# Unit tests for r/precompute/utils/*.R.
#
# Invoke:
#   Rscript r/precompute/tests/test_utils.R
#
# Pure synthetic data; no dependency on the cleaned .rds or raw CSVs.
# Exits non-zero on any failure so the caller can pipe-redirect to a
# log via `*>` (same pattern as r/clean/tests/test_*.R).

suppressPackageStartupMessages({
  library(tidyverse)
  library(here)
})

source(here("r", "precompute", "utils", "cell_filter.R"))
source(here("r", "precompute", "utils", "weighting.R"))
source(here("r", "precompute", "utils", "moe.R"))

n_pass <- 0L
n_fail <- 0L

check <- function(label, condition) {
  if (isTRUE(condition)) {
    cat(sprintf("  [PASS] %s\n", label))
    n_pass <<- n_pass + 1L
  } else {
    cat(sprintf("  [FAIL] %s\n", label))
    n_fail <<- n_fail + 1L
  }
}

approx_eq <- function(a, b, tol = 1e-6) {
  isTRUE(!is.na(a) && !is.na(b) && abs(a - b) < tol)
}

# ---- cell_filter.R ----
cat("\n=== cell_filter.R ===\n")

stats_above <- list(mean = 4.2, se = 0.1, n = 100)
out_above   <- apply_cell_floor(stats_above, n = stats_above$n)
check("above floor: mean preserved",        approx_eq(out_above$mean, 4.2))
check("above floor: suppressed is FALSE",   isFALSE(out_above$suppressed))

stats_below <- list(mean = 4.2, se = 0.1, n = 12)
out_below   <- apply_cell_floor(stats_below, n = stats_below$n)
check("below floor: mean is NA",            is.na(out_below$mean))
check("below floor: se is NA",              is.na(out_below$se))
check("below floor: n is NA",               is.na(out_below$n))
check("below floor: suppressed is TRUE",    isTRUE(out_below$suppressed))

stats_na_n <- list(mean = 4.2, se = 0.1)
out_na_n   <- apply_cell_floor(stats_na_n, n = NA_integer_)
check("NA n: treated as suppressed",        isTRUE(out_na_n$suppressed))

out_boundary <- apply_cell_floor(list(mean = 1), n = 30L)
check("n==30: not suppressed (boundary)",   isFALSE(out_boundary$suppressed))

out_just_below <- apply_cell_floor(list(mean = 1), n = 29L)
check("n==29: suppressed",                  isTRUE(out_just_below$suppressed))

# ---- weighting.R: estimate_mean_both ----
cat("\n=== weighting.R: estimate_mean_both ===\n")

set.seed(42)
x_clean <- rnorm(200, mean = 5, sd = 1.5)
w_unit  <- rep(1, 200)
out_m   <- estimate_mean_both(x_clean, w_unit)
check("unweighted mean ~ 5 (sample drift OK)", approx_eq(out_m$mean, mean(x_clean)))
check("unit weights => weighted ~= unweighted mean", approx_eq(out_m$mean, out_m$weighted_mean, tol = 1e-4))
check("n matches non-NA count",                       out_m$n == 200)
check("weighted_n_eff ~= n with unit weights",        approx_eq(out_m$weighted_n_eff, 200))
check("CI lower < mean < CI upper",                   out_m$ci_lower < out_m$mean && out_m$mean < out_m$ci_upper)

x_na <- c(x_clean, rep(NA, 5))
w_na <- c(w_unit, rep(1, 5))
out_na <- estimate_mean_both(x_na, w_na)
check("NAs in x dropped: n still 200",                out_na$n == 200)

w_var  <- runif(200, min = 0.5, max = 2)
out_w  <- estimate_mean_both(x_clean, w_var)
expected_w_mean <- weighted.mean(x_clean, w_var)
check("weighted mean matches weighted.mean()",        approx_eq(out_w$weighted_mean, expected_w_mean, tol = 1e-6))
check("weighted_n_eff <= n under non-uniform weights", out_w$weighted_n_eff < 200)

# ---- weighting.R: estimate_proportion_both ----
cat("\n=== weighting.R: estimate_proportion_both ===\n")

x01    <- c(rep(1, 60), rep(0, 40))
w_unit <- rep(1, 100)
out_p  <- estimate_proportion_both(x01, w_unit)
check("unweighted prop == 0.6",                       approx_eq(out_p$prop, 0.6))
check("unit weights => weighted prop ~ 0.6",          approx_eq(out_p$weighted_prop, 0.6, tol = 1e-4))
check("Wilson CI brackets 0.6",                       out_p$ci_lower < 0.6 && 0.6 < out_p$ci_upper)
check("n == 100",                                     out_p$n == 100)

x_all_one  <- rep(1, 50)
w_all_one  <- rep(1, 50)
out_one    <- estimate_proportion_both(x_all_one, w_all_one)
check("all-1s degenerate: weighted prop == 1",        approx_eq(out_one$weighted_prop, 1))
check("all-1s degenerate: weighted_se == 0",          approx_eq(out_one$weighted_se, 0))

# ---- weighting.R: estimate_correlation_both ----
cat("\n=== weighting.R: estimate_correlation_both ===\n")

set.seed(101)
xx <- rnorm(300)
yy <- 0.7 * xx + rnorm(300, sd = 0.7)
out_r <- estimate_correlation_both(xx, yy, rep(1, 300))
expected_r <- cor(xx, yy, method = "spearman")
check("Spearman r matches stats::cor",                approx_eq(out_r$r, expected_r))
check("p-value < 0.05 for strong correlation",        out_r$p_value < 0.05)
check("unit weights => weighted r ~= unweighted r",   approx_eq(out_r$r, out_r$weighted_r, tol = 1e-4))

# Variable weights — weighted Spearman should differ from unweighted
w_skew <- ifelse(xx > 0, 3, 1)
out_rw <- estimate_correlation_both(xx, yy, w_skew)
check("weighted r != unweighted r under skewed weights",
      !approx_eq(out_rw$r, out_rw$weighted_r, tol = 1e-3))

# Pearson explicitly disallowed
err <- tryCatch(estimate_correlation_both(xx, yy, w_skew, method = "pearson"),
                error = function(e) conditionMessage(e))
check("Pearson rejected with informative error",      grepl("Spearman", err))

# Too few pairs
out_few <- estimate_correlation_both(c(1, 2), c(3, 4), c(1, 1))
check("n < 3: r is NA",                               is.na(out_few$r))

# ---- moe.R ----
cat("\n=== moe.R ===\n")

bounds <- ci_from_se(0.5, 0.05)
check("ci_from_se: lower ~ 0.402",                    approx_eq(bounds$lower, 0.5 - 1.959964 * 0.05, tol = 1e-4))
check("ci_from_se: upper ~ 0.598",                    approx_eq(bounds$upper, 0.5 + 1.959964 * 0.05, tol = 1e-4))
check("get_moe re-export exists",                     exists("get_moe", mode = "function"))

# get_moe smoke test: 100 unit-weight respondents, none missing => MoE ~ 9.8 pp
g_moe <- get_moe(weight = rep(1, 100), subset_var = rep(1, 100))
check("get_moe(100 unit weights) ~ 9.8 pp",           approx_eq(g_moe, 1.96 * sqrt(0.25 / 100) * 100, tol = 1e-3))

# ---- summary ----
cat(sprintf("\n=== %d PASS / %d FAIL ===\n", n_pass, n_fail))
if (n_fail > 0) {
  quit(status = 1)
}
