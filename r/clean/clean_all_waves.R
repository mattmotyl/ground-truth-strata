# Canonical cleaned-data driver.
#
# Sources the cleaning library (run_script.R), runs
# `transform_data(w) |> rename_variables()` for each wave 1..6,
# additionally pulls a small set of EXPLODED CHILD columns from each
# raw CSV that transform_data does not surface (per Phase 1 followup
# #10 "battery-expansion-pattern" and Phase 3 conventions), binds the
# per-wave results into a single long tibble, and writes the artifact
# to r/output/cleaned/all_waves_long.rds.
#
# Phase 3 precompute scripts read from this artifact instead of
# re-cleaning each time — faster and guarantees all precompute outputs
# see the same snapshot.
#
# Expansion (added to the cleaned tibble alongside transform_data's output):
#
#   MULTISELECT option binaries (kept as raw "<code> <label>" character):
#     ai_useds1..14         (W1)
#     q_ai8a_<N>s<opt>      (W2-3, per AI tool x option)
#     gms00<N>s<opt>        (W6, per context-multiselect x option)
#
#   LIKERT_5 battery aggregates (1 mean per AI tool, on the 1-5 ordinal
#   scale; raw children q_ai*_<N>[a-z] are dropped after aggregation):
#     q_ai11_<N>_mean       (per AI tool N, usefulness across sub-items)
#     q_ai13_<N>_mean       (per AI tool N, harmfulness across sub-items)
#
# Per Matt's Phase 3 conventions (2026-05-25): MULTISELECTs stay as
# individual binary inputs so each option can correlate independently;
# LIKERT_5 batteries collapse to one mean per parent AI tool to keep
# the correlation matrix manageable (~14 new inputs vs ~190).
#
# The .rds is gitignored (data; never commit).
#
# Diagnostic log: when M:/MM/Websites/strata-local/audit/output is
# reachable we sink() a timestamped log there per Matt's R-output-via-sink
# convention. Otherwise diagnostics go to stdout only.
#
# Invoke:
#   Rscript r/clean/clean_all_waves.R

suppressPackageStartupMessages({
  library(tidyverse)
  library(here)
})

source(here::here("r", "clean", "run_script.R"))

# ---- Expansion-children puller (Option B from Phase 3 expansion discussion) ----
# Reads only the expansion-child columns from a wave's raw CSV, recodes
# UAS sentinels (".a"/".e") to NA, aggregates LIKERT_5 batteries to per-
# AI-tool means, and returns a tibble keyed by (uasid, wave) ready to
# left_join onto the transform_data output.
#
# Patterns kept "as is" (binary "<digit> <label>" strings):
#   ^ai_useds\d+$           (W1)
#   ^q_ai8a_\d+s\d+$        (W2-3)
#   ^gms\d+s\d+$            (W6)
#
# Patterns aggregated to rowMeans (each parent -> one column):
#   ^q_ai11_\d+[a-z]$       -> q_ai11_<N>_mean (W2-3)
#   ^q_ai13_\d+[a-z]$       -> q_ai13_<N>_mean (W2-3)
pull_expansion_columns <- function(uas_num, wave_num) {
  raw_path <- here::here("r", "data", paste0("uas", uas_num, ".csv"))
  hdr      <- names(readr::read_csv(raw_path, n_max = 0, show_col_types = FALSE))

  ms_patterns <- c("^ai_useds\\d+$",
                   "^q_ai8a_\\d+s\\d+$",
                   "^gms\\d+s\\d+$")
  battery_patterns <- c("^q_ai11_\\d+[a-z]$",
                        "^q_ai13_\\d+[a-z]$")

  ms_cols      <- unique(unlist(lapply(ms_patterns,      function(p) grep(p, hdr, value = TRUE))))
  battery_cols <- unique(unlist(lapply(battery_patterns, function(p) grep(p, hdr, value = TRUE))))

  needed <- unique(c("uasid", ms_cols, battery_cols))
  if (length(needed) == 1) return(NULL)  # wave has no expansion children

  raw <- readr::read_csv(
    raw_path,
    col_select   = dplyr::all_of(needed),
    col_types    = readr::cols(.default = readr::col_character()),
    show_col_types = FALSE
  )

  # Recode UAS missing sentinels to NA across all pulled columns.
  recode_one <- function(x) ifelse(x %in% c(".", ".a", ".e", ".c"), NA_character_, x)
  for (c in setdiff(colnames(raw), "uasid")) raw[[c]] <- recode_one(raw[[c]])

  # Aggregate LIKERT_5 batteries: parse leading digit (1..5) and rowMeans
  # with na.rm. Sub-items the respondent didn't select for that AI tool
  # are NA in the raw CSV, so na.rm naturally averages only the selected
  # use-cases per Phase 1 followup #10.
  if (length(battery_cols) > 0) {
    leading_digit <- function(v) suppressWarnings(as.integer(substr(v, 1, 1)))
    for (parent in c("q_ai11", "q_ai13")) {
      for (n in 1:7) {
        child_pat <- paste0("^", parent, "_", n, "[a-z]$")
        children  <- grep(child_pat, colnames(raw), value = TRUE)
        if (length(children) == 0) next
        mat   <- vapply(children, function(c) leading_digit(raw[[c]]),
                        integer(nrow(raw)))
        means <- rowMeans(mat, na.rm = TRUE)
        means[is.nan(means)] <- NA_real_
        raw[[paste0(parent, "_", n, "_mean")]] <- means
      }
    }
    # Drop the raw battery children; we keep only the aggregated means.
    raw <- raw[, !colnames(raw) %in% battery_cols, drop = FALSE]
  }

  raw$wave <- wave_num
  raw
}

