# Define transformation functions

# Recode UAS missing-value sentinels to NA. Per the UAS panel documentation
# (https://uasdata.usc.edu) and Phase 1 audit of all 6 raw CSVs, the
# complete set of sentinel string codes is:
#   ".e" -> respondent saw the question but did not answer it
#   "."  -> respondent never saw the question (skipped, broke off, or dirty data)
#   ".a" -> additional missing-value sentinel (observed in legacy waves)
#   ".c" -> placeholder for end_date variables when the survey is incomplete
#   ".m" -> household / panel meta sentinel (e.g., "no Nth household member")
#   ".n" -> additional UAS sentinel observed in survhhid metadata
# Also handles empty strings and literal "NA" / "N/A" strings.
#
# Optional `additional` parameter accepts per-variable out-of-range codes
# (see docs/data-dictionary.json out_of_range_codes column) — e.g., pass
# additional = "5" for ai_concerned so the numeric "No opinion" code is
# also mapped to NA. These are domain-specific sentinels distinct from the
# universal string sentinels above.
#
# Returns a character vector with sentinels replaced by NA_character_.
recode_sentinels <- function(x, additional = NULL) {
  if (is.factor(x))     x <- as.character(x)
  if (!is.character(x)) x <- as.character(x)
  base_sentinels <- c(".a", ".e", ".c", ".m", ".n", ".", "", "NA", "N/A")
  all_na <- c(base_sentinels, as.character(additional))
  na_idx <- x %in% all_na
  x[na_idx] <- NA_character_
  x
}

transform_gender <- function(x) {
  x <- recode_sentinels(x)
  # case_when (not ifelse) so NA propagates instead of falling into "Men".
  # In R, grepl("Female", NA) returns FALSE — so a naive
  # ifelse(grepl("Female", x), "Women", "Men") would silently miscode UAS
  # sentinel respondents as "Men".
  case_when(
    is.na(x)            ~ NA_character_,
    grepl("Female", x)  ~ "Women",
    TRUE                ~ "Men"
  )
}

# Bucket age into research-conventional bands. The `right = FALSE` and
# breaks at 30/45/60 ensure age 30 is the FIRST age in the "30-44" band
# (not the last age in "18-29"), and age 45 is the first in "45-59". A
# prior version used right = TRUE with breaks at 30/45/59 which silently
# misclassified ages 30 and 45 into the lower bucket.
#
# `recode_sentinels(x)` converts UAS ".e" / ".a" age strings to NA before
# numeric coercion, eliminating the "NAs introduced by coercion" warnings
# without changing the output (those respondents end up with NA age_bucket
# either way; this just makes the intent explicit and silences the noise).
transform_age <- function(x) {
  x <- recode_sentinels(x)
  cut(as.numeric(x),
      breaks         = c(0, 30, 45, 60, Inf),
      labels         = c('18-29', '30-44', '45-59', '60+'),
      right          = FALSE,
      include.lowest = TRUE)
}

transform_race <- function(x, y) factor(case_when(
  grepl("White Only", x) & grepl("No", y) ~ 'White, non-Hispanic',
  grepl("Black Only", x) & grepl("No", y) ~ 'Black, non-Hispanic',
  grepl("Asian Only", x) & grepl("No", y) ~ 'Asian, non-Hispanic',
  grepl("American Indian or Alaska Native Only|Hawaiian/Pacific Islander Only|Mixed", x) &
    grepl("No", y) ~ 'Other/Multiple races, non-Hispanic',
  grepl("Yes", y) ~ 'Hispanic',
  TRUE ~ NA_character_
),levels = c("White, non-Hispanic", "Black, non-Hispanic", "Asian, non-Hispanic",
             "Hispanic", "Other/Multiple races, non-Hispanic"))

