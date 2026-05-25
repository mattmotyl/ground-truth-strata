# Unit tests for the individual helper functions in transform_functions.R.
# These run without needing the raw CSVs — they exercise each function on
# synthetic inputs that capture the bugs the Phase 1 audit found.
#
# Invoke from the repo root:
#   Rscript r/clean/tests/test_transform_functions.R

suppressPackageStartupMessages({
  library(dplyr)
  library(stringr)
  library(here)
})

# Source just the function-definition file; no need to bring in
# transform_data.R or run_script.R.
source(here("r", "clean", "utils", "preprocessing", "transform_functions.R"))

pass <- TRUE
check <- function(label, ok) {
  if (isTRUE(ok)) {
    cat(sprintf("  [PASS] %s\n", label))
    invisible(TRUE)
  } else {
    cat(sprintf("  [FAIL] %s\n", label))
    pass <<- FALSE
    invisible(FALSE)
  }
}

cat("=== recode_sentinels ===\n")
check("maps .a -> NA",                       is.na(recode_sentinels(".a")))
check("maps .e -> NA",                       is.na(recode_sentinels(".e")))
check("maps .c -> NA",                       is.na(recode_sentinels(".c")))
check("maps .m -> NA",                       is.na(recode_sentinels(".m")))
check("maps .n -> NA",                       is.na(recode_sentinels(".n")))
check("maps '.' -> NA",                      is.na(recode_sentinels(".")))
check("maps empty string -> NA",             is.na(recode_sentinels("")))
check("maps literal 'NA' -> NA",             is.na(recode_sentinels("NA")))
check("maps 'N/A' -> NA",                    is.na(recode_sentinels("N/A")))
check("preserves real values",               recode_sentinels("Hello") == "Hello")
check("handles factor input",                is.na(recode_sentinels(factor(".a"))))
check("handles numeric input (coerces)",     recode_sentinels(5) == "5")
check("vector preserves non-sentinel rows",  identical(recode_sentinels(c(".a", "yes", ".m", "no")), c(NA_character_, "yes", NA_character_, "no")))
check("additional='5' NAs '5' too",          is.na(recode_sentinels("5", additional = "5")))
check("additional doesn't disturb others",   recode_sentinels("4", additional = "5") == "4")

cat("\n=== transform_age ===\n")
check("age 18 -> '18-29'",                   transform_age("18")  == "18-29")
check("age 29 -> '18-29'",                   transform_age("29")  == "18-29")
check("age 30 -> '30-44' (boundary fix)",    transform_age("30")  == "30-44")
check("age 44 -> '30-44'",                   transform_age("44")  == "30-44")
check("age 45 -> '45-59' (boundary fix)",    transform_age("45")  == "45-59")
check("age 59 -> '45-59'",                   transform_age("59")  == "45-59")
check("age 60 -> '60+'",                     transform_age("60")  == "60+")
check("age 95 -> '60+'",                     transform_age("95")  == "60+")
check("age '.e' (UAS sentinel) -> NA",       is.na(transform_age(".e")))
check("age NA -> NA",                        is.na(transform_age(NA_character_)))

cat("\n=== transform_gender ===\n")
check("Female -> Women",                     transform_gender("Female") == "Women")
check("Male -> Men",                         transform_gender("Male")   == "Men")
check("'.e' sentinel -> NA (was 'Men')",     is.na(transform_gender(".e")))

cat("\n=== transform_income ===\n")
inc <- function(v) as.character(transform_income(v))
check("'1 Less than $5,000' -> '<30,000' (was NA)",     inc("1 Less than $5,000")  == "<30,000")
check("'2 5,000 to 7,499' -> '<30,000'",                inc("2 5,000 to 7,499")    == "<30,000")
check("'5 12,500 to 14,999' -> '<30,000' (was NA)",     inc("5 12,500 to 14,999")  == "<30,000")
check("'9 30,000 to 34,999' -> '30,000-59,999'",        inc("9 30,000 to 34,999")  == "30,000-59,999")
check("'13 60,000 to 74,999' -> '60,000-99,999'",       inc("13 60,000 to 74,999") == "60,000-99,999")
check("'15 100,000 to 149,999' -> '100,000-149,999'",   inc("15 100,000 to 149,999") == "100,000-149,999")
check("'16 150,000 or more' -> '>150,000'",             inc("16 150,000 or more")  == ">150,000")
check("'.e' sentinel -> NA",                            is.na(inc(".e")))

cat("\n=== transform_freqs ===\n")
freq <- function(v) as.character(transform_freqs(v))
check("'1 Multiple times per day' -> stripped",  freq("1 Multiple times per day") == "Multiple times per day")
check("'5 Less than once a week' -> stripped",   freq("5 Less than once a week")  == "Less than once a week")
check("'6 I did not use ...' -> NA",             is.na(freq("6 I did not use FOO")))
check("'.a' sentinel -> NA",                     is.na(freq(".a")))
check("'.m' sentinel -> NA (new coverage)",      is.na(freq(".m")))

cat("\n=== transform_experience_qs ===\n")
exp_q <- transform_experience_qs
check("'1 Yes' -> 'Yes'",   exp_q("1 Yes") == "Yes")
check("'2 No'  -> 'No'",    exp_q("2 No")  == "No")
check("'.a' -> NA",         is.na(exp_q(".a")))
check("'.e' -> NA",         is.na(exp_q(".e")))
check("'.m' -> NA (new)",   is.na(exp_q(".m")))

cat("\n")
if (pass) {
  cat("All transform_functions.R unit tests PASSED.\n")
  quit(status = 0)
} else {
  cat("transform_functions.R unit tests FAILED.\n")
  quit(status = 1)
}
