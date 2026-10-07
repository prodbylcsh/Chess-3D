---
name: local-supabase
description: Run the Wizard Chess Supabase back-end (Postgres, auth, realtime, the `game` Edge Function) locally inside a Claude Code cloud container, and run the online end-to-end tests. Use when changing supabase/ (migrations, functions, _shared rules used by the server), src/net/, or online game modes, or when you need real online games in the browser.
---

# Local Supabase

The live project is `xpfihksbcvhihanoqzrk`. It deploys from `main` through
`.github/workflows/supabase.yml` (migrations and the `game` function). **Never deploy
or touch the live project from a session.** Test locally instead.

## Start everything

```bash
.claude/skills/local-supabase/scripts/start.sh      # from the repo root; safe to re-run
```

The first run pulls images and takes several minutes, so start it with
`run_in_background`. The script:

1. starts `dockerd` (cloud containers don't start it);
2. starts a tiny npm mirror on `:4873` (`scripts/npm-mirror.mjs`, `NODE_USE_ENV_PROXY=1`);
   the Edge Function container can't reach npm through the agent proxy itself;
3. runs `supabase start` with the images from Docker Hub
   (`SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io`), skipping services the app doesn't use;
4. patches the `supabase/edge-runtime` image once: it trusts the proxy CA
   (`/root/.ccr/ca-bundle.crt`) and uses the mirror via the Docker network gateway. The
   original stays tagged `<tag>-orig`;
5. runs `supabase functions serve` and waits until the function answers;
6. prints the anon key.

Logs: `/tmp/supabase-local/*.log`. After a container restart, run the script again
(Docker images survive, processes don't).

## Test

```bash
SUPABASE_ANON_KEY=<printed key> npm run test:e2e     # tests/online.e2e.ts
```

For the app against the local stack, run Vite with
`VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<key>`. Online games
need two browser contexts (two anonymous players): create the game in one, open
`/join/<id>` in the other.

## Rules of thumb

- Pass `</dev/null` to `npx supabase …` commands. Some (`migration new`) wait for stdin
  and hang otherwise.
- New migration: `npx supabase migration new <name> </dev/null`, write the SQL, then
  `npx supabase db reset </dev/null` to apply all migrations from scratch.
- The function and the app share the rules in `supabase/functions/_shared/`; run
  `npm test` too after changing them.
- Never print, commit or paste secrets. The local anon and service keys are public demo
  keys and fine to use, but the live project's access token and DB password exist only
  as GitHub secrets.
- Stop the stack with `npx supabase stop </dev/null` if disk space gets tight.
