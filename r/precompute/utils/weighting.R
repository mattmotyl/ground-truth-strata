# Weighted + unweighted estimators for Phase 3 precompute.
#
# Each estimate_*_both() returns a list with BOTH unweighted (mean / prop
# / r) and weighted_* fields, so build scripts can emit them
# side-by-side in JSON.
#
# Convention (project_phase3_conventions): weighted estimates use the
# UAS final_weight via the survey package. Unweighted n is the
# observed-count guard for cell suppression; weighted_n_eff is Kish's
# effective sample size, sum(w)^2 / sum(w^2).
#
# Correlations are Spearman across the board. Weighted Spearman is
# computed by ranking each variable then taking the weighted Pearson
# correlation of the ranks — the definition.

suppressPackageStartupMessages({
  library(survey)
})

# Internal: degrees of freedom for the normal-approximation CI.
.z_for_ci <- function(conf_level) qnorm(1 - (1 - conf_level) / 2)

# Internal: Kish effective sample size.
.n_eff <- function(w) {
  sw <- sum(w)
  if (sw == 0) return(NA_real_)
  sw^2 / sum(w^2)
}

# Mean + Wald CI for numeric/ordinal x, unweighted and weighted.
# x: numeric vector (coerce ordered factors via as.integer before calling)
# w: numeric weight vector aligned with x (use final_weight)
estimate_mean_both <- function(x, w, conf_level = 0.95) {
  z <- .z_for_ci(conf_level)

  keep_u <- !is.na(x)
  x_u    <- x[keep_u]
  n_u    <- length(x_u)
  if (n_u >= 2) {
    m_u  <- mean(x_u)
    se_u <- sd(x_u) / sqrt(n_u)
    lo_u <- m_u - z * se_u
    hi_u <- m_u + z * se_u
  } else {
    m_u <- se_u <- lo_u <- hi_u <- NA_real_
  }

  keep_w <- !is.na(x) & !is.na(w) & w > 0
  x_w    <- x[keep_w]
  w_w    <- w[keep_w]
  n_w    <- length(x_w)
  if (n_w >= 2) {
    d    <- svydesign(ids = ~1, weights = ~w_w,
                      data = data.frame(x_w = x_w, w_w = w_w))
    m    <- svymean(~x_w, d, na.rm = TRUE)
    m_w  <- as.numeric(coef(m))
    se_w <- as.numeric(SE(m))
    lo_w <- m_w - z * se_w
    hi_w <- m_w + z * se_w
    neff <- .n_eff(w_w)
  } else {
    m_w <- se_w <- lo_w <- hi_w <- neff <- NA_real_
  }

  list(
    mean = m_u, se = se_u, ci_lower = lo_u, ci_upper = hi_u, n = n_u,
    weighted_mean     = m_w, weighted_se       = se_w,
    weighted_ci_lower = lo_w, weighted_ci_upper = hi_w,
    weighted_n_eff    = neff
  )
}

