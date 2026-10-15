-- Openings becomes the free puzzle module and First Steps costs coins like the others
-- (docs/PLATFORM.md §4.2). Players who solved a First Steps puzzle while it was free keep
-- it unlocked.
insert into public.puzzle_modules (player_id, module, unlocked_at)
select player_id, 'first-steps', min(solved_at)
from public.puzzle_solves
where module = 'first-steps'
group by player_id
on conflict (player_id, module) do update
  set unlocked_at = coalesce(public.puzzle_modules.unlocked_at, excluded.unlocked_at);
