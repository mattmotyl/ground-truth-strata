# Build TWO sibling files in public/data/:
#   - group_comparisons.json          — respondent-level outcomes
#                                       (platform_slug always null)
#   - platform_group_comparisons.json — per-platform outcomes by
#                                       demographic group (platform_slug
#                                       always a slug string)
#
# Both files emit weighted-only point estimates with normal-approximation
# CIs. Cells with n<30 are emitted with NA stat fields and
# `suppressed: true`. Unweighted estimates were dropped from JSON output
# in Step 2 of the P3 patch (retained in the in-memory R objects for
# spot-check validation only).
#
# Scalar (respondent-level) outcomes — group_comparisons.json:
#   90 vars + 14 q_ai battery means, iterated across base demographic
#   grouping vars AND every platform_user_<slug> grouping var. The
#   platform_user_* cuts are valid here because the outcome (wellbeing,
#   loneliness, etc.) is a respondent-level property and "X among
#   Facebook users vs. non-users" is analytically sensible.
#
# Per-platform outcomes — platform_group_comparisons.json:
#   us019_time_min (mean minutes per day, W4-W5) and the four P3-B
#   experience rates us003/us007/us010/us012 (W1-W6 binary). Iterated
#   ONLY across base demographic grouping vars — cross-platform-user
#   cuts ("negative experiences on Facebook among Instagram users")
#   are not consumed by any UI and would inflate the file ~23x.
#
#   IMPORTANT: every row in platform_group_comparisons.json is
#   CONDITIONAL ON PLATFORM USE. us003/us007/us010/us012 are shown
#   only to platform users by survey skip logic, so non-users have NA
#   in the per-platform wide columns and are dropped by the weighted
#   estimator's keep_w filter. us019_time_min is asked only of users
#   for the same reason. Denominators are platform users in the named
#   demographic group, not all respondents in that group. Interpret
#   weighted_value accordingly; the UI should label these estimates
#   as conditional on use (same caveat as conditional_breakdowns.json).
#
# P3-C (ideology composition stacked bar) is intentionally NOT in this
# file. The same data already lives in platform_demographics.json as
# rows with grouping_var = "political_ideology_group" and the /compare
# stacked bar reads that file directly. (Decision: 2026-05-27 session.)
#
# Grouping vars:
#   gender, age, education, race, pol_incl_leaners — straight columns
#                                                    from cleaned tibble
#   political_ideology_tertile  — derived here as per-wave tertiles of
#                                 political_ideology_self (0-100 numeric)
#                                 per project_phase3_conventions
#   platform_user_<slug>        — derived here per (respondent x wave)
#                                 from uses_<slug>_w<wave> columns. One
#                                 grouping var per platform, two groups
#                                 ("User"/"Non-user").
#
# Invoke:
#   Rscript r/precompute/build_group_comparisons.R

suppressPackageStartupMessages({
  library(tidyverse)
  library(here)
  library(jsonlite)
})

source(here("r", "precompute", "utils", "cell_filter.R"))
source(here("r", "precompute", "utils", "weighting.R"))
source(here("r", "precompute", "utils", "coercion.R"))
source(here("r", "precompute", "utils", "transforms.R"))

# ── Output exclusions ──────────────────────────────────────────────
# These exclusions apply to JSON output only. They do NOT affect the
# cleaned .rds files or the R cleaning scripts.
# Re-including any of these in a future release is a one-line change.

EXCLUDED_DOMAINS <- c(
  "AI_ATTITUDES"        # W4+ data unavailable; W1-W3 alone would mislead
)

