# Build public/data/correlations.json — pairwise Spearman correlations
# between in-scope variables, per wave. Weighted and unweighted side-by-
# side. Cells with joint non-missing n < 30 are emitted with NA values
# and suppressed:true.
#
# Per project_phase3_conventions:
#   - Spearman across the board (ranks, then Pearson on ranks; weighted
#     version uses weighted Pearson on the ranks — see weighting.R).
#   - is_reverse_coded items (currently only ls002i, LIKERT_7) are
#     flipped via (max_code + 1) - as.integer(factor) BEFORE correlating.
#
# Scope (this pass):
#   - All in_cleaned_csv non-platform-indexed vars with renderable
#     response_type (LIKERT_*, RANGE_NUMERIC, SCALE_*, BINARY_YESNO).
#     ~90 variables.
#   - All 23 platform_user_<slug> binaries (derived per (respondent x
#     wave) from uses_<slug>_w<wave>). This honors Matt's MULTISELECT
#     ask via the us001 platform multiselect.
#
# DEFERRED to a follow-up commit (requires extending clean_all_waves.R
# to pull additional raw columns):
#   - ai_used        -> ai_useds<opt>     (W1)
#   - q_ai8a_<N>     -> q_ai8a_<N>s<opt>  (per AI tool MULTISELECT, W2-3)
#   - gms00<N>       -> gms00<N>s<opt>    (W6 context MULTISELECTs)
#   - q_ai11_<N>     -> q_ai11_<N>[a-n]   (per AI tool LIKERT_5 battery)
#   - q_ai13_<N>     -> q_ai13_<N>[a-m]   (per AI tool LIKERT_5 battery)
#   Per Phase 1 followup #10 "battery-expansion-pattern". These live as
#   exploded children in the raw CSV that transform_data does not pull.
#   See public/data/meta.json `_meta.data_availability_legend`.
#
# Invoke:
#   Rscript r/precompute/build_correlations.R

suppressPackageStartupMessages({
  library(tidyverse)
  library(here)
  library(jsonlite)
})

source(here("r", "precompute", "utils", "cell_filter.R"))
source(here("r", "precompute", "utils", "weighting.R"))
source(here("r", "precompute", "utils", "coercion.R"))

