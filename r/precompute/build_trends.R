# Build public/data/trends.json — per (variable x wave) univariate
# estimates (mean for numeric/ordinal, proportion for binary). Weighted
# and unweighted side-by-side. Cells with n < 30 are emitted with NA
# values and suppressed:true per project_phase3_conventions.
#
# Scope: variables with data_availability == "in_cleaned_csv" AND
# is_platform_indexed == FALSE AND a renderable response type. Platform
# batteries are handled in build_platform_rates.R; SINGLE_SELECT
# categoricals are handled in build_group_comparisons.R as groupings.
#
# Invoke:
#   Rscript r/precompute/build_trends.R

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

# ---- Sink diagnostic log ----
audit_dir <- "M:/MM/Websites/strata-local/audit/output"
ts        <- format(Sys.time(), "%Y%m%d_%H%M%S")
sink_path <- if (dir.exists(audit_dir)) {
  file.path(audit_dir, paste0("BUILD_TRENDS_", ts, ".txt"))
} else {
  NULL
}
if (!is.null(sink_path)) sink(sink_path, split = TRUE)

tryCatch({

  # ---- Inputs ----
  rds_path  <- here("r", "output", "cleaned", "all_waves_long.rds")
  meta_path <- here("public", "data", "meta.json")
  if (!file.exists(rds_path)) stop("Cleaned .rds missing — run clean_all_waves.R first.")
  if (!file.exists(meta_path)) stop("meta.json missing — run build_meta.R first.")

  cat("Reading", rds_path, "\n")
  cleaned <- readRDS(rds_path)
  cat("Reading", meta_path, "\n")
  meta <- read_json(meta_path)
  cleaned <- apply_reverse_coding(cleaned)
  cleaned <- derive_loneliness(cleaned)

  # ---- Scope ----
  RENDERABLE_NUMERIC <- c("LIKERT_3", "LIKERT_4", "LIKERT_5", "LIKERT_6",
                          "LIKERT_6_NOMID", "LIKERT_7", "RANGE_NUMERIC",
                          "SCALE_0_10", "SCALE_0_100")
  RENDERABLE_BINARY  <- c("BINARY_YESNO")

  # Variables flagged in meta.json (excluded_from_outputs = TRUE) are
  # skipped via the flag. The per-script EXTRA list catches additions
  # not in the base EXCLUDED_VARIABLES — currently just us001.
  EXTRA_EXCLUDED_TRENDS <- setdiff(EXCLUDED_VARIABLES_TRENDS, EXCLUDED_VARIABLES)

  vars_for_trends <- Filter(function(v) {
    identical(v$data_availability, "in_cleaned_csv") &&
      !isTRUE(v$is_platform_indexed) &&
      v$response_type %in% c(RENDERABLE_NUMERIC, RENDERABLE_BINARY) &&
      !isTRUE(v$excluded_from_outputs) &&
      !(v$variable_name %in% EXTRA_EXCLUDED_TRENDS)
  }, meta$variables)

  cat(sprintf("Variables in scope for trends: %d (of %d total in meta, after flag + EXTRA_EXCLUDED_TRENDS=[%s])\n",
              length(vars_for_trends), length(meta$variables),
              paste(EXTRA_EXCLUDED_TRENDS, collapse = ",")))

  # ---- Build rows ----
  cat("Computing per-(variable x wave) estimates...\n")
  t0 <- Sys.time()
  rows <- list()
  n_suppressed <- 0L
  n_emitted    <- 0L

  for (v in vars_for_trends) {
    col <- v$cleaned_column
    if (is.na(col) || !col %in% colnames(cleaned)) next
    is_binary  <- v$response_type %in% RENDERABLE_BINARY
    x_full     <- cleaned[[col]]
    x_coerced  <- if (is_binary) coerce_binary01(x_full) else coerce_numeric(x_full)

    waves <- unlist(v$waves_present_in_data)
    if (length(waves) == 0) next

    for (w in waves) {
      mask  <- cleaned$wave == w
      x_w   <- x_coerced[mask]
      wt_w  <- cleaned$final_weight[mask]

      if (is_binary) {
        est   <- estimate_proportion_both(x_w, wt_w)
        gated <- apply_cell_floor(est, est$n)
        # Unweighted estimates intentionally excluded from JSON output (Step 2).
        # Retained in `est` / `gated` R objects for spot-check validation only.
        # To restore: add prop, se, ci_lower, ci_upper back to this list().
        # `n` (unweighted observed count) is kept as the suppression guard
        # and the user-facing sample-size descriptor; `weighted_n_eff` is
        # kept for the Kish effective sample size.
        row <- list(
          variable_name      = v$variable_name,
          wave               = as.integer(w),
          metric_type        = "rate",
          n                  = gated$n,
          weighted_prop      = gated$weighted_prop,
          weighted_se        = gated$weighted_se,
          weighted_ci_lower  = gated$weighted_ci_lower,
          weighted_ci_upper  = gated$weighted_ci_upper,
          weighted_n_eff     = gated$weighted_n_eff,
          suppressed         = gated$suppressed
        )
      } else {
        est   <- estimate_mean_both(x_w, wt_w)
        gated <- apply_cell_floor(est, est$n)
        # Unweighted estimates intentionally excluded from JSON output (Step 2).
        # Retained in `est` / `gated` R objects for spot-check validation only.
        # To restore: add mean, se, ci_lower, ci_upper back to this list().
        row <- list(
          variable_name      = v$variable_name,
          wave               = as.integer(w),
          metric_type        = "mean",
          n                  = gated$n,
          weighted_mean      = gated$weighted_mean,
          weighted_se        = gated$weighted_se,
          weighted_ci_lower  = gated$weighted_ci_lower,
          weighted_ci_upper  = gated$weighted_ci_upper,
          weighted_n_eff     = gated$weighted_n_eff,
          suppressed         = gated$suppressed
        )
      }

      if (isTRUE(gated$suppressed)) n_suppressed <- n_suppressed + 1L
      else                          n_emitted    <- n_emitted    + 1L

      rows[[length(rows) + 1]] <- row

      # Bucketed rows for 7-point Likert items in BUCKETED_VARS. The
      # continuous row above (mean for Likert, rate for binary) is
      # unchanged with bucket absent. Bucket rows are emitted ONLY for
      # variables in BUCKETED_VARS — practically the ls002a-l set in
      # trends (us018a-g are platform-indexed and excluded by the
      # vars_for_trends filter, so they don't reach this branch).
      # Per Step C: bucket rows use a uniform schema with
      # `weighted_value` (not weighted_prop / weighted_mean) so
      # consumers have one mental model across trends, platform_rates,
      # and group_comparisons. Suppression uses the same n as the
      # continuous row — natural because the bucket-indicator and the
      # Likert have the same non-NA count.
      if (v$variable_name %in% BUCKETED_VARS) {
        x_int   <- as.integer(cleaned[[col]])
        x_int_w <- x_int[mask]
        bucket_vec <- bucket_likert_7(x_int_w)
        for (b in c("disagree", "neutral", "agree")) {
          indicator <- as.integer(bucket_vec == b)
          indicator[is.na(bucket_vec)] <- NA_integer_
          est_b   <- estimate_proportion_both(indicator, wt_w)
          gated_b <- apply_cell_floor(est_b, est_b$n)
          row_b <- list(
            variable_name      = v$variable_name,
            wave               = as.integer(w),
            metric_type        = "rate",
            bucket             = b,
            bucket_label       = BUCKET_LABELS[[b]],
            n                  = gated_b$n,
            weighted_value     = gated_b$weighted_prop,
            weighted_se        = gated_b$weighted_se,
            weighted_ci_lower  = gated_b$weighted_ci_lower,
            weighted_ci_upper  = gated_b$weighted_ci_upper,
            weighted_n_eff     = gated_b$weighted_n_eff,
            suppressed         = gated_b$suppressed
          )
          if (isTRUE(gated_b$suppressed)) n_suppressed <- n_suppressed + 1L
          else                            n_emitted    <- n_emitted    + 1L
          rows[[length(rows) + 1]] <- row_b
        }
      }
    }
  }
  dt <- as.numeric(difftime(Sys.time(), t0, units = "secs"))
  cat(sprintf("  built %d rows in %.1fs (%d above floor, %d suppressed)\n",
              length(rows), dt, n_emitted, n_suppressed))

  # ---- Write ----
  out_path <- here("public", "data", "trends.json")
  dir.create(dirname(out_path), showWarnings = FALSE, recursive = TRUE)
  write_json(rows, out_path,
             auto_unbox = TRUE, na = "null", null = "null", pretty = FALSE)
  size_kb <- file.info(out_path)$size / 1024
  cat(sprintf("Wrote %s (%.1f KB)\n", out_path, size_kb))

}, error = function(e) {
  cat("\n[FAIL] ", conditionMessage(e), "\n", sep = "")
}, finally = {
  while (sink.number() > 0) sink()
})
