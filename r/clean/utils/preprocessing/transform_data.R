### load survey data and clean variables ----

# Read one wave's raw CSV and apply the standard cleaning transforms.
# Returns a wide tibble with `wave` and `uasid` always present.
#
# - All paths use here::here() so the function works from any CWD (callers
#   may invoke it from RStudio, from the repo root via Rscript, or from
#   inside r/clean/ — all resolve the same way).
# - Raw values are read as character to keep UAS sentinel codes (".a",
#   ".e", ".c", ".") intact for downstream sentinel-aware processing; the
#   transforms here coerce to numeric / factor as needed.
transform_data <- function(which_wave) {
  # Load survey wave metadata table
  wave_meta <- read_csv(
    here::here("r", "data", "wave_data.csv"),
    show_col_types = FALSE
  )

  uas_num <- wave_meta$uas_num[wave_meta$wave_number == which_wave]
  file_path <- here::here("r", "data", paste0("uas", uas_num, ".csv"))

  # Read the wave's raw CSV. Force all columns to character so the UAS
  # missing-value sentinels (".a", ".e", ".c", ".") are preserved verbatim
  # for downstream recode_sentinels() and the type-specific transforms.
  data <- read_csv(file_path, col_types = cols(.default = col_character()),
                   show_col_types = FALSE) %>%
    mutate(
      wave = which_wave,
      # `final_weight` is the UAS sample weight — always numeric. We read
      # the whole CSV as character to preserve sentinel codes (".a", ".e",
      # ...), so any column expected to be numeric must be coerced
      # explicitly. `uasid` is intentionally kept as character: it is a
      # 9-digit panel ID and coercing to numeric risks precision loss and
      # leading-zero stripping for joins across waves.
      final_weight = as.numeric(final_weight)
    )
  # `wave` is the canonical wave identifier (1..6) parameterized by the
  # function argument. Earlier versions of this function used a six-branch
  # case_when(grepl("514", uas_num) ~ 1, ...) that was functionally
  # equivalent — replaced with the one-liner for clarity. The UAS file
  # number is the source of truth (see wave_data.csv); the internal
  # `wave :=` variable embedded in the survey-flow PDFs is unreliable.

  # Apply transformations
  data <- data %>%
    mutate(across(  # frequency questions (per-platform us002_<plat>_)
      .cols = contains("us002"),
      .fns  = transform_freqs
    )) %>%
    mutate(across(  # experience yes/no questions (per-platform)
      .cols = contains(c("us001s","us003","us004","us005","us007","us008",
                         "us016","us010","us012","us014")) & !contains("order"),
      .fns  = transform_experience_qs
    )) %>%
    mutate(  # derived / demographic / panel-preload columns
      gender             = if ("gender" %in% colnames(data))      transform_gender(gender)                          else NA_character_,
      age                = if ("age" %in% colnames(data))         transform_age(age)                                else NA_character_,
      race               = if (all(c("race", "hisplatino") %in% colnames(data))) transform_race(race, hisplatino)   else NA_character_,
      pol_incl_leaners   = if (all(c("preload_party_affil", "preload_lean_affil") %in% colnames(data)))
                              transform_pol(preload_party_affil, preload_lean_affil)                                 else NA_character_,
      # NOTE: preload_party_affil/preload_lean_affil exist in raw CSVs for
      # W1-W3 only — see docs/data-dictionary.json _meta.phase1_followups
      # ("political-vars-w4-w6-data-gap"). For W4-W6 this conditional is
      # FALSE and pol_incl_leaners is NA for all respondents. That is the
      # correct behavior given the data limitation; the followup is to
      # consider carrying earlier-wave party_affil forward via uasid join
      # in the Phase 3 precompute.
      education                    = if ("education" %in% colnames(data))      transform_edu(education)                       else NA_character_,
      hhincome                     = if ("hhincome" %in% colnames(data))       transform_income(hhincome)                     else NA_character_,
      num_ai_used                  = transform_ai_used(data, which_wave),
      num_sm_used                  = if ("us001" %in% colnames(data))          transform_sm_used(data)                        else NA_integer_,
      political_ideology_self      = if ("rate_self" %in% colnames(data))      as.numeric(rate_self)                          else NA_real_,
      feeling_therm_liberals       = if ("scim_therm_lib" %in% colnames(data))   as.numeric(scim_therm_lib)                   else NA_real_,
      feeling_therm_conservatives  = if ("scim_therm_con" %in% colnames(data))   as.numeric(scim_therm_con)                   else NA_real_,
      comfort_liberal_friends      = if ("scim_friends_lib" %in% colnames(data)) as.numeric(scim_friends_lib)                 else NA_real_,
      comfort_conservative_friends = if ("scim_friends_con" %in% colnames(data)) as.numeric(scim_friends_con)                 else NA_real_,
      # The comfort_*_friends columns now check the SCIM friends column they
      # actually use (was previously gated on scim_therm_lib/con — a copy-
      # paste bug that was latent only because all four SCIM columns coexist
      # in every wave per Phase 1 verification).
      refrained_from_posting       = if ("us014" %in% colnames(data))    recode_sentinels(us014)        else NA_character_,
      vote_2024_preference         = if ("vote2024" %in% colnames(data)) recode_sentinels(vote2024)     else NA_character_,
      regulation_tech_companies    = if ("ex004a" %in% colnames(data))   recode_sentinels(ex004a)       else NA_character_,
      regulation_elections         = if ("ex004b" %in% colnames(data))   recode_sentinels(ex004b)       else NA_character_,
      regulation_protect_users     = if ("ex004c" %in% colnames(data))   recode_sentinels(ex004c)       else NA_character_,
      # All string fields above route through recode_sentinels() so the
      # UAS ".a"/".e"/"."/".c" missing-value sentinels become true NA
      # rather than literal strings. Batch 0 (Phase 2) renamed the columns
      # to match docs/data-dictionary.json clean_variable_name fields;
      # Phase 2 batches 1-4 will convert the string pass-throughs above
      # (refrained_from_posting, vote_2024_preference, regulation_*) into
      # proper ordered factors based on the dictionary's response_type.
    ) %>%
    select(uasid, wave, final_weight, gender, age, race, pol_incl_leaners,
           political_ideology_self,
           feeling_therm_liberals, feeling_therm_conservatives,
           comfort_liberal_friends, comfort_conservative_friends,
           education, hhincome, num_ai_used, num_sm_used,
           refrained_from_posting,
           starts_with("regulation_"), vote_2024_preference,
           starts_with("us0") & !contains("order"),
           -us001,
           -(starts_with(c("us004", "us005", "us008", "us016")) & ends_with(c("_"))))
  # The trailing exclusions drop UAS-internal summary variables (the
  # per-platform "_" suffixed columns and the raw us001 multiselect
  # string, which is no longer needed once num_sm_used has been derived).

  # NOTE: an earlier version of this function had a commented-out line
  # appending "_w<wave>" to every column name as a wide-format hack for
  # downstream cross-wave column-binding. The cryptic trailing comment on
  # that line read "# 4, 5, 8, 16". The actual semantics are unknown — Matt
  # noted on 2026-05-24 that it may have been test scaffolding. Kept here
  # as a tombstone so if anything downstream breaks looking for a "_w<N>"
  # suffixed column, this is the trace.
  #   colnames(data) <- paste0(colnames(data), "_w", which_wave)  # 4,5,8,16

  return(data)
}
