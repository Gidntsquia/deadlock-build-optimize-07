# Deadlock Build Optimizer

Mobile-first React app that generates deterministic item builds and ability
level-up orders for any Deadlock hero from public aggregate match data, then
validates the output against a real top player's (Zergggy, account
35187362) actual Infernus purchases as a held-out sanity check.

## Running it

```
npm install
npm run fetch-data   # hits api.deadlock-api.com / assets.deadlock-api.com, writes public/data/*.json
npm run dev           # or: npm run build && npm run preview
```

After `fetch-data` runs once, the app never makes network calls — it reads
only the JSON files under `public/data/`.

## Data pipeline (`scripts/fetch-data.mjs`)

Fetches and snapshots, in order:

1. `GET /v2/items/by-type/upgrade` (assets API) — full item catalog, 251 items.
2. `GET /v2/items/by-type/ability` (assets API) — ability catalog (389 abilities across all heroes), used to resolve real ability names/images for `ability-order-stats` numeric ids.
3. `GET /v2/heroes` (assets API) — all 57 heroes; 38 pass the "active" filter (`player_selectable && !disabled && !in_development`).
4. For each active hero: `/v1/analytics/item-stats`, `/v1/analytics/ability-order-stats`, `/v1/analytics/item-permutation-stats`, each `?hero_id=`, with a 150ms sleep between calls to stay well under rate limits. `ability-order-stats` and `item-permutation-stats` are trimmed to the top 25 / top 100 rows by `matches` per hero before saving — the long tail is one-off noise and this keeps the snapshot small (from ~80MB combined down to ~600KB) without losing anything the generator uses.
5. Zergggy's match history (`/v1/players/35187362/match-history`), filtered to Infernus (`hero_id===1`) and standard matchmaking (`game_mode===1` and `match_mode` 1 or 2 — observed values: 1=Unranked, 2=Ranked; mode 4 and the `game_mode===4` rows were excluded as non-standard/event content), most recent 30 matches. For each, `/v1/matches/{id}/metadata` is fetched and only that account's `items` purchase array is kept.
6. App-user's (267836488) match history, same standard-mode filter, for the personalization insight.

Total snapshot size: ~5.8MB.

## Judgment calls (no user input needed at generation time)

