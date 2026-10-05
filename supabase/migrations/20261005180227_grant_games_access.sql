-- Newer Supabase projects no longer grant table privileges to the API roles by
-- default, so grant exactly what is needed instead of relying on defaults:
-- the Edge Function (service_role) reads and writes; players only read
-- (row-level security still applies to them).
grant select, insert, update, delete on table public.games to service_role;
grant select on table public.games to authenticated;
revoke all on table public.games from anon;
revoke insert, update, delete, truncate, references, trigger on table public.games from authenticated;
