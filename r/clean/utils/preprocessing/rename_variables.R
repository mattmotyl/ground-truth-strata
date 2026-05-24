# *rename variables more sensibly ----
rename_variables <- function(data, add_suffix_to_demographics=FALSE) {
  
  # Define the prefix map and suffix map
  prefix_map <- c("us001_" = "uses_","us002_" = "freq_","us003_" = "nux_","us004_"="nuximpact_",
                  "us005_"="nuxtopic_", "us007_" = "bftw_","us008_"="bftwimpact_","us016_"="bftwtopic_",
                  "us010_" = "mcxn_","us012_" = "useful_")
                  
  # Extract the unique wave numbers
  wave_numbers <- unique(data$wave)
  
  # Check if there's more than one unique wave number
  if (length(wave_numbers) != 1) {
    stop("Multiple or no wave numbers detected in the dataset.")
  }
  
  wave_number <- wave_numbers[1]  # Select the wave number
  
  # Update the column names in the dataframe
  names(data) <- lapply(names(data), function(variable_name) {
    # Check if the variable name has the prefix "us001"
    if (grepl("^us001", variable_name)) {
      # Replace the second "s" with an underscore
      variable_name <- gsub("s(?=\\d+$)", "_", variable_name, perl = TRUE)
      # Extract prefix, platform_id, and follow from the variable name
      parts <- unlist(strsplit(variable_name, "_"))
      prefix <- parts[1]
      platform_id <- parts[2]
      
      # Construct the new variable name using the provided maps
      prefix_key <- paste0(prefix, "_")
      platform_key <- as.character(platform_map[platform_id])
      
      # Append "_w" and the wave number
      wave_suffix <- paste0("_w", wave_number)
      
      new_variable_name <- paste0(prefix_map[prefix_key], platform_key, wave_suffix)
      
      # Return the new variable name
      return(new_variable_name)
    }
    
    # Check if the variable name matches the format we want to rename
    if (grepl("^us\\d+_\\d+_", variable_name)) {
      # Extract prefix, platform_id, and follow from the variable name
      parts <- unlist(strsplit(variable_name, "_"))
      prefix <- parts[1]
      platform_id <- parts[2]
      follow <- parts[3]
      
      # Construct the new variable name using the provided maps
      prefix_key <- paste0(prefix, "_")
      platform_key <- as.character(platform_map[platform_id])
      follow_key <- ifelse(!is.na(follow) && nchar(follow) > 0, paste0("_", follow), "")
      
      # Append "_w" and the wave number
      wave_suffix <- paste0("_w", wave_number)
      
      new_variable_name <- paste0(prefix_map[prefix_key], platform_key, follow_key, wave_suffix)
      
      # Return the new variable name
      return(new_variable_name)
    }
    
    # Check if the variable name corresponds to other variables that might change over time
    if (add_suffix_to_demographics==TRUE & grepl("pol_incl_leaners|conservatism|warmth_lib|warmth_con|num_ai_used|num_sm_used", variable_name)) {
      # Append "_w" and the wave number to these variables
      new_variable_name <- paste0(variable_name, "_w", wave_number)
      
      # Return the new variable name
      return(new_variable_name)
    } else {
      # If the variable name does not match the pattern, leave it unchanged
      return(variable_name)
    }
  })
  
  return(data)
}
