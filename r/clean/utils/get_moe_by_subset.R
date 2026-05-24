# stats functions ----
# *margin of error that accounts for different numbers of users/responses ----
get_moe_by_subset <- function (weight,by_subset=FALSE,subset_var,include_zeroes = FALSE) {
  if (!include_zeroes & by_subset==TRUE) { 
    weight <- ifelse(!is.na(subset_var),as.numeric(weight),NA)
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
  
  else { 
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
} 