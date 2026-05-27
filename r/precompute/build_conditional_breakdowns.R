# Build public/data/conditional_breakdowns.json — per (platform x wave x
# option) proportions for the six conditional-multiselect constructs.
# Each construct is a multiselect asked ONLY IF the respondent answered
# YES to a parent yes/no question for the same platform-wave:
#
#   nuximpact   (us004)  conditional on nux    (us003)
#   nuxtopic    (us005)  conditional on nux    (us003)
#   bftwimpact  (us008)  conditional on bftw   (us007)
#   bftwtopic   (us016)  conditional on bftw   (us007)
#   mcxntopic   (us025)  conditional on mcxn   (us010)   W6 only
#   usefultopic (us026)  conditional on useful (us012)   W6 only
#
# Cleaning produces per-(platform, option, wave) binary child columns:
#   <prefix>_<platform_slug>_s<option_index>_w<wave>
# with values "0 No" / "1 Yes" (handled by coerce_binary01).
#
# Each emitted row gives the proportion of THAT-PARENT-YES respondents
# who selected the option. The `n` field is the conditioned-on subset
# size (count of respondents who said YES to the parent for this
# platform-wave), per Matt's choice 2026-05-25. Cells with n < 30 are
# emitted with NA values and suppressed:true.
#
# Invoke:
#   Rscript r/precompute/build_conditional_breakdowns.R

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
#
# IMPORTANT: this is the conditional-breakdowns build script. The six
# conditional follow-up items (us004, us005, us008, us016, us025,
# us026) are EXPLICITLY THE CONTENT of this file — EXCLUDED_VARIABLES
# is intentionally NOT applied here (per handoff Step 7b). The
# constants block is present for documentation parity with the other
# precompute scripts and for any future domain/suffix/type-based
# filters that may need to apply to this output.

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

audit_dir <- "M:/MM/Websites/strata-local/audit/output"
ts        <- format(Sys.time(), "%Y%m%d_%H%M%S")
sink_path <- if (dir.exists(audit_dir)) {
  file.path(audit_dir, paste0("BUILD_CONDITIONAL_BREAKDOWNS_", ts, ".txt"))
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
  cleaned <- apply_reverse_coding(cleaned)
  cleaned <- derive_loneliness(cleaned)

  all_cols <- colnames(cleaned)

  # Platform-slug -> label lookup from meta.
  platform_label_by_slug <- setNames(
    vapply(meta$platforms, function(p) p$label, character(1)),
    vapply(meta$platforms, function(p) p$slug,  character(1))
  )

  CONSTRUCT_DEFS <- list(
    list(prefix = "nuximpact",   child_dict = "us004",
         parent_prefix = "nux",    parent_dict = "us003"),
    list(prefix = "nuxtopic",    child_dict = "us005",
         parent_prefix = "nux",    parent_dict = "us003"),
    list(prefix = "bftwimpact",  child_dict = "us008",
         parent_prefix = "bftw",   parent_dict = "us007"),
    list(prefix = "bftwtopic",   child_dict = "us016",
         parent_prefix = "bftw",   parent_dict = "us007"),
    list(prefix = "mcxntopic",   child_dict = "us025",
         parent_prefix = "mcxn",   parent_dict = "us010"),
    list(prefix = "usefultopic", child_dict = "us026",
         parent_prefix = "useful", parent_dict = "us012")
  )

  rows         <- list()
  n_emitted    <- 0L
  n_suppressed <- 0L
  n_skipped    <- 0L
  t0 <- Sys.time()

  for (cd in CONSTRUCT_DEFS) {
    cat(sprintf("--- %s (child %s, parent %s) ---\n",
                cd$prefix, cd$child_dict, cd$parent_dict))

    # Response option labels from dict
    child_var <- Filter(function(v) v$variable_name == cd$child_dict, meta$variables)
    opt_labels <- if (length(child_var) > 0) child_var[[1]]$response_options
                  else list()

    pat <- paste0("^", cd$prefix, "_(.+)_s(\\d+)_w(\\d+)$")
    child_cols <- grep(pat, all_cols, value = TRUE)
    if (length(child_cols) == 0) {
      cat("  no matching cleaned columns; skipping\n")
      next
    }
    parsed <- regmatches(child_cols, regexec(pat, child_cols))
    triplets_df <- data.frame(
      column = child_cols,
      slug   = vapply(parsed, function(m) m[2], character(1)),
      opt    = as.integer(vapply(parsed, function(m) m[3], character(1))),
      wave   = as.integer(vapply(parsed, function(m) m[4], character(1))),
      stringsAsFactors = FALSE
    )
    cat(sprintf("  %d child columns across %d slugs x %d waves\n",
                nrow(triplets_df),
                length(unique(triplets_df$slug)),
                length(unique(triplets_df$wave))))

    sw_pairs <- unique(triplets_df[, c("slug", "wave")])
    for (i in seq_len(nrow(sw_pairs))) {
      slug <- sw_pairs$slug[i]; w <- sw_pairs$wave[i]
      parent_col <- paste0(cd$parent_prefix, "_", slug, "_w", w)
      if (!parent_col %in% all_cols) {
        n_skipped <- n_skipped + 1L
        next
      }
      parent_x01 <- coerce_binary01(cleaned[[parent_col]])
      mask <- cleaned$wave == w & !is.na(parent_x01) & parent_x01 == 1
      wt_subset <- cleaned$final_weight[mask]

      opts_here <- sort(unique(triplets_df$opt[triplets_df$slug == slug &
                                                triplets_df$wave == w]))
      for (opt_code in opts_here) {
        child_col <- paste0(cd$prefix, "_", slug, "_s", opt_code, "_w", w)
        if (!child_col %in% all_cols) next
        x01 <- coerce_binary01(cleaned[[child_col]][mask])
        est   <- estimate_proportion_both(x01, wt_subset)
        gated <- apply_cell_floor(est, est$n)
        opt_label <- if (as.character(opt_code) %in% names(opt_labels))
                       opt_labels[[as.character(opt_code)]]
                     else NA_character_
        # Unweighted estimates intentionally excluded from JSON output (Step 7b).
        # Retained in `est` / `gated` R objects for spot-check validation only.
        # To restore: add value, se, ci_lower, ci_upper back to this list().
        # `n` (the conditioned-on subset size, parent=YES count) and
        # `weighted_n_eff` are both kept.
        rows[[length(rows) + 1]] <- list(
          construct         = cd$prefix,
          child_variable    = cd$child_dict,
          parent_variable   = cd$parent_dict,
          parent_clean      = cd$parent_prefix,
          platform_slug     = slug,
          platform_label    = unname(platform_label_by_slug[slug]),
          wave              = as.integer(w),
          option_index      = as.integer(opt_code),
          option_label      = opt_label,
          n                 = gated$n,
          weighted_value    = gated$weighted_prop,
          weighted_se       = gated$weighted_se,
          weighted_ci_lower = gated$weighted_ci_lower,
          weighted_ci_upper = gated$weighted_ci_upper,
          weighted_n_eff    = gated$weighted_n_eff,
          suppressed        = gated$suppressed
        )
        if (isTRUE(gated$suppressed)) n_suppressed <- n_suppressed + 1L
        else                          n_emitted    <- n_emitted    + 1L
      }
    }
  }

  dt <- as.numeric(difftime(Sys.time(), t0, units = "secs"))
  cat(sprintf("\nBuilt %d rows in %.1fs (%d above floor, %d suppressed, %d skipped no-parent-col)\n",
              length(rows), dt, n_emitted, n_suppressed, n_skipped))

  out_path <- here("public", "data", "conditional_breakdowns.json")
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
