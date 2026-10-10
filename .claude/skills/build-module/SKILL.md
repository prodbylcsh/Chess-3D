---
name: build-module
description: The workflow and conventions for building or extending a Wizard Chess platform module or milestone (Play, Puzzles, Learn, Community, Shop, Profile, Messages, Settings, back-end milestones). Covers API contracts and the mock back-end, shared code, UI and design rules, protecting the 3D game, docs, verification and git. Use when starting any feature larger than a one-line fix.
---

# Building a module

The user works **module by module, front-end first**: the UI is built against typed
service contracts with an in-browser mock back-end, and the real (Supabase) back-end
replaces the mock later without touching screens. The plan and every decision live in
`docs/PLATFORM.md`. Read the relevant section before starting, and keep it current.

## 0. Before writing code

- Read `docs/PLATFORM.md` for the module, plus §10 (decisions and open questions).
  Product questions that aren't decided there (rules, prices, what players see) go to
  the user. Give them a recommendation, don't silently pick one. Engineering choices are
  yours.
- Rules involving MMR, coins, seasons or prices: see the game-rules skill.
- Shop or cosmetics: see the shop-items skill.

## 1. Contracts and the mock back-end

- Types and service interfaces go in `src/api/types.ts`; add the service to `Api` and to
  `createMockApi()` (`src/api/mock/index.ts`). Larger services get their own file
  (`mock/social.ts`, `mock/shop.ts`).
- Mock conventions: start with `await wait()` (visible loading states); get the user with
  `session()`; throw `new ApiError('code', t('Human message.'))`; after a mutation call
  `save()` and `emit({ type: ... })` so badges and the header refresh; return
  `structuredClone(...)`, never live database objects.
- New stored fields: add defaults in `load()` and migrate old data in `migrate()`
  (`src/api/mock/db.ts`). People's browsers already hold older databases.
- Rules that the server must enforce (prices, rewards, limits) go in
  `supabase/functions/_shared/*.ts` as pure functions with tests. The mock calls them
  exactly as the server will.
- `_shared` files run under Node for tests and Deno on the server: use explicit `.ts`
  import extensions, the `#shared/...` alias from `src/`, no TypeScript parameter
  properties, enums or namespaces, and no browser or Node APIs.

## 1b. Moving a module to the real back-end (M4 onwards)

Accounts were the first module on Supabase. Follow the same pattern for the next ones:

- **Server:** a migration (table, constraints, RLS select-only for clients, explicit
  grants), an Edge Function that does every write with the service role, and the rules in
  `supabase/functions/_shared/` with unit tests. Functions return `{ error, code }`; the
  app maps codes to translated messages.
- **App:** implement the service in `src/api/supabase/` and swap it in inside
  `createSupabaseApi()`. Everything not yet moved keeps running on the mock store, keyed
  to the real user (`adoptAccount` in `src/api/mock/db.ts` mirrors the server profile
  into it). When a module moves, its data leaves the mock store and its fields come
  from the server instead; keep `npm run dev:mock` working.
- **Tests:** an e2e file against the local stack (local-supabase skill) covering the happy
  path, every rule the server enforces, and that clients can't write tables directly.
- **Auth settings** (URLs, email rules, templates) go into `supabase/config.toml`; the
  deploy applies them to the live project (`supabase/auth-config.ts`). Settings that hold
  secrets (SMTP, OAuth providers) go into the docs checklist (`docs/PLATFORM.md` §8.4)
  and the final report to the user: the user does them.

## 2. UI

- Pages use `Page` (`src/app/AppLayout.tsx`). Build from the kit (`src/ui/kit.tsx`): `Button`,
  `IconButton`, `Field`, `Card`, `Badge`, `Coins`, `Segmented`, `Modal`, `EmptyState`,
  `Spinner`, `ProgressBar`, `Switch`, `useToast`, `confirmDialog`, and `cx`. Avatars and
  emblems come from `src/ui/art/art.tsx`. Icons come from `lucide-react`.
- One CSS file per feature next to it. Use the tokens in `src/styles/global.css` (`--gold`,
  `--violet`, `--panel-solid`, `--border`, `--radius-*`, `--font-display`, …), never new
  ad-hoc colours for standard UI. Reuse the global keyframes `rise-in`, `fade-in`, `pop-in`.
  Global helper classes: `.faint`, `.muted`, `.display` (global.css), `.chip` (app.css),
  `.link-btn` (ui/kit.css).
- The phone layout starts at **`@media (max-width: 820px)`** (the tab bar replaces the
  sidebar). Check 390 px wide: no horizontal page scroll, toasts above the tab bar.
- Every visible string goes through `t()` (see the i18n skill) and gets a Czech entry.
- Loading, empty and error states for every list. Destructive actions go through
  `confirmDialog`.
- Sidebar entries: `NAV` in `AppLayout.tsx` (`tk()` labels, `mobile: true` for the tab bar);
  routes in `src/app/App.tsx`.

## 3. Don't break the game

The user asked for the 3D graphics, animations and effects to stay intact: only the
interface around them is redesigned.

- The engine (`src/game`, `src/scene`, `src/fx`) talks to React only through `GameUi` / the
  `GameStore`. Modes (`src/features/game/modes`) drive it. The engine is created once and
  attached and detached (`engine.ts`). Don't create a second one.
- Any change to the engine must keep the default look and animations pixel-for-pixel
  the same. Compare screenshots before and after (verify-in-browser skill, `gl: true`).
- Moves and the rules engine: the custom AI (`src/ai`) is perft-verified (`tests/ai.test.ts`).
  Don't touch its move generator without running those tests.

## 4. Finish

1. `npx tsc --noEmit` and `npm test` (unit tests: rules, rating, seasons, shop, accounts,
   i18n, AI). `npm run test:e2e` needs a local Supabase (local-supabase skill). Run it when
   `net/`, `supabase/`, `src/api/supabase/` or online modes change.
2. Check it in the browser (verify-in-browser skill) in English **and** Czech, desktop and
   phone width, and read the screenshots.
3. Update `docs/PLATFORM.md`: the module section, the roadmap table in §9 (status), and §10
   for new decisions. Update `README.md` ("What's in the app today") too.
4. Commit with a descriptive message to the **session's development branch** and push it.
   **Never push to or merge into `main`, and never open a PR, without the user's
   explicit permission.** `main` deploys the live site (GitHub Pages) and the Supabase
   back-end.
5. Never commit secrets: `.env.local` is ignored; `.env.production` holds only the public
   URL and anon key. Supabase access tokens and DB passwords live in GitHub secrets only.
6. Report back briefly: what's done, what's mocked or placeholder, and any open product
   question.
