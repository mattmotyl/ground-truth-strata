#*coloring functions----
#*
get_luminance <- function(rgb) {
  if (is.null(rgb[1]) || is.null(rgb[2]) || is.null(rgb[3])) {
    return(NA)
  }
  c <- rgb / 255
  c <- sapply(c, function(v) {
    if (v <= 0.03928) {
      v / 12.92
    } else {
      ((v + 0.055) / 1.055) ^ 2.4
    }
  })
  return(0.2126 * c[1] + 0.7152 * c[2] + 0.0722 * c[3])
}

# Calculate contrast ratio for each pair
get_contrast_ratios <- function(bg_colors,fg_colors) { 
  sapply(1:length(bg_colors), function(i) {
    bg_rgb <- col2rgb(bg_colors[i])
    fg_rgb <- col2rgb(fg_colors[i])
    
    bg_lum <- get_luminance(bg_rgb)
    fg_lum <- get_luminance(fg_rgb)
    
    if (is.na(bg_lum) || is.na(fg_lum)) {
      return(NA)  # Return NA if luminance calculation fails
    }
    
    # Calculate contrast ratio
    return((max(bg_lum, fg_lum) + 0.05) / (min(bg_lum, fg_lum) + 0.05))
  }) 
}

# Define the generate_text_color function with the contrast_ratio argument
adjust_text_color <- function(bg_color, fg_color,contrast_ratio) {
  # Calculate luminance of background color
  bg_rgb <- col2rgb(bg_color)
  bg_lum <- get_luminance(bg_rgb)
  
  fg_rgb <- col2rgb(fg_color)
  fg_lum <- get_luminance(fg_rgb)
  
  # Find the target luminance for the new text color
  target_lum <- (1 + 0.05) * bg_lum - 0.05
  
  # Calculate contrast ratio between target luminance and perfect white
  contrast_white <- (target_lum + 0.05) / 1.05
  
  # Calculate contrast ratio between target luminance and perfect black
  contrast_black <- 1.05 / (target_lum + 0.05)
  
  if (contrast_ratio<4.4) {
    new_text_color <- ifelse(abs(contrast_white - 4.5) < abs(contrast_black - 4.5), "#FFFFFF", "#000000")
    # Check if new_text_color provides better contrast
    if (get_contrast_ratios(bg_color, new_text_color) > get_contrast_ratios(bg_color, fg_color)) {
      return(new_text_color)
    }
  }
  return(fg_color)
}