transform_pol <- function(x,y) factor(case_when(
  # create a combined politics variable to distinguish "independents" based on leaning; combine 3rd parties into single 'other' group
  grepl("Democrats",x) ~ "Democrats, including leaners",
  grepl("Republicans",x) ~ "Republicans, including leaners",
  grepl("Independents|Not aligned with any political party",x) &
    grepl("Do not lean",y) ~ "Independents, excluding leaners",
  grepl("Independents|Not aligned with any political party",x) &
    grepl("Lean toward affiliating with Democrats",y) ~ "Democrats, including leaners",
  grepl("Independents|Not aligned with any political party",x) &
    grepl("Lean toward affiliating with Republicans",y) ~ "Republicans, including leaners",
  grepl('Libertarians|Green party|Some other party',x) ~ 'Other parties',
  TRUE~NA_character_ ),
  levels=c("Democrats, including leaners", "Independents, excluding leaners",
           "Republicans, including leaners","Other parties"))

transform_edu <- function(x) factor(case_when(
  # create education buckets; following American National Election Study & Pew
  grepl("Less than 1st grade|7th or 8th grade|9th grade|10th grade|11th grade|12th grade-no diploma",x) ~ 'Grade School / Some High School',
  grepl("High school graduate or GED",x) ~ 'High School Diploma',
  grepl("Some college-no degree|Assoc. college degree-occ/voc prog|Assoc. college degree-academic prog",x) ~ 'Some College',
  grepl("Bachelor's degree|Master's degree|Professional school degree|Doctorate degree",x) ~ 'College Degree / Post-grad',
  TRUE~NA_character_ ),
  levels=c("Grade School / Some High School","High School Diploma","Some College","College Degree / Post-grad"))

# NOTE on the income pattern: the previous version had two regex bugs that
# silently misclassified the lowest two income brackets as NA:
#   1) "Less than $" — the `$` was treated as regex end-of-line anchor
#      instead of a literal dollar sign. Fixed by escaping as "\\$".
#   2) "12,500 to 14,\n        999" — the multi-line string literal in R
#      embedded a literal newline + 8 spaces in the regex pattern, between
#      "14," and "999". Fixed by writing the alternatives across multiple
#      grepl() calls so no string literal needs to wrap.
# Both bugs were silent: respondents in "Less than $5,000" and
# "12,500 to 14,999" were dropped from the "<30,000" bucket.
transform_income <- function(x) factor(case_when(
  grepl("Less than \\$|5,000 to 7,499|7,500 to 9,999|10,000 to 12,499", x) ~ "<30,000",
  grepl("12,500 to 14,999|15,000 to 19,999|20,000 to 24,999|25,000 to 29,999", x) ~ "<30,000",
  grepl("30,000 to 34,999|35,000 to 39,999|40,000 to 49,999|50,000 to 59,999", x) ~ "30,000-59,999",
  grepl("60,000 to 74,999|75,000 to 99,999", x) ~ "60,000-99,999",
  grepl("100,000 to 149,999", x) ~ "100,000-149,999",
  grepl("150,000 or more", x) ~ ">150,000",
  TRUE ~ NA_character_),
  levels = c("<30,000","30,000-59,999","60,000-99,999","100,000-149,999",">150,000"))

transform_ai_used <- function(data, which_wave) {
  if (which_wave == 1) {
    num_ai_used <- sapply(strsplit(as.character(data$ai_used), "-"),
                          function(matches) sum(as.numeric(matches) %in% c(1, 2, 3, 4))) # exclude 5 because 5 = none of the above
  } else {
    if (which_wave == 2 | which_wave == 3) {
      q_ai_cols <- c("q_ai1","q_ai2","q_ai4","q_ai5","q_ai6") # exclude q_ai3 because that is a search engine
      num_ai_used <- rowSums(data[, q_ai_cols] == "1 Yes", na.rm = TRUE) # count total number of AI tools user said yes they used
    } else {
      num_ai_used <- rep(NA, nrow(data)) # waves > 3 do not include AI used questions
    }
  }
  return(num_ai_used) # return total number of AI tools used
}

