# Unit + integration tests for rename_variables().
# Runs against synthetic single-wave fixtures + real cleaned output for
# every wave. Invoke from the repo root:
#   Rscript r/clean/tests/test_rename_variables.R

suppressPackageStartupMessages({
  library(dplyr); library(here)
})

# Source the function defs that rename_variables depends on
source(here("r", "clean", "utils", "platform_map.R"))
source(here("r", "clean", "utils", "preprocessing", "rename_variables.R"))

pass <- TRUE
check <- function(label, ok) {
  if (isTRUE(ok)) {
    cat(sprintf("  [PASS] %s\n", label)); invisible(TRUE)
  } else {
    cat(sprintf("  [FAIL] %s\n", label)); pass <<- FALSE; invisible(FALSE)
  }
}

# Helper: rename a one-row data frame with the given columns.
ren <- function(cols, wave = 1, add_demo = FALSE) {
  df <- as.data.frame(setNames(rep(list(NA), length(cols)), cols))
  df$wave <- wave
  out <- rename_variables(df, add_suffix_to_demographics = add_demo)
  colnames(out)
}

cat("=== us001sN -> uses_<platform>_w<wave> ===\n")
check("us001s1 -> uses_facebook_w1",     "uses_facebook_w1"     %in% ren(c("us001s1")))
check("us001s23 W6 -> uses_bluesky_w6",  "uses_bluesky_w6"      %in% ren(c("us001s23"), wave = 6))
check("us001s22 W2 -> uses_threads_w2",  "uses_threads_w2"      %in% ren(c("us001s22"), wave = 2))

cat("\n=== us<digits>_<plat>_<follow?> (path 2) ===\n")
check("us002_1_ -> freq_facebook_w1",                 "freq_facebook_w1"           %in% ren(c("us002_1_")))
check("us003_3_ -> nux_instagram_w2",                 "nux_instagram_w2"           %in% ren(c("us003_3_"), wave = 2))
check("us004_1_s1 -> nuximpact_facebook_s1_w1",       "nuximpact_facebook_s1_w1"   %in% ren(c("us004_1_s1")))
check("us010_3_ -> mcxn_instagram_w1",                "mcxn_instagram_w1"          %in% ren(c("us010_3_")))
check("us025_1_s1 W6 -> mcxntopic_facebook_s1_w6",
      "mcxntopic_facebook_s1_w6" %in% ren(c("us025_1_s1"), wave = 6))
check("us026_3_s5 W6 -> usefultopic_instagram_s5_w6",
      "usefultopic_instagram_s5_w6" %in% ren(c("us026_3_s5"), wave = 6))

cat("\n=== us<digits><letter>_<plat>_ (path 3, W4+ habit scale) ===\n")
check("us018a_1_ W4 -> habit_auto_facebook_w4",      "habit_auto_facebook_w4"     %in% ren(c("us018a_1_"), wave = 4))
check("us018b_2_ W5 -> habit_think_twitter_x_w5",    "habit_think_twitter_x_w5"   %in% ren(c("us018b_2_"), wave = 5))
check("us018c_3_ W4 -> habit_pos_instagram_w4",      "habit_pos_instagram_w4"     %in% ren(c("us018c_3_"), wave = 4))
check("us018d_4_ W4 -> habit_neg_tiktok_w4",         "habit_neg_tiktok_w4"        %in% ren(c("us018d_4_"), wave = 4))
check("us018e_5_ W4 -> habit_time_snapchat_w4",      "habit_time_snapchat_w4"     %in% ren(c("us018e_5_"), wave = 4))
check("us018f_6_ W4 -> habit_learn_youtube_w4",      "habit_learn_youtube_w4"     %in% ren(c("us018f_6_"), wave = 4))
check("us018g_22_ W5 -> habit_rel_threads_w5",       "habit_rel_threads_w5"       %in% ren(c("us018g_22_"), wave = 5))
check("us018g_23_ W6 -> habit_rel_bluesky_w6",       "habit_rel_bluesky_w6"       %in% ren(c("us018g_23_"), wave = 6))

