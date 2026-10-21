-- Phase 2 proposal; apply ONLY to an ephemeral local stack after review.
-- Never auto-apply to the hosted Grapes TEST project or any other project.
-- Install only after independent review in a dedicated, authorized test database.
-- Configure `api` as an exposed schema; keep `grapes_private` unexposed.
create schema if not exists grapes_private;
create schema if not exists api;
revoke all on schema grapes_private from public, anon, authenticated;
grant usage on schema api to authenticated;

alter default privileges in schema grapes_private revoke execute on functions from public;

create table grapes_private.profiles (
  user_id uuid not null references auth.users(id),
  profile_id text not null,
  legacy_google_subject text,
  created_at timestamptz not null default now(),
  primary key (user_id, profile_id),
  check (length(profile_id) between 1 and 200)
);

create table grapes_private.documents (
  user_id uuid not null,
  profile_id text not null,
  kind text not null check (kind in ('food', 'water', 'health', 'yazio', 'food_diary', 'food_custom', 'food_recipe', 'food_recipe_ingredient', 'water_entry', 'yazio_import', 'nutrient_goal')),
  record_id text not null check (length(record_id) between 1 and 200),
  schema_version integer not null check (schema_version > 0),
  revision bigint not null check (revision > 0),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, profile_id, kind, record_id),
  foreign key (user_id, profile_id) references grapes_private.profiles(user_id, profile_id)
);

create table grapes_private.revisions (
  user_id uuid not null,
  profile_id text not null,
  kind text not null,
  record_id text not null,
  revision bigint not null,
  operation_id uuid not null,
  schema_version integer not null,
  payload jsonb not null,
  recorded_at timestamptz not null default now(),
  primary key (user_id, profile_id, kind, record_id, revision),
  foreign key (user_id, profile_id, kind, record_id)
    references grapes_private.documents(user_id, profile_id, kind, record_id)
);

-- Every candidate is retained, including rejected stale writes. The unique
-- operation ID makes a lost response safely retriable with identical bytes.
create table grapes_private.attempts (
  user_id uuid not null,
  operation_id uuid not null,
  profile_id text not null,
  kind text not null,
  record_id text not null,
  expected_revision bigint not null,
  schema_version integer not null,
  candidate jsonb not null,
  outcome text not null check (outcome in ('committed', 'conflict')),
  resulting_revision bigint not null,
  recorded_at timestamptz not null default now(),
  primary key (user_id, operation_id),
  foreign key (user_id, profile_id) references grapes_private.profiles(user_id, profile_id)
);
create index attempts_record_idx on grapes_private.attempts (user_id, profile_id, kind, record_id, recorded_at desc);

create function grapes_private.reject_history_mutation() returns trigger
language plpgsql set search_path = pg_catalog
as $$ begin
  raise exception 'recovery history is append-only' using errcode = '55000';
end $$;
create trigger revisions_append_only before update or delete on grapes_private.revisions
  for each row execute function grapes_private.reject_history_mutation();
create trigger attempts_append_only before update or delete on grapes_private.attempts
  for each row execute function grapes_private.reject_history_mutation();

alter table grapes_private.profiles enable row level security;
alter table grapes_private.documents enable row level security;
alter table grapes_private.revisions enable row level security;
alter table grapes_private.attempts enable row level security;
-- No direct Data API grants on private tables. RLS is defense in depth.
create policy profile_owner_read on grapes_private.profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy document_owner_read on grapes_private.documents for select to authenticated
  using (user_id = (select auth.uid()));
create policy revision_owner_read on grapes_private.revisions for select to authenticated
  using (user_id = (select auth.uid()));
create policy attempt_owner_read on grapes_private.attempts for select to authenticated
  using (user_id = (select auth.uid()));

