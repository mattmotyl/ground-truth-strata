# Regression tests for transform_data().
#
# Runs transform_data(N) for each of the 6 waves and checks invariants
# that should always hold after cleaning. Designed to be runnable from
# any CWD via here::here() — invoke with:
#
#   Rscript r/clean/tests/test_transform_data.R
#
# Writes a one-line PASS/FAIL summary to docs/ ... no wait, audit artifacts
# live in strata-local. This test prints to stdout / stderr and exits with
# a non-zero status code on failure so CI / pre-commit hooks can catch
# regressions.
#
# Data dependency: requires the raw UAS CSVs to be reachable via the
# r/data/ junction (or the canonical r/data/ subdirectory). If the junction
# is missing the tests skip with a clear message.

suppressPackageStartupMessages({
  library(tidyverse)
  library(here)
})

source(here("r", "clean", "run_script.R"))

data_dir <- here("r", "data")
if (!dir.exists(data_dir)) {
  message("[SKIP] r/data/ junction not present — tests need raw CSVs.")
  quit(status = 0)
}

# Invariants asserted per wave. Each entry is a check function returning
# NULL on success or an error message string on failure.
check <- function(label, ok) {
  if (isTRUE(ok)) {
    cat(sprintf("  [PASS] %s\n", label))
    return(TRUE)
  }
  cat(sprintf("  [FAIL] %s\n", label))
  return(FALSE)
}

run_wave_checks <- function(w) {
  cat(sprintf("\n=== Wave %d ===\n", w))
  df <- suppressWarnings(transform_data(w))

  pass <- TRUE
  pass <- check("returns a data.frame",                         is.data.frame(df))                          && pass
  pass <- check("nrow > 1500",                                  nrow(df) > 1500)                            && pass
  pass <- check("`wave` column == which_wave",                  all(df$wave == w))                          && pass
  pass <- check("`uasid` is non-empty and has no NAs",          length(df$uasid) > 0 && !any(is.na(df$uasid))) && pass
  pass <- check("`final_weight` is numeric and has no NAs",     is.numeric(df$final_weight) && !any(is.na(df$final_weight))) && pass
  pass <- check("no literal '.a' / '.e' / '.c' / '.' sentinel strings remain in cleaned fields",
                all(vapply(c("vote", "atts_gov_reg_tech", "atts_tech_election", "atts_tech_harm", "felt_silenced"),
                           function(col) !any(df[[col]] %in% c(".a", ".e", ".c", ".")),
                           logical(1))))                                                                     && pass
  pass <- check("warmth_friend_lib & warmth_friend_con are numeric",
                is.numeric(df$warmth_friend_lib) && is.numeric(df$warmth_friend_con))                       && pass
  pass <- check("num_sm_used is in [0, 23]",
                all(is.na(df$num_sm_used) | (df$num_sm_used >= 0 & df$num_sm_used <= 23)))                  && pass

  if (w %in% 1:3) {
    pass <- check("pol_incl_leaners has at least some non-NA values (W1-W3)",
                  any(!is.na(df$pol_incl_leaners)))                                                          && pass
  } else {
    pass <- check("pol_incl_leaners is all-NA (W4-W6 data limitation)",
                  all(is.na(df$pol_incl_leaners)))                                                           && pass
  }

  pass
}

results <- sapply(1:6, run_wave_checks)
cat("\n")
if (all(results)) {
  cat("All 6 waves PASSED.\n")
  quit(status = 0)
} else {
  cat(sprintf("FAILED for %d / 6 waves.\n", sum(!results)))
  quit(status = 1)
}