- **"Shopable" item definition**: `cost > 0`, `item_tier` in 1-4, and `item_slot_type` in `weapon`/`vitality`/`spirit`. This yields 228 items (the catalog has 251 rows total; 23 are non-purchasable variants/leftovers with `shopable:false` in the source data and are excluded). 228 ≥ the 200-item requirement.
- **Active heroes**: `player_selectable && !disabled && !in_development` → 38 heroes. All 38 are guaranteed to render; only Infernus is tuned/validated against real player data.
- **Two build archetypes, generic across all heroes** (not hardcoded to any hero's specific items): "Gun Damage Build" biases toward `weapon`-slot items, "Spirit / Ability Build" biases toward `spirit`-slot items. This works for any hero because it's driven by item slot type and generic stat-property keywords, not by hero name.
- **Minimum sample size**: an item is only eligible if its `item-stats` row has `matches >= 30`. Below that, win rate is too noisy to trust.
- **Game phase (early/mid/late)**: derived from `avg_buy_time_relative` in `item-stats` (the API's own "how far into the average game is this item typically bought, as a %" field) — `<33%`→early, `33-66%`→mid, `>66%`→late. This is real purchase-timing data, not a guess.
- **Buy-order within a build**: items are sorted by `avg_buy_time_relative` ascending.
- **Item count per build**: fixed budget of 4 tier-1, 4 tier-2, 3 tier-3, 2 tier-4 items = 13 items per build (≥12 required), picked as the top-scoring items in each tier for that archetype.
- **Ability order**: pick the single sequence from `ability-order-stats` (which enumerates real 15-16 step ability-point sequences played by real matches) with the highest `winRate-confidence × log(matches)` score, restricted to sequences whose ability ids all belong to the target hero. Each id's first occurrence in the sequence = unlock; later repeats = upgrade points.

## Scoring function (`src/lib/generator.ts`)

For each shopable item with `matches >= 30` in the hero's `item-stats`:

```
winScore    = wilsonLowerBound(wins, wins+losses)      // 95% confidence lower bound on win rate
popularity  = log(1+matches) / log(1+maxMatchesForHero) // normalized pick rate
slotBonus   = 1.0 if item's slot matches archetype's primary slot,
              0.4 if item's slot is 'vitality' (partial credit either archetype),
              0.15 otherwise
keywordBonus = fraction of the item's stat properties that match archetype-relevant
               keywords (weapon: Damage/FireRate/ClipSize/BulletVelocity/... ;
               spirit: TechPower/SpiritPower/AbilityCooldown/AbilityDuration/...)
vitalityBonus = fraction of stat properties matching survivability keywords
               (MaxHealth/HealthRegen/Stamina/MoveSpeed/BulletResist) * 0.3

score = winScore*0.45 + popularity*0.2 + slotBonus*0.2 + keywordBonus*0.1 + vitalityBonus*0.05
```

Win-rate confidence dominates (0.45) because that's the strongest real signal
of "this item is good on this hero." Popularity (0.2) corroborates it —
a niche pick with a 51% win rate over 40 games is less trustworthy than a
mainstream 51%-over-40,000-games pick. Slot fit (0.2) and keyword synergy
(0.1) are what turn one flat item pool into two distinct named archetypes;
they're weighted lower because they're heuristic (string-matching on stat
property names) rather than measured outcomes. Vitality gets a small credit
(0.05) in both archetypes because survivability items are cross-cutting.

Item selection is a fixed per-tier budget (4/4/3/2 for tiers 1-4), taking the
top-scoring items within each tier — this guarantees a spread across the
whole game instead of, say, an all-tier-1 build. This whole pipeline is pure
function of the snapshot data — same input, same output, every run
(verified: see Acceptance criteria below).

The generator (`src/lib/generator.ts`) imports only `items.json`,
`heroes.json`, `abilities.json`, `item-stats.json`, and
`ability-order-stats.json`. It never imports
`zergggy-infernus-matches.json` — `grep -rn "zergggy" src/lib/generator.ts`
returns only a comment documenting that constraint, no import or fetch.

## Zergggy validation (`src/lib/validation.ts`, held-out)

This is the only module in the app that reads
`public/data/zergggy-infernus-matches.json`. It is invoked after a build is
already generated and only annotates/reports on it — it never feeds back
into `generator.ts`.

- **Core-set rule**: an item counts toward Zergggy's "core" Infernus set if
  it appears in **≥30%** of his 30 sampled matches, with wins weighted 2x and
  losses weighted 1x (so an item he buys mostly in matches he loses counts
  for less than one bought mostly in wins). Items below the 30% threshold
  are treated as one-off experiments and excluded from the core set — this
  is exactly the "one-off builds excluded" requirement.
- **Per-build agreement %**: `overlapPct*0.6 + orderAgreementPct*0.4`, where
  `overlapPct` = (core-set items also in the generated build) / (core-set
  size), and `orderAgreementPct` is a normalized pairwise-concordance
  (Kendall-tau-style) score comparing the relative buy order of items shared
  between the build and Zergggy's average purchase-order ranking.
- Every item shown in the UI carries a "Zergggy core" / "not core" badge
  (computed from the same core-set data), and each build tab shows its
  overall agreement % in a banner. This is explicitly framed in the UI as
  "how well the generator matches a real player," never as a build source.

## Personalization (`src/lib/insights.ts`)

Uses the app-user's (267836488) standard-mode match history to compute the
median match duration, and shows a one-line note ("your matches run short/
long/typical") that annotates how aggressively to chase the late-game tier-4
item in the buy list. It's a display-only annotation — it does not change
which items are chosen.

## UI

- Hero picker (horizontal scroll strip of all 38 active heroes) at the top,
  Infernus selected by default.
- Two build tabs per hero. Each build shows: buy order grouped into
  early/mid/late sections with per-item cost and a running soul total,
  and an ability level-up grid (16 steps, unlock steps outlined).
- Tapping any item opens a bottom-sheet detail card: shop image, cost, tier,
  slot type, tooltip text (innate/active descriptions from the assets API),
  and stat lines.
- Mobile-first: single centered column, max-width 480px (560px border on
  wider viewports), all tap targets ≥40px, horizontal-scroll only inside the
  hero picker strip (the rest of the page never scrolls horizontally).

## Verification performed

- `npm run fetch-data`: completed — 251-item catalog (228 pass the shopable
  filter), 38 active heroes with per-hero item-stats/ability-order-stats/
  item-permutation-stats, 30 of Zergggy's real Infernus matches with
  per-match purchase timelines, app-user match history.
- `npm run build`: succeeds (`tsc -b && vite build`), no type errors.
- Generator verified directly (Node script loading the real snapshots and
  calling `generateBuilds`) for Infernus + 3 other heroes (Wraith, Mo & Krill,
  Sinclair): each produced 2 named builds, 13 items each (≥12, grouped
  early/mid/late, correct running totals), 16-step ability order with 4 real
  ability names covering unlock + upgrade tiers, item images present.
  Running the generator twice on the same snapshot produced byte-identical
  output (determinism confirmed).
- `grep -rn "zergggy" src/lib/generator.ts` returns only the doc comment —
  no import/reference to the held-out snapshot file.
- Headless-browser (Playwright) verification of live rendering and console
  errors was attempted but could not run in this sandbox — the environment
  has no `libnspr4`/`libnss3` and no root access to install them. In lieu,
  the production bundle was served via `vite preview` and reachability of
  `index.html` and `data/*.json` was confirmed with `curl` (200 OK for
  both), TypeScript strict-mode compiled cleanly, and all data-shape
  assumptions were confirmed against live `curl` responses before writing
  any parsing code.
