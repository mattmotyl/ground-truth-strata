# Canonical cleaned-data driver.
#
# Sources the cleaning library (run_script.R), runs
# `transform_data(w) |> rename_variables()` for each wave 1..6, binds
# the results into a single long tibble, and writes the artifact to
# r/output/cleaned/all_waves_long.rds. Phase 3 precompute scripts read
# from this artifact instead of re-cleaning each time — much faster and
# guarantees all precompute outputs see the same snapshot.
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

  wave_results <- vector("list", 6)
  for (w in 1:6) {
    cat(sprintf("--- Wave %d ---\n", w))
    t0   <- Sys.time()
    df_w <- transform_data(w) |> rename_variables()
    dt   <- as.numeric(difftime(Sys.time(), t0, units = "secs"))
    cat(sprintf("  rows=%d  cols=%d  elapsed=%.1fs\n",
                nrow(df_w), ncol(df_w), dt))
    wave_results[[w]] <- df_w
  }

  cat("\n--- Bind all waves ---\n")
  t0 <- Sys.time()
  cleaned_long <- bind_rows(wave_results)
  dt <- as.numeric(difftime(Sys.time(), t0, units = "secs"))
  cat(sprintf("  total_rows=%d  total_cols=%d  elapsed=%.1fs\n",
              nrow(cleaned_long), ncol(cleaned_long), dt))

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
