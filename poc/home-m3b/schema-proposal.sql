-- Grapes Home M3/B TEST migration, reviewed after local three-user Auth/RLS/CAS PASS.
-- Authorized for the dedicated Grapes TEST project ONLY after remote preflight.
-- Never apply to Grapes PROD or any unrelated Supabase project.
-- Expose schema "api" for RPC; never expose grapes_home_private.
create schema if not exists api;
create schema if not exists grapes_home_private;
revoke all on schema grapes_home_private from public, anon, authenticated;
grant usage on schema api to authenticated;
-- pgcrypto is not required: gen_random_uuid() and sha256(bytea) built in.
create table grapes_home_private.households (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  name text not null check (char_length(name) between 1 and 100),
  revision bigint not null default 0 check (revision >= 0),
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table grapes_home_private.members (
  household_id uuid not null references grapes_home_private.households(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner','editor','viewer')),
  joined_at timestamptz not null default now(),
  primary key (household_id,user_id)
);
create unique index only_one_household_owner on grapes_home_private.members(household_id)
  where role='owner';
create table grapes_home_private.invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references grapes_home_private.households(id),
  token_hash bytea not null unique,
  role text not null check (role in ('editor','viewer')),
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  revoked_at timestamptz
);
create table grapes_home_private.attempts (
  household_id uuid not null references grapes_home_private.households(id),
  actor_id uuid not null references auth.users(id),
  operation_id uuid not null,
  expected_revision bigint not null,
  candidate jsonb not null,
  result text not null check (result in ('committed','conflict')),
  resulting_revision bigint not null,
  created_at timestamptz not null default now(),
  primary key(actor_id,operation_id)
);
create index home_attempts_by_household on grapes_home_private.attempts
  (household_id,actor_id,created_at desc);
-- Inaccessible tables, RLS defense in depth, no generic authenticated grant.
alter table grapes_home_private.households enable row level security;
alter table grapes_home_private.members enable row level security;
alter table grapes_home_private.invites enable row level security;
alter table grapes_home_private.attempts enable row level security;
revoke all on all tables in schema grapes_home_private from public, anon, authenticated;

-- A validated Auth JWT, never a user-supplied ownerId, is the sole principal.
create function grapes_home_private.require_actor() returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or coalesce(auth.jwt()->>'is_anonymous','false') = 'true' then
    raise exception 'verified Supabase Auth required' using errcode='28000';
  end if;
  return v_user;
end $$;

create function grapes_home_private.home_m3b_create_household_internal(p_name text) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := grapes_home_private.require_actor(); v_id uuid := gen_random_uuid();
begin
  if p_name is null or length(btrim(p_name)) not between 1 and 100 then
    raise exception 'invalid household name' using errcode='22023';
  end if;
  insert into grapes_home_private.households(id,owner_id,name,state)
    values(v_id,v_actor,btrim(p_name),
      jsonb_build_object('schemaVersion',2,'householdId',v_id,'actorId',v_actor,
        'revision',0,'inventory',jsonb_build_array(),'shopping',jsonb_build_array(),
        'prepared',jsonb_build_array(),'events',jsonb_build_array()));
  insert into grapes_home_private.members(household_id,user_id,role)
    values(v_id,v_actor,'owner');
  return jsonb_build_object('householdId',v_id,'revision',0,'role','owner','name',btrim(p_name));
end $$;

create function grapes_home_private.home_m3b_list_households_internal() returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := grapes_home_private.require_actor();
begin
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'householdId',h.id,'name',h.name,'role',m.role,'revision',h.revision)
    order by h.created_at,h.id),'[]'::jsonb)
    from grapes_home_private.members m join grapes_home_private.households h
      on h.id=m.household_id where m.user_id=v_actor);
end $$;

create function grapes_home_private.home_m3b_read_household_internal(p_household_id uuid) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := grapes_home_private.require_actor();
  v_house grapes_home_private.households%rowtype; v_role text;
begin
  select role into v_role from grapes_home_private.members
    where household_id=p_household_id and user_id=v_actor;
  if v_role is null then raise exception 'not a household member' using errcode='42501'; end if;
  select * into v_house from grapes_home_private.households where id=p_household_id;
  return jsonb_build_object('householdId',v_house.id,'revision',v_house.revision,
    'role',v_role,'state',v_house.state);
