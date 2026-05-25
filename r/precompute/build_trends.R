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

  # ---- Scope ----
  RENDERABLE_NUMERIC <- c("LIKERT_3", "LIKERT_4", "LIKERT_5", "LIKERT_6",
                          "LIKERT_6_NOMID", "LIKERT_7", "RANGE_NUMERIC",
                          "SCALE_0_10", "SCALE_0_100")
  RENDERABLE_BINARY  <- c("BINARY_YESNO")

  vars_for_trends <- Filter(function(v) {
    identical(v$data_availability, "in_cleaned_csv") &&
      !isTRUE(v$is_platform_indexed) &&
      v$response_type %in% c(RENDERABLE_NUMERIC, RENDERABLE_BINARY)
  }, meta$variables)

  cat(sprintf("Variables in scope for trends: %d (of %d total in meta)\n",
              length(vars_for_trends), length(meta$variables)))

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
        row <- list(
          variable_name      = v$variable_name,
          wave               = as.integer(w),
          metric_type        = "rate",
          prop               = gated$prop,
          se                 = gated$se,
          ci_lower           = gated$ci_lower,
          ci_upper           = gated$ci_upper,
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
        row <- list(
          variable_name      = v$variable_name,
          wave               = as.integer(w),
          metric_type        = "mean",
          mean               = gated$mean,
          se                 = gated$se,
          ci_lower           = gated$ci_lower,
          ci_upper           = gated$ci_upper,
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
