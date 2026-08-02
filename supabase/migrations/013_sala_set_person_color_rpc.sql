-- 013_sala_set_person_color_rpc.sql
-- Atomic read-modify-write of sala_schedule.colored_persons. The old client-side
-- implementation (lib/queries/sala-schedule.ts updatePersonColor) fetched the
-- whole jsonb, mutated it, and wrote it back — concurrent edits to the same
-- month could lose updates. A single UPDATE inside a function is atomic.
--
-- SECURITY DEFINER + explicit permission check so callers still need the same
-- write permission the RLS policies grant (admin or manager).

create or replace function public.set_person_color(
  p_month text,
  p_day int,
  p_name text,
  p_color text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing jsonb;
  v_day jsonb;
  v_updated jsonb;
begin
  -- Only admin or managers may write colors (mirrors migration 009 policies)
  if not (
    auth.uid() = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'::uuid
    or exists (select 1 from public.users where id = auth.uid() and is_manager = true)
  ) then
    raise exception 'permission denied';
  end if;

  select coalesce(colored_persons, '{}'::jsonb) into v_existing
  from public.sala_schedule
  where month = p_month;

  if v_existing is null then
    v_existing := '{}'::jsonb;
  end if;

  v_day := coalesce(v_existing -> p_day::text, '{}'::jsonb);

  if p_color is null then
    v_day := v_day - p_name;
  else
    v_day := jsonb_set(v_day, array[p_name], to_jsonb(p_color));
  end if;

  if v_day = '{}'::jsonb then
    v_updated := v_existing - p_day::text;
  else
    v_updated := jsonb_set(v_existing, array[p_day::text], v_day);
  end if;

  update public.sala_schedule
  set colored_persons = v_updated
  where month = p_month;
end;
$$;

revoke all on function public.set_person_color(text, int, text, text) from public;
grant execute on function public.set_person_color(text, int, text, text) to authenticated;
