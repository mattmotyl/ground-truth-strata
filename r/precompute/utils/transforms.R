# Shared post-load data transformations for the precompute pipeline.
# Every build script that reads all_waves_long.rds sources this file
# and applies these transforms BEFORE any computation, so all
# downstream outputs (trends, distributions, platform_rates,
# platform_demographics, group_comparisons, conditional_breakdowns,
# correlations) see the same canonical reversed / derived values.
#
# Three transforms live here:
#   1. apply_reverse_coding(data)             — flips is_reverse_coded items
#   2. bucket_likert_7(x) + BUCKETED_VARS     — 7-point Likert -> 3 buckets
#   3. derive_loneliness(data)                — UCLA 3-item -> ex003_lonely binary

suppressPackageStartupMessages({
  library(dplyr)
})

# ── Reverse coding ─────────────────────────────────────────────────
# Variables that require reverse coding before any computation. Value
# is the max_code on the variable's scale.
#
# This list is the CANONICAL source of truth for the precompute
# pipeline. The dictionary's `is_reverse_coded` flag in
# docs/data-dictionary.json / meta.json is the DISCOVERY source: when a
# new variable is marked is_reverse_coded = TRUE in the dict, add it to
# this list (with its max_code) and the precompute pipeline will pick
# it up. Keeping this list explicit avoids sourcing meta.json from
# transforms.R, which would fight its standalone design.

REVERSE_CODED_VARS <- list(
  ls002i = 7L   # "I feel negative most of the time" — 7-point Likert
)

# Arithmetic flip for non-factor numeric columns. Exported in case any
# caller needs it directly.
reverse_code <- function(x, max_code) {
  (max_code + 1L) - x
}

# Apply reverse coding to every variable in REVERSE_CODED_VARS that
# is present in `data`. For ordered factors (the canonical storage
# form in the cleaned tibble), reverse the LEVELS ORDER — this
# preserves the factor structure that downstream code (notably
# build_distributions.R's is.factor() check) relies on. For non-factor
# numeric columns, do the arithmetic flip (max_code + 1) - x.
apply_reverse_coding <- function(data) {
  for (var in names(REVERSE_CODED_VARS)) {
    if (!var %in% names(data)) next
    x <- data[[var]]
    if (is.factor(x)) {
      data[[var]] <- factor(x,
                            levels  = rev(levels(x)),
                            ordered = is.ordered(x))
    } else {
      data[[var]] <- reverse_code(x, REVERSE_CODED_VARS[[var]])
    }
  }
  data
}

# ── Likert bucketing ────────────────────────────────────────────────
# 7-point Likert -> 3 display buckets. Applied to us018a-g and
# ls002a-l AFTER reverse coding (so ls002i shares the same direction
# as the rest of ls002*).
#
# Caller must pass INTEGER codes — use as.integer(factor) on an
# ordered factor input. The cleaned tibble stores Likert items as
# ordered/factor, so the typical call pattern is:
#     bucket_likert_7(as.integer(cleaned$ls002a))

BUCKETED_VARS <- c(
  "us018a", "us018b", "us018c", "us018d", "us018e", "us018f", "us018g",
  "ls002a", "ls002b", "ls002c", "ls002d", "ls002e", "ls002f", "ls002g",
  "ls002h", "ls002i", "ls002j", "ls002k", "ls002l"
)

bucket_likert_7 <- function(x) {
  dplyr::case_when(
    x %in% 1:3 ~ "disagree",
    x == 4     ~ "neutral",
    x %in% 5:7 ~ "agree",
    TRUE       ~ NA_character_
  )
}

BUCKET_LABELS <- list(
  disagree = "Disagree (1–3)",
  neutral  = "Neutral (4)",
  agree    = "Agree (5–7)"
)

# ── Loneliness binary ───────────────────────────────────────────────
# UCLA 3-item scale scoring. Each item is an ordered factor with
# storage codes: 1 = "Hardly ever", 2 = "Some of the time",
# 3 = "Often". Sum range 3-9, threshold sum >= 6 = lonely.
# Available in W2, W5, W6 only — derive_loneliness yields NA for rows
# where any of the three items is NA, which includes all of W1/W3/W4.
# Result column: ex003_lonely (0 = not lonely, 1 = lonely, NA otherwise).

derive_loneliness <- function(data) {
  if (all(c("ex003a", "ex003b", "ex003c") %in% names(data))) {
    data <- data |>
      dplyr::mutate(
        ex003_lonely = dplyr::case_when(
          is.na(ex003a) | is.na(ex003b) | is.na(ex003c) ~ NA_integer_,
          (as.integer(ex003a) + as.integer(ex003b) +
             as.integer(ex003c)) >= 6L ~ 1L,
          TRUE ~ 0L
        )
      )
  }
  data
}
