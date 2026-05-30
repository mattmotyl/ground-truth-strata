# Build public/data/platform_rates.json — per (platform x wave x metric)
# estimates. Seven metrics:
#   usage_rate       % of respondents who used the platform in the past
#                    4 weeks (binary from us001 multiselect, stored as
#                    `uses_<slug>_w<N>`).
#   frequency_mean   mean of the per-platform use-frequency ordinal
#                    (us002, stored as `freq_<slug>_w<N>`). Coerced to
#                    integer levels for the mean.
#   nux_rate         % reporting personal negative experience (us003,
#                    stored as `nux_<slug>_w<N>`).
#   bftw_rate        % reporting bad-for-the-world content (us007,
#                    stored as `bftw_<slug>_w<N>`).
#   mcxn_rate        % reporting meaningful connection (us010,
#                    stored as `mcxn_<slug>_w<N>`).
#   useful_rate      % reporting learned-something-useful (us012,
#                    stored as `useful_<slug>_w<N>`).
#   time_per_day_minutes  mean minutes per day spent on the platform
#                    (us019_time_min, derived in clean_all_waves.R as
#                    us019_hours * 60 + us019_minutes, stored as
#                    `time_min_total_<slug>_w<N>`). W4-W5 only;
#                    conditional on daily/near-daily use per us002.
#
# Weighted and unweighted side-by-side via the survey package. Cells
# with n<30 emitted with NA values and suppressed:true. Rows are emitted
# only when the underlying column exists in the cleaned tibble — the
# (platform x wave) grid of "what was asked" lives in meta.json.
#
# Invoke:
#   Rscript r/precompute/build_platform_rates.R

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
  file.path(audit_dir, paste0("BUILD_PLATFORM_RATES_", ts, ".txt"))
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

  # ---- Metric definitions ----
  PLATFORM_METRICS <- list(
    list(metric = "usage_rate",            prefix = "uses",           type = "rate",
         source_variable = "us001"),
    list(metric = "frequency_mean",        prefix = "freq",           type = "mean",
         source_variable = "us002"),
    list(metric = "nux_rate",              prefix = "nux",            type = "rate",
         source_variable = "us003"),
    list(metric = "bftw_rate",             prefix = "bftw",           type = "rate",
         source_variable = "us007"),
    list(metric = "mcxn_rate",             prefix = "mcxn",           type = "rate",
         source_variable = "us010"),
    list(metric = "useful_rate",           prefix = "useful",         type = "rate",
         source_variable = "us012"),
    list(metric = "time_per_day_minutes",  prefix = "time_min_total", type = "mean",
         source_variable = "us019_time_min"),

    # Platform habit/attitude scale (us018a-g) — 7-point Likert per
    # platform, asked W4-W6. Each entry is the continuous mean over
    # respondents who used this platform in this wave. Bucket rows
    # (disagree / neutral / agree) are emitted in the iteration loop
    # below for every source_variable in BUCKETED_VARS — that's the
    # entire us018a-g set today.
    list(metric = "us018a_mean",            prefix = "habit_auto",     type = "mean",
         source_variable = "us018a"),
    list(metric = "us018b_mean",            prefix = "habit_think",    type = "mean",
         source_variable = "us018b"),
    list(metric = "us018c_mean",            prefix = "habit_pos",      type = "mean",
         source_variable = "us018c"),
    list(metric = "us018d_mean",            prefix = "habit_neg",      type = "mean",
         source_variable = "us018d"),
    list(metric = "us018e_mean",            prefix = "habit_time",     type = "mean",
         source_variable = "us018e"),
    list(metric = "us018f_mean",            prefix = "habit_learn",    type = "mean",
         source_variable = "us018f"),
    list(metric = "us018g_mean",            prefix = "habit_rel",      type = "mean",
         source_variable = "us018g")
  )

  # Defensive: drop any metric whose source variable matches the global
  # exclusion list. Today no metric matches — but if a future change to
  # EXCLUDED_VARIABLES adds e.g. "us003" the corresponding rate metric
  # disappears from platform_rates.json automatically.
  n_metrics_before <- length(PLATFORM_METRICS)
  PLATFORM_METRICS <- Filter(function(m) {
    !(m$source_variable %in% EXCLUDED_VARIABLES)
  }, PLATFORM_METRICS)
  if (length(PLATFORM_METRICS) < n_metrics_before) {
    cat(sprintf("Metric filter: dropped %d of %d metrics by EXCLUDED_VARIABLES\n",
                n_metrics_before - length(PLATFORM_METRICS), n_metrics_before))
  }

  # ---- Iterate (platform x wave x metric) ----
  all_cols <- colnames(cleaned)
  cat(sprintf("Iterating %d platforms x %d waves x %d metrics = %d cells max\n",
              length(meta$platforms), 6, length(PLATFORM_METRICS),
              length(meta$platforms) * 6 * length(PLATFORM_METRICS)))

  wave_masks <- setNames(lapply(1:6, function(w) cleaned$wave == w),
                         as.character(1:6))

  rows         <- list()
  n_emitted    <- 0L
  n_suppressed <- 0L
  n_no_col     <- 0L

  t0 <- Sys.time()
  for (p in meta$platforms) {
    for (w in 1:6) {
      mask <- wave_masks[[as.character(w)]]
      wt   <- cleaned$final_weight[mask]
      for (m in PLATFORM_METRICS) {
        col <- paste0(m$prefix, "_", p$slug, "_w", w)
        if (!col %in% all_cols) {
          n_no_col <- n_no_col + 1L
          next
        }
        x_raw <- cleaned[[col]][mask]
        if (m$type == "rate") {
          x_coerced <- coerce_binary01(x_raw)
          est       <- estimate_proportion_both(x_coerced, wt)
          gated     <- apply_cell_floor(est, est$n)
          # Unweighted estimates intentionally excluded from JSON output (Step 2).
          # Retained in `est` / `gated` R objects for spot-check validation only.
          # To restore: add value, se, ci_lower, ci_upper back to this list().
          # `n` (unweighted observed count) and `weighted_n_eff` are both kept.
          row <- list(
            platform_slug      = p$slug,
            platform_code      = as.integer(p$code),
            platform_label     = p$label,
            wave               = as.integer(w),
            metric             = m$metric,
            metric_type        = "rate",
            source_variable    = m$source_variable,
            n                  = gated$n,
            weighted_value     = gated$weighted_prop,
            weighted_se        = gated$weighted_se,
            weighted_ci_lower  = gated$weighted_ci_lower,
            weighted_ci_upper  = gated$weighted_ci_upper,
            weighted_n_eff     = gated$weighted_n_eff,
            suppressed         = gated$suppressed
          )
        } else {  # mean
          x_coerced <- coerce_numeric(x_raw)
          est       <- estimate_mean_both(x_coerced, wt)
          gated     <- apply_cell_floor(est, est$n)
          # Unweighted estimates intentionally excluded from JSON output (Step 2).
          # Retained in `est` / `gated` R objects for spot-check validation only.
          # To restore: add value, se, ci_lower, ci_upper back to this list().
          row <- list(
            platform_slug      = p$slug,
            platform_code      = as.integer(p$code),
            platform_label     = p$label,
            wave               = as.integer(w),
            metric             = m$metric,
            metric_type        = "mean",
            source_variable    = m$source_variable,
            n                  = gated$n,
            weighted_value     = gated$weighted_mean,
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

        # Bucketed rows for 7-point Likert metrics in BUCKETED_VARS.
        # Today only us018a-g qualify; the check is on source_variable
        # so future additions to BUCKETED_VARS (or future metrics
        # whose source_variable happens to land in BUCKETED_VARS) get
        # bucketed automatically. The continuous mean row above is
        # unchanged. Bucket rows use uniform schema with
        # `weighted_value` — see strata-types.ts notes on the
        # bucket-row discriminant.
        if (m$source_variable %in% BUCKETED_VARS) {
          x_int <- as.integer(x_raw)
          bucket_vec <- bucket_likert_7(x_int)
          for (b in c("disagree", "neutral", "agree")) {
            indicator <- as.integer(bucket_vec == b)
            indicator[is.na(bucket_vec)] <- NA_integer_
            est_b   <- estimate_proportion_both(indicator, wt)
            gated_b <- apply_cell_floor(est_b, est_b$n)
            row_b <- list(
              platform_slug      = p$slug,
              platform_code      = as.integer(p$code),
              platform_label     = p$label,
              wave               = as.integer(w),
              metric             = m$metric,
              metric_type        = "rate",
              source_variable    = m$source_variable,
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
  }
  dt <- as.numeric(difftime(Sys.time(), t0, units = "secs"))
  cat(sprintf("  built %d rows in %.1fs (%d above floor, %d suppressed, %d skipped no-column)\n",
              length(rows), dt, n_emitted, n_suppressed, n_no_col))

  # ---- Write ----
  out_path <- here("public", "data", "platform_rates.json")
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
