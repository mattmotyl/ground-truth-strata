# Build public/data/distributions.json — per-response-option proportions
# for variables whose distribution shape matters more than the mean
# (stacked-bar / histogram fodder). Covers:
#
#   Likert (LIKERT_3..LIKERT_7, LIKERT_6_NOMID), non-platform-indexed:
#     metric_type = "likert_option", bin_index = 1..N, bin_label from
#     the dict response_options.
#
#   Scale 0-10 (SCALE_0_10) — feeling-thermometer and comfort items:
#     metric_type = "scale_int_bin", bin_index = 0..10.
#
#   Count variables (num_sm_used, num_ai_used) — derived in Phase 2
#   cleaning, not in the dict:
#     metric_type = "count_bin", bins 0/1/2/3/4/5/6/7+.
#
# SCALE_0_100 (rate_self / political_ideology_self) is intentionally
# excluded — 101 bins is too granular for a stacked bar; the mean is
# already in trends.json. Add binning here if/when the UI needs it.
#
# Each row carries weighted + unweighted proportion for one bin; n is
# the total non-NA respondents in that (variable, wave), same across
# all bins for that wave. Cells with n < 30 are emitted with NA values
# and suppressed:true per project_phase3_conventions.
#
# Invoke:
#   Rscript r/precompute/build_distributions.R

suppressPackageStartupMessages({
  library(tidyverse)
  library(here)
  library(jsonlite)
})

source(here("r", "precompute", "utils", "cell_filter.R"))
source(here("r", "precompute", "utils", "weighting.R"))
source(here("r", "precompute", "utils", "coercion.R"))

audit_dir <- "M:/MM/Websites/strata-local/audit/output"
ts        <- format(Sys.time(), "%Y%m%d_%H%M%S")
sink_path <- if (dir.exists(audit_dir)) {
  file.path(audit_dir, paste0("BUILD_DISTRIBUTIONS_", ts, ".txt"))
} else {
  NULL
}
if (!is.null(sink_path)) sink(sink_path, split = TRUE)