EXCLUDED_VARIABLES <- c(
  # Time-spent items — sparse (us019 absent W6; W4-W5 only)
  "us019_hours", "us019_minutes",

  # Conditional follow-up items — only valid in conditional_breakdowns.json.
  # These are asked only of respondents who answered the parent question
  # affirmatively (e.g., us004 only if us003 = yes). Including them in
  # general correlations/trends would compute estimates on a selected
  # subgroup, not the full sample, producing misleading results.
  "us004", "us005",     # negative experience: impact + topic
  "us008", "us016",     # bad for world: impact + topic
  "us025", "us026",     # meaningful connection + useful: topic

  # In-person experience items (us020-us024) intentionally included.
  # These are the in-person counterparts to platform-indexed experience
  # items (us002/us003/us007/us010/us012) and appear only in W5-W6.
  # Build scripts derive waves_present_in_data from the cleaned tibble
  # so only W5-W6 rows will be emitted — no change needed elsewhere.

  # Administrative / sampling variables
  "citizenus", "statereside", "primary_respondent",
  "bornus", "stateborn", "language", "dateofbirth_year",
  "regis", "cs_001"
)

# Variables excluded from specific outputs only — not globally excluded.
# us001 (platform use, binary) is excluded from trends.json and
# group_comparisons.json because platform_rates.json already covers
# usage rates. It is INCLUDED in correlations.json — see Step 1a.
EXCLUDED_VARIABLES_TRENDS <- c(EXCLUDED_VARIABLES, "us001")
EXCLUDED_VARIABLES_GROUP_COMPARISONS <- c(EXCLUDED_VARIABLES, "us001")
EXCLUDED_VARIABLES_CORRELATIONS <- EXCLUDED_VARIABLES  # us001 intentionally kept

EXCLUDED_SUFFIXES <- c(
  "_other"              # free-text 'other specify' captures — out of scope
)

EXCLUDED_TYPES <- c(
  "STRING_OPEN"         # catches any open-text variables not already excluded
)
# ── End exclusions ─────────────────────────────────────────────────

# ---- Sink ----
audit_dir <- "M:/MM/Websites/strata-local/audit/output"
ts        <- format(Sys.time(), "%Y%m%d_%H%M%S")
sink_path <- if (dir.exists(audit_dir)) {
  file.path(audit_dir, paste0("BUILD_GROUP_COMPARISONS_", ts, ".txt"))
} else {
  NULL
}
if (!is.null(sink_path)) sink(sink_path, split = TRUE)

