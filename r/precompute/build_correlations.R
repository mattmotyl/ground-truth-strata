# Build public/data/correlations.json — pairwise Spearman correlations
# between in-scope variables, per wave. Weighted and unweighted side-by-
# side. Cells with joint non-missing n < 30 are emitted with NA values
# and suppressed:true.
#
# Per project_phase3_conventions:
#   - Spearman across the board (ranks, then Pearson on ranks; weighted
#     version uses weighted Pearson on the ranks — see weighting.R).
#   - is_reverse_coded items are flipped at data-load time by
#     r/precompute/utils/transforms.R::apply_reverse_coding (factor
#     levels reversed in place; canonical list in REVERSE_CODED_VARS).
#     The matrix build below reads the already-reversed columns and
#     does no per-iteration flipping.
#
# Scope (after 2026-05-25 expansion pass):
#   - All in_cleaned_csv non-platform-indexed vars with renderable
#     response_type (LIKERT_*, RANGE_NUMERIC, SCALE_*, BINARY_YESNO).
#     ~90 dict scalar vars + 14 battery means (q_ai11_<N>_mean,
#     q_ai13_<N>_mean) = ~104 inputs.
#   - All 23 platform_user_<slug> binaries (derived per (respondent x
#     wave) from uses_<slug>_w<wave>).
#   - All MULTISELECT option binaries from in_cleaned_csv_exploded vars
#     (ai_useds<opt>, q_ai8a_<N>s<opt>, gms00<N>s<opt>) — each option
#     becomes its own binary correlation input.
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
  cleaned <- apply_reverse_coding(cleaned)
  cleaned <- derive_loneliness(cleaned)

  # Reverse coding for is_reverse_coded items now runs at load time via
  # r/precompute/utils/transforms.R::apply_reverse_coding(). The
  # per-iteration helper that lived here previously has been removed —
  # the matrix-build loop below now reads already-reversed values from
  # `cleaned`.

  # ---- Build the inputs list ----
  INPUT_NUMERIC <- c("LIKERT_3", "LIKERT_4", "LIKERT_5", "LIKERT_6",
                     "LIKERT_6_NOMID", "LIKERT_7", "RANGE_NUMERIC",
                     "SCALE_0_10", "SCALE_0_100")
  INPUT_BINARY  <- c("BINARY_YESNO")

  # Scalar dict vars (one input each) — covers regular dict scalars AND
  # the aggregated q_ai11_<N>_mean / q_ai13_<N>_mean battery means since
  # those have data_availability="in_cleaned_csv" with cleaned_column
  # pointing at the _mean column.
  #
  # EXCLUDED_VARIABLES_CORRELATIONS deliberately equals the base list
  # (no us001). us001 is already excluded from dict_inputs because
  # is_platform_indexed = TRUE on its meta record. Platform-use
  # information enters this build via the derived platform_user_<slug>
  # binaries below (Step 1a). Multiselect children, platform_user
  # binaries, and time_per_day_min inputs are derived inputs not
  # present in meta$variables and are intentionally retained.
  EXTRA_EXCLUDED_CORRELATIONS <-
    setdiff(EXCLUDED_VARIABLES_CORRELATIONS, EXCLUDED_VARIABLES)  # empty today

  dict_inputs <- Filter(function(v) {
    identical(v$data_availability, "in_cleaned_csv") &&
      !isTRUE(v$is_platform_indexed) &&
      v$response_type %in% c(INPUT_NUMERIC, INPUT_BINARY) &&
      !isTRUE(v$excluded_from_outputs) &&
      !(v$variable_name %in% EXTRA_EXCLUDED_CORRELATIONS)
  }, meta$variables)

  # MULTISELECT exploded vars — one input per expansion_column.
  multiselect_parents <- Filter(function(v) {
    identical(v$data_availability, "in_cleaned_csv_exploded")
  }, meta$variables)
  multiselect_inputs <- unlist(lapply(multiselect_parents, function(v) {
    children <- unlist(v$expansion_columns)
    lapply(children, function(child) {
      list(
        variable_name       = child,
        response_type       = "BINARY_DERIVED",
        is_reverse_coded    = FALSE,
        cleaned_column      = child,
        is_platform_indexed = FALSE,
        parent_variable     = v$variable_name
      )
    })
  }), recursive = FALSE)

  # NOTE on binary-predictor correlations: ex003_lonely (the UCLA
  # loneliness binary) is picked up here as a regular BINARY_YESNO
  # dict input via the `dict_inputs` filter above. Its correlations
  # against any other variable use the same Spearman-with-binary
  # interpretation as the platform_user_<slug> derivations below —
  # rho reflects the degree to which the two groups (lonely vs not,
  # users vs non-users) differ on the partner variable, which is
  # closer in spirit to a group comparison than a traditional
  # continuous-continuous correlation. UI interpretation copy should
  # call this out for any binary x continuous pair.

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

  platform_user_inputs <- lapply(meta$platforms, function(p) {
    list(
      variable_name       = paste0("platform_user_", p$slug),
      response_type       = "BINARY_DERIVED",
      is_reverse_coded    = FALSE,
      cleaned_column      = paste0("platform_user_", p$slug),
      is_platform_indexed = FALSE
    )
  })

  # ---- Derive time_per_day_min_<slug> per-platform numeric columns ----
  # Mirrors the platform_user pattern: collapse the per-wave columns
  # (time_min_total_<slug>_w<N>) into a single per-respondent column
  # populated from whichever wave row each respondent is in. W4-W5 only.
  for (p in meta$platforms) {
    col_name <- paste0("time_per_day_min_", p$slug)
    cleaned[[col_name]] <- NA_real_
    for (w in 4:5) {
      src_col <- paste0("time_min_total_", p$slug, "_w", w)
      if (!src_col %in% colnames(cleaned)) next
      mask <- cleaned$wave == w
      cleaned[[col_name]][mask] <- as.numeric(cleaned[[src_col]][mask])
    }
  }

  time_per_day_inputs <- lapply(meta$platforms, function(p) {
    list(
      variable_name       = paste0("time_per_day_min_", p$slug),
      response_type       = "RANGE_NUMERIC_DERIVED",
      is_reverse_coded    = FALSE,
      cleaned_column      = paste0("time_per_day_min_", p$slug),
      is_platform_indexed = FALSE
    )
  })

  inputs <- c(dict_inputs, multiselect_inputs, platform_user_inputs, time_per_day_inputs)
  cat(sprintf("Inputs: %d (%d dict scalars + %d multiselect options + %d platform_user + %d time_per_day)\n",
              length(inputs), length(dict_inputs),
              length(multiselect_inputs), length(platform_user_inputs),
              length(time_per_day_inputs)))

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
      if (is.null(col) || is.na(col) || !col %in% colnames(cleaned)) next
      x_raw <- cleaned[[col]][mask]
      is_bin <- v$response_type %in% c(INPUT_BINARY, "BINARY_DERIVED")
      x_coe <- if (is_bin) coerce_binary01(x_raw) else coerce_numeric(x_raw)
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
        # Unweighted estimates intentionally excluded from JSON output (Step 2).
        # Retained in `est` / `gated` R objects for spot-check validation only.
        # To restore: add r and p_value back to this list().
        # `n` (unweighted joint non-missing count) and `weighted_n_eff`
        # are both kept.
        rows[[idx]] <- list(
          var1            = var_names[i],
          var2            = var_names[j],
          wave            = as.integer(w),
          method          = "spearman",
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
