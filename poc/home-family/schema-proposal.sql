-- Home M3/B exploratory TEST-only backend. NEVER apply to hosted TEST/PROD.
-- Kept independent of existing personal Home owner-CAS and all personal modules.
create schema if not exists api;
create schema if not exists grapes_family_private;
revoke all on schema grapes_family_private from public, anon, authenticated;
grant usage on schema grapes_family_private to authenticated;
grant usage on schema api to authenticated;

create table grapes_family_private.households (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id),
  title text not null check (length(title) between 1 and 100),
  revision bigint not null default 0 check (revision >= 0),
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table grapes_family_private.members (
  household_id uuid not null references grapes_family_private.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  joined_at timestamptz not null default now(),
  primary key(household_id, user_id)
);
create unique index family_one_owner on grapes_family_private.members(household_id) where role='owner';
create table grapes_family_private.invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references grapes_family_private.households(id) on delete cascade,
  invitee_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id),
  role text not null check (role in ('editor','viewer')),
  status text not null default 'pending' check(status in ('pending','accepted','declined','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index family_only_one_pending_invite on grapes_family_private.invitations(household_id,invitee_id) where status='pending';
create table grapes_family_private.attempts (
  household_id uuid not null references grapes_family_private.households(id) on delete cascade,
  operation_id uuid not null,
  actor_id uuid not null references auth.users(id),
  expected_revision bigint not null check (expected_revision >= 0),
  candidate jsonb not null,
  status text not null check (status in ('committed','conflict')),
  resulting_revision bigint not null,
  created_at timestamptz not null default now(),
  primary key(household_id, operation_id)
);
create table grapes_family_private.revisions (
  household_id uuid not null references grapes_family_private.households(id) on delete cascade,
  revision bigint not null check (revision > 0),
  operation_id uuid not null,
  actor_id uuid not null references auth.users(id),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  primary key(household_id,revision)
);

alter table grapes_family_private.households enable row level security;
alter table grapes_family_private.members enable row level security;
alter table grapes_family_private.invitations enable row level security;
alter table grapes_family_private.attempts enable row level security;
alter table grapes_family_private.revisions enable row level security;
-- No direct table grants or permissive RLS policies. Only checked private RPCs.
revoke all on all tables in schema grapes_family_private from public, anon, authenticated;
alter default privileges in schema grapes_family_private revoke execute on functions from public;

create function grapes_family_private.require_user() returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or coalesce(auth.jwt()->>'is_anonymous','false')='true'
     or not exists(select 1 from auth.users where id=v_user) then
    raise exception 'Grapes Auth required' using errcode='28000';
  end if;
  return v_user;
end $$;

create function grapes_family_private.role_for(p_household uuid,p_user uuid) returns text
language sql security definer set search_path=''
as $$
  select m.role from grapes_family_private.members m
    where m.household_id=p_household and m.user_id=p_user
$$;

create function grapes_family_private.create_household(p_title text) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=grapes_family_private.require_user();
        v_household grapes_family_private.households%rowtype;
begin
  if length(trim(coalesce(p_title,''))) not between 1 and 100 then
    raise exception 'invalid family name' using errcode='22023';
  end if;
  insert into grapes_family_private.households(creator_id,title)
    values(v_user,trim(p_title)) returning * into v_household;
  insert into grapes_family_private.members(household_id,user_id,role)
    values(v_household.id,v_user,'owner');
  return jsonb_build_object('householdId',v_household.id,'revision',0,'role','owner');
end $$;

create function grapes_family_private.list_households() returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=grapes_family_private.require_user();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('householdId',h.id,
    'title',h.title,'revision',h.revision,'role',m.role) order by h.created_at desc)
    from grapes_family_private.members m join grapes_family_private.households h
      on h.id=m.household_id where m.user_id=v_user),'[]'::jsonb);
end $$;