tryCatch({

  # ---- Inputs ----
  rds_path  <- here("r", "output", "cleaned", "all_waves_long.rds")
  meta_path <- here("public", "data", "meta.json")
  if (!file.exists(rds_path))  stop("Cleaned .rds missing — run clean_all_waves.R first.")
  if (!file.exists(meta_path)) stop("meta.json missing — run build_meta.R first.")

  cat("Reading", rds_path, "\n")
  cleaned <- readRDS(rds_path)
  cat("Reading", meta_path, "\n")
  meta <- read_json(meta_path)
  cleaned <- apply_reverse_coding(cleaned)
  cleaned <- derive_loneliness(cleaned)

  # ---- Outcomes ----
  OUTCOME_NUMERIC <- c("LIKERT_3", "LIKERT_4", "LIKERT_5", "LIKERT_6",
                       "LIKERT_6_NOMID", "LIKERT_7", "RANGE_NUMERIC",
                       "SCALE_0_10", "SCALE_0_100")
  OUTCOME_BINARY  <- c("BINARY_YESNO")

  # Variables flagged in meta.json (excluded_from_outputs = TRUE) are
  # skipped via the flag. The per-script EXTRA list catches additions
  # not in the base EXCLUDED_VARIABLES — currently just us001.
  EXTRA_EXCLUDED_GROUP_COMPARISONS <-
    setdiff(EXCLUDED_VARIABLES_GROUP_COMPARISONS, EXCLUDED_VARIABLES)

  scalar_outcomes <- Filter(function(v) {
    identical(v$data_availability, "in_cleaned_csv") &&
      !isTRUE(v$is_platform_indexed) &&
      v$response_type %in% c(OUTCOME_NUMERIC, OUTCOME_BINARY) &&
      !isTRUE(v$excluded_from_outputs) &&
      !(v$variable_name %in% EXTRA_EXCLUDED_GROUP_COMPARISONS)
  }, meta$variables)

  # Per-platform outcomes: dict-platform-indexed numeric/binary vars
  # explicitly listed below. Routed to platform_group_comparisons.json
  # (new file from Step 3 of the P3 patch).
  #
  # us019_time_min: mean minutes per day on platform, W4-W5, numeric.
  # us003/007/010/012 (P3-B): per-platform experience rates, W1-W6,
  # binary. Templates resolve to nux_/bftw_/mcxn_/useful_<slug>_w<N>.
  PER_PLATFORM_OUTCOMES_INCLUDED <- c(
    "us019_time_min",
    "us003", "us007", "us010", "us012"
  )
  per_platform_outcomes <- Filter(function(v) {
    v$variable_name %in% PER_PLATFORM_OUTCOMES_INCLUDED &&
      identical(v$data_availability, "in_cleaned_csv") &&
      isTRUE(v$is_platform_indexed) &&
      v$response_type %in% c(OUTCOME_NUMERIC, OUTCOME_BINARY) &&
      !isTRUE(v$excluded_from_outputs) &&
      !(v$variable_name %in% EXTRA_EXCLUDED_GROUP_COMPARISONS)
  }, meta$variables)

  cat(sprintf("Outcomes in scope: %d scalar + %d per-platform (after flag + EXTRA_EXCLUDED_GROUP_COMPARISONS=[%s])\n",
              length(scalar_outcomes), length(per_platform_outcomes),
              paste(EXTRA_EXCLUDED_GROUP_COMPARISONS, collapse = ",")))

  # ---- Derived grouping vars ----
  # 1. political_ideology_tertile (internal column name retained for
  #    historical compatibility) — fixed three-way split of
  #    political_ideology_self (0-100 integer scale, 101 values).
  #    Replaces the previous per-wave quantile tertile. Cut-points are
  #    independent of sample composition so labels are comparable
  #    across waves AND platforms.
  #
  #    Design: Liberal and Conservative carry equal width (40 scale
  #    points each); Moderate is the necessary 21-point middle band
  #    that lets 40 + 21 + 40 = 101 total integer values:
  #        0-39    -> Liberal       (40 points)
  #        40-60   -> Moderate      (21 points)
  #        61-100  -> Conservative  (40 points)
  #
  #    The JSON output emits this as `grouping_var = "political_ideology_group"`
  #    via to_json_grouping_var() below, since the value is no longer a
  #    data-driven tertile but a fixed split.
  ideology_label <- function(x) {
    dplyr::case_when(
      x <= 39  ~ "Liberal",
      x <= 60  ~ "Moderate",
      x <= 100 ~ "Conservative",
      TRUE     ~ NA_character_
    )
  }
  cleaned$political_ideology_tertile <- ideology_label(cleaned$political_ideology_self)

  # Internal column name -> JSON grouping_var label. Renames
  # political_ideology_tertile to political_ideology_group in the
  # emitted JSON to reflect the fixed-split definition. Add more
  # entries here if any other internal column needs a different
  # JSON-visible label.
  JSON_GROUPING_VAR_NAMES <- c(
    political_ideology_tertile = "political_ideology_group"
  )
  to_json_grouping_var <- function(col) {
    if (col %in% names(JSON_GROUPING_VAR_NAMES))
      unname(JSON_GROUPING_VAR_NAMES[[col]])
    else col
  }

  # 2. platform_user_<slug>: derive per (respondent x wave) by reading the
  #    `uses_<slug>_w<wave>` column for the row's wave. Yes -> "User",
  #    No -> "Non-user".
  for (p in meta$platforms) {
    col_name <- paste0("platform_user_", p$slug)
    cleaned[[col_name]] <- NA_character_
    for (w in 1:6) {
      src_col <- paste0("uses_", p$slug, "_w", w)
      if (!src_col %in% colnames(cleaned)) next
      mask <- cleaned$wave == w
      raw  <- cleaned[[src_col]][mask]
      x01  <- coerce_binary01(raw)
      out  <- rep(NA_character_, length(raw))
      out[x01 == 1] <- "User"
      out[x01 == 0] <- "Non-user"
      cleaned[[col_name]][mask] <- out
    }
  }

  # ---- Grouping var lists ----
  # Two separate lists because scalar and per-platform outcomes route
  # to different files with different inclusion rules.
  base_grouping_vars <- c("gender", "age", "education", "race",
                          "pol_incl_leaners", "political_ideology_tertile")
  platform_user_grouping_vars <- paste0(
    "platform_user_",
    vapply(meta$platforms, function(p) p$slug, character(1))
  )

  # Respondent-level outcomes iterate the full set: base demographics
  # PLUS every platform_user_<slug> column. Cross-platform-user cuts
  # are valid here ("loneliness on Facebook users vs. non-users").
  respondent_grouping_vars <- c(base_grouping_vars, platform_user_grouping_vars)
  respondent_grouping_vars <- respondent_grouping_vars[
    respondent_grouping_vars %in% colnames(cleaned)
  ]

  # Per-platform outcomes iterate ONLY base demographics. The outcome
  # is already keyed by a specific platform, so platform_user_* cuts
  # would be cross-platform-user-cohort slices (e.g. "negative
  # experiences on Facebook among Instagram users") which no UI
  # consumes and which would multiply the file size ~23x.
  platform_outcome_grouping_vars <- base_grouping_vars[
    base_grouping_vars %in% colnames(cleaned)
  ]

  cat(sprintf(
    "Grouping vars: %d for respondent outputs (%d demographic + %d platform_user); %d for platform outputs (demographic only)\n",
    length(respondent_grouping_vars),
    length(base_grouping_vars),
    length(respondent_grouping_vars) - length(base_grouping_vars),
    length(platform_outcome_grouping_vars)
  ))

  # ---- Precompute wave masks ----
  wave_masks <- setNames(lapply(1:6, function(w) cleaned$wave == w),
                         as.character(1:6))

  # ---- Accumulators (one per output file) ----
  # Environments are pass-by-reference, so process_outcome can mutate
  # the accumulator it's handed without needing <<- on the caller's
  # bindings. Counters live alongside rows so the build log can report
  # emit/suppress totals per file separately.
  make_accumulator <- function() {
    e <- new.env(parent = emptyenv())
    e$rows         <- list()
    e$n_emitted    <- 0L
    e$n_suppressed <- 0L
    e
  }
  respondent_acc <- make_accumulator()
  platform_acc   <- make_accumulator()

  # ---- Iterate ----
  cat("Iterating outcomes x grouping_vars x waves x groups...\n")
  t0 <- Sys.time()

  # Inner loop helper. Emits one row per (grouping_var x wave x group)
  # for a given outcome vector. `platform_slug` is NULL for
  # respondent-level outcomes and a slug string for per-platform
  # outcomes. `grouping_vars_local` is the list of grouping columns to
  # iterate (respondent outputs pass the full list including
  # platform_user_*; platform outputs pass base demographics only).
  # `acc` is the destination accumulator environment.
  process_outcome <- function(x_full, waves, variable_name, is_binary,
                              platform_slug, grouping_vars_local, acc) {
    for (g_col in grouping_vars_local) {
      g_full <- cleaned[[g_col]]
      for (w in waves) {
        mask    <- wave_masks[[as.character(w)]]
        g_wave  <- g_full[mask]
        x_wave  <- x_full[mask]
        wt_wave <- cleaned$final_weight[mask]
        groups_present <- unique(g_wave[!is.na(g_wave)])
        if (length(groups_present) == 0) next

        for (g in groups_present) {
          sub <- !is.na(g_wave) & g_wave == g
          x_s <- x_wave[sub]
          w_s <- wt_wave[sub]

          if (is_binary) {
            est   <- estimate_proportion_both(x_s, w_s)
            gated <- apply_cell_floor(est, est$n)
            # Unweighted estimates intentionally excluded from JSON output (Step 2).
            # Retained in `est` / `gated` R objects for spot-check validation only.
            # To restore: add value, se, ci_lower, ci_upper back to this list().
            # `n` (unweighted observed count) and `weighted_n_eff` are both kept.
            row <- list(
              outcome           = variable_name,
              platform_slug     = platform_slug,
              grouping_var      = to_json_grouping_var(g_col),
              group             = as.character(g),
              wave              = as.integer(w),
              metric_type       = "rate",
              n                 = gated$n,
              weighted_value    = gated$weighted_prop,
              weighted_se       = gated$weighted_se,
              weighted_ci_lower = gated$weighted_ci_lower,
              weighted_ci_upper = gated$weighted_ci_upper,
              weighted_n_eff    = gated$weighted_n_eff,
              suppressed        = gated$suppressed
            )
          } else {
            est   <- estimate_mean_both(x_s, w_s)
            gated <- apply_cell_floor(est, est$n)
            # Unweighted estimates intentionally excluded from JSON output (Step 2).
            # Retained in `est` / `gated` R objects for spot-check validation only.
            # To restore: add value, se, ci_lower, ci_upper back to this list().
            row <- list(
              outcome           = variable_name,
              platform_slug     = platform_slug,
              grouping_var      = to_json_grouping_var(g_col),
              group             = as.character(g),
              wave              = as.integer(w),
              metric_type       = "mean",
              n                 = gated$n,
              weighted_value    = gated$weighted_mean,
              weighted_se       = gated$weighted_se,
              weighted_ci_lower = gated$weighted_ci_lower,
              weighted_ci_upper = gated$weighted_ci_upper,
              weighted_n_eff    = gated$weighted_n_eff,
              suppressed        = gated$suppressed
            )
          }

          if (isTRUE(gated$suppressed)) acc$n_suppressed <- acc$n_suppressed + 1L
          else                          acc$n_emitted    <- acc$n_emitted    + 1L
          acc$rows[[length(acc$rows) + 1]] <- row

          # Bucketed rows for 7-point Likert outcomes in BUCKETED_VARS.
          # Skipped for binary outcomes (Likert bucketing applies only
          # to mean-type outcomes). The continuous mean row above is
          # unchanged. Per Step C: bucket rows use uniform schema with
          # `weighted_value` — see strata-types.ts for the bucket-row
          # discriminant explanation. n and weighted_n_eff match the
          # continuous row because the bucket indicator and the Likert
          # have the same non-NA count within this group subset.
          if (!is_binary && variable_name %in% BUCKETED_VARS) {
            bucket_vec <- bucket_likert_7(as.integer(x_s))
            for (b in c("disagree", "neutral", "agree")) {
              indicator <- as.integer(bucket_vec == b)
              indicator[is.na(bucket_vec)] <- NA_integer_
              est_b   <- estimate_proportion_both(indicator, w_s)
              gated_b <- apply_cell_floor(est_b, est_b$n)
              row_b <- list(
                outcome           = variable_name,
                platform_slug     = platform_slug,
                grouping_var      = to_json_grouping_var(g_col),
                group             = as.character(g),
                wave              = as.integer(w),
                metric_type       = "rate",
                bucket            = b,
                bucket_label      = BUCKET_LABELS[[b]],
                n                 = gated_b$n,
                weighted_value    = gated_b$weighted_prop,
                weighted_se       = gated_b$weighted_se,
                weighted_ci_lower = gated_b$weighted_ci_lower,
                weighted_ci_upper = gated_b$weighted_ci_upper,
                weighted_n_eff    = gated_b$weighted_n_eff,
                suppressed        = gated_b$suppressed
              )
              if (isTRUE(gated_b$suppressed)) acc$n_suppressed <- acc$n_suppressed + 1L
              else                            acc$n_emitted    <- acc$n_emitted    + 1L
              acc$rows[[length(acc$rows) + 1]] <- row_b
            }
          }
        }
      }
    }
  }

  # Scalar outcomes → respondent_acc (full grouping_vars).
  for (v in scalar_outcomes) {
    outcome_col <- v$cleaned_column
    if (is.na(outcome_col) || !outcome_col %in% colnames(cleaned)) next
    is_binary   <- v$response_type %in% OUTCOME_BINARY
    x_full      <- if (is_binary) coerce_binary01(cleaned[[outcome_col]])
                   else            coerce_numeric(cleaned[[outcome_col]])
    waves       <- unlist(v$waves_present_in_data)
    if (length(waves) == 0) next
    process_outcome(x_full, waves, v$variable_name, is_binary, NULL,
                    respondent_grouping_vars, respondent_acc)
  }

  # Per-platform outcomes → platform_acc (base demographics only).
  # x_full is built per-platform by reading the right wide column for
  # each respondent's wave. Prefix is parsed from the cleaned_column
  # template stored in meta.json (e.g. "nux_<platform_slug>_w<wave>"
  # for us003 -> "nux").
  #
  # Implicit user-filter note: us003/us007/us010/us012 are shown only
  # to platform users by survey skip logic, so non-users have NA in
  # the per-platform wide columns. The weighted estimator drops these
  # via keep_w, making denominators in platform_group_comparisons.json
  # platform-users-only — estimates are conditional on platform use.
  # No explicit `platform_user_<slug> == "User"` subset is needed.
  # The same is true of us019_time_min (only users get the time prompt).
  for (v in per_platform_outcomes) {
    template <- v$cleaned_column
    if (is.null(template) || is.na(template)) next
    prefix    <- sub("_<platform_slug>_w<wave>$", "", template)
    is_binary <- v$response_type %in% OUTCOME_BINARY
    waves     <- unlist(v$waves_present_in_data)
    if (length(waves) == 0) next

    for (p in meta$platforms) {
      x_full <- rep(NA_real_, nrow(cleaned))
      any_data <- FALSE
      for (w in waves) {
        src_col <- paste0(prefix, "_", p$slug, "_w", w)
        if (!src_col %in% colnames(cleaned)) next
        mask <- cleaned$wave == w
        x_raw <- cleaned[[src_col]][mask]
        x_full[mask] <- if (is_binary) coerce_binary01(x_raw)
                        else            coerce_numeric(x_raw)
        any_data <- TRUE
      }
      if (!any_data) next
      process_outcome(x_full, waves, v$variable_name, is_binary, p$slug,
                      platform_outcome_grouping_vars, platform_acc)
    }
  }

  dt <- as.numeric(difftime(Sys.time(), t0, units = "secs"))
  cat(sprintf("  respondent rows: %d in %.1fs (%d above floor, %d suppressed)\n",
              length(respondent_acc$rows), dt,
              respondent_acc$n_emitted, respondent_acc$n_suppressed))
  cat(sprintf("  platform rows:   %d           (%d above floor, %d suppressed)\n",
              length(platform_acc$rows),
              platform_acc$n_emitted, platform_acc$n_suppressed))

  # ---- Write ----
  out_dir <- here("public", "data")
  dir.create(out_dir, showWarnings = FALSE, recursive = TRUE)

  # group_comparisons.json — respondent-level outcomes only.
  # platform_slug is null on every row. Existing UI consumers
  # (loadGroupComparisons in src/lib/strata-data.ts) continue to read
  # this file unchanged.
  out_path_resp <- file.path(out_dir, "group_comparisons.json")
  write_json(respondent_acc$rows, out_path_resp,
             auto_unbox = TRUE, na = "null", null = "null", pretty = FALSE)
  size_mb_resp <- file.info(out_path_resp)$size / 1024 / 1024
  cat(sprintf("Wrote %s (%.2f MB)\n", out_path_resp, size_mb_resp))

  # platform_group_comparisons.json — per-platform outcomes by
  # demographic group. platform_slug is a slug string on every row.
  # Read by loadPlatformGroupComparisons() in src/lib/strata-data.ts.
  #
  # See header docstring for the conditional-on-use caveat that applies
  # to every row in this file.
  out_path_plat <- file.path(out_dir, "platform_group_comparisons.json")
  write_json(platform_acc$rows, out_path_plat,
             auto_unbox = TRUE, na = "null", null = "null", pretty = FALSE)
  size_mb_plat <- file.info(out_path_plat)$size / 1024 / 1024
  cat(sprintf("Wrote %s (%.2f MB)\n", out_path_plat, size_mb_plat))

}, error = function(e) {
  cat("\n[FAIL] ", conditionMessage(e), "\n", sep = "")
}, finally = {
  while (sink.number() > 0) sink()
})
