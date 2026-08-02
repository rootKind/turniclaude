-- 012_realtime_publication.sql
-- Adds the tables the app subscribes to via postgres_changes to the
-- supabase_realtime publication. Migration 007 only added app_settings.
-- Guarded with a DO block: `alter publication ... add table` fails if the
-- table is already in the publication (the live DB already has them).

do $$
declare
  t text;
begin
  foreach t in array array['shifts', 'shift_interested_users', 'vacation_requests', 'vacation_request_interests']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