create function grapes_family_private.invite_member(p_household uuid,p_invitee uuid,p_role text) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=grapes_family_private.require_user(); v_id uuid;
begin
  if p_household is null or p_invitee is null or p_invitee=v_user or
     p_role not in ('editor','viewer') then
    raise exception 'invalid invite' using errcode='22023';
  end if;
  if grapes_family_private.role_for(p_household,v_user) is distinct from 'owner' then
    raise exception 'owner required' using errcode='42501';
  end if;
  if not exists(select 1 from auth.users where id=p_invitee) or
     exists(select 1 from grapes_family_private.members
            where household_id=p_household and user_id=p_invitee) then
    raise exception 'invitee unavailable' using errcode='22023';
  end if;
  insert into grapes_family_private.invitations(household_id,invitee_id,invited_by,role)
    values(p_household,p_invitee,v_user,p_role) returning id into v_id;
  return v_id;
end $$;

create function grapes_family_private.list_my_invites() returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=grapes_family_private.require_user();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('inviteId',i.id,'householdId',h.id,
      'title',h.title,'role',i.role) order by i.created_at desc)
    from grapes_family_private.invitations i join grapes_family_private.households h
      on h.id=i.household_id where i.invitee_id=v_user and i.status='pending'),'[]'::jsonb);
end $$;

create function grapes_family_private.respond_invite(p_invite uuid,p_accept boolean) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=grapes_family_private.require_user(); v_invite grapes_family_private.invitations%rowtype;
begin
  if p_accept is null then raise exception 'explicit response required' using errcode='22023'; end if;
  select * into v_invite from grapes_family_private.invitations
   where id=p_invite for update;
  if not found or v_invite.invitee_id<>v_user or v_invite.status<>'pending' then
    raise exception 'invite not available for this recipient' using errcode='42501';
  end if;
  if p_accept then
    insert into grapes_family_private.members(household_id,user_id,role)
      values(v_invite.household_id,v_user,v_invite.role);
  end if;
  update grapes_family_private.invitations set
    status=case when p_accept then 'accepted' else 'declined' end,updated_at=now()
    where id=p_invite;
  return jsonb_build_object('status',case when p_accept then 'accepted' else 'declined' end,
                            'householdId',v_invite.household_id);
end $$;

create function grapes_family_private.remove_member(p_household uuid,p_member uuid) returns boolean
language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=grapes_family_private.require_user();
begin
  if grapes_family_private.role_for(p_household,v_user) is distinct from 'owner' or
     p_member=v_user or grapes_family_private.role_for(p_household,p_member)='owner' then
    raise exception 'owner authorization required' using errcode='42501';
  end if;
  delete from grapes_family_private.members
    where household_id=p_household and user_id=p_member;
  if not found then raise exception 'member not found' using errcode='22023'; end if;
  return true;
end $$;

create function grapes_family_private.read_household(p_household uuid) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=grapes_family_private.require_user();
        v_role text:=grapes_family_private.role_for(p_household,v_user);
        v_house grapes_family_private.households%rowtype;
begin
  if v_role is null then raise exception 'not a member' using errcode='42501'; end if;
  select * into v_house from grapes_family_private.households where id=p_household;
  return jsonb_build_object('householdId',v_house.id,'title',v_house.title,
        'revision',v_house.revision,'role',v_role,'snapshot',v_house.snapshot);
end $$;