-- Direct table mutation is deliberately unavailable. The privileged function
-- stays private; its exposed wrapper is SECURITY INVOKER. The owner is derived
-- from the validated JWT, never a client argument.
create or replace function grapes_private.compare_and_swap_internal(
  p_profile_id text, p_kind text, p_record_id text, p_operation_id uuid,
  p_expected_revision bigint, p_schema_version integer, p_candidate jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_existing grapes_private.attempts%rowtype;
  v_revision bigint;
  v_outcome text;
begin
  if v_user is null or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true' then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_kind not in ('food', 'water', 'health', 'yazio', 'food_diary', 'food_custom', 'food_recipe', 'food_recipe_ingredient', 'water_entry', 'yazio_import', 'nutrient_goal') or
     length(p_profile_id) not between 1 and 200 or
     length(p_record_id) not between 1 and 200 or
     p_operation_id is null or p_expected_revision is null or p_expected_revision < 0 or
     p_schema_version is null or p_schema_version < 1 or p_candidate is null or
     octet_length(p_candidate::text) > 1048576 then
    raise exception 'invalid write' using errcode = '22023';
  end if;
  if not exists (select 1 from grapes_private.profiles
                 where user_id = v_user and profile_id = p_profile_id) then
    raise exception 'profile not found' using errcode = '42501';
  end if;
  -- Serializes both existing-row updates and first-insert races. Hash collisions
  -- only serialize unrelated keys; the full primary key still decides identity.
  perform pg_advisory_xact_lock(hashtextextended(
    v_user::text || ':' || p_profile_id || ':' || p_kind || ':' || p_record_id, 0));
  select * into v_existing from grapes_private.attempts
    where user_id = v_user and operation_id = p_operation_id;
  if found then
    if v_existing.profile_id <> p_profile_id or v_existing.kind <> p_kind or
       v_existing.record_id <> p_record_id or v_existing.expected_revision <> p_expected_revision or
       v_existing.schema_version <> p_schema_version or v_existing.candidate <> p_candidate then
      raise exception 'operation ID reused with different content' using errcode = '23505';
    end if;
    return jsonb_build_object('status', v_existing.outcome, 'revision', v_existing.resulting_revision,
      'snapshotId', case when v_existing.outcome = 'conflict' then p_operation_id end);
  end if;
  select revision into v_revision from grapes_private.documents
    where user_id = v_user and profile_id = p_profile_id and kind = p_kind and record_id = p_record_id for update;
  v_revision := coalesce(v_revision, 0);
  if v_revision = p_expected_revision then
    v_outcome := 'committed';
    v_revision := v_revision + 1;
    insert into grapes_private.documents as d
      (user_id, profile_id, kind, record_id, schema_version, revision, payload)
      values (v_user, p_profile_id, p_kind, p_record_id, p_schema_version, v_revision, p_candidate)
      on conflict (user_id, profile_id, kind, record_id) do update
      set schema_version = excluded.schema_version, revision = excluded.revision,
          payload = excluded.payload, updated_at = now();
    insert into grapes_private.revisions
      (user_id, profile_id, kind, record_id, revision, operation_id, schema_version, payload)
      values (v_user, p_profile_id, p_kind, p_record_id, v_revision, p_operation_id, p_schema_version, p_candidate);
  else
    v_outcome := 'conflict';
  end if;
  insert into grapes_private.attempts
    (user_id, operation_id, profile_id, kind, record_id, expected_revision, schema_version,
     candidate, outcome, resulting_revision)
    values (v_user, p_operation_id, p_profile_id, p_kind, p_record_id, p_expected_revision,
            p_schema_version, p_candidate, v_outcome, v_revision);
  return jsonb_build_object('status', v_outcome, 'revision', v_revision,
    'snapshotId', case when v_outcome = 'conflict' then p_operation_id end);
end;
$$;
-- A signed-in Data API request enters through an invoker wrapper. The
-- privileged implementation stays in the unexposed private schema. Explicit
-- USAGE allows calling that function but does not grant table access.
revoke all on function grapes_private.compare_and_swap_internal(text,text,text,uuid,bigint,integer,jsonb) from public, anon;
grant usage on schema grapes_private to authenticated;
grant execute on function grapes_private.compare_and_swap_internal(text,text,text,uuid,bigint,integer,jsonb) to authenticated;

create or replace function api.compare_and_swap(
  p_profile_id text, p_kind text, p_record_id text, p_operation_id uuid,
  p_expected_revision bigint, p_schema_version integer, p_candidate jsonb
) returns jsonb language sql security invoker set search_path = ''
as $$ select grapes_private.compare_and_swap_internal($1,$2,$3,$4,$5,$6,$7) $$;
revoke all on function api.compare_and_swap(text,text,text,uuid,bigint,integer,jsonb) from public, anon;
grant execute on function api.compare_and_swap(text,text,text,uuid,bigint,integer,jsonb) to authenticated;

-- A rejected candidate must be exportable for recovery. The lookup uses the
-- authenticated owner and operation ID, and never accepts a user ID argument.
create or replace function grapes_private.read_attempt_internal(p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_attempt grapes_private.attempts%rowtype;
begin
  if v_user is null or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true' then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select * into v_attempt from grapes_private.attempts
    where user_id = v_user and operation_id = p_operation_id;
  if not found then return null; end if;
  return jsonb_build_object('profileId', v_attempt.profile_id, 'kind', v_attempt.kind,
    'recordId', v_attempt.record_id, 'status', v_attempt.outcome,
    'expectedRevision', v_attempt.expected_revision, 'revision', v_attempt.resulting_revision,
    'schemaVersion', v_attempt.schema_version, 'candidate', v_attempt.candidate);
end;
$$;
revoke all on function grapes_private.read_attempt_internal(uuid) from public, anon;
grant execute on function grapes_private.read_attempt_internal(uuid) to authenticated;
create or replace function api.read_attempt(p_operation_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select grapes_private.read_attempt_internal($1) $$;
revoke all on function api.read_attempt(uuid) from public, anon;
grant execute on function api.read_attempt(uuid) to authenticated;

-- All reads derive the principal from verified Auth context. No caller-supplied
-- owner UUID or user-editable metadata can select a different account.

create or replace function grapes_private.create_profile_internal()
returns text language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_id text;
begin
  if v_user is null or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true' then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  v_id := 'grapes:' || gen_random_uuid()::text;
  insert into grapes_private.profiles(user_id, profile_id) values (v_user, v_id);
  return v_id;
end;
$$;
revoke all on function grapes_private.create_profile_internal() from public, anon;
grant execute on function grapes_private.create_profile_internal() to authenticated;
create or replace function api.create_profile()
returns text language sql security invoker set search_path = ''
as $$ select grapes_private.create_profile_internal() $$;
revoke all on function api.create_profile() from public, anon;
grant execute on function api.create_profile() to authenticated;

create or replace function grapes_private.list_profiles_internal()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_result jsonb;
begin
  if v_user is null or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true' then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('profileId', p.profile_id,
    'createdAt', p.created_at) order by p.created_at, p.profile_id), '[]'::jsonb)
    into v_result from grapes_private.profiles p where p.user_id = v_user;
  return v_result;
