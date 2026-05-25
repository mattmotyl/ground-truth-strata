# Build public/data/group_comparisons.json — per (outcome x grouping_var
# x group x wave) estimates. Weighted and unweighted side-by-side. Cells
# with n<30 emitted with NA values and suppressed:true.
#
# Each row carries an OPTIONAL `platform_slug` field. It is null for
# scalar outcomes (the bulk of the rows). For per-platform outcomes —
# currently only us019_time_min (time per day in minutes) — the row is
# emitted once per platform with `platform_slug` set, since the
# semantic unit is (outcome x platform x grouping x group x wave).
#
# Outcomes:
#   Scalar (in_cleaned_csv, non-platform-indexed, renderable type) —
#     90 vars + 14 q_ai battery means.
#   Per-platform (in_cleaned_csv, dict-platform-indexed, restricted to
#     PER_PLATFORM_OUTCOMES_INCLUDED) — currently just us019_time_min.
#     Add more entries to PER_PLATFORM_OUTCOMES_INCLUDED to surface
#     additional per-platform numeric outcomes (e.g., us002 frequency)
#     in group_comparisons.
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

  # ---- Outcomes ----
  OUTCOME_NUMERIC <- c("LIKERT_3", "LIKERT_4", "LIKERT_5", "LIKERT_6",
                       "LIKERT_6_NOMID", "LIKERT_7", "RANGE_NUMERIC",
                       "SCALE_0_10", "SCALE_0_100")
  OUTCOME_BINARY  <- c("BINARY_YESNO")

  scalar_outcomes <- Filter(function(v) {
    identical(v$data_availability, "in_cleaned_csv") &&
      !isTRUE(v$is_platform_indexed) &&
      v$response_type %in% c(OUTCOME_NUMERIC, OUTCOME_BINARY)
  }, meta$variables)

  # Per-platform outcomes: dict-platform-indexed numeric/binary vars
  # explicitly listed below. Extend this list to add more per-platform
  # outcomes to group_comparisons (e.g., add "us003" to surface
  # negative-experience rate by platform x demographic).
  PER_PLATFORM_OUTCOMES_INCLUDED <- c("us019_time_min")
  per_platform_outcomes <- Filter(function(v) {
    v$variable_name %in% PER_PLATFORM_OUTCOMES_INCLUDED &&
      identical(v$data_availability, "in_cleaned_csv") &&
      isTRUE(v$is_platform_indexed) &&
      v$response_type %in% c(OUTCOME_NUMERIC, OUTCOME_BINARY)
  }, meta$variables)

  cat(sprintf("Outcomes in scope: %d scalar + %d per-platform\n",
              length(scalar_outcomes), length(per_platform_outcomes)))

  # ---- Derived grouping vars ----
  # 1. political_ideology_tertile: per-wave tertiles of political_ideology_self.
  cleaned <- cleaned |>
    group_by(wave) |>
    mutate(political_ideology_tertile = {
      v <- political_ideology_self
      qs <- quantile(v, probs = c(1/3, 2/3), na.rm = TRUE, names = FALSE)
      if (length(unique(qs)) < 2) {
        rep(NA_character_, length(v))
      } else {
        cut(v, breaks = c(-Inf, qs[1], qs[2], Inf),
            labels = c("Tertile 1 (low)", "Tertile 2 (mid)", "Tertile 3 (high)"),
            include.lowest = TRUE) |> as.character()
      }
    }) |>
    ungroup()

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

  # ---- Grouping var list ----
  base_grouping_vars <- c("gender", "age", "education", "race",
                          "pol_incl_leaners", "political_ideology_tertile")
  platform_grouping_vars <- paste0("platform_user_", vapply(meta$platforms,
                                                            function(p) p$slug,
                                                            character(1)))
  grouping_vars <- c(base_grouping_vars, platform_grouping_vars)
  grouping_vars <- grouping_vars[grouping_vars %in% colnames(cleaned)]
  cat(sprintf("Grouping vars: %d (%d demographic, %d platform_user)\n",
              length(grouping_vars), length(base_grouping_vars),
              length(grouping_vars) - length(base_grouping_vars)))

  # ---- Precompute wave masks ----
  wave_masks <- setNames(lapply(1:6, function(w) cleaned$wave == w),
                         as.character(1:6))

  # ---- Iterate ----
  cat("Iterating outcomes x grouping_vars x waves x groups...\n")
  rows         <- list()
  n_emitted    <- 0L
  n_suppressed <- 0L
  t0 <- Sys.time()

  # Inner loop helper. Emits one row per (grouping_var x wave x group)
  # for a given outcome vector. `platform_slug` is NULL for scalar
  # outcomes and a slug string for per-platform outcomes.
  process_outcome <- function(x_full, waves, variable_name, is_binary, platform_slug) {
    for (g_col in grouping_vars) {
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
            row <- list(
              outcome           = variable_name,
              platform_slug     = platform_slug,
              grouping_var      = g_col,
              group             = as.character(g),
              wave              = as.integer(w),
              metric_type       = "rate",
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
          } else {
            est   <- estimate_mean_both(x_s, w_s)
            gated <- apply_cell_floor(est, est$n)
            row <- list(
              outcome           = variable_name,
              platform_slug     = platform_slug,
              grouping_var      = g_col,
              group             = as.character(g),
              wave              = as.integer(w),
              metric_type       = "mean",
              value             = gated$mean,
              se                = gated$se,
              ci_lower          = gated$ci_lower,
              ci_upper          = gated$ci_upper,
              n                 = gated$n,
              weighted_value    = gated$weighted_mean,
              weighted_se       = gated$weighted_se,
              weighted_ci_lower = gated$weighted_ci_lower,
              weighted_ci_upper = gated$weighted_ci_upper,
              weighted_n_eff    = gated$weighted_n_eff,
              suppressed        = gated$suppressed
            )
          }

          if (isTRUE(gated$suppressed)) n_suppressed <<- n_suppressed + 1L
          else                          n_emitted    <<- n_emitted    + 1L
          rows[[length(rows) + 1]] <<- row
        }
      }
    }
  }

  # Scalar outcomes (platform_slug = NULL on every row).
  for (v in scalar_outcomes) {
    outcome_col <- v$cleaned_column
    if (is.na(outcome_col) || !outcome_col %in% colnames(cleaned)) next
    is_binary   <- v$response_type %in% OUTCOME_BINARY
    x_full      <- if (is_binary) coerce_binary01(cleaned[[outcome_col]])
                   else            coerce_numeric(cleaned[[outcome_col]])
    waves       <- unlist(v$waves_present_in_data)
    if (length(waves) == 0) next
    process_outcome(x_full, waves, v$variable_name, is_binary, NULL)
  }

  # Per-platform outcomes: one pass per (outcome x platform). x_full is
  # built per-platform by reading the right time_*_<slug>_w<N> column
  # for each respondent's wave. Parses the column-prefix from the
  # cleaned_column template stored in meta.json
  # ("time_min_total_<platform_slug>_w<wave>" -> "time_min_total").
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
      process_outcome(x_full, waves, v$variable_name, is_binary, p$slug)
    }
  }

  dt <- as.numeric(difftime(Sys.time(), t0, units = "secs"))
  cat(sprintf("  built %d rows in %.1fs (%d above floor, %d suppressed)\n",
              length(rows), dt, n_emitted, n_suppressed))

  # ---- Write ----
  out_path <- here("public", "data", "group_comparisons.json")
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