# Proportion of x01 == 1, unweighted and weighted.
# x01: numeric 0/1 vector (NAs dropped)
# w:   numeric weight vector aligned with x01
# Unweighted CI: Wilson. Weighted CI: svyciprop(method = "logit").
estimate_proportion_both <- function(x01, w, conf_level = 0.95) {
  z <- .z_for_ci(conf_level)

  keep_u <- !is.na(x01)
  x_u    <- x01[keep_u]
  n_u    <- length(x_u)
  if (n_u >= 2) {
    p_u  <- mean(x_u)
    se_u <- sqrt(p_u * (1 - p_u) / n_u)
    denom  <- 1 + z^2 / n_u
    center <- (p_u + z^2 / (2 * n_u)) / denom
    pm     <- z * sqrt((p_u * (1 - p_u) + z^2 / (4 * n_u)) / n_u) / denom
    lo_u <- center - pm
    hi_u <- center + pm
  } else {
    p_u <- se_u <- lo_u <- hi_u <- NA_real_
  }

  keep_w <- !is.na(x01) & !is.na(w) & w > 0
  x_w    <- x01[keep_w]; w_w <- w[keep_w]
  n_w    <- length(x_w)
  if (n_w >= 2 && length(unique(x_w)) > 1) {
    d   <- svydesign(ids = ~1, weights = ~w_w,
                     data = data.frame(x_w = x_w, w_w = w_w))
    p   <- suppressWarnings(svyciprop(~x_w, d, method = "logit", level = conf_level))
    p_w  <- as.numeric(coef(p))
    se_w <- as.numeric(SE(p))
    ci   <- attr(p, "ci")
    lo_w <- as.numeric(ci[1])
    hi_w <- as.numeric(ci[2])
    neff <- .n_eff(w_w)
  } else if (n_w >= 2) {
    # All-same edge case — svyciprop fails on degenerate input. Emit point estimate with zero-width CI.
    p_w  <- weighted.mean(x_w, w_w)
    se_w <- 0
    lo_w <- hi_w <- p_w
    neff <- .n_eff(w_w)
  } else {
    p_w <- se_w <- lo_w <- hi_w <- neff <- NA_real_
  }

  list(
    prop = p_u, se = se_u, ci_lower = lo_u, ci_upper = hi_u, n = n_u,
    weighted_prop     = p_w, weighted_se       = se_w,
    weighted_ci_lower = lo_w, weighted_ci_upper = hi_w,
    weighted_n_eff    = neff
  )
}

# Spearman correlation, unweighted and weighted.
# Unweighted: stats::cor(x, y, method = "spearman") + t-based p-value
#   (the same approximation cor.test() uses).
# Weighted: rank x and y, then weighted Pearson correlation of the
#   ranks. The weights enter the mean / cross-product moments.
# Requires at least 3 complete pairs; below that returns NAs.
estimate_correlation_both <- function(x, y, w, method = "spearman") {
  if (method != "spearman") {
    stop("Phase 3 standardizes on Spearman per project_phase3_conventions.md")
  }

  keep_u <- !is.na(x) & !is.na(y)
  x_u    <- x[keep_u]; y_u <- y[keep_u]
  n_u    <- length(x_u)
  if (n_u >= 3) {
    r_u <- suppressWarnings(cor(x_u, y_u, method = "spearman"))
    if (is.na(r_u) || abs(r_u) >= 1) {
      # Perfect / degenerate — p-value undefined under the t approximation.
      p_u <- NA_real_
    } else {
      t_u <- r_u * sqrt((n_u - 2) / (1 - r_u^2))
      p_u <- 2 * pt(-abs(t_u), df = n_u - 2)
    }
  } else {
    r_u <- p_u <- NA_real_
  }

  keep_w <- !is.na(x) & !is.na(y) & !is.na(w) & w > 0
  x_w    <- x[keep_w]; y_w <- y[keep_w]; w_w <- w[keep_w]
  n_w    <- length(x_w)
  if (n_w >= 3) {
    rx <- rank(x_w)
    ry <- rank(y_w)
    sw <- sum(w_w)
    mu_x   <- sum(w_w * rx) / sw
    mu_y   <- sum(w_w * ry) / sw
    cov_xy <- sum(w_w * (rx - mu_x) * (ry - mu_y)) / sw
    var_x  <- sum(w_w * (rx - mu_x)^2) / sw
    var_y  <- sum(w_w * (ry - mu_y)^2) / sw
    r_w <- if (var_x > 0 && var_y > 0) cov_xy / sqrt(var_x * var_y) else NA_real_
    neff <- .n_eff(w_w)
  } else {
    r_w  <- NA_real_
    neff <- NA_real_
  }

  list(
    r = r_u, p_value = p_u, n = n_u,
    weighted_r = r_w, weighted_n_eff = neff
  )
}
