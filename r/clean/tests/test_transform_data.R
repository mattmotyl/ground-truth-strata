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
                all(vapply(c("vote_2024_preference", "regulation_tech_companies",
                             "regulation_elections", "regulation_protect_users",
                             "refrained_from_posting"),
                           function(col) !any(df[[col]] %in% c(".a", ".e", ".c", ".")),
                           logical(1))))                                                                     && pass
  pass <- check("comfort_liberal_friends & comfort_conservative_friends are numeric",
                is.numeric(df$comfort_liberal_friends) && is.numeric(df$comfort_conservative_friends))      && pass
  pass <- check("num_sm_used is in [0, 23]",
                all(is.na(df$num_sm_used) | (df$num_sm_used >= 0 & df$num_sm_used <= 23)))                  && pass

  if (w %in% 1:3) {
    pass <- check("pol_incl_leaners has at least some non-NA values (W1-W3)",
                  any(!is.na(df$pol_incl_leaners)))                                                          && pass
  } else {
    pass <- check("pol_incl_leaners is all-NA (W4-W6 data limitation)",
                  all(is.na(df$pol_incl_leaners)))                                                           && pass
  }

  # Phase 2 Batch 1 — LIKERT_3 loneliness scale (W2, W5, W6 only)
  if (w %in% c(2, 5, 6)) {
    pass <- check("ex003a-c are ordered factors with the loneliness levels (W2,W5,W6)",
                  all(c("ex003a", "ex003b", "ex003c") %in% colnames(df)) &&
                  all(vapply(c("ex003a","ex003b","ex003c"), function(col)
                    is.ordered(df[[col]]) &&
                    identical(levels(df[[col]]), c("Hardly ever","Some of the time","Often")),
                    logical(1))))                                                                            && pass
    pass <- check("ex003a has at least some non-NA values (W2,W5,W6)",
                  any(!is.na(df$ex003a)))                                                                    && pass
  } else {
    pass <- check("ex003a-c are absent in non-loneliness waves (W1,W3,W4)",
                  !any(c("ex003a","ex003b","ex003c") %in% colnames(df)))                                     && pass
  }

  # Phase 2 Batch 1 — LIKERT_4 DASS depression/anxiety scale (W1 only)
  if (w == 1) {
    pass <- check("ds001a-f are ordered factors with the DASS levels (W1)",
                  all(paste0("ds001", letters[1:6]) %in% colnames(df)) &&
                  all(vapply(paste0("ds001", letters[1:6]), function(col)
                    is.ordered(df[[col]]) &&
                    identical(levels(df[[col]]), c("Never","Sometimes","Often","Almost always")),
                    logical(1))))                                                                            && pass
    pass <- check("ds001a has at least some non-NA values (W1)",
                  any(!is.na(df$ds001a)))                                                                    && pass
  } else {
    pass <- check("ds001a-f are absent outside W1",
                  !any(paste0("ds001", letters[1:6]) %in% colnames(df)))                                     && pass
  }

  # Phase 2 Batch 1 — LIKERT_4 sm_wake_to_check (ex001, W2 only)
  if (w == 2) {
    pass <- check("sm_wake_to_check is an ordered factor with expected levels (W2)",
                  "sm_wake_to_check" %in% colnames(df) &&
                  is.ordered(df$sm_wake_to_check) &&
                  identical(levels(df$sm_wake_to_check),
                            c("Rarely or never", "Some of the time", "Frequently", "Always or almost always")))  && pass
    pass <- check("sm_wake_to_check has at least some non-NA values (W2)",
                  any(!is.na(df$sm_wake_to_check)))                                                          && pass
  } else {
    pass <- check("sm_wake_to_check is all-NA outside W2",
                  "sm_wake_to_check" %in% colnames(df) && all(is.na(df$sm_wake_to_check)))                   && pass
  }

  # Phase 2 Batch 1 — LIKERT_3 tech-regulation more/less (W5, W6 only)
  if (w %in% c(5, 6)) {
    pass <- check("regulation_elections is an ordered factor with more/less levels (W5,W6)",
                  is.ordered(df$regulation_elections) &&
                  identical(levels(df$regulation_elections),
                            c("Less", "Keep doing what they are now", "More")))                              && pass
    pass <- check("regulation_protect_users is an ordered factor with more/less levels (W5,W6)",
                  is.ordered(df$regulation_protect_users) &&
                  identical(levels(df$regulation_protect_users),
                            c("Less", "Keep doing what they are now", "More")))                              && pass
    pass <- check("regulation_elections has at least some non-NA values (W5,W6)",
                  any(!is.na(df$regulation_elections)))                                                      && pass
  } else {
    pass <- check("regulation_elections is all-NA outside W5,W6",
                  all(is.na(df$regulation_elections)))                                                       && pass
  }

  # Phase 2 Batch 2 — LIKERT_5 spot checks
  # regulation_tech_companies (ex004a, W5-W6 only)
  if (w %in% c(5, 6)) {
    pass <- check("regulation_tech_companies is ordered factor with 5 amount levels (W5,W6)",
                  is.ordered(df$regulation_tech_companies) &&
                  length(levels(df$regulation_tech_companies)) == 5 &&
                  "Much more than they are now" %in% levels(df$regulation_tech_companies))                   && pass
  } else {
    pass <- check("regulation_tech_companies is all-NA outside W5,W6",
                  all(is.na(df$regulation_tech_companies)))                                                  && pass
  }

  # ins001a-h institutional trust (W1 only)
  if (w == 1) {
    pass <- check("ins001a-h are ordered factors with None..A great deal (W1)",
                  all(paste0("ins001", letters[1:8]) %in% colnames(df)) &&
                  is.ordered(df$ins001a) &&
                  identical(levels(df$ins001a),
                            c("None", "Very little", "Some", "Quite a lot", "A great deal")))                && pass
  } else {
    pass <- check("ins001a-h are absent outside W1",
                  !any(paste0("ins001", letters[1:8]) %in% colnames(df)))                                    && pass
  }

  # sc001a-f social media beliefs (W1, W2 only per dictionary —
  # the handoff doc's "all waves" claim turned out to be wrong; the raw
  # CSVs don't carry sc001* in W3-W6)
  if (w %in% 1:2) {
    pass <- check("sc001a is ordered factor with agree_dnd levels (W1,W2)",
                  "sc001a" %in% colnames(df) &&
                  is.ordered(df$sc001a) &&
                  identical(levels(df$sc001a),
                            c("Strongly disagree", "Disagree",
                              "Neither agree nor disagree", "Agree",
                              "Strongly agree")))                                                            && pass
  } else {
    pass <- check("sc001a-f absent outside W1,W2",
                  !any(paste0("sc001", letters[1:6]) %in% colnames(df)))                                     && pass
  }

  # ai_concern / ai_excitement (LIKERT_5 with OOR=5) — singletons, always present
  pass <- check("ai_concern is ordered factor with 4 levels (OOR dropped)",
                is.ordered(df$ai_concern) &&
                length(levels(df$ai_concern)) == 4)                                                          && pass
  pass <- check("ai_excitement is ordered factor with 4 levels (OOR dropped)",
                is.ordered(df$ai_excitement) &&
                length(levels(df$ai_excitement)) == 4)                                                       && pass

  # AI XR (q_ai13/q_ai14) — singletons, always present (NA outside waves
  # where the question was asked)
  pass <- check("ai_xr_excitement is ordered factor with 5 levels",
                is.ordered(df$ai_xr_excitement) &&
                length(levels(df$ai_xr_excitement)) == 5)                                                    && pass
  pass <- check("ai_xr_concern is ordered factor with 5 levels",
                is.ordered(df$ai_xr_concern) &&
                length(levels(df$ai_xr_concern)) == 5)                                                       && pass

  # survey_interest (cs_001) — always present
  pass <- check("survey_interest is ordered factor with 5 levels",
                is.ordered(df$survey_interest) &&
                length(levels(df$survey_interest)) == 5)                                                     && pass

  # ai_effect_a-g (W1 only, OOR=6)
  if (w == 1) {
    pass <- check("ai_effect_a-g are ordered factors with concern_excite levels (W1)",
                  all(paste0("ai_effect_", letters[1:7]) %in% colnames(df)) &&
                  is.ordered(df$ai_effect_a) &&
                  identical(levels(df$ai_effect_a),
                            c("Very concerned", "Somewhat concerned",
                              "Equally concerned and excited",
                              "Somewhat excited", "Very excited")))                                          && pass
  } else {
    pass <- check("ai_effect_a-g absent outside W1",
                  !any(paste0("ai_effect_", letters[1:7]) %in% colnames(df)))                                && pass
  }

  # Phase 2 Batch 3 — LIKERT_6_NOMID tech identity (te001a-e, W1 only)
  if (w == 1) {
    pass <- check("te001a-e are ordered factors with 6 no-midpoint levels (W1)",
                  all(paste0("te001", letters[1:5]) %in% colnames(df)) &&
                  is.ordered(df$te001a) &&
                  identical(levels(df$te001a),
                            c("Strongly disagree", "Disagree", "Somewhat disagree",
                              "Somewhat agree", "Agree", "Strongly agree")))                                 && pass
    pass <- check("te001 levels do NOT include a neutral midpoint",
                  !any(grepl("Neither", levels(df$te001a))))                                                 && pass
  } else {
    pass <- check("te001a-e absent outside W1",
                  !any(paste0("te001", letters[1:5]) %in% colnames(df)))                                     && pass
  }

  # Phase 2 Batch 3 — LIKERT_7 life satisfaction (ls002a-l, all 6 waves;
  # ls002a/b/e/f have PDF truncation flag for W5/W6 — column may exist
  # but be all-NA in those waves)
  pass <- check("ls002a-l are ordered factors with 7-point agree levels",
                all(paste0("ls002", letters[1:12]) %in% colnames(df)) &&
                is.ordered(df$ls002a) &&
                identical(levels(df$ls002a),
                          c("Strongly disagree", "Disagree", "Somewhat disagree",
                            "Neither agree nor disagree",
                            "Somewhat agree", "Agree", "Strongly agree")))                                   && pass
  # ls002i (reverse-coded per dictionary) should still parse correctly
  pass <- check("ls002i (reverse-coded item) has same levels as the rest of the scale",
                identical(levels(df$ls002i), levels(df$ls002a)))                                             && pass
  # W6 truncation: ls002a/b/e/f should be all-NA in W6 per PDF
  if (w == 6) {
    pass <- check("ls002a is all-NA in W6 (PDF truncation flag confirmed)",
                  all(is.na(df$ls002a)))                                                                     && pass
  }

  # Phase 2 Batch 3 — LIKERT_7 per-platform habit/attitude scale
  # (us018<letter>_<plat>_, W4-W6). Column shape: us018a_1_, us018a_2_,
  # ..., us018g_23_. Hundreds of columns per wave — spot-check one.
  if (w %in% 4:6) {
    pass <- check("us018a_1_ is an ordered LIKERT_7 factor in W4-W6",
                  "us018a_1_" %in% colnames(df) &&
                  is.ordered(df[["us018a_1_"]]) &&
                  identical(levels(df[["us018a_1_"]]),
                            c("Strongly disagree", "Disagree", "Somewhat disagree",
                              "Neither agree nor disagree",
                              "Somewhat agree", "Agree", "Strongly agree")))                                 && pass
    # Count of us018 columns present in this wave (should be many)
    us018_cols <- grep("^us018[a-g]_\\d+_$", colnames(df), value = TRUE)
    pass <- check(sprintf("us018 family has multiple platform-indexed columns in W%d (found %d)",
                          w, length(us018_cols)),
                  length(us018_cols) > 50)                                                                   && pass
  } else {
    pass <- check("us018 platform-indexed columns absent outside W4-W6",
                  length(grep("^us018[a-g]_\\d+_$", colnames(df))) == 0)                                     && pass
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
