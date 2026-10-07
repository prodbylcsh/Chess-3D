---
name: i18n
description: Rules and tooling for interface text in Wizard Chess (English default, Czech). Use whenever you add, change or remove any user-visible string (labels, toasts, errors, empty states, aria-labels, titles, item names, mock API messages), add a language, or when tests/i18n.test.ts fails.
---

# Interface text and translations

Every user-visible string is written in English in the code and translated through
`src/i18n`. Czech (`src/i18n/cs.ts`) must always be complete: `npm test` fails otherwise.

## Which helper

| Situation | Use |
| --- | --- |
| Text shown now (components, toasts, errors, mock API messages, game modes) | `t('Text {name}', { name })` |
| Text stored in data and translated later (menus, tables, catalog, `REASON` maps) | `tk('Text')` in the data, `t(value)` where it is shown |
| A count | `tn(n, '{n} move', '{n} moves')` — never `n === 1 ? … : …` |
| A rank label like "Silver II" from the API | `rankText(label)`; tier ids: `tierName(id)` |
| Dates and numbers | `src/ui/format.ts` helpers, `formatNumber`, `locale()` — never `toLocaleString()` without a locale, never `'en-US'` |
| Module that cannot import `src/i18n` (shared server code, the AI worker) | keep English there and register the strings with `tk()` in `src/i18n/keys.ts` |

Rules that keep the scanner and the translations working:

- Pass **string literals** to `t`/`tk`/`tn`. Variables are fine only when the value was
  registered with `tk()` somewhere (e.g. `t(CATEGORY_NAMES[c])`). A ternary inside `t()`
  is not scanned: write `cond ? t('A') : t('B')`.
- Never build sentences by concatenation (`t('Win') + ' +' + n`); use one key with
  `{placeholders}`. Czech word order differs.
- When text wraps JSX (`<b>{name}</b> invites you`), split it into a key that reads well
  in both languages on its own, e.g. `{host} {t('invites you to a game')}`.
- Don't name a local variable `t` (timers!) in a file that imports `t`: use `timer`, `t1`.
- `translate` is imported as an alias of `t` only in `src/ui/art/art.tsx`, where `t` is a
  tier variable.
- Internal sentinels and codes stay English and untranslated (e.g. `sideName()` returns
  `'You'`, stored game reasons like `'checkmate'` are translated only when displayed).
- Components re-mount when the language changes (`LanguageRoot`), so the plain `t` is fine
  inside components; `useT()` exists for the few that render outside it.

## Workflow after changing text

```bash
node .claude/skills/i18n/scripts/sync.ts              # what is missing / stale
node .claude/skills/i18n/scripts/sync.ts --template > /tmp/new.json   # fill in the Czech
node .claude/skills/i18n/scripts/sync.ts /tmp/new.json                 # merge, drop stale, rewrite cs.ts
npm test
```

The script refuses empty translations and translations whose `{placeholders}` differ
from the English key. It rewrites `cs.ts` in order of first appearance, so diffs stay small.

## Czech style

- Informal **ty** throughout ("Vyber si", "Tvůj rank"), matching the existing entries.
- Avoid gendered past tense where possible; when unavoidable use `(a)`: "Vzdal(a) ses".
- Plurals: `tn` keys need three entries: `'{n} move'` → `'{n} tah'`, `'{n} moves'` → `'{n} tahů'`
  (0, 5+) and `'{n} moves#few'` → `'{n} tahy'` (2–4).
- Months after "od"/"do" need the genitive; date formats from `toLocaleDateString('cs-CZ',
  {month:'long'})` give the nominative ("říjen"), so phrase around it ("Registrace: říjen 2026").
- Numbers: "31 000", "10 %" (space before %), "1. 1. 2027" — the formatters do this.
- Game terms: rank tiers Železo, Bronz, Stříbro, Zlato, Platina, Smaragd, Diamant, Mistr,
  Velmistr, Vyzyvatel; mat, pat, remíza, šach; hodnocená (ranked) / nehodnocená (casual)
  hra; "o mince" (for coins); sezóna; Obchod (Shop).
- Keep product names untranslated: Wizard Chess, MMR.

## Adding a language

1. Add `src/i18n/<lang>.ts` (same shape as `cs.ts`) and register it in `DICTIONARIES`
   (`src/i18n/index.ts`) and `LANGUAGES` (`src/app/prefs.ts`); add its `locale()` mapping.
2. Extend `tn()` if the language has other plural forms.
3. Make the completeness test cover it (it currently checks `cs`).
4. Record the decision in `docs/PLATFORM.md` §10.
