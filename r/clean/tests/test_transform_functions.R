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

cat("\n=== transform_likert3_loneliness (Phase 2 Batch 1) ===\n")
lon <- transform_likert3_loneliness
check("'1 Hardly ever' -> 'Hardly ever'",   as.character(lon("1 Hardly ever")) == "Hardly ever")
check("'2 Some of the time' -> 'Some of the time'", as.character(lon("2 Some of the time")) == "Some of the time")
check("'3 Often' -> 'Often'",               as.character(lon("3 Often")) == "Often")
check("'.a' -> NA",                          is.na(lon(".a")))
check("'.e' -> NA",                          is.na(lon(".e")))
check("returns ordered factor",              is.ordered(lon(c("1 Hardly ever", "3 Often"))))
check("levels are Hardly ever < Some of the time < Often",
      identical(levels(lon("1 Hardly ever")), c("Hardly ever", "Some of the time", "Often")))
check("'Often' > 'Hardly ever' (ordering check)",
      lon("3 Often") > lon("1 Hardly ever"))

cat("\n=== transform_likert3_more_less (Phase 2 Batch 1) ===\n")
ml <- transform_likert3_more_less
check("'1 More' -> 'More'",                  as.character(ml("1 More")) == "More")
check("'2 Less' -> 'Less'",                  as.character(ml("2 Less")) == "Less")
check("'3 Keep doing what they are now' -> 'Keep doing what they are now'",
      as.character(ml("3 Keep doing what they are now")) == "Keep doing what they are now")
check("'.a' -> NA",                          is.na(ml(".a")))
check("levels ordered low-to-high effort: Less < Keep doing < More",
      identical(levels(ml("1 More")), c("Less", "Keep doing what they are now", "More")))
check("'More' > 'Less' (higher score = more regulation effort)",
      ml("1 More") > ml("2 Less"))

cat("\n=== transform_likert4_dass (Phase 2 Batch 1) ===\n")
dass <- transform_likert4_dass
check("'1 Never' -> 'Never'",                as.character(dass("1 Never")) == "Never")
check("'4 Almost always' -> 'Almost always'", as.character(dass("4 Almost always")) == "Almost always")
check("'.a' -> NA",                          is.na(dass(".a")))
check("returns ordered factor",              is.ordered(dass(c("1 Never", "4 Almost always"))))
check("levels are Never < Sometimes < Often < Almost always",
      identical(levels(dass("1 Never")), c("Never", "Sometimes", "Often", "Almost always")))
check("'Almost always' > 'Never'",
      dass("4 Almost always") > dass("1 Never"))

cat("\n=== transform_likert4_freq (Phase 2 Batch 1) ===\n")
fr4 <- transform_likert4_freq
check("'1 Always or almost always' -> 'Always or almost always'",
      as.character(fr4("1 Always or almost always")) == "Always or almost always")
check("'4 Rarely or never' -> 'Rarely or never'",
      as.character(fr4("4 Rarely or never")) == "Rarely or never")
check("'.a' -> NA",                          is.na(fr4(".a")))
check("levels ordered low-to-high frequency",
      identical(levels(fr4("1 Always or almost always")),
                c("Rarely or never", "Some of the time", "Frequently", "Always or almost always")))
check("'Always or almost always' > 'Rarely or never'",
      fr4("1 Always or almost always") > fr4("4 Rarely or never"))

cat("\n=== Phase 2 Batch 2: LIKERT_5 transformers ===\n")

ad <- transform_likert5_agree_dnd
check("agree_dnd: '1 Strongly disagree' -> 'Strongly disagree'",
      as.character(ad("1 Strongly disagree")) == "Strongly disagree")
check("agree_dnd: '5 Strongly agree' is the highest level",
      ad("5 Strongly agree") > ad("1 Strongly disagree"))
check("agree_dnd: '.a' -> NA",                is.na(ad(".a")))

asw <- transform_likert5_agree_somewhat
check("agree_somewhat: '2 Somewhat disagree' -> 'Somewhat disagree'",
      as.character(asw("2 Somewhat disagree")) == "Somewhat disagree")
check("agree_somewhat: levels include 'Somewhat'",
      "Somewhat disagree" %in% levels(asw("1 Strongly disagree")) &&
      "Somewhat agree"    %in% levels(asw("1 Strongly disagree")))

am <- transform_likert5_amount
check("amount: '1 None' -> 'None'",          as.character(am("1 None")) == "None")
check("amount: '5 A great deal' > '1 None'", am("5 A great deal") > am("1 None"))

harm <- transform_likert5_harm
check("harm: '5 Extremely harmful' is highest",
      harm("5 Extremely harmful") > harm("1 Not at all harmful"))

uf <- transform_likert5_useful
check("useful: '5 Extremely useful' is highest",
      uf("5 Extremely useful") > uf("1 Not at all useful"))

ce <- transform_likert5_concern_excite
check("concern_excite: '1 Very concerned' -> 'Very concerned'",
      as.character(ce("1 Very concerned")) == "Very concerned")
check("concern_excite: '5 Very excited' is highest",
      ce("5 Very excited") > ce("1 Very concerned"))
check("concern_excite: '6 No opinion' -> NA (OOR)",
      is.na(ce("6 No opinion")))

sp <- transform_likert5_support
check("support: '5 Strongly support' > '1 Strongly oppose'",
      sp("5 Strongly support") > sp("1 Strongly oppose"))

mla <- transform_likert5_more_less_amount
check("more_less_amount: '5 Much more...' > '1 Much less...'",
      mla("5 Much more than they are now") > mla("1 Much less than they are now"))

co <- transform_likert5_concern_only
check("concern_only: '5 Extremely concerned' > '1 Not at all concerned'",
      co("5 Extremely concerned") > co("1 Not at all concerned"))

eo <- transform_likert5_excite_only
check("excite_only: '5 Extremely excited' > '1 Not at all excited'",
      eo("5 Extremely excited") > eo("1 Not at all excited"))

cno <- transform_likert5_concerned_no_opinion
check("concerned_no_opinion: '1 Very concerned' -> 'Very concerned'",
      as.character(cno("1 Very concerned")) == "Very concerned")
check("concerned_no_opinion: '5 No opinion' -> NA (OOR)",
      is.na(cno("5 No opinion")))
check("concerned_no_opinion: only 4 real levels (No opinion is NA, not a level)",
      length(levels(cno("1 Very concerned"))) == 4)
check("concerned_no_opinion: preserves raw direction (Very concerned = level 1)",
      as.integer(cno("1 Very concerned")) == 1)

eno <- transform_likert5_excited_no_opinion
check("excited_no_opinion: '5 No opinion' -> NA (OOR)",
      is.na(eno("5 No opinion")))
check("excited_no_opinion: only 4 real levels",
      length(levels(eno("1 Very excited"))) == 4)

intg <- transform_likert5_interesting
check("interesting: '1 Very interesting' is at level 1 (raw direction preserved)",
      as.integer(intg("1 Very interesting")) == 1)
check("interesting: 5 levels total",
      length(levels(intg("1 Very interesting"))) == 5)

cat("\n")
if (pass) {
  cat("All transform_functions.R unit tests PASSED.\n")
  quit(status = 0)
} else {
  cat("transform_functions.R unit tests FAILED.\n")
  quit(status = 1)
}
