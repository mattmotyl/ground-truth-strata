# visualization functions ----
# *platform change over 6 waves ----
create_pretty_table_showing_change_over_time <- function(data, question) {
  # load wave meta data
  wave_meta<-read_csv(file='data/wave_data.csv',show_col_types = FALSE) %>% 
    mutate(wave_dates=factor(wave_dates,levels=c("March 2 - May 7, 2023","August 7 - September 17, 2023",
                                                 "September 4 - October 15, 2023","November 6, 2023 - February 18, 2024",
                                                 "February 5, 2024 - May 19, 2024","October 14, 2024 - January 4, 2025")))
  
  # Define the question map
  question_map <- c("used" = "In the past 28 days, which of the following services have you used?",
                    "nux" = "In the past 28 days, have you personally witnessed or experienced something that affected you negatively on ____?",
                    "bftw" = "In the past 28 days, have you witnessed or experienced content that you would consider bad for the world on ____?",
                    "mcxn" = "In the past 28 days, have you experienced a meaningful connection with others on ____?",
                    "useful" = "In the past 28 days, have you learned something that was useful or that helped you understand something important on ____?")
  # Retrieve the question text
  q_text <- question_map[question]
  
  question_to_header_map <- c("In the past 28 days, which of the following services have you used?" = 
                                "% of US adults who used each platform in the last 28 days",
                              "In the past 28 days, have you personally witnessed or experienced something that affected you negatively on ____?" = 
                                "% of US adults on each platform witnessing or experiencing something that affected them negatively in the last 28 days",
                              "In the past 28 days, have you witnessed or experienced content that you would consider bad for the world on ____?" = 
                                "% of US adults on each platform witnessing or experiencing content they consider to be bad for the world in the last 28 days",
                              "In the past 28 days, have you experienced a meaningful connection with others on ____?" = 
                                "% of US adults on each platform who experienced a meaningful connection with others in the last 28 days",
                              "In the past 28 days, have you learned something that was useful or that helped you understand something important on ____?" = 
                                "% of US adults on each platform who learned something that was useful or that helped them understand something important in the last 28 days")
  header_text <- question_to_header_map[q_text]
  
  # Check if question is found in the question_to_header_map
  if (!(question %in% names(question_map))) {
    stop("Question not found in the question_map.")
  }
  
  if (grepl("nux|mcxn|bftw|useful", question)) {
    temp <- data %>% 
      filter(grepl(q_text, Question)) # filter to desired question
  }
  
  # need to evaluate the used question separately because people who do not use platform get a value of "No", which gets included in the "total" column
  if (grepl("used", question)) {
    temp <- data %>% 
      filter(grepl(q_text, Question))  # filter to desired question
  }
  temp<-temp %>% 
    pivot_wider(id_cols=c(Platform,Question), 
                names_from = Wave, 
                values_from = c(yes, total, moe, Percent, unweighted_n, weighted_n), 
                names_glue = "{.value}_w{Wave}") %>% 
    mutate(across(contains("Percent"), ~ round(.x, 1)), # round percents to 2 decimals
           across(contains("moe_"), ~ round(.x, 1)), # round moe to 2 decimals
           weighted_average_moe = round(((moe_w1 * weighted_n_w1) + (moe_w2 * weighted_n_w2) + 
                                           (moe_w3 * weighted_n_w3) + (moe_w4 * weighted_n_w4) +
                                           (moe_w5 * weighted_n_w5) + (moe_w6 * weighted_n_w6)) / 
                                          (weighted_n_w1 + weighted_n_w2 + weighted_n_w3 + 
                                             weighted_n_w4 + weighted_n_w5 + weighted_n_w6), 1),
           delta_w1_w2 = round(Percent_w2 - Percent_w1, 1), # calculate delta between time points
           delta_w2_w3 = round(Percent_w3 - Percent_w2, 1),
           delta_w3_w4 = round(Percent_w4 - Percent_w3, 1),
           delta_w4_w5 = round(Percent_w5 - Percent_w4, 1),
           delta_w5_w6 = round(Percent_w6 - Percent_w5, 1),
           delta_w1_w6 = round(Percent_w6 - Percent_w1, 1), # calculate delta from first wave to last wave
           delta_w1_w6_perc = round((delta_w1_w6/Percent_w1)*100,1),
           color_w1w2 = case_when(
             grepl("bad for the world|affected you negatively", Question) & delta_w1_w2 < 0 & abs(delta_w1_w2) >= weighted_average_moe ~ "#008888", 
             grepl("meaningful|helped you understand|used", Question) & delta_w1_w2 > 0 & abs(delta_w1_w2) >= weighted_average_moe ~ "#008888", 
             grepl("bad for the world|affected you negatively", Question) & delta_w1_w2 < 0 & abs(delta_w1_w2) >= weighted_average_moe ~ "#880000",
             grepl("meaningful|helped you understand|used", Question) & delta_w1_w2 < 0 & abs(delta_w1_w2) >= weighted_average_moe ~ "#880000", 
             TRUE ~ "#666666"),
           direction_w1w2 = case_when(
             grepl("bad for the world|affected you negatively", Question) & delta_w1_w2 < 0 & abs(delta_w1_w2) >= weighted_average_moe ~ "\u25BC", # down triangle code
             grepl("meaningful|helped you understand|used", Question) & delta_w1_w2 > 0 & abs(delta_w1_w2) >= weighted_average_moe ~ "\u25B2", # up triangle code
             grepl("bad for the world|affected you negatively", Question) & delta_w1_w2 < 0 & abs(delta_w1_w2) >= weighted_average_moe ~ "\u25B2", # up triangle code
             grepl("meaningful|helped you understand|used", Question) & delta_w1_w2 < 0 & abs(delta_w1_w2) >= weighted_average_moe ~ "\u25BC", # down triangle code
             TRUE ~ ""),
           color_w2w3 = case_when(
             grepl("bad for the world|affected you negatively", Question) & delta_w2_w3 < 0 & abs(delta_w2_w3) >= weighted_average_moe ~ "#008888", 
             grepl("meaningful|helped you understand|used", Question) & delta_w2_w3 > 0 & abs(delta_w2_w3) >= weighted_average_moe ~ "#008888", 
             grepl("bad for the world|affected you negatively", Question) & delta_w2_w3 < 0 & abs(delta_w2_w3) >= weighted_average_moe ~ "#880000",
             grepl("meaningful|helped you understand|used", Question) & delta_w2_w3 < 0 & abs(delta_w2_w3) >= weighted_average_moe ~ "#880000", 
             TRUE ~ "#666666"),
           direction_w2w3 = case_when(
             grepl("bad for the world|affected you negatively", Question) & delta_w2_w3 < 0 & abs(delta_w2_w3) >= weighted_average_moe ~ "\u25BC", # down triangle code
             grepl("meaningful|helped you understand|used", Question) & delta_w2_w3 > 0 & abs(delta_w2_w3) >= weighted_average_moe ~ "\u25B2", # up triangle code
             grepl("bad for the world|affected you negatively", Question) & delta_w2_w3 < 0 & abs(delta_w2_w3) >= weighted_average_moe ~ "\u25B2", # up triangle code
             grepl("meaningful|helped you understand|used", Question) & delta_w2_w3 < 0 & abs(delta_w2_w3) >= weighted_average_moe ~ "\u25BC", # down triangle code
             TRUE ~ ""),
           color_w3w4 = case_when(
             grepl("bad for the world|affected you negatively", Question) & delta_w3_w4 < 0 & abs(delta_w3_w4) >= weighted_average_moe ~ "#008888", 
             grepl("meaningful|helped you understand|used", Question) & delta_w3_w4 > 0 & abs(delta_w3_w4) >= weighted_average_moe ~ "#008888", 
             grepl("bad for the world|affected you negatively", Question) & delta_w3_w4 < 0 & abs(delta_w3_w4) >= weighted_average_moe ~ "#880000",
             grepl("meaningful|helped you understand|used", Question) & delta_w3_w4 < 0 & abs(delta_w3_w4) >= weighted_average_moe ~ "#880000", 
             TRUE ~ "#666666"),
           direction_w3w4 = case_when(
             grepl("bad for the world|affected you negatively", Question) & delta_w3_w4 < 0 & abs(delta_w3_w4) >= weighted_average_moe ~ "\u25BC", # down triangle code
             grepl("meaningful|helped you understand|used", Question) & delta_w3_w4 > 0 & abs(delta_w3_w4) >= weighted_average_moe ~ "\u25B2", # up triangle code
             grepl("bad for the world|affected you negatively", Question) & delta_w3_w4 < 0 & abs(delta_w3_w4) >= weighted_average_moe ~ "\u25B2", # up triangle code
             grepl("meaningful|helped you understand|used", Question) & delta_w3_w4 < 0 & abs(delta_w3_w4) >= weighted_average_moe ~ "\u25BC", # down triangle code
             TRUE ~ ""),
           color_w4w5 = case_when(
             grepl("bad for the world|affected you negatively", Question) & delta_w4_w5 < 0 & abs(delta_w4_w5) >= weighted_average_moe ~ "#008888", 
             grepl("meaningful|helped you understand|used", Question) & delta_w4_w5 > 0 & abs(delta_w4_w5) >= weighted_average_moe ~ "#008888", 
             grepl("bad for the world|affected you negatively", Question) & delta_w4_w5 < 0 & abs(delta_w4_w5) >= weighted_average_moe ~ "#880000",
             grepl("meaningful|helped you understand|used", Question) & delta_w4_w5 < 0 & abs(delta_w4_w5) >= weighted_average_moe ~ "#880000", 
             TRUE ~ "#666666"),
           direction_w4w5 = case_when(
             grepl("bad for the world|affected you negatively", Question) & delta_w4_w5 < 0 & abs(delta_w4_w5) >= weighted_average_moe ~ "\u25BC", # down triangle code
             grepl("meaningful|helped you understand|used", Question) & delta_w4_w5 > 0 & abs(delta_w4_w5) >= weighted_average_moe ~ "\u25B2", # up triangle code
             grepl("bad for the world|affected you negatively", Question) & delta_w4_w5 < 0 & abs(delta_w4_w5) >= weighted_average_moe ~ "\u25B2", # up triangle code
             grepl("meaningful|helped you understand|used", Question) & delta_w4_w5 < 0 & abs(delta_w4_w5) >= weighted_average_moe ~ "\u25BC", # down triangle code
             TRUE ~ ""),
           color_w5w6 = case_when(
             grepl("bad for the world|affected you negatively", Question) & delta_w5_w6 < 0 & abs(delta_w5_w6) >= weighted_average_moe ~ "#008888", 
             grepl("meaningful|helped you understand|used", Question) & delta_w5_w6 > 0 & abs(delta_w5_w6) >= weighted_average_moe ~ "#008888", 
             grepl("bad for the world|affected you negatively", Question) & delta_w5_w6 < 0 & abs(delta_w5_w6) >= weighted_average_moe ~ "#880000",
             grepl("meaningful|helped you understand|used", Question) & delta_w5_w6 < 0 & abs(delta_w5_w6) >= weighted_average_moe ~ "#880000", 
             TRUE ~ "#666666"),
           direction_w5w6 = case_when(
             grepl("bad for the world|affected you negatively", Question) & delta_w5_w6 < 0 & abs(delta_w5_w6) >= weighted_average_moe ~ "\u25BC", # down triangle code
             grepl("meaningful|helped you understand|used", Question) & delta_w5_w6 > 0 & abs(delta_w5_w6) >= weighted_average_moe ~ "\u25B2", # up triangle code
             grepl("bad for the world|affected you negatively", Question) & delta_w5_w6 < 0 & abs(delta_w5_w6) >= weighted_average_moe ~ "\u25B2", # up triangle code
             grepl("meaningful|helped you understand|used", Question) & delta_w5_w6 < 0 & abs(delta_w5_w6) >= weighted_average_moe ~ "\u25BC", # down triangle code
             TRUE ~ ""),
           color_w1w6 = case_when(
             grepl("bad for the world|affected you negatively", Question) & delta_w1_w6 < 0 & abs(delta_w1_w6) >= weighted_average_moe ~ "#008888", 
             grepl("meaningful|helped you understand|used", Question) & delta_w1_w6 > 0 & abs(delta_w1_w6) >= weighted_average_moe ~ "#008888", 
             grepl("bad for the world|affected you negatively", Question) & delta_w1_w6 > 0 & abs(delta_w1_w6) >= weighted_average_moe ~ "#880000",
             grepl("meaningful|helped you understand|used", Question) & delta_w1_w6 < 0 & abs(delta_w1_w6) >= weighted_average_moe ~ "#880000", 
             TRUE ~ "#666666"),
           direction_w1w6 = case_when(
             grepl("bad for the world|affected you negatively", Question) & delta_w1_w6 < 0 & abs(delta_w1_w6) >= weighted_average_moe ~ "\u25BC", # down triangle code
             grepl("meaningful|helped you understand|used", Question) & delta_w1_w6 > 0 & abs(delta_w1_w6) >= weighted_average_moe ~ "\u25B2", # up triangle code
             grepl("bad for the world|affected you negatively", Question) & delta_w1_w6 > 0 & abs(delta_w1_w6) >= weighted_average_moe ~ "\u25B2", # up triangle code
             grepl("meaningful|helped you understand|used", Question) & delta_w1_w6 < 0 & abs(delta_w1_w6) >= weighted_average_moe ~ "\u25BC", # down triangle code
             TRUE ~ ""),
           color_w1w6_perc = case_when(
             grepl("bad for the world|affected you negatively", Question) & delta_w1_w6_perc < 0 & abs(delta_w1_w6) >= weighted_average_moe ~ "#008888", 
             grepl("meaningful|helped you understand|used", Question) & delta_w1_w6_perc > 0 & abs(delta_w1_w6) >= weighted_average_moe ~ "#008888", 
             grepl("bad for the world|affected you negatively", Question) & delta_w1_w6_perc > 0 & abs(delta_w1_w6) >= weighted_average_moe ~ "#880000",
             grepl("meaningful|helped you understand|used", Question) & delta_w1_w6_perc < 0 & abs(delta_w1_w6) >= weighted_average_moe ~ "#880000", 
             TRUE ~ "#666666"),
           direction_w1w6_perc = case_when(
             grepl("bad for the world|affected you negatively", Question) & delta_w1_w6_perc < 0 & abs(delta_w1_w6) >= weighted_average_moe ~ "\u25BC", # down triangle code
             grepl("meaningful|helped you understand|used", Question) & delta_w1_w6_perc > 0 & abs(delta_w1_w6) >= weighted_average_moe ~ "\u25B2", # up triangle code
             grepl("bad for the world|affected you negatively", Question) & delta_w1_w6_perc > 0 & abs(delta_w1_w6) >= weighted_average_moe ~ "\u25B2", # up triangle code
             grepl("meaningful|helped you understand|used", Question) & delta_w1_w6_perc < 0 & abs(delta_w1_w6) >= weighted_average_moe ~ "\u25BC", # down triangle code
             TRUE ~ ""),
           too_small=case_when(
             grepl("used",Question) & rowMeans(.[grepl('yes_', colnames(.))], na.rm = TRUE) > 90 ~ "Keep",
             grepl("used",Question) & rowMeans(.[grepl('yes_', colnames(.))], na.rm = TRUE) < 90 ~ "Drop",
             grepl("bad for the world|affected you negatively|meaningful|helped you understand",Question) & 
               rowMeans(.[grepl('total_', colnames(.))], na.rm = TRUE) > 90 ~ "Keep",
             grepl("bad for the world|affected you negatively|meaningful|helped you understand",Question) &
               rowMeans(.[grepl('total_', colnames(.))], na.rm = TRUE) < 90 ~ "Drop")) %>%
    filter(grepl("Keep",too_small)) %>% 
    arrange(-Percent_w6) %>% # sort based on most recent wave
    rename('March 2 - May 7, 2023' = Percent_w1,
           'August 7 - September 17, 2023' = Percent_w2,
           'September 4 - October 15, 2023' = Percent_w3,
           'November 6, 2023 - February 18, 2024' = Percent_w4,
           'February 5, 2024 - May 19, 2024' = Percent_w5,
           'October 14, 2024 - January 4, 2025' = Percent_w6,
           'Weighted Margin of Error (+/-)' = weighted_average_moe,
           'Raw Change Over Period' = delta_w1_w6,
           'Relative Change Over Period' = delta_w1_w6_perc) %>% 
    select(-contains(c("moe","delta","weighted_n","total_","yes_","too_small"))) %>%   # drop columns not needed for the table
    mutate(`August 7 - September 17, 2023` = paste0(`August 7 - September 17, 2023`, direction_w1w2),
           `September 4 - October 15, 2023` = paste0(`September 4 - October 15, 2023`, direction_w2w3),
           `November 6, 2023 - February 18, 2024` = paste0(`November 6, 2023 - February 18, 2024`, direction_w3w4),
           `February 5, 2024 - May 19, 2024` = paste0(`February 5, 2024 - May 19, 2024`, direction_w4w5),
           `October 14, 2024 - January 4, 2025` = paste0(`October 14, 2024 - January 4, 2025`, direction_w5w6),
           `Raw Change Over Period` = paste0(`Raw Change Over Period`, direction_w1w6),
           `Relative Change Over Period` = paste0(`Relative Change Over Period`, direction_w1w6_perc),
    ) 
  # the platform use question gets its own chunk because the MoE is the same for all platforms
  # and it's redundant to include in a column of the table. In this chunk, I demote the
  # MoE to the notes under the table.
  if (grepl("used", question)) { 
    temp %>% 
      select(Platform, `March 2 - May 7, 2023`, `August 7 - September 17, 2023`,
             `September 4 - October 15, 2023`, `November 6, 2023 - February 18, 2024`,
             `February 5, 2024 - May 19, 2024`, `October 14, 2024 - January 4, 2025`,
             -`Weighted Margin of Error (+/-)`, `Raw Change Over Period`,
             `Relative Change Over Period`) %>% 
      rename("Platform*" = Platform) %>% 
      kable(format = "html", escape = FALSE, align = "lcccccccc") %>%
      kable_styling(full_width = FALSE, html_font = "Open Sans", font_size = 20) %>%
      add_header_above(c(" " = 1, "Survey Conducted" = 6, " " = 1, " " = 1), color = "#666666") %>%
      add_header_above(c(setNames(9,header_text)), align = "l", font_size = 30, color = "#333333") %>% 
      row_spec(0, bold = TRUE, color = "#555555") %>% 
      column_spec(1, bold = TRUE, width = "3.5cm", color = "#555555", background = "#E8E8E8", border_right = T) %>%
      column_spec(2, width = "3.5cm") %>%
      column_spec(3, width = "3.5cm", color = temp$color_w1w2) %>%
      column_spec(4, width = "3.5cm", color = temp$color_w2w3) %>%
      column_spec(5, width = "3.5cm", color = temp$color_w3w4, border_right = F) %>%
      column_spec(6, width = "3.5cm", color = temp$color_w4w5, border_right = F) %>%
      column_spec(7, width = "3.5cm", color = temp$color_w5w6, border_right = T) %>%
      column_spec(8, width = "3.5cm", color = temp$color_w1w6, bold = TRUE, background = "#E8E8E8") %>% 
      column_spec(9, width = "3.2cm", color = temp$color_w1w6_perc, bold = TRUE, background = "#E8E8E8", border_right = T) %>% 
      footnote(symbol = "Platforms with fewer than 100 respondents on average per wave are excluded.",
               general = paste0("Neely Social Media Index survey panel of ",
                                comma(as.integer(length(unique(c(w1$uasid, w2$uasid, w3$uasid, w4$uasid,w5$uasid,w6$uasid))))), # count unique number of respondents across all waves
                                " US adults conducted between ", wave_meta$wave_dates[min(wave_meta$wave_number)], # extract wave 1 date string
                                " and ", wave_meta$wave_dates[max(wave_meta$wave_number)], # extract latest wave date string
                                ". Each wave contained between ", comma(min(wave_meta$completed_N)), " and ", # extract min sample size
                                comma(max(wave_meta$completed_N)), " respondents. The weighted margin of error for all use data is +/-", # extract max sample size
                                mean(temp$`Weighted Margin of Error (+/-)`),"%."),
               footnote_as_chunk = TRUE, title_format = c("italic")) %>% 
      save_kable(paste0("change_2023_2024/plots/",question,"_table.html"),density=300,zoom = 1.5)
  }  else { 
    temp %>% 
      select(Platform, `March 2 - May 7, 2023`, `August 7 - September 17, 2023`,
             `September 4 - October 15, 2023`, `November 6, 2023 - February 18, 2024`,
             `February 5, 2024 - May 19, 2024`, `October 14, 2024 - January 4, 2025`,
             `Weighted Margin of Error (+/-)`, `Raw Change Over Period`,
             `Relative Change Over Period`) %>% 
      rename("Platform*" = Platform) %>% 
      kable(format = "html", escape = FALSE, align = "lccccccccc") %>%
      kable_styling(full_width = FALSE, html_font = "Open Sans", font_size = 20) %>%
      add_header_above(c(" " = 1, "Survey Conducted" = 7, " " = 1, " " = 1), color = "#666666") %>%
      add_header_above(c(setNames(10,header_text)), align = "l", font_size = 30, color = "#333333") %>% 
      row_spec(0, bold = TRUE, color = "#555555") %>% 
      column_spec(1, bold = TRUE, width = "3.5cm", color = "#555555", background = "#E8E8E8", border_right = T) %>%
      column_spec(2, width = "3.5cm") %>%
      column_spec(3, width = "3.5cm", color = temp$color_w1w2) %>%
      column_spec(4, width = "3.5cm", color = temp$color_w2w3) %>%
      column_spec(5, width = "3.5cm", color = temp$color_w3w4) %>%
      column_spec(6, width = "3.5cm", color = temp$color_w4w5) %>%
      column_spec(7, width = "3.5cm", color = temp$color_w5w6) %>%
      column_spec(8, width = "3.9cm", color = "#666666", border_right = T) %>%
      column_spec(9, width = "3.2cm", color = temp$color_w1w6, bold = TRUE, background = "#E8E8E8") %>% 
      column_spec(10, width = "4.05cm", color = temp$color_w1w6_perc, bold = TRUE, background = "#E8E8E8", border_right = T) %>% 
      footnote(symbol = "Platforms with fewer than 100 respondents on average per wave are excluded.",
               general = paste0("Neely Social Media Index survey panel of ",
                                comma(as.integer(length(unique(c(w1$uasid, w2$uasid, w3$uasid, w4$uasid, w5$uasid, w6$uasid))))), # count unique number of respondents across all waves
                                " US adults conducted between ", wave_meta$wave_dates[min(wave_meta$wave_number)], # extract wave 1 date string
                                " and ", wave_meta$wave_dates[max(wave_meta$wave_number)], # extract latest wave date string
                                ". Each wave contained between ", comma(min(wave_meta$completed_N)), " and ", # extract min sample size
                                comma(max(wave_meta$completed_N)), " respondents."), # extract max sample size
               footnote_as_chunk = TRUE, title_format = c("italic")) %>% 
      save_kable(paste0("change_2023_2024/plots/",question,"_table.html"),density=300,zoom = 1.5)
  }
}
