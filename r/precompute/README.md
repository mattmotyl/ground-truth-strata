# Phase 3: Precomputation Pipeline

This directory contains the R scripts that turn the cleaned UAS panel
data into the five static JSON artifacts the Strata web app serves.

## Pipeline

```
r/data/uas51{4..9}.csv         (raw, gitignored)
        │
        │  r/clean/transform_data() ∘ rename_variables()
        │  + per-wave pull of expansion children
        ▼
r/output/cleaned/all_waves_long.rds   (canonical cleaned, gitignored)
        │
        │  r/precompute/build_meta.R
        ▼
public/data/meta.json
        │
        │  + build_trends / build_platform_rates / build_group_comparisons / build_correlations
        ▼
public/data/{trends,platform_rates,group_comparisons,correlations}.json
```

The end-to-end driver is `build_all.R` — sources each step in order in
roughly 2 minutes. Each step is also runnable standalone for iteration.

## Why precompute

We deliberately do not run a query server. Reasons:

- **Hosting at $0.** Static JSON files hosted on Vercel scale to any
  traffic without per-request compute cost.
- **Reproducibility.** Every published estimate is a function of (raw
  CSV → cleaning → build script), all under version control. The
  JSON committed under `public/data/` is the audit trail.
- **Defensibility.** Confidentiality and statistical-quality rules
  (n≥30 suppression, weighting policy, reverse-coding) are enforced
  once in R rather than per-request in the UI.

Tradeoff: users cannot run arbitrary new analyses through the UI.
Adding a new variable, group, or metric requires a code change here.

## The build scripts

| Script | Reads | Writes | Notes |
|---|---|---|---|
| `r/clean/clean_all_waves.R` | raw CSVs + cleaning library | `r/output/cleaned/all_waves_long.rds` | Bound long tibble across all 6 waves; pulls MULTISELECT and battery-mean expansion children; derives time-per-day total |
| `build_meta.R` | `.rds` + `docs/data-dictionary.json` | `meta.json` | Variable / wave / platform manifest with data-availability classification |
| `build_trends.R` | `.rds` + `meta.json` | `trends.json` | Per (var × wave) mean or proportion |
| `build_distributions.R` | `.rds` + `meta.json` | `distributions.json` | Per (var × wave × bin) proportion — Likert option, SCALE_0_10 integer bin, count bin (num_sm_used / num_ai_used) |
| `build_platform_rates.R` | `.rds` + `meta.json` | `platform_rates.json` | Per (platform × wave × metric) rate or mean (7 metrics) |
| `build_conditional_breakdowns.R` | `.rds` + `meta.json` | `conditional_breakdowns.json` | Per (construct × platform × wave × option) proportion AMONG respondents who said YES to the parent yes/no for that platform-wave. Constructs: nuximpact, nuxtopic, bftwimpact, bftwtopic, mcxntopic, usefultopic |
| `build_group_comparisons.R` | `.rds` + `meta.json` | `group_comparisons.json` | Per (outcome × grouping × group × wave [× platform]) estimate. `platform_slug` field is null for scalar outcomes, slug string for per-platform outcomes (currently only us019_time_min) |
| `build_correlations.R` | `.rds` + `meta.json` | `correlations.json` | Per-wave pairwise Spearman over ~300 inputs |
| `build_all.R` | (all of the above) | (all of the above) | Top-level driver with timing/size summary |

## Shared utilities (`utils/`)

- `cell_filter.R` — `CELL_FLOOR = 30` plus `apply_cell_floor(stats, n)`.
  Cells with n < 30 are emitted with NA values and `suppressed: true`
  (not omitted) so the JSON shape stays stable across cells.
- `weighting.R` — `estimate_mean_both` / `estimate_proportion_both` /
  `estimate_correlation_both`. Each returns weighted + unweighted side
  by side. Weighted estimates use the `survey` package
  (`svymean`, `svyciprop`); weighted Spearman is rank-then-weighted-
  Pearson.
- `coercion.R` — `coerce_numeric` (factor → integer, character →
  as.numeric) and `coerce_binary01` (handles Yes/No strings, factors,
  and the `"<digit> <label>"` labelled-metadata format from UAS).
- `moe.R` — `ci_from_se` Wald bounds plus a re-export of
  `r/clean/utils/get_moe.R`.

## Phase 3 conventions

These are locked in across all build scripts. Summary:

