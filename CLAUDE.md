# Wizard Chess 3D

An online chess platform around a cinematic 3D board. The plan, every product decision
and the roadmap are in **`docs/PLATFORM.md`**: read the relevant section before changing
behaviour, and update it when something changes.

## Hard rules

- **Git:** work on the session's development branch and push there. **Never push to or
  merge into `main`, and never open a PR, without the user's explicit permission.**
  `main` deploys the live site (GitHub Pages) and the live Supabase back-end.
- **Secrets:** never print, paste or commit Supabase access tokens or DB passwords (they
  live in GitHub secrets only). `.env.production` holds only the public URL and anon key.
- **The 3D game stays intact:** graphics, animations and effects are not to be changed
  unless asked. Only the interface around them is redesigned. The default look must stay
  identical.
- **Decided product rules** (MMR, ranks, coins, stakes, seasons, rewards, prices, username
  limits) are not changed without the user's yes. See the `game-rules` skill.
- **All UI text** goes through `t()`/`tk()`/`tn()` with a Czech entry. English is the
  default. See the `i18n` skill.
- Ask the user about undecided *product* questions, with a recommendation. Decide
  engineering questions yourself.

## Architecture in one breath

React 19 + Vite + TypeScript UI (`src/app`, `src/features/*`, `src/ui`), Three.js engine
(`src/game`, `src/scene`, `src/fx`, cosmetics in `src/cosmetics` + `src/game/Wardrobe.ts`),
typed service contracts (`src/api/types.ts`). Accounts and the own profile run on Supabase
(`src/api/supabase`, `account` Edge Function); everything else still runs on an in-browser
mock (`src/api/mock`, localStorage) keyed to the signed-in user. Online invite games are on
Supabase too (`src/net`, `game` Edge Function). Wizard Chess has its own Supabase project
(`wizard-chess`); its auth settings and email templates come from `supabase/config.toml`
on deploy (`supabase/auth-config.ts`). One Supabase client: `src/net/supabase.ts`.
Rules shared by app and server: `supabase/functions/_shared/*.ts`, imported as
`#shared/...` (explicit `.ts` extensions; Node runs them in tests).

## Commands

```bash
npm run dev            # http://localhost:5173, real accounts on the local Supabase (.env.local)
npm run dev:mock       # accounts in the browser too, no Supabase needed
npx tsc --noEmit       # type check
npm test               # rules, rating, seasons, shop, accounts, i18n, AI (must pass before every push)
npm run test:e2e       # online games and accounts; needs local Supabase (local-supabase skill)
```

## Skills in `.claude/skills/`

| Skill | Use it when |
| --- | --- |
| `build-module` | building or extending a module or milestone (workflow, mock back-end, UI conventions, finish checklist) |
| `i18n` | adding or changing any visible text; `scripts/sync.ts` updates the Czech dictionary |
| `game-rules` | anything about MMR, ranks, coins, stakes, seasons or rewards |
| `shop-items` | shop items, cosmetics, loadouts, plugging in the user's real assets |
| `verify-in-browser` | checking UI or 3D changes with screenshots (Playwright harness; mock or real accounts) |
| `local-supabase` | running the back-end locally (auth emails included) and the e2e tests |
