#*load text and clean data #####
load_and_clean_text_data <- function(which_wave,which_question) { # text data are only shared after they've been scrubbed of personally identifiable info,
  # and each question is a separate file
  # load survey wave meta data
  wave_meta<-read_csv("data/wave_data.csv")
  question_meta<-read_csv("data/question_data.csv")
  
  # Define the prefix map and suffix map
  prefix_map <- c("cs003_" = "surveycomments_","qai8a7other"="otheraiuse_","us001other_"="otherplatforms",
                  "us005_"="nuxtopic_","us006_" = "nuxtxt_","us009_"="bftwtarget_",
                  "us011"="mcxntxt_","us013_"="informtxt_","us017_"="bftwtxt_",
                  "us010_" = "mcxn_")
  
  # Load CSV file for the specific wave
  file_path <- paste0("data/text/uas", wave_meta$uas_num[wave_meta$wave_number == which_wave],"_",which_question," - c.csv", sep = "")
  data <- read.csv(file_path, header = TRUE) %>% # load data
    mutate(wave=case_when( # match the wave numbers to the UAS survey number
      grepl("514",wave_meta$uas_num[wave_meta$wave_number == which_wave])~1,
      grepl("515",wave_meta$uas_num[wave_meta$wave_number == which_wave])~2,
      grepl("516",wave_meta$uas_num[wave_meta$wave_number == which_wave])~3,
      grepl("517",wave_meta$uas_num[wave_meta$wave_number == which_wave])~4,
      grepl("518",wave_meta$uas_num[wave_meta$wave_number == which_wave])~5),
      question_text = question_meta$question[question_meta$question_number == which_question],
      variable=gsub("\\[", "_",variablename),
      variable=gsub("\\]","_",variable),
      # these next replacements are needed because somewhere upstream before
      # we get the data, inconsistent encoding was used such that typographic
      # curvy ampersands, quotation marks, and single quotation marks
      # the next lines replace those with standard characters
      answer=str_replace_all(answer,"&quot;",""),
      answer=str_replace_all(answer,"‚Äú","\'"),
      answer=str_replace_all(answer,"‚Äù","\'"),
      answer=str_replace_all(answer,"‚Äô","\'"),
      answer=str_replace_all(answer,"‚Äò","\'"),
      answer=str_replace_all(answer,"‚Äù","\'"),
      answer=str_replace_all(answer,"‚Äô","\'"),
      answer=str_replace_all(answer,"&amp;","&")) %>% 
    select(-variablename,-ts) %>% 
    pivot_wider(id_cols = c(uasid,wave,question_text), names_from=variable,values_from = answer) 
  
  # Extract the unique wave numbers
  wave_numbers <- unique(data$wave)
  
  # Check if there's more than one unique wave number
  if (length(wave_numbers) != 1) {
    stop("Multiple or no wave numbers detected in the dataset.")
  }
  
  wave_number <- wave_numbers[1]  # Select the wave number
  
  # Update the column names in the dataframe
  names(data) <- lapply(names(data), function(variable_name) {
    # Check if the variable name matches the format we want to rename
    if (grepl("^us\\d+_\\d+_", variable_name)) {
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
    } else {
      # If the variable name does not match the pattern, leave it unchanged
      return(variable_name)
    }
  })
  data<- data %>%
    unite("unified_text",# create new variable that concatenates all text responses for selected question per user
          contains("txt_"),
          remove=F, # retain original text columns to spot check by platform
          na.rm=T, # don't concatenate NA columns to unified_text
          sep="~nextplat~") %>% # add in a separator to identify when responses come from diff platforms
    mutate(num_plats_w_response=ifelse(str_detect(unified_text,"~nextplat~"), # count # of platforms user responded for
                                       1+str_count(unified_text,"~nextplat~"), # if the separator is found then, minimum # of platforms is 2
                                       1), # if separator isn't found, they only responded for 1 platform
           unified_text=noquote(str_replace_all(unified_text,"~nextplat~"," "))) # replace ugly separator with a space
  return(data)
}