| Topic | Choice | Where applied |
|---|---|---|
| Correlation method | Spearman across the board | `build_correlations` |
| Weighting | `survey` package with `final_weight`; emit both weighted and unweighted | all builds |
| Reverse coding | Apply `(max_code + 1) − x` for `is_reverse_coded` items at composite/correlation time only (NOT for standalone trends) | `build_correlations` |
| Political ideology tertile | Per-wave tertiles of `political_ideology_self` (0-100 numeric) | `build_group_comparisons` |
| Suppression | n < 30 → emit with NA + `suppressed: true` (not omitted) | all builds via `cell_filter` |
| Variable scope | All in-scope dict vars + MULTISELECT options + battery means; STRING_OPEN out of scope (lives in separate text files) | `build_correlations` |

## Expansion: MULTISELECTs and LIKERT batteries

The data dictionary records some variables as single logical entries
even though the raw CSV stores them as several exploded child columns:

| Dict variable | Raw children | Handling |
|---|---|---|
| `ai_used` | `ai_useds1..14` (W1 only — has 5 in raw) | MULTISELECT — each option becomes its own binary correlation input |
| `q_ai8a_1..7` | `q_ai8a_<N>s<opt>` (W2-3, 97 total across N) | MULTISELECT — same as above |
| `gms001..005` | `gms00<N>s<opt>` (W6, 52 total) | MULTISELECT — same as above |
| `q_ai11_1..7` | `q_ai11_<N>[a..n]` (W2-3) | LIKERT_5 battery — aggregated to **per-AI-tool mean** (`q_ai11_<N>_mean`); raw children dropped |
| `q_ai13_1..7` | `q_ai13_<N>[a..m]` (W2-3) | LIKERT_5 battery — aggregated to per-AI-tool mean |

`clean_all_waves.R::pull_expansion_columns()` reads these children
directly from the raw CSV (independent of `transform_data`'s `select()`)
and either passes them through as-is (MULTISELECTs) or aggregates them
via `rowMeans(..., na.rm = TRUE)` on the leading-digit-coerced
integer values (batteries). The result `left_join`s onto the cleaned
per-wave tibble.

`build_meta.R::classify_expansion()` detects these and tags the parent
dict variable accordingly:

- MULTISELECTs → `data_availability = "in_cleaned_csv_exploded"` with
  an `expansion_columns` array listing the child column names.
- Battery means → `data_availability = "in_cleaned_csv"` with
  `cleaned_column` pointing at the `_mean` column.

`build_correlations.R` then enumerates each expansion child as its
own input.

## Adding a new build

1. Decide your unit of analysis (per row of output JSON).
2. Source `cell_filter.R` + `weighting.R` + `coercion.R`. Use the
   `estimate_*_both()` helpers — never reimplement weighted stats.
3. Read inputs from `r/output/cleaned/all_waves_long.rds` and (for
   variable metadata) `public/data/meta.json`.
4. Apply `apply_cell_floor()` per cell.
5. Write compact JSON to `public/data/`:
   `write_json(rows, out_path, auto_unbox = TRUE, na = "null", null = "null", pretty = FALSE)`
6. Add the script to `build_all.R`'s `steps` list.
7. Document in this README's "build scripts" table.

## Output suppression / shape

All five JSON artifacts share these conventions:

- **Top-level array of row objects** (`[{...}, {...}, ...]`) for the
  build scripts; `meta.json` is a single object with `waves`,
  `platforms`, `variables` arrays inside.
- **Compact JSON** (no pretty-print) for size.
- **`suppressed: true`** + null-valued stat fields when n < 30. The
  field is always present so the UI can dispatch on it uniformly.
- **`metric_type: "mean" | "rate"`** on per-cell rows so the UI knows
  which estimate kind it's reading.
- **Variable identifiers** are the dictionary's `variable_name` field
  (e.g., `rate_self`, `ls002a`); join to `meta.json` for the human-
  readable `clean_variable_name`, `construct`, etc.

## Diagnostic logs

Each script sinks a timestamped diagnostic file to
`M:/MM/Websites/strata-local/audit/output/` (when reachable). These
audit artifacts stay in the local-only workspace per the project's
"no committed audit files" rule. The top-level driver `build_all.R`
deliberately does NOT sink — caller should redirect (`*>`) so it
catches both driver and per-step output in one log.
