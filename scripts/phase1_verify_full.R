# Phase 1 expanded verification: check EVERY wave-presence claim in the
# dictionary against actual CSV column headers. Run with R 4.4.3 from repo root.

suppressPackageStartupMessages({
  library(readr); library(dplyr); library(stringr); library(purrr);
  library(tibble); library(jsonlite); library(tidyr)
})

data_dir <- "r/data"
dict <- fromJSON("docs/data-dictionary.json", simplifyVector = FALSE)

read_header <- function(uas_num) {
  path <- file.path(data_dir, sprintf("uas%d.csv", uas_num))
  suppressMessages(read_csv(path, n_max = 0, show_col_types = FALSE, progress = FALSE)) %>% colnames()
}
cols_by_wave <- map(set_names(514:519, paste0("W", 1:6)), read_header)
wave_to_idx  <- c(W1=1, W2=2, W3=3, W4=4, W5=5, W6=6)

# Helper: is variable_name present in any case in this wave's columns?
col_present <- function(vname, wave_key) {
  ci_cols <- tolower(cols_by_wave[[wave_key]])
  tolower(vname) %in% ci_cols
}

# 1. For each dictionary variable, compute observed wave presence and compare
#    against the documented waves_present.
rows <- list()
for (v in dict$variables) {
  vn <- v$variable_name
  documented <- sort(unlist(v$waves_present))
  observed <- c()
  for (k in names(cols_by_wave)) {
    if (col_present(vn, k)) observed <- c(observed, unname(wave_to_idx[[k]]))
  }
  observed <- as.integer(sort(unique(observed)))
  documented_i <- as.integer(documented)
  status <- if (length(observed) == length(documented_i) &&
                all(observed == documented_i)) "MATCH"
            else if (length(observed) == 0) "MISSING_IN_DATA"
            else "MISMATCH"
  rows[[length(rows) + 1]] <- tibble(
    variable_name = vn,
    documented = paste(documented, collapse = ","),
    observed   = paste(observed,   collapse = ","),
    status     = status,
    domain     = v$domain
  )
}
result <- bind_rows(rows)

cat("============================================================\n")
cat("OVERALL STATUS\n")
cat("============================================================\n")
print(result %>% count(status))

cat("\n--- MISMATCHES (documented != observed) ---\n")
result %>% filter(status == "MISMATCH") %>% print(n = Inf)

cat("\n--- MISSING_IN_DATA (documented waves_present, but column not in any CSV) ---\n")
result %>% filter(status == "MISSING_IN_DATA") %>% print(n = Inf)

# 2. Investigate specific concerns

cat("\n============================================================\n")
cat("DEEPER CHECKS\n")
cat("============================================================\n")

# 2a. party_affil / lean_affil fallback when preload_* missing (W4-W6)
cat("\n[2a] party_affil / lean_affil presence per wave\n")
for (k in names(cols_by_wave)) {
  present <- c("party_affil","lean_affil","preload_party_affil","preload_lean_affil")
  hits <- present %in% cols_by_wave[[k]]
  names(hits) <- present
  cat(" ", k, ":  ", paste(names(hits)[hits], collapse=", "), "\n")
}

# 2b. CS_001 / CS_003 case in raw CSVs
cat("\n[2b] cs* (case-insensitive) columns per wave\n")
for (k in names(cols_by_wave)) {
  cs <- cols_by_wave[[k]][grepl("^cs", cols_by_wave[[k]], ignore.case=TRUE)]
  cat(" ", k, ":  ", paste(cs, collapse=", "), "\n")
}

# 2c. AI_concerned / AI_excited case in raw CSVs (documented W1-W3 only)
cat("\n[2c] ai_concerned / ai_excited case per wave\n")
for (k in names(cols_by_wave)) {
  ai <- cols_by_wave[[k]][grepl("^ai_(concerned|excited)", cols_by_wave[[k]], ignore.case=TRUE)]
  cat(" ", k, ":  ", paste(ai, collapse=", "), "\n")
}

# 2d. SCIM companion *_SLID / *_BOX presence
cat("\n[2d] scim_*_slid / scim_*_box presence per wave (case-insensitive)\n")
for (k in names(cols_by_wave)) {
  comp <- cols_by_wave[[k]][grepl("^scim.*(_slid|_box)$", cols_by_wave[[k]], ignore.case=TRUE)]
  cat(" ", k, ":  ", paste(comp, collapse=", "), "\n")
}

# 2e. q_ai battery presence
cat("\n[2e] q_ai* columns per wave (count + first 10)\n")
for (k in names(cols_by_wave)) {
  qai <- cols_by_wave[[k]][grepl("^q_ai", cols_by_wave[[k]], ignore.case=TRUE)]
  cat(" ", k, " (", length(qai), "): ", paste(head(qai, 12), collapse=", "), "\n", sep="")
}

# 2f. sc001 (social media beliefs) presence - claimed W1-W2 only
cat("\n[2f] sc001* columns per wave (claimed W1-W2 only)\n")
for (k in names(cols_by_wave)) {
  sc <- cols_by_wave[[k]][grepl("^sc001", cols_by_wave[[k]], ignore.case=TRUE)]
  cat(" ", k, ":  ", paste(sc, collapse=", "), "\n")
}

# 2g. ex modules
cat("\n[2g] ex* columns per wave\n")
for (k in names(cols_by_wave)) {
  ex <- cols_by_wave[[k]][grepl("^ex00\\d", cols_by_wave[[k]], ignore.case=TRUE)]
  cat(" ", k, ":  ", paste(ex, collapse=", "), "\n")
}

# 2h. gms (W6 only) and vote2024
cat("\n[2h] gms*, vote2024, us025/us026 columns per wave\n")
for (k in names(cols_by_wave)) {
  gms <- cols_by_wave[[k]][grepl("^(gms|vote2024|us02[56])", cols_by_wave[[k]], ignore.case=TRUE)]
  cat(" ", k, ":  ", paste(head(gms,12), collapse=", "), "\n")
}

# 2i. us018, us019, us020-024 per wave
cat("\n[2i] us018/us019/us020-024 columns per wave\n")
for (k in names(cols_by_wave)) {
  u <- cols_by_wave[[k]][grepl("^us(018|019|02[01234])", cols_by_wave[[k]], ignore.case=TRUE)]
  cat(" ", k, " (", length(u), "): ", paste(head(u,10), collapse=", "), "\n", sep="")
}

# 2j. Wave-1-only modules: ins001, ds001, te001, ai_effect, ai_used, us014/us015
cat("\n[2j] W1-only modules presence per wave\n")
for (k in names(cols_by_wave)) {
  w1 <- cols_by_wave[[k]][grepl("^(ins001|ds001|te001|ai_effect|ai_used|us01[45])", cols_by_wave[[k]], ignore.case=TRUE)]
  cat(" ", k, " (", length(w1), "): ", paste(head(w1,12), collapse=", "), "\n", sep="")
}

# 2k. Other panel-preload candidates we should add
cat("\n[2k] Additional likely panel-preload demographics in W1 columns:\n")
candidates <- c("maritalstatus","primary_respondent","bornus","stateborn",
                "employed","worker","work_status","occupation","industry",
                "regions","division","metro","urbanicity","household",
                "veteran","disability","insurance","language","hispanic",
                "dateofbirth_year","agerange")
hits <- intersect(candidates, cols_by_wave$W1)
cat("  ", paste(hits, collapse=", "), "\n")

cat("\nDone.\n")
