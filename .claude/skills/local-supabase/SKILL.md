---
name: local-supabase
description: Run the Wizard Chess Supabase back-end (Postgres, auth with emails, realtime, the `game` and `account` Edge Functions) locally inside a Claude Code cloud container, read auth emails, and run the end-to-end tests. Use when changing supabase/ (migrations, functions, _shared rules used by the server), src/net/, src/api/supabase/, online game modes or anything about accounts, or when you need real accounts or online games in the browser.
---

# Local Supabase

The live project is `xpfihksbcvhihanoqzrk`. It deploys from `main` through
`.github/workflows/supabase.yml` (migrations and the `game` and `account` functions).
**Never deploy or touch the live project from a session.** Test locally instead.
Dashboard-only settings for the live project (URLs, SMTP, Apple and Google) are listed in
`docs/PLATFORM.md` §8.4: tell the user, don't attempt them.

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
   (`SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io`), skipping services the app doesn't use.
   The first boot often fails with `StatusDbNotReadyError`, so it retries up to 3 times;
4. starts an **email sink** in place of Mailpit (`scripts/smtp-sink.mjs`, see below);
5. applies migrations added since the database volume was created (`migration up`);
6. patches the `supabase/edge-runtime` image once: it trusts the proxy CA
   (`/root/.ccr/ca-bundle.crt`) and uses the mirror via the Docker network gateway. The
   original stays tagged `<tag>-orig`;
7. runs `supabase functions serve` and waits until the functions answer;
8. prints the anon and service-role keys (local demo keys).

Logs: `/tmp/supabase-local/*.log`. After a container restart, run the script again
(Docker images survive, processes don't).

## Auth emails

`supabase/config.toml` has email confirmation on, like production. The auth server sends
every email to `supabase_inbucket_chess-3d:1025`. Mailpit's image comes from Docker Hub,
which rate-limits these containers (429), and the other registries' CDNs are blocked by
the proxy. So the script runs `smtp-sink.mjs` under that container name, on the host's
Node inside the edge-runtime image. It serves Mailpit's API on `:54324`:

```bash
curl -s http://127.0.0.1:54324/api/v1/messages          # list (newest first)
curl -s http://127.0.0.1:54324/api/v1/message/latest    # one message: Subject, To, Text, HTML
curl -s -X DELETE http://127.0.0.1:54324/api/v1/messages
```

Links in the emails point at `…/auth/v1/verify?…`. Following one (`fetch(link, {redirect:
'manual'})`) gives the URL the player lands on: the app with `?code=…` (PKCE), plus our
`&flow=recovery` on reset links, or `?error_code=otp_expired…` for a used or expired link.

## Test

```bash
SUPABASE_ANON_KEY=<key> SUPABASE_SERVICE_ROLE_KEY=<key> npm run test:e2e
# tests/online.e2e.ts (two players over the network) and tests/accounts.e2e.ts
# (sign-up with the emailed link, onboarding rules, permissions, reset, deletion)
```

Right after a fresh start, the first online test can time out while realtime and the
functions warm up ("two players play a game to checkmate…"). Run it again before
treating it as a failure. A second failure is real.

Create confirmed test users without email through the admin API (service-role key):
`admin.auth.admin.createUser({ email, password, email_confirm: true })`.

The dev server reads `.env.local`, which points at this local stack: `npm run dev` gives
real accounts. Online games need two browser contexts (or one plus a Node `Online`
client): create the game in one, open `/join/<id>` in the other.

## Rules of thumb

- Pass `</dev/null` to `npx supabase …` commands. Some (`migration new`) wait for stdin
  and hang otherwise.
- New migration: `npx supabase migration new <name> </dev/null`, write the SQL, then
  `npx supabase migration up --local </dev/null` (or `db reset` to rebuild from scratch).
  Grant table privileges explicitly (see the existing migrations): newer projects don't.
- Clients only read tables; every write goes through an Edge Function with the service
  role, which applies the rules in `supabase/functions/_shared/` (shared with the app;
  run `npm test` after changing them). New functions need `[functions.<name>]
  verify_jwt = false` in `config.toml` (they check the token themselves) and a deploy line
  in the workflow.
- Never print, commit or paste secrets. The local anon and service keys are public demo
  keys and fine to use, but the live project's access token and DB password exist only
  as GitHub secrets.
- Stop the stack with `npx supabase stop </dev/null` if disk space gets tight.
