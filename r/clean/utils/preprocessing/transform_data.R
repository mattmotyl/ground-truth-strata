### load survey data and clean variables ----
transform_data <- function(which_wave) {
  # load survey wave meta data
  wave_meta<-read_csv("data/wave_data.csv")
  
  # Load CSV file for the specific wave
  file_path <- paste0("data/uas", wave_meta$uas_num[wave_meta$wave_number == which_wave], ".csv", sep = "")
  data <- read.csv(file_path, header = TRUE) %>% # load data
    mutate(wave=case_when( # match the wave numbers to the UAS survey number
      grepl("514",wave_meta$uas_num[wave_meta$wave_number == which_wave])~1,
      grepl("515",wave_meta$uas_num[wave_meta$wave_number == which_wave])~2,
      grepl("516",wave_meta$uas_num[wave_meta$wave_number == which_wave])~3,
      grepl("517",wave_meta$uas_num[wave_meta$wave_number == which_wave])~4,
      grepl("518",wave_meta$uas_num[wave_meta$wave_number == which_wave])~5,
      grepl("519",wave_meta$uas_num[wave_meta$wave_number == which_wave])~6
    ))
  
  # Apply transformations
  data <- data %>%
    mutate(across( # frequency questions
      .cols = contains("us002"), 
      .fns = ~transform_freqs(.)
    )) %>% 
    mutate(across( # experience questions
      .cols = contains(c("us001s","us003","us004","us005","us007","us008",
                         "us016","us010","us012","us014")) & !contains("order"),
      .fns = ~transform_experience_qs(.)
    )) %>% 
    mutate( # demographic questions
      gender = if ("gender" %in% colnames(data)) transform_gender(gender) else NA_character_,
      age = if ("age" %in% colnames(data)) transform_age(age) else NA_character_,
      race = if (all(c("race", "hisplatino") %in% colnames(data))) transform_race(race, hisplatino) else NA_character_,
      pol_incl_leaners = if (all(c("preload_party_affil", "preload_lean_affil") %in% colnames(data))) transform_pol(preload_party_affil,preload_lean_affil) else NA_character_,
      edu_bucket = if ("education" %in% colnames(data)) transform_edu(education) else NA_character_,
      income = if ("hhincome" %in% colnames(data)) transform_income(hhincome) else NA_character_,
      num_ai_used = transform_ai_used(data, which_wave), 
      num_sm_used = if ("us001" %in% colnames(data)) transform_sm_used(data),
      conservatism = if ("rate_self" %in% colnames(data)) as.numeric(rate_self),
      warmth_lib = if ("scim_therm_lib" %in% colnames(data)) as.numeric(scim_therm_lib),
      warmth_con = if ("scim_therm_con" %in% colnames(data)) as.numeric(scim_therm_con),
      warmth_friend_lib = if ("scim_therm_lib" %in% colnames(data)) as.numeric(scim_friends_lib),
      warmth_friend_con = if ("scim_therm_con" %in% colnames(data)) as.numeric(scim_friends_con),
      felt_silenced = if ("us014" %in% colnames(data)) as.character(us014) else NA_character_,
      vote= if("vote2024" %in% colnames(data)) as.character(vote2024) else NA_character_,
      atts_gov_reg_tech = if ("ex004a" %in% colnames(data)) as.character(ex004a) else NA_character_,
      atts_tech_election = if ("ex004b" %in% colnames(data)) as.character(ex004b) else NA_character_,
      atts_tech_harm = if ("ex004c" %in% colnames(data)) as.character(ex004c) else NA_character_,
    ) %>%
    select(uasid, wave,final_weight,gender, age, race, pol_incl_leaners,conservatism,warmth_lib,warmth_con,
           warmth_friend_lib,warmth_friend_con,
           edu_bucket,income, num_ai_used,num_sm_used,felt_silenced,starts_with("atts_"),vote,
           starts_with("us0") & !contains("order"),
           -us001,-(starts_with(c("us004","us005","us008","us016")) & ends_with(c("_")))) # drop weird UAS summary vars
  
  # Append _w plus the wave number to each variable name for ease of binding columns over time
  #colnames(data) <- paste0(colnames(data), "_w", which_wave) # 4, 5, 8, 16
  
  return(data)
}
