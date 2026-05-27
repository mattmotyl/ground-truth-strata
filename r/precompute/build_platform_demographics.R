# Build public/data/platform_demographics.json — per (platform × wave ×
# grouping_var × group_value) weighted % within the user base of each
# platform.
#
# For each (platform × wave) combination:
#   - Filter the cleaned tibble to wave == w AND uses_<slug>_w<w> == 1
#     (i.e., to respondents who reported using this platform in this
#     wave, derived from us001 multiselect).
#   - Within that platform-user subset, compute the weighted % of users
#     in each level of each grouping var.
#
# Grouping vars (column names from the cleaned tibble — matches the
# precedent set by build_group_comparisons.R, NOT the conceptual names
# in PHASE4_ROUND3_HANDOFF.md):
#   gender, age, education, race, hhincome, pol_incl_leaners,
#   political_ideology_tertile
#
# political_ideology_tertile is derived per-WAVE from
# political_ideology_self (0-100 numeric). Cut-points are defined on
# the FULL wave sample (not on each platform's user subset) so that
# "low / mid / high" means the same thing across platforms — without
# that, cross-platform comparison of political composition would be
# incoherent. Same derivation as build_group_comparisons.R.
#
# `n` is the platform-user denominator with non-NA grouping value (the
# count of users we're computing percentages over). The suppression
# rule is applied at the (platform × wave × grouping_var) level:
# if n < 30 for any one level of that breakdown, every level of that
# breakdown is emitted with NA stats and suppressed = TRUE. This is
# the same n that goes into estimate_proportion_both() for every
# level of that breakdown, so the rule is uniform.
#
# Schema:
#   platform_slug, platform_code, platform_label,
#   wave,
#   grouping_var, group_value,
#   n,
#   weighted_value, weighted_se,
#   weighted_ci_lower, weighted_ci_upper,
#   weighted_n_eff,
#   suppressed
#
# Unweighted point estimates / SE / CI are intentionally excluded from
# JSON output per Step 2. They remain in the R `est` / `gated` objects
# for spot-check validation.
#
# Invoke:
#   Rscript r/precompute/build_platform_demographics.R

suppressPackageStartupMessages({
  library(tidyverse)
  library(here)
  library(jsonlite)
})

source(here("r", "precompute", "utils", "cell_filter.R"))
source(here("r", "precompute", "utils", "weighting.R"))
source(here("r", "precompute", "utils", "coercion.R"))
source(here("r", "precompute", "utils", "transforms.R"))

