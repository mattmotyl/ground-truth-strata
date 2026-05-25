# Build public/data/platform_rates.json — per (platform x wave x metric)
# estimates. Six metrics:
#   usage_rate       % of respondents who used the platform in the past
#                    4 weeks (binary from us001 multiselect, stored as
#                    `uses_<slug>_w<N>`).
#   frequency_mean   mean of the per-platform use-frequency ordinal
#                    (us002, stored as `freq_<slug>_w<N>`). Coerced to
#                    integer levels for the mean.
#   nux_rate         % reporting personal negative experience (us003,
#                    stored as `nux_<slug>_w<N>`).
#   bftw_rate        % reporting bad-for-the-world content (us007,
#                    stored as `bftw_<slug>_w<N>`).
#   mcxn_rate        % reporting meaningful connection (us010,
#                    stored as `mcxn_<slug>_w<N>`).
#   useful_rate      % reporting learned-something-useful (us012,
#                    stored as `useful_<slug>_w<N>`).
#
# Weighted and unweighted side-by-side via the survey package. Cells
# with n<30 emitted with NA values and suppressed:true. Rows are emitted
# only when the underlying column exists in the cleaned tibble — the
# (platform x wave) grid of "what was asked" lives in meta.json.
#
# Invoke:
#   Rscript r/precompute/build_platform_rates.R

suppressPackageStartupMessages({
  library(tidyverse)
  library(here)
  library(jsonlite)
})

source(here("r", "precompute", "utils", "cell_filter.R"))
source(here("r", "precompute", "utils", "weighting.R"))
source(here("r", "precompute", "utils", "coercion.R"))

# ---- Sink ----
audit_dir <- "M:/MM/Websites/strata-local/audit/output"
ts        <- format(Sys.time(), "%Y%m%d_%H%M%S")
sink_path <- if (dir.exists(audit_dir)) {
  file.path(audit_dir, paste0("BUILD_PLATFORM_RATES_", ts, ".txt"))
} else {
  NULL
}
if (!is.null(sink_path)) sink(sink_path, split = TRUE)

tryCatch({

  # ---- Inputs ----
  rds_path  <- here("r", "output", "cleaned", "all_waves_long.rds")
  meta_path <- here("public", "data", "meta.json")
  if (!file.exists(rds_path))  stop("Cleaned .rds missing — run clean_all_waves.R first.")
  if (!file.exists(meta_path)) stop("meta.json missing — run build_meta.R first.")

  cat("Reading", rds_path, "\n")
  cleaned <- readRDS(rds_path)
  cat("Reading", meta_path, "\n")
  meta <- read_json(meta_path)

  # ---- Metric definitions ----
  PLATFORM_METRICS <- list(
    list(metric = "usage_rate",      prefix = "uses",   type = "rate",
         source_variable = "us001"),
    list(metric = "frequency_mean",  prefix = "freq",   type = "mean",
         source_variable = "us002"),
    list(metric = "nux_rate",        prefix = "nux",    type = "rate",
         source_variable = "us003"),
    list(metric = "bftw_rate",       prefix = "bftw",   type = "rate",
         source_variable = "us007"),
    list(metric = "mcxn_rate",       prefix = "mcxn",   type = "rate",
         source_variable = "us010"),
    list(metric = "useful_rate",     prefix = "useful", type = "rate",
         source_variable = "us012")
  )

  # ---- Iterate (platform x wave x metric) ----
  all_cols <- colnames(cleaned)
  cat(sprintf("Iterating %d platforms x %d waves x %d metrics = %d cells max\n",
              length(meta$platforms), 6, length(PLATFORM_METRICS),
              length(meta$platforms) * 6 * length(PLATFORM_METRICS)))

  wave_masks <- setNames(lapply(1:6, function(w) cleaned$wave == w),
                         as.character(1:6))

  rows         <- list()
  n_emitted    <- 0L
  n_suppressed <- 0L
  n_no_col     <- 0L

  t0 <- Sys.time()
  for (p in meta$platforms) {
    for (w in 1:6) {
      mask <- wave_masks[[as.character(w)]]
      wt   <- cleaned$final_weight[mask]
      for (m in PLATFORM_METRICS) {
        col <- paste0(m$prefix, "_", p$slug, "_w", w)
        if (!col %in% all_cols) {
          n_no_col <- n_no_col + 1L
          next
        }
        x_raw <- cleaned[[col]][mask]
        if (m$type == "rate") {
          x_coerced <- coerce_binary01(x_raw)
          est       <- estimate_proportion_both(x_coerced, wt)
          gated     <- apply_cell_floor(est, est$n)
          row <- list(
            platform_slug      = p$slug,
            platform_code      = as.integer(p$code),
            platform_label     = p$label,
            wave               = as.integer(w),
            metric             = m$metric,
            metric_type        = "rate",
            source_variable    = m$source_variable,
            value              = gated$prop,
            se                 = gated$se,
            ci_lower           = gated$ci_lower,
            ci_upper           = gated$ci_upper,
            n                  = gated$n,
            weighted_value     = gated$weighted_prop,
            weighted_se        = gated$weighted_se,
            weighted_ci_lower  = gated$weighted_ci_lower,
            weighted_ci_upper  = gated$weighted_ci_upper,
            weighted_n_eff     = gated$weighted_n_eff,
            suppressed         = gated$suppressed
          )
        } else {  # mean
          x_coerced <- coerce_numeric(x_raw)
          est       <- estimate_mean_both(x_coerced, wt)
          gated     <- apply_cell_floor(est, est$n)
          row <- list(
            platform_slug      = p$slug,
            platform_code      = as.integer(p$code),
            platform_label     = p$label,
            wave               = as.integer(w),
            metric             = m$metric,
            metric_type        = "mean",
            source_variable    = m$source_variable,
            value              = gated$mean,
            se                 = gated$se,
            ci_lower           = gated$ci_lower,
            ci_upper           = gated$ci_upper,
            n                  = gated$n,
            weighted_value     = gated$weighted_mean,
            weighted_se        = gated$weighted_se,
            weighted_ci_lower  = gated$weighted_ci_lower,
            weighted_ci_upper  = gated$weighted_ci_upper,
            weighted_n_eff     = gated$weighted_n_eff,
            suppressed         = gated$suppressed
          )
        }

        if (isTRUE(gated$suppressed)) n_suppressed <- n_suppressed + 1L
        else                          n_emitted    <- n_emitted    + 1L

        rows[[length(rows) + 1]] <- row
      }
    }
  }
  dt <- as.numeric(difftime(Sys.time(), t0, units = "secs"))
  cat(sprintf("  built %d rows in %.1fs (%d above floor, %d suppressed, %d skipped no-column)\n",
              length(rows), dt, n_emitted, n_suppressed, n_no_col))

  # ---- Write ----
  out_path <- here("public", "data", "platform_rates.json")
  dir.create(dirname(out_path), showWarnings = FALSE, recursive = TRUE)
  write_json(rows, out_path,
             auto_unbox = TRUE, na = "null", null = "null", pretty = FALSE)
  size_kb <- file.info(out_path)$size / 1024
  cat(sprintf("Wrote %s (%.1f KB)\n", out_path, size_kb))

}, error = function(e) {
  cat("\n[FAIL] ", conditionMessage(e), "\n", sep = "")
}, finally = {
  while (sink.number() > 0) sink()
})
