# Helpers for applying the EXCLUDED_* constants declared at the top of
# each build_*.R script. Excluded variables are dropped from JSON output
# only — the cleaned .rds files and R cleaning scripts are unaffected.
#
# Each build script declares its own EXCLUDED_VARIABLES_* vector (e.g.,
# EXCLUDED_VARIABLES_TRENDS adds us001 to the base list). Pass the
# correct variant in via `excluded_variables`. Domains / suffixes /
# types are global across scripts and passed in as EXCLUDED_DOMAINS,
# EXCLUDED_SUFFIXES, EXCLUDED_TYPES respectively.
#
# is_excluded(var_rec, ...) returns TRUE if any of the four rules
# matches. Records with NULL/NA fields are tolerated (rule simply
# does not match for that field).

is_excluded <- function(var_rec,
                        excluded_variables,
                        excluded_domains,
                        excluded_suffixes,
                        excluded_types) {
  vn <- var_rec$variable_name
  if (!is.null(vn) && length(vn) == 1 && !is.na(vn)) {
    if (vn %in% excluded_variables) return(TRUE)
    if (length(excluded_suffixes) > 0 &&
        any(vapply(excluded_suffixes,
                   function(s) endsWith(vn, s),
                   logical(1)))) return(TRUE)
  }
  dom <- var_rec$domain
  if (!is.null(dom) && length(dom) == 1 && !is.na(dom) &&
      dom %in% excluded_domains) {
    return(TRUE)
  }
  rt <- var_rec$response_type
  if (!is.null(rt) && length(rt) == 1 && !is.na(rt) &&
      rt %in% excluded_types) {
    return(TRUE)
  }
  FALSE
}

# Convenience: classify WHY a variable was excluded, for diagnostic logs.
# Returns a short tag — "var-list", "domain=X", "suffix=Y", "type=Z",
# or "" if not excluded.
exclusion_reason <- function(var_rec,
                             excluded_variables,
                             excluded_domains,
                             excluded_suffixes,
                             excluded_types) {
  vn <- var_rec$variable_name
  if (!is.null(vn) && length(vn) == 1 && !is.na(vn)) {
    if (vn %in% excluded_variables) return("var-list")
    if (length(excluded_suffixes) > 0) {
      hit <- excluded_suffixes[vapply(excluded_suffixes,
                                       function(s) endsWith(vn, s),
                                       logical(1))]
      if (length(hit) > 0) return(paste0("suffix=", hit[1]))
    }
  }
  dom <- var_rec$domain
  if (!is.null(dom) && length(dom) == 1 && !is.na(dom) &&
      dom %in% excluded_domains) {
    return(paste0("domain=", dom))
  }
  rt <- var_rec$response_type
  if (!is.null(rt) && length(rt) == 1 && !is.na(rt) &&
      rt %in% excluded_types) {
    return(paste0("type=", rt))
  }
  ""
}