end $$;

create function grapes_home_private.home_m3b_create_invite_internal(
  p_household_id uuid,p_role text default 'editor',p_hours integer default 48
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := grapes_home_private.require_actor();
  v_id uuid := gen_random_uuid(); v_token text; v_expiry timestamptz;
begin
  if p_role not in ('editor','viewer') or p_hours not between 1 and 168 then
    raise exception 'invalid invite role or expiry' using errcode='22023';
  end if;
  if not exists(select 1 from grapes_home_private.members
    where household_id=p_household_id and user_id=v_actor and role='owner') then
    raise exception 'only household owner can invite' using errcode='42501';
  end if;
  -- 256 random bits, only its SHA-256 digest is stored; plaintext returned once.
  v_token := replace(gen_random_uuid()::text,'-','') ||
             replace(gen_random_uuid()::text,'-','');
  v_expiry := now() + make_interval(hours=>p_hours);
  insert into grapes_home_private.invites(id,household_id,token_hash,role,created_by,expires_at)
    values(v_id,p_household_id,sha256(convert_to(v_token,'UTF8')),p_role,v_actor,v_expiry);
  return jsonb_build_object('inviteId',v_id,'inviteCode',v_token,'expiresAt',v_expiry,'role',p_role);
end $$;

create function grapes_home_private.home_m3b_accept_invite_internal(p_code text) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := grapes_home_private.require_actor();
  v_invite grapes_home_private.invites%rowtype;
begin
  if p_code is null or p_code !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid invitation code' using errcode='22023';
  end if;
  select * into v_invite from grapes_home_private.invites
    where token_hash=sha256(convert_to(p_code,'UTF8')) for update;
  if not found or v_invite.accepted_at is not null or v_invite.revoked_at is not null
     or v_invite.expires_at <= now() then
    raise exception 'invitation invalid or expired' using errcode='42501';
  end if;
  if exists(select 1 from grapes_home_private.members
     where household_id=v_invite.household_id and user_id=v_actor) then
    raise exception 'already in household' using errcode='23505';
  end if;
  insert into grapes_home_private.members(household_id,user_id,role)
    values(v_invite.household_id,v_actor,v_invite.role);
  update grapes_home_private.invites set accepted_at=now(),accepted_by=v_actor
    where id=v_invite.id;
  return jsonb_build_object('householdId',v_invite.household_id,'role',v_invite.role);
end $$;

create function grapes_home_private.home_m3b_revoke_invite_internal(p_household_id uuid,p_invite_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := grapes_home_private.require_actor();
begin
  if not exists(select 1 from grapes_home_private.members
    where household_id=p_household_id and user_id=v_actor and role='owner') then
    raise exception 'only owner may revoke invitation' using errcode='42501';
  end if;
  update grapes_home_private.invites set revoked_at=now()
    where household_id=p_household_id and id=p_invite_id
      and accepted_at is null and revoked_at is null;
  return found;
end $$;

create function grapes_home_private.home_m3b_remove_member_internal(p_household_id uuid,p_user_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := grapes_home_private.require_actor();
begin
  if not exists(select 1 from grapes_home_private.members
    where household_id=p_household_id and user_id=v_actor and role='owner') then
    raise exception 'only owner may remove member' using errcode='42501';
  end if;
  if p_user_id=v_actor then
    raise exception 'cannot remove the only owner' using errcode='42501';
  end if;
  delete from grapes_home_private.members
    where household_id=p_household_id and user_id=p_user_id and role<>'owner';
  return found;
end $$;

create function grapes_home_private.home_m3b_leave_household_internal(p_household_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := grapes_home_private.require_actor();
begin
  if exists(select 1 from grapes_home_private.members
    where household_id=p_household_id and user_id=v_actor and role='owner') then
    raise exception 'sole owner cannot leave without ownership transfer' using errcode='42501';
  end if;
  delete from grapes_home_private.members
    where household_id=p_household_id and user_id=v_actor and role in ('viewer','editor');
  return found;
end $$;

-- CAS stores rejected candidates and never last-write-wins; owner/editor only.
-- Append-only event history is replayed against collection deltas BEFORE write.
create function grapes_home_private.home_m3b_compare_and_swap_internal(
  p_household_id uuid,p_operation_id uuid,p_expected_revision bigint,p_candidate jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := grapes_home_private.require_actor(); v_role text;
  v_house grapes_home_private.households%rowtype;
  v_old grapes_home_private.attempts%rowtype;
  v_event jsonb; v_change jsonb; v_collection text; v_id text;
  v_current jsonb; v_before jsonb; v_after jsonb; v_modified jsonb;
  v_inventory jsonb; v_shopping jsonb; v_result text; v_revision bigint;
begin
  if p_household_id is null or p_operation_id is null or
     p_expected_revision is null or p_expected_revision < 0 or
     p_candidate is null or jsonb_typeof(p_candidate)<>'object' or
     octet_length(p_candidate::text) > 1048576 then
    raise exception 'invalid household CAS request' using errcode='22023';
  end if;
  select role into v_role from grapes_home_private.members
    where household_id=p_household_id and user_id=v_actor;
  if v_role not in ('owner','editor') or v_role is null then
    raise exception 'no household write permission' using errcode='42501';
  end if;
  select * into v_house from grapes_home_private.households
    where id=p_household_id for update;
  if not found then raise exception 'household missing' using errcode='42501'; end if;
  select * into v_old from grapes_home_private.attempts
    where actor_id=v_actor and operation_id=p_operation_id;
  if found then
    if v_old.household_id<>p_household_id or v_old.expected_revision<>p_expected_revision
       or v_old.candidate<>p_candidate then
      raise exception 'operation ID reused with different payload' using errcode='23505';
    end if;
    return jsonb_build_object('status',v_old.result,'revision',v_old.resulting_revision);
  end if;
  if v_house.revision <> p_expected_revision then
    v_result := 'conflict';
    v_revision := v_house.revision;
  else
    if (select count(*) from jsonb_object_keys(p_candidate))<>8 or
      not p_candidate ?& array['schemaVersion','householdId','actorId','revision',
                               'inventory','shopping','prepared','events'] or
       p_candidate->>'schemaVersion'<>'2' or
       p_candidate->>'householdId'<>p_household_id::text or
       p_candidate->>'actorId'<>v_house.owner_id::text or
       p_candidate->>'revision'<>(p_expected_revision+1)::text or
       jsonb_typeof(p_candidate->'inventory')<>'array' or
       jsonb_typeof(p_candidate->'shopping')<>'array' or
       p_candidate->'prepared'<>'[]'::jsonb or
       jsonb_typeof(p_candidate->'events')<>'array' or
       jsonb_array_length(p_candidate->'events')<>p_expected_revision+1 then
      raise exception 'invalid shared Home snapshot' using errcode='22023';
    end if;
    if ((p_candidate->'events') - (p_expected_revision::integer)) <>
       (v_house.state->'events') then
      raise exception 'cannot change past shared Home events' using errcode='42501';
    end if;
    v_event := p_candidate->'events'->(p_expected_revision::integer);
    if v_event->>'eventId' is distinct from p_operation_id::text or
       v_event->>'actorId' is distinct from v_actor::text or
       v_event->>'householdId' is distinct from p_household_id::text or
       v_event->>'sourceType' is distinct from 'manual' or
       v_event->>'confirmation' is distinct from 'true' or
       v_event->>'resultingRevision' is distinct from (p_expected_revision+1)::text or
       jsonb_typeof(v_event->'changes')<>'array' or
       v_event->>'type' not in
        ('StockCountConfirmed','LotEdited','LotDeleted','StockSplit',
         'ShoppingItemAdded','ShoppingItemEdited','ShoppingItemStatusChanged',
         'ShoppingItemDeleted','Reversed') or
       (v_event ? 'sourceId' and v_event->'sourceId'<>'null'::jsonb) then
      raise exception 'invalid shared Home event' using errcode='22023';
    end if;
    v_inventory := v_house.state->'inventory';
    v_shopping := v_house.state->'shopping';
    for v_change in select value from jsonb_array_elements(v_event->'changes') loop
      v_collection := v_change->>'collection';
      v_id := v_change->>'id';
      if v_collection not in ('inventory','shopping') or
         v_id is null or length(v_id) not between 1 and 200 then
        raise exception 'personal or invalid shared change' using errcode='42501';
      end if;
      v_current := case when v_collection='inventory' then v_inventory else v_shopping end;
      select value into v_before from jsonb_array_elements(v_current)
        where value->>'id'=v_id;
      if not found then v_before := 'null'::jsonb; end if;
      if coalesce(v_change->'before','null'::jsonb) <> v_before then
        raise exception 'stale shared collection delta' using errcode='40001';
      end if;
      v_after := coalesce(v_change->'after','null'::jsonb);
      if v_after<>'null'::jsonb and
          (jsonb_typeof(v_after)<>'object' or v_after->>'id' is distinct from v_id or
           v_after->>'householdId' is distinct from p_household_id::text or
           (v_collection='inventory' and
            (v_after->>'sourceType' is distinct from 'manual' or
             (v_after ? 'sourceId' and v_after->'sourceId'<>'null'::jsonb) or
             v_after->>'evidenceStatus' is distinct from 'confirmed' or
             v_after->>'storageLocation' not in ('untracked','fridge','freezer','pantry'))) or
           (v_collection='shopping' and
            (v_after->>'sourceType' is distinct from 'manual' or
             v_after->>'status' not in ('planned','checked','deferred')))) then
        raise exception 'private or invalid shared item' using errcode='42501';
      end if;
      select coalesce(jsonb_agg(value),'[]'::jsonb) into v_modified
        from jsonb_array_elements(v_current) where value->>'id'<>v_id;
      if v_after <> 'null'::jsonb then
        v_modified := v_modified || jsonb_build_array(v_after);
      end if;
      if v_collection='inventory' then v_inventory:=v_modified;
      else v_shopping:=v_modified; end if;
    end loop;
    if v_inventory<>p_candidate->'inventory' or
       v_shopping<>p_candidate->'shopping' then
      raise exception 'snapshot does not match audited changes' using errcode='42501';
    end if;
    update grapes_home_private.households set state=p_candidate,
      revision=p_expected_revision+1,updated_at=now()
      where id=p_household_id;
    v_result:='committed'; v_revision:=p_expected_revision+1;
  end if;
  insert into grapes_home_private.attempts(household_id,actor_id,operation_id,
    expected_revision,candidate,result,resulting_revision)
    values(p_household_id,v_actor,p_operation_id,p_expected_revision,
      p_candidate,v_result,v_revision);
  return jsonb_build_object('status',v_result,'revision',v_revision);
end $$;

create function grapes_home_private.home_m3b_read_attempt_internal(p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := grapes_home_private.require_actor();
  v_attempt grapes_home_private.attempts%rowtype;
begin
  select * into v_attempt from grapes_home_private.attempts
    where actor_id=v_actor and operation_id=p_operation_id;
  if not found then return null; end if;
  return jsonb_build_object('householdId',v_attempt.household_id,
    'status',v_attempt.result,'revision',v_attempt.resulting_revision,
    'expectedRevision',v_attempt.expected_revision,'candidate',v_attempt.candidate);
end $$;

-- SECURITY INVOKER API wrappers call owner-checked privileged logic in a
-- PRIVATE, unexposed schema. No direct private table grants.
revoke all on all functions in schema grapes_home_private from public, anon, authenticated;
grant usage on schema grapes_home_private to authenticated;
grant execute on function grapes_home_private.home_m3b_create_household_internal(text) to authenticated;
grant execute on function grapes_home_private.home_m3b_list_households_internal() to authenticated;
grant execute on function grapes_home_private.home_m3b_read_household_internal(uuid) to authenticated;
grant execute on function grapes_home_private.home_m3b_create_invite_internal(uuid,text,integer) to authenticated;
grant execute on function grapes_home_private.home_m3b_accept_invite_internal(text) to authenticated;
grant execute on function grapes_home_private.home_m3b_revoke_invite_internal(uuid,uuid) to authenticated;
grant execute on function grapes_home_private.home_m3b_remove_member_internal(uuid,uuid) to authenticated;
grant execute on function grapes_home_private.home_m3b_leave_household_internal(uuid) to authenticated;
grant execute on function grapes_home_private.home_m3b_compare_and_swap_internal(uuid,uuid,bigint,jsonb) to authenticated;
grant execute on function grapes_home_private.home_m3b_read_attempt_internal(uuid) to authenticated;
create function api.home_m3b_create_household(p_name text) returns jsonb
language sql security invoker set search_path=''
as $$ select grapes_home_private.home_m3b_create_household_internal($1) $$;
revoke all on function api.home_m3b_create_household(text) from public, anon;
grant execute on function api.home_m3b_create_household(text) to authenticated;
create function api.home_m3b_list_households() returns jsonb
language sql security invoker set search_path=''
as $$ select grapes_home_private.home_m3b_list_households_internal() $$;
revoke all on function api.home_m3b_list_households() from public, anon;
grant execute on function api.home_m3b_list_households() to authenticated;
create function api.home_m3b_read_household(p_household_id uuid) returns jsonb
language sql security invoker set search_path=''
as $$ select grapes_home_private.home_m3b_read_household_internal($1) $$;
revoke all on function api.home_m3b_read_household(uuid) from public, anon;
grant execute on function api.home_m3b_read_household(uuid) to authenticated;
create function api.home_m3b_create_invite(p_household_id uuid,p_role text default 'editor',p_hours integer default 48) returns jsonb
language sql security invoker set search_path=''
as $$ select grapes_home_private.home_m3b_create_invite_internal($1,$2,$3) $$;
revoke all on function api.home_m3b_create_invite(uuid,text,integer) from public, anon;
grant execute on function api.home_m3b_create_invite(uuid,text,integer) to authenticated;
create function api.home_m3b_accept_invite(p_code text) returns jsonb
language sql security invoker set search_path=''
as $$ select grapes_home_private.home_m3b_accept_invite_internal($1) $$;
revoke all on function api.home_m3b_accept_invite(text) from public, anon;
grant execute on function api.home_m3b_accept_invite(text) to authenticated;
create function api.home_m3b_revoke_invite(p_household_id uuid,p_invite_id uuid) returns boolean
language sql security invoker set search_path=''
as $$ select grapes_home_private.home_m3b_revoke_invite_internal($1,$2) $$;
revoke all on function api.home_m3b_revoke_invite(uuid,uuid) from public, anon;
grant execute on function api.home_m3b_revoke_invite(uuid,uuid) to authenticated;
create function api.home_m3b_remove_member(p_household_id uuid,p_user_id uuid) returns boolean
language sql security invoker set search_path=''
as $$ select grapes_home_private.home_m3b_remove_member_internal($1,$2) $$;
revoke all on function api.home_m3b_remove_member(uuid,uuid) from public, anon;
grant execute on function api.home_m3b_remove_member(uuid,uuid) to authenticated;
create function api.home_m3b_leave_household(p_household_id uuid) returns boolean
language sql security invoker set search_path=''
as $$ select grapes_home_private.home_m3b_leave_household_internal($1) $$;
revoke all on function api.home_m3b_leave_household(uuid) from public, anon;
grant execute on function api.home_m3b_leave_household(uuid) to authenticated;
create function api.home_m3b_compare_and_swap(p_household_id uuid,p_operation_id uuid,p_expected_revision bigint,p_candidate jsonb) returns jsonb
language sql security invoker set search_path=''
as $$ select grapes_home_private.home_m3b_compare_and_swap_internal($1,$2,$3,$4) $$;
revoke all on function api.home_m3b_compare_and_swap(uuid,uuid,bigint,jsonb) from public, anon;
grant execute on function api.home_m3b_compare_and_swap(uuid,uuid,bigint,jsonb) to authenticated;
create function api.home_m3b_read_attempt(p_operation_id uuid) returns jsonb
language sql security invoker set search_path=''
as $$ select grapes_home_private.home_m3b_read_attempt_internal($1) $$;
revoke all on function api.home_m3b_read_attempt(uuid) from public, anon;
grant execute on function api.home_m3b_read_attempt(uuid) to authenticated;