create function grapes_family_private.compare_and_swap(
 p_household uuid,p_operation uuid,p_expected bigint,p_candidate jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=grapes_family_private.require_user(); v_role text;
        v_head grapes_family_private.households%rowtype;
        v_existing grapes_family_private.attempts%rowtype;
        v_status text; v_revision bigint;
begin
  if p_household is null or p_operation is null or p_expected is null or
     p_expected<0 or p_candidate is null or jsonb_typeof(p_candidate)<>'object' or
     octet_length(p_candidate::text)>1048576 or
     p_candidate->>'householdId' is distinct from p_household::text or
     (p_candidate->>'revision') is distinct from (p_expected+1)::text then
    raise exception 'invalid family candidate: no personal Home snapshots allowed'
      using errcode='22023';
  end if;
  select * into v_head from grapes_family_private.households
     where id=p_household for update;
  v_role:=grapes_family_private.role_for(p_household,v_user);
  if not found or v_role not in ('owner','editor') then
    raise exception 'editor role required' using errcode='42501';
  end if;
  select * into v_existing from grapes_family_private.attempts
     where household_id=p_household and operation_id=p_operation;
  if found then
    if v_existing.actor_id<>v_user or v_existing.expected_revision<>p_expected or
       v_existing.candidate<>p_candidate then
      raise exception 'operation ID reused with different content' using errcode='23505';
    end if;
    return jsonb_build_object('status',v_existing.status,'revision',v_existing.resulting_revision);
  end if;
  v_status:=case when v_head.revision=p_expected then 'committed' else 'conflict' end;
  v_revision:=case when v_status='committed' then v_head.revision+1 else v_head.revision end;
  insert into grapes_family_private.attempts
    (household_id,operation_id,actor_id,expected_revision,candidate,status,resulting_revision)
    values(p_household,p_operation,v_user,p_expected,p_candidate,v_status,v_revision);
  if v_status='committed' then
    update grapes_family_private.households set snapshot=p_candidate,revision=v_revision
       where id=p_household;
    insert into grapes_family_private.revisions
      (household_id,revision,operation_id,actor_id,snapshot)
      values(p_household,v_revision,p_operation,v_user,p_candidate);
  end if;
  return jsonb_build_object('status',v_status,'revision',v_revision,
      'conflict',v_status='conflict');
end $$;

create function grapes_family_private.read_own_attempt(p_household uuid,p_operation uuid) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=grapes_family_private.require_user(); v grapes_family_private.attempts%rowtype;
begin
  if grapes_family_private.role_for(p_household,v_user) is null then
    raise exception 'not a member' using errcode='42501'; end if;
  select * into v from grapes_family_private.attempts where household_id=p_household
    and operation_id=p_operation and actor_id=v_user;
  if not found then return null; end if;
  return jsonb_build_object('status',v.status,'revision',v.resulting_revision,
    'expectedRevision',v.expected_revision,'candidate',v.candidate);
end $$;

-- No authorized client ever accesses private tables directly. SQL SECURITY
-- INVOKER facades call narrowly granted definer functions in an UNEXPOSED schema.
create function api.home_create_household(p_title text) returns jsonb
language sql security invoker set search_path='' as $$
 select grapes_family_private.create_household(p_title)
$$;
create function api.home_list_households() returns jsonb
language sql security invoker set search_path='' as $$
 select grapes_family_private.list_households()
$$;
create function api.home_invite_member(p_household uuid,p_invitee uuid,p_role text) returns uuid
language sql security invoker set search_path='' as $$
 select grapes_family_private.invite_member(p_household,p_invitee,p_role)
$$;
create function api.home_list_my_invites() returns jsonb
language sql security invoker set search_path='' as $$
 select grapes_family_private.list_my_invites()
$$;
create function api.home_respond_invite(p_invite uuid,p_accept boolean) returns jsonb
language sql security invoker set search_path='' as $$
 select grapes_family_private.respond_invite(p_invite,p_accept)
$$;
create function api.home_remove_member(p_household uuid,p_member uuid) returns boolean
language sql security invoker set search_path='' as $$
 select grapes_family_private.remove_member(p_household,p_member)
$$;
create function api.home_read_household(p_household uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select grapes_family_private.read_household(p_household)
$$;
create function api.home_compare_and_swap(p_household uuid,p_operation uuid,p_expected bigint,p_candidate jsonb) returns jsonb
language sql security invoker set search_path='' as $$
 select grapes_family_private.compare_and_swap(p_household,p_operation,p_expected,p_candidate)
$$;
create function api.home_read_own_attempt(p_household uuid,p_operation uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select grapes_family_private.read_own_attempt(p_household,p_operation)
$$;

revoke all on all functions in schema grapes_family_private from public,anon;
grant execute on all functions in schema grapes_family_private to authenticated;
revoke all on all functions in schema api from public,anon;
grant execute on all functions in schema api to authenticated;
