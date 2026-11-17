-- Puzzles played against the server (audit, November 2026): the app no longer gets the
-- solutions. Each move goes to the `puzzles` function, which judges it and keeps the
-- attempt's state here (the right moves so far, mistakes, hints, what the board shows);
-- the stars and coins of a solve come from this state, not from the browser.
-- `rev` makes each change conditional on the state the function read (no lost updates).

alter table public.puzzle_attempts add column state jsonb not null default '{}'::jsonb;
alter table public.puzzle_attempts add column rev integer not null default 0;