# ---- Sink ----
audit_dir <- "M:/MM/Websites/strata-local/audit/output"
ts        <- format(Sys.time(), "%Y%m%d_%H%M%S")
sink_path <- if (dir.exists(audit_dir)) {
  file.path(audit_dir, paste0("BUILD_PLATFORM_DEMOGRAPHICS_", ts, ".txt"))
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

  # ---- Derive political_ideology_tertile (internal column name) ----
  # Fixed three-way split of political_ideology_self (0-100 integer
  # scale, 101 values). Replaces the previous per-wave quantile
  # tertile. Cut-points are independent of sample composition so
  # labels are comparable across waves AND platforms.
  #
  # Design: Liberal and Conservative carry equal width (40 scale
  # points each); Moderate is the necessary 21-point middle band
  # that lets 40 + 21 + 40 = 101 total integer values:
  #     0-39    -> Liberal       (40 points)
  #     40-60   -> Moderate      (21 points)
  #     61-100  -> Conservative  (40 points)
  #
  # The JSON output emits this as `grouping_var = "political_ideology_group"`
  # via to_json_grouping_var() below, since the value is no longer a
  # data-driven tertile but a fixed split. Same derivation as
  # build_group_comparisons.R.
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
  # emitted JSON to reflect the fixed-split definition.
  JSON_GROUPING_VAR_NAMES <- c(
    political_ideology_tertile = "political_ideology_group"
  )
  to_json_grouping_var <- function(col) {
    if (col %in% names(JSON_GROUPING_VAR_NAMES))
      unname(JSON_GROUPING_VAR_NAMES[[col]])
    else col
  }

  # ---- Grouping vars (cleaned-tibble column names) ----
  GROUPING_VARS <- c("gender", "age", "education", "race", "hhincome",
                     "pol_incl_leaners", "political_ideology_tertile")
  missing_gv <- setdiff(GROUPING_VARS, colnames(cleaned))
  if (length(missing_gv) > 0) {
    stop("Grouping vars missing from cleaned tibble: ",
         paste(missing_gv, collapse = ", "))
  }
  cat(sprintf("Grouping vars: %s\n", paste(GROUPING_VARS, collapse = ", ")))

  # ---- Iterate (platform × wave × grouping_var × group_value) ----
  all_cols <- colnames(cleaned)
  cat(sprintf("Iterating %d platforms × %d waves × %d grouping_vars\n",
              length(meta$platforms), 6, length(GROUPING_VARS)))

  rows           <- list()
  n_emitted      <- 0L
  n_suppressed   <- 0L
  n_no_users     <- 0L
  n_no_use_col   <- 0L
  t0 <- Sys.time()

  for (p in meta$platforms) {
    for (w in 1:6) {
      use_col <- paste0("uses_", p$slug, "_w", w)
      if (!use_col %in% all_cols) {
        n_no_use_col <- n_no_use_col + 1L
        next
      }
      wave_mask <- cleaned$wave == w
      use01     <- coerce_binary01(cleaned[[use_col]])
      user_mask <- wave_mask & !is.na(use01) & use01 == 1
      if (!any(user_mask)) { n_no_users <- n_no_users + 1L; next }
      wt_users <- cleaned$final_weight[user_mask]

      for (gv in GROUPING_VARS) {
        g_users <- cleaned[[gv]][user_mask]
        # If factor, coerce to character so as.character(lvl) is stable.
        if (is.factor(g_users)) g_users <- as.character(g_users)
        levels_present <- sort(unique(g_users[!is.na(g_users)]))
        if (length(levels_present) == 0) next

        for (lvl in levels_present) {
          # weighted_value is the share of platform users in THIS level
          # (out of all users with a non-NA value on this grouping_var).
          # Computed via a binary indicator across the full non-NA
          # denominator — its SE/CI are the right proportion-uncertainty.
          keep_mask <- !is.na(g_users)
          x01_keep  <- as.integer(g_users[keep_mask] == lvl)
          wt_keep   <- wt_users[keep_mask]
          est <- estimate_proportion_both(x01_keep, wt_keep)

          # Override n and weighted_n_eff with GROUP-SPECIFIC values so
          # this file's schema matches group_comparisons.json (n is the
          # count of users in this level, not the breakdown denominator).
          # Suppression then triggers per-group on n_group < 30 — also
          # matching group_comparisons.json. Consequence: sum of
          # weighted_value across non-suppressed groups may be < 1.0
          # when one of the groups in a breakdown is suppressed.
          n_group     <- sum(x01_keep == 1L)
          wt_in_group <- wt_keep[x01_keep == 1L]
          est$n <- n_group
          est$weighted_n_eff <- if (length(wt_in_group) >= 2) {
            sum(wt_in_group)^2 / sum(wt_in_group^2)
          } else NA_real_

          gated <- apply_cell_floor(est, est$n)
          # Unweighted estimates intentionally excluded from JSON output
          # (Step 2 / option B). Retained in `est` / `gated` for
          # spot-check validation only. To restore: add prop, se,
          # ci_lower, ci_upper back to this list().
          row <- list(
            platform_slug      = p$slug,
            platform_code      = as.integer(p$code),
            platform_label     = p$label,
            wave               = as.integer(w),
            grouping_var       = to_json_grouping_var(gv),
            group_value        = as.character(lvl),
            n                  = gated$n,
            weighted_value     = gated$weighted_prop,
            weighted_se        = gated$weighted_se,
            weighted_ci_lower  = gated$weighted_ci_lower,
            weighted_ci_upper  = gated$weighted_ci_upper,
            weighted_n_eff     = gated$weighted_n_eff,
            suppressed         = gated$suppressed
          )
          if (isTRUE(gated$suppressed)) n_suppressed <- n_suppressed + 1L
          else                          n_emitted    <- n_emitted    + 1L
          rows[[length(rows) + 1]] <- row
        }
      }
    }
  }
  dt <- as.numeric(difftime(Sys.time(), t0, units = "secs"))
  cat(sprintf("  built %d rows in %.1fs (%d above floor, %d suppressed, %d (platform×wave) skipped no-use-col, %d (platform×wave) had zero users)\n",
              length(rows), dt, n_emitted, n_suppressed, n_no_use_col, n_no_users))

  # ---- Write ----
  out_path <- here("public", "data", "platform_demographics.json")
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
