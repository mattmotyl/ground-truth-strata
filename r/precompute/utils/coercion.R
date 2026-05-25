# Coercion helpers shared across the precompute build_*.R scripts.
#
# Phase 2 cleaning produces a mix of column types: ordered factors (for
# the Likert and other ordinal scales), numeric (for RANGE_NUMERIC and
# SCALE_*), and character (for BINARY_YESNO yes/no items, sometimes
# from labelled() metadata as "<code> <label>"). The two helpers below
# normalize each kind to either an integer-valued numeric (for mean
# estimation) or a 0/1 numeric (for proportion estimation).

# Ordered factors -> as.integer() preserving raw code direction. The
# is_reverse_coded flag (currently only ls002i) is NOT applied here;
# that is a composite/correlation concern handled in build_correlations.
coerce_numeric <- function(x) {
  if (is.factor(x))   return(as.integer(x))
  if (is.numeric(x))  return(x)
  suppressWarnings(as.numeric(x))
}

# Coerce a binary variable to numeric 0/1.
#   factor (2-level): as.integer-1 maps level 1 -> 0, level 2 -> 1.
#   character "Yes"/"No" (case-insensitive): Yes -> 1, No -> 0.
#   character "<digit> <label>" (e.g., "1 Primary respondent" /
#     "0 Added member" — labelled() metadata coerced to character by
#     Phase 2 cleaning): leading digit wins.
coerce_binary01 <- function(x) {
  if (is.factor(x)) {
    if (nlevels(x) != 2) return(rep(NA_real_, length(x)))
    return(as.integer(x) - 1L)
  }
  if (is.character(x)) {
    out <- rep(NA_real_, length(x))
    xl  <- tolower(x)
    out[xl == "yes" | xl == "true"]  <- 1
    out[xl == "no"  | xl == "false"] <- 0
    leading <- substr(x, 1, 1)
    out[is.na(out) & leading == "1"] <- 1
    out[is.na(out) & leading == "0"] <- 0
    return(out)
  }
  if (is.numeric(x)) return(as.numeric(x))
  rep(NA_real_, length(x))
}
