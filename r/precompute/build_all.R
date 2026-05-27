# Phase 3 master driver. Sources each step in order, isolated to its
# own env so locals don't leak between steps. Each child script writes
# its own timestamped audit log to strata-local/audit/output/ via its
# internal sink(). This driver logs step labels, per-step timings, and
# a final summary to stdout — the caller is expected to redirect to a
# top-level log file:
#
#   $RS = "C:\Program Files\R\R-4.6.0\bin\Rscript.exe"
#   $t  = "M:\MM\Websites\strata-local\audit\output"
#   $ts = Get-Date -Format yyyyMMdd_HHmmss
#   & $RS r/precompute/build_all.R *> "$t\BUILD_ALL_$ts.txt"
#
# (We deliberately do NOT sink() in this driver: each child's finally
# block pops all active sinks on exit, which would truncate a parent
# sink at the end of the first step. The caller-redirect pattern
# sidesteps that entirely.)

suppressPackageStartupMessages({
  library(here)
})

# Step 0 — Data input
# all_waves_long.rds is a pre-built input produced from confidential
# survey data by r/clean/clean_all_waves.R (not in public repo).
# Obtain this file from Matt before running the precompute pipeline.
# All steps below assume r/output/cleaned/all_waves_long.rds exists.

steps <- list(
  list(label = "Build meta.json",            script = here("r", "precompute", "build_meta.R")),
  list(label = "Build trends.json",          script = here("r", "precompute", "build_trends.R")),
  list(label = "Build distributions",        script = here("r", "precompute", "build_distributions.R")),
  list(label = "Build platform_rates",       script = here("r", "precompute", "build_platform_rates.R")),
  list(label = "Build platform_demographics", script = here("r", "precompute", "build_platform_demographics.R")),
  list(label = "Build conditional_breakdowns", script = here("r", "precompute", "build_conditional_breakdowns.R")),
  list(label = "Build group_comparisons",    script = here("r", "precompute", "build_group_comparisons.R")),
  list(label = "Build correlations",         script = here("r", "precompute", "build_correlations.R"))
)

audit_dir <- "M:/MM/Websites/strata-local/audit/output"

cat("=== Phase 3 build_all.R ===\n")
cat("Started:           ", as.character(Sys.time()), "\n")
cat("R version:         ", R.version.string, "\n")
cat("Working directory: ", getwd(), "\n")
cat("Per-step logs:     ", audit_dir, "/<STEPNAME>_<ts>.txt\n\n")

overall_t0 <- Sys.time()
timings    <- list()
status     <- "[OK]"

tryCatch({
  for (s in steps) {
    cat(sprintf("--- %s ---\n", s$label))
    t0 <- Sys.time()
    source(s$script, local = new.env())
    dt <- as.numeric(difftime(Sys.time(), t0, units = "secs"))
    cat(sprintf("  elapsed: %.1fs\n\n", dt))
    timings[[s$label]] <- dt
  }

  cat("--- Output file sizes ---\n")
  for (f in c("meta.json", "trends.json", "distributions.json",
              "platform_rates.json", "platform_demographics.json",
              "conditional_breakdowns.json",
              "group_comparisons.json", "platform_group_comparisons.json",
              "correlations.json",
              "contextual-events.json")) {
    p <- here("public", "data", f)
    if (file.exists(p)) {
      sz <- file.info(p)$size
      unit <- if (sz >= 1024 * 1024) {
        sprintf("%.2f MB", sz / 1024 / 1024)
      } else {
        sprintf("%.1f KB", sz / 1024)
      }
      cat(sprintf("  %-26s %s\n", f, unit))
    }
  }

  overall_dt <- as.numeric(difftime(Sys.time(), overall_t0, units = "secs"))
  cat("\n--- Step timings ---\n")
  for (label in names(timings)) {
    cat(sprintf("  %-26s %.1fs\n", label, timings[[label]]))
  }
  cat(sprintf("\n%s Phase 3 build_all complete in %.1fs.\n",
              status, overall_dt))
}, error = function(e) {
  cat("\n[FAIL] ", conditionMessage(e), "\n", sep = "")
  status <<- "[FAIL]"
})

if (identical(status, "[FAIL]")) quit(status = 1)
