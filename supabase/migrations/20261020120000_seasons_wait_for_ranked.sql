-- Ranked is closed until the platform has enough players, and season 1 starts when it
-- opens (SEASON_ONE in _shared/seasons.ts, October 2026). Until then no season runs:
-- `season` 0 means "before season 1". The calendar that counted seasons from July 2026
-- is gone, so nobody gets rewards for it; at the start of season 1 everyone starts fresh
-- at 1,000 MMR (rollSeasons).
update public.players set season = 0 where season > 0;