end;
$$;
revoke all on function grapes_private.list_profiles_internal() from public, anon;
grant execute on function grapes_private.list_profiles_internal() to authenticated;
create or replace function api.list_profiles()
returns jsonb language sql security invoker set search_path = ''
as $$ select grapes_private.list_profiles_internal() $$;
revoke all on function api.list_profiles() from public, anon;
grant execute on function api.list_profiles() to authenticated;

create or replace function grapes_private.read_document_internal(
  p_profile_id text, p_kind text, p_record_id text
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_result jsonb;
begin
  if v_user is null or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true' then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (select 1 from grapes_private.profiles
      where user_id = v_user and profile_id = p_profile_id) then
    raise exception 'profile not found' using errcode = '42501';
  end if;
  select jsonb_build_object('profileId', d.profile_id, 'kind', d.kind,
    'recordId', d.record_id, 'schemaVersion', d.schema_version,
    'revision', d.revision, 'payload', d.payload, 'updatedAt', d.updated_at)
    into v_result from grapes_private.documents d
    where d.user_id = v_user and d.profile_id = p_profile_id
      and d.kind = p_kind and d.record_id = p_record_id;
  return v_result;
end;
$$;
revoke all on function grapes_private.read_document_internal(text,text,text) from public, anon;
grant execute on function grapes_private.read_document_internal(text,text,text) to authenticated;
create or replace function api.read_document(p_profile_id text, p_kind text, p_record_id text)
returns jsonb language sql security invoker set search_path = ''
as $$ select grapes_private.read_document_internal($$1,$$2,$$3) $$;
revoke all on function api.read_document(text,text,text) from public, anon;
grant execute on function api.read_document(text,text,text) to authenticated;

