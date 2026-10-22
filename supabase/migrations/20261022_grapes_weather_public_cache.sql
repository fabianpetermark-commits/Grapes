-- TEST-only weather snapshot. Public readers cannot access this table directly.
-- Access via the Edge Function public read-only endpoint.
create table if not exists public.grapes_weather_public_cache (
  location_key text primary key check (location_key = 'szentendre'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.grapes_weather_public_cache enable row level security;
revoke all on table public.grapes_weather_public_cache from PUBLIC, anon, authenticated;
grant select, insert, update on table public.grapes_weather_public_cache to service_role;
-- Deliberately no RLS policies for client-side roles.