# ---- Sink ----
audit_dir <- "M:/MM/Websites/strata-local/audit/output"
ts        <- format(Sys.time(), "%Y%m%d_%H%M%S")
sink_path <- if (dir.exists(audit_dir)) {
  file.path(audit_dir, paste0("BUILD_CORRELATIONS_", ts, ".txt"))
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

  # ---- Reverse-coding helper ----
  # Flip an integer-coded variable: new = (max_code + 1) - old.
  # For Likert factors, max_code is the number of levels (extracted from
  # the response_type, e.g. LIKERT_7 -> 7). For non-Likert reverse-coded
  # items the caller should pass max_code explicitly.
  apply_reverse_coding <- function(x_int, var_rec, x_full = NULL) {
    if (!isTRUE(var_rec$is_reverse_coded)) return(x_int)
    rt <- var_rec$response_type
    max_code <- if (grepl("^LIKERT_\\d+", rt)) {
      as.integer(sub("^LIKERT_(\\d+).*", "\\1", rt))
    } else if (rt == "SCALE_0_10") {
      10L
    } else if (rt == "SCALE_0_100") {
      100L
    } else {
      warning(sprintf("Cannot infer max_code for reverse-coded %s (%s); leaving unflipped",
                      var_rec$variable_name, rt))
      return(x_int)
    }
    (max_code + 1L) - x_int
  }

  # ---- Build the inputs list ----
  INPUT_NUMERIC <- c("LIKERT_3", "LIKERT_4", "LIKERT_5", "LIKERT_6",
                     "LIKERT_6_NOMID", "LIKERT_7", "RANGE_NUMERIC",
                     "SCALE_0_10", "SCALE_0_100")
  INPUT_BINARY  <- c("BINARY_YESNO")

  dict_inputs <- Filter(function(v) {
    identical(v$data_availability, "in_cleaned_csv") &&
      !isTRUE(v$is_platform_indexed) &&
      v$response_type %in% c(INPUT_NUMERIC, INPUT_BINARY)
  }, meta$variables)

  # ---- Derive platform_user_<slug> binary columns ----
  for (p in meta$platforms) {
    col_name <- paste0("platform_user_", p$slug)
    cleaned[[col_name]] <- NA_real_
    for (w in 1:6) {
      src_col <- paste0("uses_", p$slug, "_w", w)
      if (!src_col %in% colnames(cleaned)) next
      mask <- cleaned$wave == w
      cleaned[[col_name]][mask] <- coerce_binary01(cleaned[[src_col]][mask])
    }
  }

  # Build platform_user input records that mirror the dict-var shape.
  platform_user_inputs <- lapply(meta$platforms, function(p) {
    list(
      variable_name       = paste0("platform_user_", p$slug),
      response_type       = "BINARY_DERIVED",
      is_reverse_coded    = FALSE,
      cleaned_column      = paste0("platform_user_", p$slug),
      is_platform_indexed = FALSE
    )
  })

  inputs <- c(dict_inputs, platform_user_inputs)
  cat(sprintf("Inputs: %d (%d dict + %d platform_user)\n",
              length(inputs), length(dict_inputs), length(platform_user_inputs)))

  # ---- Precompute per-wave matrices ----
  cat("Building per-wave numeric matrices...\n")
  t0 <- Sys.time()
  N <- length(inputs)
  wave_mats   <- vector("list", 6)
  wave_wts    <- vector("list", 6)
  for (w in 1:6) {
    mask <- cleaned$wave == w
    n_w  <- sum(mask)
    M    <- matrix(NA_real_, nrow = n_w, ncol = N)
    for (i in seq_along(inputs)) {
      v <- inputs[[i]]
      col <- v$cleaned_column
      if (is.na(col) || !col %in% colnames(cleaned)) next
      x_raw <- cleaned[[col]][mask]
      is_bin <- v$response_type %in% c(INPUT_BINARY, "BINARY_DERIVED")
      x_coe <- if (is_bin) coerce_binary01(x_raw) else coerce_numeric(x_raw)
      x_coe <- apply_reverse_coding(x_coe, v)
      M[, i] <- x_coe
    }
    wave_mats[[w]] <- M
    wave_wts[[w]]  <- cleaned$final_weight[mask]
  }
  cat(sprintf("  done in %.1fs\n",
              as.numeric(difftime(Sys.time(), t0, units = "secs"))))

  var_names <- vapply(inputs, function(v) v$variable_name, character(1))

  # ---- Pairwise loop ----
  cat(sprintf("Computing %d pairs x 6 waves = %d cells max...\n",
              N * (N - 1) / 2, N * (N - 1) / 2 * 6))
  t0 <- Sys.time()
  rows         <- vector("list", N * (N - 1) / 2 * 6)
  idx          <- 0L
  n_emitted    <- 0L
  n_suppressed <- 0L

  for (w in 1:6) {
    M  <- wave_mats[[w]]
    wt <- wave_wts[[w]]
    if (is.null(M) || nrow(M) == 0) next
    for (i in 1:(N - 1)) {
      x_i <- M[, i]
      # short-circuit if i has no observations at all in this wave
      if (all(is.na(x_i))) next
      for (j in (i + 1):N) {
        x_j <- M[, j]
        if (all(is.na(x_j))) next
        est   <- estimate_correlation_both(x_i, x_j, wt, method = "spearman")
        gated <- apply_cell_floor(est, est$n)
        idx <- idx + 1L
        rows[[idx]] <- list(
          var1            = var_names[i],
          var2            = var_names[j],
          wave            = as.integer(w),
          method          = "spearman",
          r               = gated$r,
          p_value         = gated$p_value,
          n               = gated$n,
          weighted_r      = gated$weighted_r,
          weighted_n_eff  = gated$weighted_n_eff,
          suppressed      = gated$suppressed
        )
        if (isTRUE(gated$suppressed)) n_suppressed <- n_suppressed + 1L
        else                          n_emitted    <- n_emitted    + 1L
      }
    }
  }
  rows <- rows[seq_len(idx)]
  dt   <- as.numeric(difftime(Sys.time(), t0, units = "secs"))
  cat(sprintf("  built %d rows in %.1fs (%d above floor, %d suppressed)\n",
              length(rows), dt, n_emitted, n_suppressed))

  # ---- Write ----
  out_path <- here("public", "data", "correlations.json")
  dir.create(dirname(out_path), showWarnings = FALSE, recursive = TRUE)
  write_json(rows, out_path,
             auto_unbox = TRUE, na = "null", null = "null", pretty = FALSE)
  size_mb <- file.info(out_path)$size / 1024 / 1024
  cat(sprintf("Wrote %s (%.2f MB)\n", out_path, size_mb))

}, error = function(e) {
  cat("\n[FAIL] ", conditionMessage(e), "\n", sep = "")
}, finally = {
  while (sink.number() > 0) sink()
})
