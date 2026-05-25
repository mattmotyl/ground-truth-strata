# *load text and clean data #####
# NOTE: This helper is for qualitative subsample analyses only — it reads
# per-question PII-scrubbed free-text CSVs that are NOT distributed with the
# main uas51X.csv files and are NOT part of the Phase 3 precompute pipeline.
# Expected inputs:
#   r/data/wave_data.csv          (committed; wave -> uas_num map)
#   r/data/question_data.csv      (NOT in repo; PII-scrubbed alongside text)
#   r/data/text/uas<N>_<q> - c.csv (NOT in repo; per-question text files)
# If you don't have the text files locally, this function will error on the
# read_csv() at file_path — that's expected.

load_and_clean_text_data <- function(which_wave, which_question) {
  # load survey wave meta data
  wave_meta     <- read_csv(here::here("r", "data", "wave_data.csv"),
                            col_types = cols(.default = col_character()))
  question_meta <- read_csv(here::here("r", "data", "question_data.csv"),
                            col_types = cols(.default = col_character()))

  # Prefix map for free-text question prefixes. PARALLEL to (and partly
  # disjoint from) the prefix_map in rename_variables.R — these cover
  # text-only questions (us006/nuxtxt_, us013/informtxt_, etc.), the
  # rename_variables version covers structured questions. If either map
  # changes, audit the other.
  prefix_map <- c("cs003_"        = "surveycomments_",
                  "qai8a7other_"  = "otheraiuse_",
                  "us001other_"   = "otherplatforms",
                  "us005_"        = "nuxtopic_",
                  "us006_"        = "nuxtxt_",
                  "us009_"        = "bftwtarget_",
                  "us011_"        = "mcxntxt_",
                  "us013_"        = "informtxt_",
                  "us017_"        = "bftwtxt_",
                  "us010_"        = "mcxn_")

  # Look up the UAS survey number for this wave, then load that wave's text CSV
  uas_num   <- wave_meta$uas_num[wave_meta$wave_number == as.character(which_wave)]
  file_path <- here::here("r", "data", "text",
                          paste0("uas", uas_num, "_", which_question, " - c.csv"))

  data <- read_csv(file_path,
                   col_types = cols(.default = col_character())) %>%
    mutate(
      # `wave` is just the argument — no need to grep it back out of uas_num.
      # The original case_when only handled UAS 514..518 (waves 1..5) and
      # silently produced NA for wave 6 (UAS 519), which then propagated
      # to "_wNA" column suffixes downstream. Direct assignment is both
      # simpler and correct for all 6 waves.
      wave = which_wave,
      question_text = question_meta$question[question_meta$question_number == as.character(which_question)],
      variable = gsub("\\[", "_", variablename),
      variable = gsub("\\]", "_", variable),
      # Some text fields arrive with mis-encoded typographic punctuation
      # (curly quotes, ampersand entities). Normalize to plain ASCII.
      answer = str_replace_all(answer, "&quot;", ""),
      answer = str_replace_all(answer, "‚Äú", "\'"),
      answer = str_replace_all(answer, "‚Äù", "\'"),
      answer = str_replace_all(answer, "‚Äô", "\'"),
      answer = str_replace_all(answer, "‚Äò", "\'"),
      answer = str_replace_all(answer, "&amp;", "&")
    ) %>%
    select(-variablename, -ts) %>%
    pivot_wider(id_cols = c(uasid, wave, question_text),
                names_from = variable, values_from = answer)

  # Sanity: wave should always be a single scalar equal to which_wave.
  # Tightened to also reject NA (the original check passed silently for NA).
  wave_numbers <- unique(data$wave)
  if (length(wave_numbers) != 1 || is.na(wave_numbers[1])) {
    stop("Multiple or no wave numbers detected in the dataset.")
  }
  wave_number <- wave_numbers[1]

  # Rename us<N>_<platform_id>_<follow> columns to <prefix><platform>_<follow>_w<wave>.
  # Uses snake_case `platform_slug` from r/clean/utils/platform_map.R so
  # renamed columns are bare-name-safe (e.g., `nuxtxt_twitter_x_w2`).
  # Pair with `platform_label` from the same file when a human-readable
  # name is needed for display.
  names(data) <- lapply(names(data), function(variable_name) {
    if (grepl("^us\\d+_\\d+_", variable_name)) {
      parts       <- unlist(strsplit(variable_name, "_"))
      prefix      <- parts[1]
      platform_id <- parts[2]
      prefix_key  <- paste0(prefix, "_")

      if (is.na(prefix_map[prefix_key])) {
        warning("process_text_data: unknown prefix '", prefix_key,
                "' — column ", variable_name, " will be renamed to NA-prefixed string")
      }

      platform_key      <- as.character(platform_slug[platform_id])
      wave_suffix       <- paste0("_w", wave_number)
      new_variable_name <- paste0(prefix_map[prefix_key], platform_key, wave_suffix)
      return(new_variable_name)
    } else {
      return(variable_name)
    }
  })

  data <- data %>%
    # Concatenate all per-platform free-text responses for this question into
    # one unified_text field per respondent. `contains("txt_")` matches the
    # renamed text columns (nuxtxt_, mcxntxt_, informtxt_, bftwtxt_).
    unite("unified_text",
          contains("txt_"),
          remove = FALSE,
          na.rm  = TRUE,
          sep    = "~nextplat~") %>%
    mutate(
      num_plats_w_response = ifelse(str_detect(unified_text, "~nextplat~"),
                                    1 + str_count(unified_text, "~nextplat~"),
                                    1),
      unified_text = noquote(str_replace_all(unified_text, "~nextplat~", " "))
    )

  return(data)
}