# take us001 variable which is a concatenated string of numbers separated by dashes
# each number corresponds to a different social media platform, except for 21, which = "None"
transform_sm_used<-function(x) sapply(strsplit(as.character(x$us001), "-"), function(matches)
  # count total number of valid platforms selected
  sum(as.numeric(matches) %in% c(1, 2, 3, 4, 5, 6,7,8,9,10,11,12,13,14,15,16,
                                 17,18,19,20,22,23))) # exclude 21 bc = "None"

# Map the UAS "N <label>" frequency response to its label, with .a/.e/.c/.m/.n
# sentinels and the "I did not use" non-response option folded to NA.
# Uses recode_sentinels for the sentinel set rather than inline string equality
# so the helper stays the single source of truth for what counts as missing.
transform_freqs <- function(x) {
  x <- recode_sentinels(x)
  x <- factor(case_when(
    grepl("I did not use", x) ~ NA_character_,
    !is.na(x) ~ str_sub(x, 3, nchar(x))
  ), levels = c("Less than once a week", "About once a week", "A few times per week",
                "About once a day", "Multiple times per day"))
  return(x)
}

# Normalize the UAS "N Yes" / "N No" experience questions to plain Yes / No
# strings, with UAS sentinels mapped to NA via recode_sentinels.
transform_experience_qs <- function(x) {
  x <- recode_sentinels(x)
  x <- case_when(
    grepl("Yes", x) ~ "Yes",
    grepl("No",  x) ~ "No",
    TRUE ~ x
  )
  return(x)
}

# ----------------------------------------------------------------------
# Ordinal Likert-scale transformers (Phase 2)
#
# Every UAS scale variable arrives as a "N <label>" string (e.g.,
# "1 Strongly disagree", "3 Often"). The transformers below strip the
# leading "N " and return an ordered factor whose levels match the
# response_options field in docs/data-dictionary.json for that scale.
#
# Common pattern (matching transform_freqs):
#   1. recode_sentinels() — drop UAS missing-value sentinels (and any
#      per-variable out-of-range codes like "5 No opinion") to NA
#   2. case_when() — keep non-NA values, strip the "N " prefix
#   3. factor(..., levels = ..., ordered = TRUE) — set the canonical
#      ordering so scale composites can use as.integer() in Phase 3
#
# Reverse-coding and scale-composite scoring stay in Phase 3 precompute
# (driven by the dictionary's is_reverse_coded field). These transformers
# preserve raw codes in their natural direction.
# ----------------------------------------------------------------------

# Helper: strip the leading "N " from a UAS scale label.
.strip_uas_code <- function(x) str_sub(x, 3, nchar(x))

# LIKERT_3 — UCLA loneliness short scale (ex003a/b/c).
# Levels: Hardly ever -> Some of the time -> Often.
transform_likert3_loneliness <- function(x) {
  x <- recode_sentinels(x)
  factor(
    case_when(!is.na(x) ~ .strip_uas_code(x)),
    levels  = c("Hardly ever", "Some of the time", "Often"),
    ordered = TRUE
  )
}

# LIKERT_3 — tech-regulation "more vs less" (ex004b/c).
# Levels ordered low-to-high effort: Less -> Keep doing what they are now
# -> More. The dictionary lists raw codes as 1=More, 2=Less, 3=Keep
# doing what they are now — those codes are NOT monotonic with respect
# to the effort construct, so the factor explicitly imposes a high-score-
# means-more-regulation ordering, matching standard survey research
# convention (higher score = more of the construct).
transform_likert3_more_less <- function(x) {
  x <- recode_sentinels(x)
  factor(
    case_when(!is.na(x) ~ .strip_uas_code(x)),
    levels  = c("Less", "Keep doing what they are now", "More"),
    ordered = TRUE
  )
}

# LIKERT_4 — DASS depression/anxiety severity (ds001a-f).
# Levels: Never -> Sometimes -> Often -> Almost always.
transform_likert4_dass <- function(x) {
  x <- recode_sentinels(x)
  factor(
    case_when(!is.na(x) ~ .strip_uas_code(x)),
    levels  = c("Never", "Sometimes", "Often", "Almost always"),
    ordered = TRUE
  )
}

