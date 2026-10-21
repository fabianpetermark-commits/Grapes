-- Phase 2 local test only. Run with psql against an ephemeral local Supabase DB.
-- Supply two synthetic Auth user UUIDs as -v user_a=... -v user_b=...
-- Both UUIDs must already exist in auth.users. This transaction rolls back.
\set ON_ERROR_STOP on
begin;
insert into grapes_private.profiles(user_id, profile_id)
values (:'user_a'::uuid, 'synthetic-a'), (:'user_b'::uuid, 'synthetic-b');

set local role authenticated;
select set_config('request.jwt.claim.sub', :'user_a', true);
do $$
declare result jsonb;
begin
  if jsonb_array_length(api.list_profiles()) <> 1 or
     api.list_profiles()->0->>'profileId' <> 'synthetic-a' then
    raise exception 'owner profile listing failed';
  end if;
  if api.create_profile() not like 'grapes:%' or jsonb_array_length(api.list_profiles()) <> 2 then
    raise exception 'new profile creation failed';
  end if;
  result := api.compare_and_swap('synthetic-a', 'food', 'entry-1',
    '00000000-0000-4000-8000-000000000001', 0, 1, '{"value":"A"}'::jsonb);
  if result->>'status' <> 'committed' or (result->>'revision')::bigint <> 1 then
    raise exception 'initial commit failed: %', result;
  end if;
  if api.read_document('synthetic-a','food','entry-1')->'payload' <> '{"value":"A"}'::jsonb or
     (api.read_document('synthetic-a','food','entry-1')->>'revision')::bigint <> 1 then
    raise exception 'owner head read failed';
  end if;
  if jsonb_array_length(api.list_documents('synthetic-a','food')->'items') <> 1 then
    raise exception 'owner head listing failed';
  end if;
  if api.read_revision('synthetic-a','food','entry-1',1)->'payload' <> '{"value":"A"}'::jsonb or
     jsonb_array_length(api.list_revisions('synthetic-a','food','entry-1')->'items') <> 1 then
    raise exception 'owner immutable version read failed';
  end if;
  if api.read_document('synthetic-a','food','missing') is not null then
    raise exception 'missing head was returned';
  end if;
  result := api.compare_and_swap('synthetic-a', 'food', 'entry-1',
    '00000000-0000-4000-8000-000000000001', 0, 1, '{"value":"A"}'::jsonb);
  if result->>'status' <> 'committed' or (result->>'revision')::bigint <> 1 then
    raise exception 'idempotent retry failed: %', result;
  end if;
  result := api.compare_and_swap('synthetic-a', 'food', 'entry-1',
    '00000000-0000-4000-8000-000000000002', 0, 1, '{"value":"stale"}'::jsonb);
  if result->>'status' <> 'conflict' or result->>'snapshotId' is null then
    raise exception 'stale write did not retain conflict: %', result;
  end if;
  result := api.read_attempt('00000000-0000-4000-8000-000000000002');
  if result->>'status' <> 'conflict' or result->'candidate' <> '{"value":"stale"}'::jsonb then
    raise exception 'owner cannot recover rejected candidate: %', result;
  end if;
  begin
    perform api.compare_and_swap('synthetic-b', 'food', 'entry-1',
      '00000000-0000-4000-8000-000000000003', 0, 1, '{}'::jsonb);
    raise exception 'cross-user profile write was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform api.compare_and_swap('synthetic-a', 'food', 'entry-1',
      '00000000-0000-4000-8000-000000000001', 0, 1, '{"value":"changed"}'::jsonb);
    raise exception 'operation ID reuse was allowed';
  exception when unique_violation then null;
  end;
end;
$$;

-- Direct table access is denied even when a caller knows its name.
do $$ begin
  begin
    perform count(*) from grapes_private.documents;
    raise exception 'direct private table read was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', :'user_b', true);
do $$ begin
  begin
    perform api.read_document('synthetic-a','food','entry-1');
    raise exception 'user B read user A head';
  exception when insufficient_privilege then null;
  end;
  begin
    perform api.list_revisions('synthetic-a','food','entry-1');
    raise exception 'user B read user A history';
  exception when insufficient_privilege then null;
  end;
  if api.read_attempt('00000000-0000-4000-8000-000000000002') is not null then
    raise exception 'user B read user A recovery snapshot';
  end if;
  begin
    perform api.compare_and_swap('synthetic-a', 'food', 'entry-1',
      '00000000-0000-4000-8000-000000000004', 1, 1, '{}'::jsonb);
    raise exception 'user B changed user A data';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin
    perform api.compare_and_swap('synthetic-a', 'food', 'entry-1',
      '00000000-0000-4000-8000-000000000005', 1, 1, '{}'::jsonb);
    raise exception 'missing Auth user was allowed';
  exception when invalid_authorization_specification then null;
  end;
end $$;

reset role;
set local role anon;
do $$ begin
  begin
    perform api.list_profiles();
    raise exception 'anonymous role listed profiles';
  exception when insufficient_privilege then null;
  end;
  begin
    perform api.read_document('synthetic-a','food','entry-1');
    raise exception 'anonymous role read head';
  exception when insufficient_privilege then null;
  end;
  begin
    perform api.compare_and_swap('synthetic-a', 'food', 'entry-1',
      '00000000-0000-4000-8000-000000000006', 1, 1, '{}'::jsonb);
    raise exception 'anonymous role executed CAS';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

savepoint rollback_probe;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'user_a', true);
do $$ begin
  if (api.compare_and_swap('synthetic-a', 'food', 'entry-1',
      '00000000-0000-4000-8000-000000000007', 1, 1, '{"value":"rolled back"}'::jsonb)->>'status') <> 'committed' then
    raise exception 'rollback probe did not commit inside savepoint';
  end if;
end $$;
rollback to savepoint rollback_probe;
reset role;
do $$ begin
  if (select count(*) from grapes_private.documents where profile_id = 'synthetic-a') <> 1 or
     (select count(*) from grapes_private.revisions where profile_id = 'synthetic-a') <> 1 or
     (select count(*) from grapes_private.attempts where profile_id = 'synthetic-a') <> 2 or
     (select count(*) from grapes_private.attempts where operation_id = '00000000-0000-4000-8000-000000000007') <> 0 then
    raise exception 'head, history or conflict snapshot mismatch';
  end if;
end $$;
do $$ begin
  begin
    delete from grapes_private.attempts where profile_id = 'synthetic-a';
    raise exception 'conflict recovery was mutable';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    update grapes_private.revisions set payload = '{}'::jsonb where profile_id = 'synthetic-a';
    raise exception 'revision history was mutable';
  exception when object_not_in_prerequisite_state then null;
  end;
end $$;
rollback;
