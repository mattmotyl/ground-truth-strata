# use this get_moe function; above is acting up and spitting error messages for non-subset function calls
get_moe <- function (weight,subset_var,include_zeroes = FALSE) {
  weight <- ifelse(!is.na(subset_var),as.numeric(weight),NA)
  if (!include_zeroes) 
    weight <- if_else(weight == 0, NA_real_, weight)
  n <- length(na.omit(weight))
  mean_wt <- mean(weight, na.rm = T)
  sd_wt <- sd(weight, na.rm = T)
  deff <- 1 + (sd_wt/mean_wt)^2
  ess <- n/deff
  variance <- (0.5^2/n) * deff
  std_err <- sqrt(variance)
  moe <- 1.96 * std_err * 100
  return(moe)
}