# LIKERT_4 — frequency scale used by ex001 ("wake up to check social media").
# Levels ordered low-to-high frequency.
transform_likert4_freq <- function(x) {
  x <- recode_sentinels(x)
  factor(
    case_when(!is.na(x) ~ .strip_uas_code(x)),
    levels  = c("Rarely or never", "Some of the time", "Frequently",
                "Always or almost always"),
    ordered = TRUE
  )
}

# ----------------------------------------------------------------------
# LIKERT_5 transformers (Phase 2 Batch 2)
#
# Direction convention: preserve raw code direction in factor levels
# (code 1 = level 1, code 5 = level 5). For multi-item scales the
# dictionary's is_reverse_coded field marks items that need flipping
# at Phase 3 precompute time; standalone items keep their natural
# survey direction.
#
# Exceptions (where raw codes are NOT monotonic with the construct,
# so the transformer imposes a deliberate ordering): documented in
# the function's leading comment.
# ----------------------------------------------------------------------

# LIKERT_5 — Strongly disagree -> Strongly agree (no "Somewhat" variants).
# Used by social media beliefs (sc001a-f) and usage patterns (ex002a-c).
transform_likert5_agree_dnd <- function(x) {
  x <- recode_sentinels(x)
  factor(
    case_when(!is.na(x) ~ .strip_uas_code(x)),
    levels  = c("Strongly disagree", "Disagree", "Neither agree nor disagree",
                "Agree", "Strongly agree"),
    ordered = TRUE
  )
}

# LIKERT_5 — Strongly disagree -> Strongly agree (with "Somewhat" variants).
# Used by AI governance attitudes (ex006a-d).
transform_likert5_agree_somewhat <- function(x) {
  x <- recode_sentinels(x)
  factor(
    case_when(!is.na(x) ~ .strip_uas_code(x)),
    levels  = c("Strongly disagree", "Somewhat disagree",
                "Neither agree nor disagree",
                "Somewhat agree", "Strongly agree"),
    ordered = TRUE
  )
}

# LIKERT_5 — None -> A great deal. Used by institutional trust (ins001a-h).
transform_likert5_amount <- function(x) {
  x <- recode_sentinels(x)
  factor(
    case_when(!is.na(x) ~ .strip_uas_code(x)),
    levels  = c("None", "Very little", "Some", "Quite a lot", "A great deal"),
    ordered = TRUE
  )
}

# LIKERT_5 — Not at all harmful -> Extremely harmful.
# Used by AI tool perceived-harm ratings (q_ai13_1..7).
transform_likert5_harm <- function(x) {
  x <- recode_sentinels(x)
  factor(
    case_when(!is.na(x) ~ .strip_uas_code(x)),
    levels  = c("Not at all harmful", "Not very harmful", "Somewhat harmful",
                "Very harmful", "Extremely harmful"),
    ordered = TRUE
  )
}

# LIKERT_5 — Not at all useful -> Extremely useful.
# Used by AI tool perceived-usefulness ratings (q_ai11_1..7).
transform_likert5_useful <- function(x) {
  x <- recode_sentinels(x)
  factor(
    case_when(!is.na(x) ~ .strip_uas_code(x)),
    levels  = c("Not at all useful", "Not very useful", "Somewhat useful",
                "Very useful", "Extremely useful"),
    ordered = TRUE
  )
}

# LIKERT_5 — concerned -> excited bipolar scale with "No opinion" OOR.
# Used by ai_effect_a..g (perceived effect of AI on outcomes). Raw codes:
# 1=Very concerned, 5=Very excited, 6=No opinion (OOR per dictionary —
# mapped to NA before factor coercion).
transform_likert5_concern_excite <- function(x) {
  x <- recode_sentinels(x, additional = "6 No opinion")
  factor(
    case_when(!is.na(x) ~ .strip_uas_code(x)),
    levels  = c("Very concerned", "Somewhat concerned",
                "Equally concerned and excited",
                "Somewhat excited", "Very excited"),
    ordered = TRUE
  )
}