audit_dir <- "M:/MM/Websites/strata-local/audit/output"
ts        <- format(Sys.time(), "%Y%m%d_%H%M%S")
sink_path <- if (dir.exists(audit_dir)) {
  file.path(audit_dir, paste0("CLEAN_ALL_WAVES_", ts, ".txt"))
} else {
  NULL
}
if (!is.null(sink_path)) sink(sink_path, split = TRUE)

tryCatch({
  cat("=== clean_all_waves.R ===\n")
  cat("Timestamp:         ", as.character(Sys.time()), "\n")
  cat("R version:         ", R.version.string, "\n")
  cat("Working directory: ", getwd(), "\n")
  cat("Log file:          ", if (is.null(sink_path)) "<stdout only>" else sink_path, "\n\n")

  data_dir <- here::here("r", "data")
  if (!dir.exists(data_dir)) {
    stop("r/data/ junction is missing — raw CSVs unreachable; cannot clean.")
  }

  wave_meta_csv <- read_csv(here::here("r", "data", "wave_data.csv"),
                            show_col_types = FALSE)

  wave_results <- vector("list", 6)
  for (w in 1:6) {
    cat(sprintf("--- Wave %d ---\n", w))
    t0   <- Sys.time()
    df_w <- transform_data(w) |> rename_variables()
    # Pull and join expansion children for this wave.
    uas_num <- wave_meta_csv$uas_num[wave_meta_csv$wave_number == w]
    expand  <- pull_expansion_columns(uas_num, w)
    if (!is.null(expand)) {
      df_w <- dplyr::left_join(df_w, expand, by = c("uasid", "wave"))
    }
    dt   <- as.numeric(difftime(Sys.time(), t0, units = "secs"))
    cat(sprintf("  rows=%d  cols=%d  expansion_added=%d  elapsed=%.1fs\n",
                nrow(df_w), ncol(df_w),
                if (is.null(expand)) 0L else ncol(expand) - 2L,
                dt))
    wave_results[[w]] <- df_w
  }

  cat("\n--- Bind all waves ---\n")
  t0 <- Sys.time()
  cleaned_long <- bind_rows(wave_results)
  dt <- as.numeric(difftime(Sys.time(), t0, units = "secs"))
  cat(sprintf("  total_rows=%d  total_cols=%d  elapsed=%.1fs\n",
              nrow(cleaned_long), ncol(cleaned_long), dt))

  # ---- Derive combined time-per-day in minutes (us019_hours * 60 + us019_minutes) ----
  # Original `time_hrs_<slug>_w<N>` and `time_min_<slug>_w<N>` columns are
  # kept for provenance; downstream Phase 3 builds consume the derived
  # `time_min_total_<slug>_w<N>` column. NA when either part is NA.
  hrs_cols <- grep("^time_hrs_(.+)_w(\\d+)$", colnames(cleaned_long), value = TRUE)
  n_derived <- 0L
  for (hcol in hrs_cols) {
    m         <- regmatches(hcol, regexec("^time_hrs_(.+)_w(\\d+)$", hcol))[[1]]
    slug      <- m[2]
    wave_num  <- m[3]
    mcol      <- paste0("time_min_", slug, "_w", wave_num)
    totalcol  <- paste0("time_min_total_", slug, "_w", wave_num)
    if (!mcol %in% colnames(cleaned_long)) next
    h_num     <- suppressWarnings(as.numeric(cleaned_long[[hcol]]))
    m_num     <- suppressWarnings(as.numeric(cleaned_long[[mcol]]))
    cleaned_long[[totalcol]] <- h_num * 60 + m_num
    n_derived <- n_derived + 1L
  }
  cat(sprintf("  derived %d time_min_total_<slug>_w<N> columns\n", n_derived))

  cat("\n--- Sanity checks ---\n")
  cat(sprintf("  unique uasid: %d\n", length(unique(cleaned_long$uasid))))
  cat("  rows per wave:\n")
  print(cleaned_long |> count(wave) |> arrange(wave))

  key_cols <- c("uasid", "wave", "final_weight", "gender", "age", "race",
                "education", "hhincome", "political_ideology_self")
  present  <- key_cols %in% colnames(cleaned_long)
  cat("\n  key columns present:\n")
  for (i in seq_along(key_cols)) {
    cat(sprintf("    [%s] %s\n",
                if (present[i]) "OK" else "MISSING", key_cols[i]))
  }
  if (!all(present)) {
    stop("One or more key columns missing from cleaned tibble.")
  }

  out_dir <- here::here("r", "output", "cleaned")
  dir.create(out_dir, showWarnings = FALSE, recursive = TRUE)
  out_path <- file.path(out_dir, "all_waves_long.rds")
  saveRDS(cleaned_long, out_path)
  size_mb <- file.info(out_path)$size / 1024 / 1024
  cat("\n--- Wrote artifact ---\n")
  cat(sprintf("  path: %s\n", out_path))
  cat(sprintf("  size: %.2f MB\n", size_mb))

  cat("\n[OK] clean_all_waves.R complete.\n")
}, error = function(e) {
  cat("\n[FAIL] ", conditionMessage(e), "\n", sep = "")
}, finally = {
  while (sink.number() > 0) sink()
})