tryCatch({

  rds_path  <- here("r", "output", "cleaned", "all_waves_long.rds")
  meta_path <- here("public", "data", "meta.json")
  if (!file.exists(rds_path))  stop("Cleaned .rds missing — run clean_all_waves.R first.")
  if (!file.exists(meta_path)) stop("meta.json missing — run build_meta.R first.")

  cat("Reading", rds_path, "\n")
  cleaned <- readRDS(rds_path)
  cat("Reading", meta_path, "\n")
  meta <- read_json(meta_path)

  # ---- Scope ----
  LIKERT_TYPES   <- c("LIKERT_3", "LIKERT_4", "LIKERT_5", "LIKERT_6",
                      "LIKERT_6_NOMID", "LIKERT_7")
  SCALE_INT_TYPE <- "SCALE_0_10"

  likert_vars <- Filter(function(v) {
    identical(v$data_availability, "in_cleaned_csv") &&
      !isTRUE(v$is_platform_indexed) &&
      v$response_type %in% LIKERT_TYPES
  }, meta$variables)
  scale10_vars <- Filter(function(v) {
    identical(v$data_availability, "in_cleaned_csv") &&
      !isTRUE(v$is_platform_indexed) &&
      v$response_type == SCALE_INT_TYPE
  }, meta$variables)

  COUNT_VARS <- list(
    list(variable_name = "num_sm_used", construct = "Social Media Platforms Used (count)"),
    list(variable_name = "num_ai_used", construct = "AI Tools Used (count)")
  )

  COUNT_BINS <- list(
    list(bin_index = 0, bin_label = "0",
         predicate = (function(t) function(x) x == t)(0)),
    list(bin_index = 1, bin_label = "1",
         predicate = (function(t) function(x) x == t)(1)),
    list(bin_index = 2, bin_label = "2",
         predicate = (function(t) function(x) x == t)(2)),
    list(bin_index = 3, bin_label = "3",
         predicate = (function(t) function(x) x == t)(3)),
    list(bin_index = 4, bin_label = "4",
         predicate = (function(t) function(x) x == t)(4)),
    list(bin_index = 5, bin_label = "5",
         predicate = (function(t) function(x) x == t)(5)),
    list(bin_index = 6, bin_label = "6",
         predicate = (function(t) function(x) x == t)(6)),
    list(bin_index = 7, bin_label = "7+",
         predicate = (function(t) function(x) x >= t)(7))
  )

  cat(sprintf("Inputs: %d Likert + %d SCALE_0_10 + %d count\n",
              length(likert_vars), length(scale10_vars), length(COUNT_VARS)))

  rows         <- list()
  n_emitted    <- 0L
  n_suppressed <- 0L

  process_input <- function(variable_name, x_full, waves, metric_type, bins) {
    for (w in waves) {
      mask    <- cleaned$wave == w
      x_wave  <- x_full[mask]
      wt_wave <- cleaned$final_weight[mask]
      for (bin in bins) {
        indicator             <- as.integer(bin$predicate(x_wave))
        indicator[is.na(x_wave)] <- NA_integer_
        est   <- estimate_proportion_both(indicator, wt_wave)
        gated <- apply_cell_floor(est, est$n)
        rows[[length(rows) + 1]] <<- list(
          variable_name     = variable_name,
          wave              = as.integer(w),
          bin_index         = as.integer(bin$bin_index),
          bin_label         = bin$bin_label,
          metric_type       = metric_type,
          value             = gated$prop,
          se                = gated$se,
          ci_lower          = gated$ci_lower,
          ci_upper          = gated$ci_upper,
          n                 = gated$n,
          weighted_value    = gated$weighted_prop,
          weighted_se       = gated$weighted_se,
          weighted_ci_lower = gated$weighted_ci_lower,
          weighted_ci_upper = gated$weighted_ci_upper,
          weighted_n_eff    = gated$weighted_n_eff,
          suppressed        = gated$suppressed
        )
        if (isTRUE(gated$suppressed)) n_suppressed <<- n_suppressed + 1L
        else                          n_emitted    <<- n_emitted    + 1L
      }
    }
  }

  t0 <- Sys.time()
  cat("Processing Likert vars...\n")
  for (v in likert_vars) {
    col <- v$cleaned_column
    if (is.na(col) || !col %in% colnames(cleaned)) next
    x_full <- cleaned[[col]]
    if (!is.factor(x_full)) next
    levels_x <- levels(x_full)
    x_int    <- as.integer(x_full)
    bins <- lapply(seq_along(levels_x), function(i) {
      list(
        bin_index = i,
        bin_label = levels_x[i],
        predicate = (function(t) function(x) x == t)(i)
      )
    })
    process_input(v$variable_name, x_int, unlist(v$waves_present_in_data),
                  "likert_option", bins)
  }

  cat("Processing SCALE_0_10 vars...\n")
  for (v in scale10_vars) {
    col <- v$cleaned_column
    if (is.na(col) || !col %in% colnames(cleaned)) next
    x_full <- suppressWarnings(as.numeric(cleaned[[col]]))
    bins <- lapply(0:10, function(i) {
      list(
        bin_index = i,
        bin_label = as.character(i),
        predicate = (function(t) function(x) x == t)(i)
      )
    })
    process_input(v$variable_name, x_full, unlist(v$waves_present_in_data),
                  "scale_int_bin", bins)
  }

  cat("Processing count vars...\n")
  for (cv in COUNT_VARS) {
    if (!cv$variable_name %in% colnames(cleaned)) next
    x_full <- suppressWarnings(as.numeric(cleaned[[cv$variable_name]]))
    # All 6 waves (waves where any non-NA exists)
    waves_with_data <- vapply(1:6, function(w) {
      any(!is.na(x_full[cleaned$wave == w]))
    }, logical(1))
    waves <- which(waves_with_data)
    process_input(cv$variable_name, x_full, waves, "count_bin", COUNT_BINS)
  }

  dt <- as.numeric(difftime(Sys.time(), t0, units = "secs"))
  cat(sprintf("Built %d rows in %.1fs (%d above floor, %d suppressed)\n",
              length(rows), dt, n_emitted, n_suppressed))

  out_path <- here("public", "data", "distributions.json")
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
