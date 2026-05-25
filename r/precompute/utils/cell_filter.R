# n>=30 cell-suppression helper for Phase 3 precompute outputs.
#
# Convention (agreed 2026-05-25): cells whose unweighted n is below the
# floor are EMITTED with all stat values set to NA and a `suppressed`
# flag of TRUE. They are NOT omitted from the JSON. This keeps the JSON
# shape stable across cells and lets the UI render an explicit
# "insufficient n" indicator instead of handling gaps.
#
# The floor applies to the unweighted observed count, not Kish's
# effective sample size (n_eff). Suppression is a confidentiality /
# stability protection against tiny cells, so the raw count is the right
# guard.

CELL_FLOOR <- 30L

# apply_cell_floor(stats, n, floor) — null out stats and set suppressed
# flag when n is below the floor. Always returns a list of the same
# length as `stats` plus one extra `suppressed` element.
apply_cell_floor <- function(stats, n, floor = CELL_FLOOR) {
  if (is.null(n) || is.na(n) || n < floor) {
    nullified <- lapply(stats, function(x) NA)
    nullified$suppressed <- TRUE
    return(nullified)
  }
  stats$suppressed <- FALSE
  stats
}
