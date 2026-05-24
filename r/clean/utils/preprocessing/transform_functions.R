# Define transformation functions

transform_gender <- function(x) ifelse(grepl("Female", x), "Women", "Men")

transform_age <- function(x) cut(as.numeric(x), breaks = c(0, 30, 45, 59, Inf), 
                                 labels = c('18-29', '30-44', '45-59', '60+'), 
                                 include.lowest = TRUE)

transform_race <- function(x, y) factor(case_when(
  grepl("White Only", x) & grepl("No", y) ~ 'White, non-Hispanic',
  grepl("Black Only", x) & grepl("No", y) ~ 'Black, non-Hispanic',
  grepl("Asian Only", x) & grepl("No", y) ~ 'Asian, non-Hispanic',
  grepl("American Indian or Alaska Native Only|Hawaiian/Pacific Islander Only|Mixed", x) & 
    grepl("No", y) ~ 'Other/Multiple races, non-Hispanic',
  grepl("Yes", y) ~ 'Hispanic',
  TRUE ~ NA_character_
),levels = c("White, non-Hispanic", "Black, non-Hispanic", "Asian, non-Hispanic", 
             "Hispanic", "Other/Multiple races, non-Hispanic"))

transform_pol <- function(x,y) factor(case_when( 
  # create a combined politics variable to different "independents" based on leaning; combine 3rd parties into single 'other' group
  grepl("Democrats",x) ~ "Democrats, including leaners",
  grepl("Republicans",x) ~ "Republicans, including leaners",
  grepl("Independents|Not aligned with any political party",x) & 
    grepl("Do not lean",y) ~ "Independents, excluding leaners",
  grepl("Independents|Not aligned with any political party",x) & 
    grepl("Lean toward affiliating with Democrats",y) ~ "Democrats, including leaners",
  grepl("Independents|Not aligned with any political party",x) & 
    grepl("Lean toward affiliating with Republicans",y) ~ "Republicans, including leaners",
  grepl('Libertarians|Green party|Some other party',x) ~ 'Other parties',
  TRUE~NA_character_ ),
  levels=c("Democrats, including leaners", "Independents, excluding leaners", 
           "Republicans, including leaners","Other parties"))

transform_edu <- function(x) factor(case_when( 
  # create education buckets; following American National Election Study & Pew
  grepl("Less than 1st grade|7th or 8th grade|9th grade|10th grade|11th grade|12th grade-no diploma",x) ~ 'Grade School / Some High School',
  grepl("High school graduate or GED",x) ~ 'High School Diploma',
  grepl("Some college-no degree|Assoc. college degree-occ/voc prog|Assoc. college degree-academic prog",x) ~ 'Some College',
  grepl("Bachelor's degree|Master's degree|Professional school degree|Doctorate degree",x) ~ 'College Degree / Post-grad',
  TRUE~NA_character_ ),
  levels=c("Grade School / Some High School","High School Diploma","Some College","College Degree / Post-grad"))

transform_income <- function(x) factor(case_when(
  grepl("Less than $|5,000 to 7,499|7,500 to 9,999|10,000 to 12,499|12,500 to 14,
        999|15,000 to 19,999|20,000 to 24,999|25,000 to 29,999",x)~"<30,000",
  grepl("30,000 to 34,999|35,000 to 39,999|40,000 to 49,999|50,000 to 59,999",x)~"30,000-59,999",
  grepl("60,000 to 74,999|75,000 to 99,999",x)~"60,000-99,999",
  grepl("100,000 to 149,999",x)~"100,000-149,999",
  grepl("150,000 or more",x)~">150,000",
  TRUE~NA_character_),
  levels=c("<30,000","30,000-59,999","60,000-99,999","100,000-149,999",">150,000"))

transform_ai_used <- function(data, which_wave) {
  if (which_wave == 1) {
    num_ai_used <- sapply(strsplit(as.character(data$ai_used), "-"), 
                          function(matches) sum(as.numeric(matches) %in% c(1, 2, 3, 4))) # exclude 5 because 5 = none of the above
  } else {
    if (which_wave == 2 | which_wave == 3) {
      q_ai_cols <- c("q_ai1","q_ai2","q_ai4","q_ai5","q_ai6") # exclude q_ai3 because that is a search engine
      num_ai_used <- rowSums(data[, q_ai_cols] == "1 Yes", na.rm = TRUE) # count total number of AI tools user said yes they used
    } else { 
      num_ai_used <- rep(NA, nrow(data)) # waves > 3 do not include AI used questions
    }
  }
  return(num_ai_used) # return total number of AI tools used
}

# take us001 variable which is a concatenated string of numbers seperated by dashes
# each number corresponds to a different social media platform, except for 21, which = "None"
transform_sm_used<-function(x) sapply(strsplit(as.character(x$us001), "-"), function(matches) 
  # count total number of valid platforms selected
  sum(as.numeric(matches) %in% c(1, 2, 3, 4, 5, 6,7,8,9,10,11,12,13,14,15,16,
                                 17,18,19,20,22,23))) # exclude 21 bc = "None"

transform_freqs <- function(x) {
  x<-factor(case_when(
    x==".a" | x==".e"  ~ NA_character_,
    grepl("I did not use",x) ~ NA_character_,
    !is.na(x) ~ str_sub(x,3,nchar(x))
  ),levels=c("Less than once a week","About once a week","A few times per week",
             "About once a day","Multiple times per day"))
  return(x)
}

transform_experience_qs <- function(x) {
  x<-case_when(
    x==".a" ~ NA_character_,
    x==".e" ~ NA_character_,
    grepl("Yes",as.character(x)) ~ "Yes",
    grepl("No",as.character(x)) ~ "No",
    TRUE~as.character(x)
  )
  return(x)
}