create or replace function grapes_private.list_documents_internal(
  p_profile_id text, p_kind text, p_after_record_id text default null, p_limit integer default 50
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_items jsonb; v_cursor text;
begin
  if v_user is null or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true' then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (select 1 from grapes_private.profiles
      where user_id = v_user and profile_id = p_profile_id) then
    raise exception 'profile not found' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('recordId', d.record_id,
      'revision', d.revision, 'schemaVersion', d.schema_version,
      'payload', d.payload) order by d.record_id), '[]'::jsonb), max(d.record_id)
    into v_items, v_cursor
    from (select record_id, revision, schema_version, payload
      from grapes_private.documents
      where user_id = v_user and profile_id = p_profile_id and kind = p_kind
        and (p_after_record_id is null or record_id > p_after_record_id)
      order by record_id limit least(greatest(coalesce(p_limit, 50), 1), 100)) d;
  return jsonb_build_object('items', v_items, 'nextCursor', v_cursor);
end;
$$;
revoke all on function grapes_private.list_documents_internal(text,text,text,integer) from public, anon;
grant execute on function grapes_private.list_documents_internal(text,text,text,integer) to authenticated;
create or replace function api.list_documents(
  p_profile_id text, p_kind text, p_after_record_id text default null, p_limit integer default 50
) returns jsonb language sql security invoker set search_path = ''
as $$ select grapes_private.list_documents_internal($$1,$$2,$$3,$$4) $$;
revoke all on function api.list_documents(text,text,text,integer) from public, anon;
grant execute on function api.list_documents(text,text,text,integer) to authenticated;

create or replace function grapes_private.read_revision_internal(
  p_profile_id text, p_kind text, p_record_id text, p_revision bigint
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_result jsonb;
begin
  if v_user is null or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true' then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (select 1 from grapes_private.profiles
      where user_id = v_user and profile_id = p_profile_id) then
    raise exception 'profile not found' using errcode = '42501';
  end if;
  select jsonb_build_object('revision', r.revision, 'operationId', r.operation_id,
    'schemaVersion', r.schema_version, 'payload', r.payload, 'recordedAt', r.recorded_at)
    into v_result from grapes_private.revisions r
    where r.user_id = v_user and r.profile_id = p_profile_id and r.kind = p_kind
      and r.record_id = p_record_id and r.revision = p_revision;
  return v_result;
end;
$$;
revoke all on function grapes_private.read_revision_internal(text,text,text,bigint) from public, anon;
grant execute on function grapes_private.read_revision_internal(text,text,text,bigint) to authenticated;
create or replace function api.read_revision(
  p_profile_id text, p_kind text, p_record_id text, p_revision bigint
) returns jsonb language sql security invoker set search_path = ''
as $$ select grapes_private.read_revision_internal($$1,$$2,$$3,$$4) $$;
revoke all on function api.read_revision(text,text,text,bigint) from public, anon;
grant execute on function api.read_revision(text,text,text,bigint) to authenticated;

create or replace function grapes_private.list_revisions_internal(
  p_profile_id text, p_kind text, p_record_id text,
  p_before_revision bigint default null, p_limit integer default 50
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_items jsonb; v_cursor bigint;
begin
  if v_user is null or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true' then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (select 1 from grapes_private.profiles
      where user_id = v_user and profile_id = p_profile_id) then
    raise exception 'profile not found' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('revision', r.revision,
      'operationId', r.operation_id, 'schemaVersion', r.schema_version,
      'recordedAt', r.recorded_at) order by r.revision desc), '[]'::jsonb),
      min(r.revision) into v_items, v_cursor
    from (select revision, operation_id, schema_version, recorded_at
      from grapes_private.revisions
      where user_id = v_user and profile_id = p_profile_id and kind = p_kind
        and record_id = p_record_id
        and (p_before_revision is null or revision < p_before_revision)
      order by revision desc limit least(greatest(coalesce(p_limit, 50), 1), 100)) r;
  return jsonb_build_object('items', v_items, 'nextBeforeRevision', v_cursor);
end;
$$;
revoke all on function grapes_private.list_revisions_internal(text,text,text,bigint,integer) from public, anon;
grant execute on function grapes_private.list_revisions_internal(text,text,text,bigint,integer) to authenticated;
create or replace function api.list_revisions(
  p_profile_id text, p_kind text, p_record_id text,
  p_before_revision bigint default null, p_limit integer default 50
) returns jsonb language sql security invoker set search_path = ''
as $$ select grapes_private.list_revisions_internal($$1,$$2,$$3,$$4,$$5) $$;
revoke all on function api.list_revisions(text,text,text,bigint,integer) from public, anon;
grant execute on function api.list_revisions(text,text,text,bigint,integer) to authenticated;

