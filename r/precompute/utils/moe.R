# MoE helpers for Phase 3.
#
# Most of Phase 3's uncertainty math goes through the `survey` package
# via weighting.R (svymean/svyciprop give SEs and CIs directly). This
# file provides two helpers used in display / legacy contexts.

suppressPackageStartupMessages({
  library(here)
})

# Wald-style CI bounds from a point estimate + SE.
ci_from_se <- function(est, se, conf_level = 0.95) {
  z <- qnorm(1 - (1 - conf_level) / 2)
  list(lower = est - z * se, upper = est + z * se)
}

# Re-export get_moe() — Kish-design-effect-adjusted worst-case MoE for
# a proportion at 0.5, in percentage points (* 100). Useful for showing
# a conservative bound alongside actual CIs in the UI.
# Historically lived in r/clean/utils/get_moe.R; copied to
# r/precompute/utils/ during the v0.1.0 repo cleanup so the public
# precompute pipeline is self-contained.
if (!exists("get_moe", mode = "function")) {
  source(here::here("r", "precompute", "utils", "get_moe.R"), local = FALSE)
}
