-- PROPOSAL ONLY. Never applied to PROD, TEST, or a live Supabase project.
-- Install only after independent review in a dedicated, authorized test database.
-- Configure `api` as an exposed schema; keep `grapes_private` unexposed.
create schema if not exists grapes_private;
create schema if not exists api;
revoke all on schema grapes_private from public, anon, authenticated;
grant usage on schema api to authenticated;

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
  kind text not null check (kind in ('food', 'water', 'health', 'yazio')),
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

-- SECURITY DEFINER is required because direct table mutation is deliberately
-- unavailable. The owner is derived from the validated JWT, never a client arg.
-- Fixed search_path, explicit grants and profile check are mandatory.
create or replace function api.compare_and_swap(
  p_profile_id text, p_kind text, p_record_id text, p_operation_id uuid,
  p_expected_revision bigint, p_schema_version integer, p_candidate jsonb
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, auth, grapes_private
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
  if p_kind not in ('food', 'water', 'health', 'yazio') or
     length(p_profile_id) not between 1 and 200 or
     length(p_record_id) not between 1 and 200 or
     p_operation_id is null or p_expected_revision is null or p_expected_revision < 0 or
     p_schema_version is null or p_schema_version < 1 or p_candidate is null then
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
revoke all on function api.compare_and_swap(text,text,text,uuid,bigint,integer,jsonb) from public, anon;
grant execute on function api.compare_and_swap(text,text,text,uuid,bigint,integer,jsonb) to authenticated;

-- Read APIs must also derive v_user from auth.uid(), check profile ownership,
-- and expose only that owner's head/history/attempts. They are intentionally
-- deferred until the dedicated TEST gate and independent security review.