cat("\n=== us<digits>_<word>_<plat>_ (path 4, W4+ time-spent) ===\n")
check("us019_hours_1_ W4 -> time_hrs_facebook_w4",     "time_hrs_facebook_w4"     %in% ren(c("us019_hours_1_"), wave = 4))
check("us019_minutes_3_ W4 -> time_min_instagram_w4",  "time_min_instagram_w4"    %in% ren(c("us019_minutes_3_"), wave = 4))

cat("\n=== multi-word slug spot-checks (dating_apps, online_gaming, text_messaging, something_else) ===\n")
check("us002_13_ -> freq_dating_apps_w1",            "freq_dating_apps_w1"        %in% ren(c("us002_13_")))
check("us002_16_ -> freq_online_gaming_w1",          "freq_online_gaming_w1"      %in% ren(c("us002_16_")))
check("us002_15_ -> freq_text_messaging_w1",         "freq_text_messaging_w1"     %in% ren(c("us002_15_")))
check("us002_20_ -> freq_something_else_w1",         "freq_something_else_w1"     %in% ren(c("us002_20_")))

cat("\n=== add_suffix_to_demographics ===\n")
check("default leaves political_ideology_self unchanged",
      "political_ideology_self" %in% ren(c("political_ideology_self"), wave = 3))
check("add_demo=TRUE -> political_ideology_self_w3",
      "political_ideology_self_w3" %in% ren(c("political_ideology_self"), wave = 3, add_demo = TRUE))
check("comfort_liberal_friends also gets suffixed",
      "comfort_liberal_friends_w4" %in% ren(c("comfort_liberal_friends"), wave = 4, add_demo = TRUE))
check("regulation_tech_companies also gets suffixed",
      "regulation_tech_companies_w5" %in% ren(c("regulation_tech_companies"), wave = 5, add_demo = TRUE))

cat("\n=== invariants ===\n")
check("non-platform-indexed columns pass through unchanged",
      "uasid"        %in% ren(c("uasid")) &&
      "final_weight" %in% ren(c("final_weight")) &&
      "gender"       %in% ren(c("gender")))
check("multi-wave data raises an error",
      tryCatch({
        df <- data.frame(wave = c(1, 2))
        rename_variables(df)
        FALSE
      }, error = function(e) grepl("[Mm]ultiple|wave", conditionMessage(e))))

cat("\n=== platform_slug / platform_label invariants ===\n")
check("platform_slug and platform_label have identical keys",
      identical(sort(names(platform_slug)), sort(names(platform_label))))
check("all slugs are valid snake_case (lower, underscore, digits only)",
      all(grepl("^[a-z0-9_]+$", unname(platform_slug))))
check("no slug starts with a digit (safe for column names)",
      all(!grepl("^[0-9]", unname(platform_slug))))
check("23 slug-label pairs total",
      length(platform_slug) == 23 && length(platform_label) == 23)

# Full pipeline run on each wave: cleanest renames, no NA-prepended
# names, no duplicate column names. Also: no spaces or parentheses
# in any column name (those would require backtick-quoting).
cat("\n=== full pipeline (each wave) ===\n")
source(here("r", "clean", "run_script.R"))
for (w in 1:6) {
  cleaned <- suppressWarnings(transform_data(w))
  ok <- tryCatch({
    renamed <- rename_variables(cleaned)
    after <- colnames(renamed)
    no_na    <- !any(grepl("^NA[A-Z]|_NA_|NA_w\\d", after))
    no_dup   <- anyDuplicated(after) == 0
    no_space <- !any(grepl("[ ()]", after))
    no_na && no_dup && no_space
  }, error = function(e) {
    cat(sprintf("    error: %s\n", conditionMessage(e))); FALSE
  })
  check(sprintf("wave %d renames cleanly (no NA-names, no duplicates, no spaces/parens)", w), ok)
}

cat("\n")
if (pass) {
  cat("All rename_variables tests PASSED.\n")
  quit(status = 0)
} else {
  cat("rename_variables tests FAILED.\n")
  quit(status = 1)
}