# LIKERT_5 — Strongly oppose -> Strongly support.
# Used by AI governance support items (ex005a-c).
transform_likert5_support <- function(x) {
  x <- recode_sentinels(x)
  factor(
    case_when(!is.na(x) ~ .strip_uas_code(x)),
    levels  = c("Strongly oppose", "Somewhat oppose",
                "Neither support nor oppose",
                "Somewhat support", "Strongly support"),
    ordered = TRUE
  )
}

# LIKERT_5 — Much less -> Much more. Used by regulation_tech_companies (ex004a).
# Raw codes are monotonic (1=Much less, 5=Much more) — preserves natural
# direction. Higher score = wants more regulation.
transform_likert5_more_less_amount <- function(x) {
  x <- recode_sentinels(x)
  factor(
    case_when(!is.na(x) ~ .strip_uas_code(x)),
    levels  = c("Much less than they are now",
                "A little less than they are now",
                "The same as they are now",
                "A little more than they are now",
                "Much more than they are now"),
    ordered = TRUE
  )
}

# LIKERT_5 — Not at all concerned -> Extremely concerned.
# Used by q_ai14 (AR/VR-headset concern). Single-item, no OOR.
transform_likert5_concern_only <- function(x) {
  x <- recode_sentinels(x)
  factor(
    case_when(!is.na(x) ~ .strip_uas_code(x)),
    levels  = c("Not at all concerned", "Not very concerned",
                "Somewhat concerned", "Very concerned",
                "Extremely concerned"),
    ordered = TRUE
  )
}

# LIKERT_5 — Not at all excited -> Extremely excited.
# Used by q_ai13 (AR/VR-headset excitement). Single-item, no OOR.
transform_likert5_excite_only <- function(x) {
  x <- recode_sentinels(x)
  factor(
    case_when(!is.na(x) ~ .strip_uas_code(x)),
    levels  = c("Not at all excited", "Not very excited",
                "Somewhat excited", "Very excited",
                "Extremely excited"),
    ordered = TRUE
  )
}

# LIKERT_5 with OOR=5 ("No opinion"). ai_concerned (general AI concern).
# Raw codes: 1=Very concerned, 4=Not at all concerned, 5=No opinion (OOR
# per dictionary — mapped to NA before factor coercion). After NA-recode,
# 4 real levels remain. Preserves raw direction: higher score = LESS
# concerned (the survey ordering). Phase 3 may flip via is_reverse_coded
# if needed for scale composites.
transform_likert5_concerned_no_opinion <- function(x) {
  x <- recode_sentinels(x, additional = "5 No opinion")
  factor(
    case_when(!is.na(x) ~ .strip_uas_code(x)),
    levels  = c("Very concerned", "Somewhat concerned",
                "Not very concerned", "Not at all concerned"),
    ordered = TRUE
  )
}

# LIKERT_5 with OOR=5 ("No opinion"). ai_excited (general AI excitement).
# Same structure as ai_concerned (4 real levels after NA-recode).
transform_likert5_excited_no_opinion <- function(x) {
  x <- recode_sentinels(x, additional = "5 No opinion")
  factor(
    case_when(!is.na(x) ~ .strip_uas_code(x)),
    levels  = c("Very excited", "Somewhat excited",
                "Not very excited", "Not at all excited"),
    ordered = TRUE
  )
}

# LIKERT_5 — Very interesting -> Very uninteresting. Survey-quality
# item (cs_001 — was the survey interesting). Preserves raw direction:
# higher score = LESS interesting. Phase 3 may flip if needed.
transform_likert5_interesting <- function(x) {
  x <- recode_sentinels(x)
  factor(
    case_when(!is.na(x) ~ .strip_uas_code(x)),
    levels  = c("Very interesting", "Interesting",
                "Neither interesting nor uninteresting",
                "Uninteresting", "Very uninteresting"),
    ordered = TRUE
  )
}
