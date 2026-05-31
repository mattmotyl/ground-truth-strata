# Ground Truth Strata — Roadmap

Deferred enhancements that are intentionally out of scope for v0.1.0.
Tracked here so they are not lost; none of these block the current
release.

## Data-integrity follow-ups (pre-deployment)

- **[RESOLVED 2026-05-30, commit 0357c4b] correlations.json AI_ATTITUDES
  tokens** (`ai_useds*`, `q_ai8a_*`). Root cause was NOT `EXCLUDED_DOMAINS`
  (that constant was declared in `build_correlations.R` but never applied —
  dead code): the `multiselect_parents` filter omitted the
  `excluded_from_outputs` check that `dict_inputs` already had, so the AI
  exploded option-columns (flagged `excluded_from_outputs: true`) leaked in.
  Fixed by adding that check; regenerated correlations.json 5.30 → 2.00 MB.
  `gms00N` (PLATFORM_USE) intentionally retained.
- **Cross-wave correlations** (e.g. wellbeing W1 vs W6 for the same
  panelist) require a new precompute pass — correlations.json only
  contains same-wave pairs. Track A task for a future session.
- **Per-platform predictor correlations (restore the Platform
  Correlations tab).** The /explore "Platform correlations" tab (F08,
  time-per-day × wellbeing among users) is DISABLED in v0.1 (commented
  out in `explore-views.tsx`) — its time-per-day predictor is
  unvalidated, and it plus the binary `platform_user_<slug>` are the
  only platform-indexed predictors that exist in correlations.json. To
  give the tab real value, precompute (Track A, `build_correlations.R`)
  weighted Spearman ρ between each per-platform item — the us018a–g
  habit/attitude scale (W4–6), us002 frequency, and the
  us003/us007/us010/us012 experience flags — among that platform's
  users, against each respondent-level wellbeing measure. Caveats:
  per-platform denominators (small-n suppression), us018 is
  non-validated, binary flags read as point-biserial, all observational.
  Re-enable the tab once the JSON exists and is validated.

## Deferred / future enhancements

- **/compare heatmap "Show top 8 / full table" toggle.** The Theme A
  drill-down heatmap renders the platforms currently chosen in the
  multiselect. A separate top-8 / full-table toggle (Chart Type #4 in
  PHASE4_UI_SPEC.md) is deferred — the platform multiselect already
  bounds the visible rows.
- **Glossary with tooltip underlines** (same pattern as
  show-me-the-data.com).
- **Box-and-whisker / violin plot** for political ideology per platform.
- **Multiple-comparison correction** (Bonferroni / FDR) for Finding 08.
- **Paired / repeated-measures SE** for longitudinal change claims
  (current significance rule uses the conservative independent-samples
  pooled SE).
- **URL state persistence (partial).** Shipped 2026-05-30: the landing
  Start Here cards deep-link into /trends (`?category=<id>&q=<questionKey>`)
  and /explore (`?tab=`); both pages read the query params and validate
  against the registry/views, falling back to defaults. Still deferred:
  persisting wave / platform / zoom / picker selections in the URL, and
  deep-linking /platforms (platform picker) and /compare (theme/question).
- **Grayscale-friendly fallback** for significance-colored bars.
- **Loading states / Suspense fallbacks** for the large JSON files
  beyond the current plain "Loading…" text.
- **/explore correlation matrix + variable pairs — SHIPPED 2026-05-30.**
  The /explore route now has a two-tab layout: a pairwise **correlation
  matrix** (lower-triangle, ≤12 respondent-level vars, per-wave,
  plain-language axis labels) and a **variable-pairs-over-time** view (ρ
  per wave for any two respondent-level variables). The old Finding-08
  "Platform correlations" view is disabled (see the per-platform
  precompute item above). NOT built / not feasible: a true two-variable
  **scatter with regression line** — correlations.json holds only
  precomputed ρ per pair (no raw respondent points), so there is nothing
  to scatter. A scatter would need a different, per-respondent data
  export, which is out of scope for the precomputed-JSON architecture.
- **/platforms — Usage frequency distribution section.** Listed in the
  original PHASE4_UI_SPEC /platforms checklist but dropped from the
  T3-B5 build scope. Would show the us002 frequency-of-use distribution
  for the selected platform.
- **/platforms — Time spent per day section (W4–W5).** Also in the
  original checklist, dropped from T3-B5 scope. us019 time-per-day is
  sparse (W4–W5 only) and excluded from JSON output via
  EXCLUDED_VARIABLES, so this would need the data path reconsidered
  before it can be built.
- **/compare group-split — dense-case fallback.** If the race/ethnicity
  breakdown (6 bars per platform cluster: Overall + 5 groups) reads too
  dense in full review, the fallback is numbers-only for 4+ group
  demographics — keep the multi-column Numbers table but drop the
  grouped bars (Overall stays as the table column). The Overall bar was
  intentionally de-emphasized (light grey #C8C3BC) to mitigate density;
  revisit only if review still finds it cluttered.
- **Lift platform selection to TrendsExplorer for cross-category
  persistence (currently resets per renderer).** On /trends, the
  platform multiselect lives inside each platform-using renderer
  (Platform Use & Experiences, Well-Being), so switching category resets
  the selection to the default 8. Mirroring /compare's persistence would
  require hoisting the selected-platform state into TrendsExplorer and
  threading it (plus F01's initialPlatforms) through the renderers.
- **Reference lines — time-axis upgrade.** /trends contextual-event
  reference lines currently *snap* each event to the wave whose
  collection window contains its date (or the nearest wave when it falls
  between windows), because the X axis is a categorical wave-band scale.
  A future enhancement is to switch the trend X axis to a numeric/time
  scale and place each event line at its true calendar date (fractional
  position between waves). See `buildEventReferenceLines` /
  `snapEventToWave` in `trends-adapters.ts` (marked with a
  `TODO(time-axis)`). Note: all 18 events are shown on every category
  (macro and platform-specific alike); filtering platform-specific events
  by the currently selected platform is a possible future refinement.
- **"Too many levels" picker warning — dropped from T3-B7 scope.** The
  original /trends variable-picker spec called for an intelligent warning
  when a chosen variable had too many response levels to chart cleanly.
  It was dropped: the curated category registry only exposes variables
  that chart well, and small-n cells are already handled by suppression,
  so the warning had no variable to fire on. Revisit only if an
  open-ended (non-curated) variable picker is reintroduced.
- **Context event label crowding.** With all 18 context events visible
  simultaneously, Wave 6 and Wave 3/4 labels can clip at the card edge or
  sit tight. Per-event toggles are the intended workaround. Future:
  force-directed or rotated label placement for dense event waves.
