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
    mutate(across(  # LIKERT_3 — UCLA loneliness short scale (W2, W5, W6)
      .cols = any_of(c("ex003a", "ex003b", "ex003c")),
      .fns  = transform_likert3_loneliness
    )) %>%
    mutate(across(  # LIKERT_4 — DASS depression/anxiety scale (W1 only)
      .cols = any_of(c("ds001a", "ds001b", "ds001c", "ds001d", "ds001e", "ds001f")),
      .fns  = transform_likert4_dass
    )) %>%
    # ----- Phase 2 Batch 2: LIKERT_5 batteries (variable per wave) -----
    mutate(across(  # social media beliefs (sc001a-f) + usage patterns (ex002a-c)
      .cols = any_of(c("sc001a", "sc001b", "sc001c", "sc001d", "sc001e", "sc001f",
                       "ex002a", "ex002b", "ex002c")),
      .fns  = transform_likert5_agree_dnd
    )) %>%
    mutate(across(  # AI governance agreement (ex006a-d) — W6
      .cols = any_of(c("ex006a", "ex006b", "ex006c", "ex006d")),
      .fns  = transform_likert5_agree_somewhat
    )) %>%
    mutate(across(  # institutional trust (ins001a-h) — W1
      .cols = any_of(paste0("ins001", letters[1:8])),
      .fns  = transform_likert5_amount
    )) %>%
    mutate(across(  # perceived harm of AI tools (q_ai13_1..7)
      .cols = any_of(paste0("q_ai13_", 1:7)),
      .fns  = transform_likert5_harm
    )) %>%
    mutate(across(  # perceived usefulness of AI tools (q_ai11_1..7)
      .cols = any_of(paste0("q_ai11_", 1:7)),
      .fns  = transform_likert5_useful
    )) %>%
    mutate(across(  # AI effect concern<->excited (ai_effect_a..g) — W1; "No opinion" OOR
      .cols = any_of(paste0("ai_effect_", letters[1:7])),
      .fns  = transform_likert5_concern_excite
    )) %>%
    mutate(across(  # AI governance support (ex005a-c) — W6
      .cols = any_of(c("ex005a", "ex005b", "ex005c")),
      .fns  = transform_likert5_support
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
      # Phase 2 Batch 1 converted ex004b/c (LIKERT_3 more/less). Batch 2
      # converts ex004a (LIKERT_5 amount-of-regulation).
      regulation_tech_companies    = if ("ex004a" %in% colnames(data))   transform_likert5_more_less_amount(ex004a) else factor(NA, levels = c("Much less than they are now","A little less than they are now","The same as they are now","A little more than they are now","Much more than they are now"), ordered = TRUE),
      regulation_elections         = if ("ex004b" %in% colnames(data))   transform_likert3_more_less(ex004b)    else factor(NA, levels = c("Less", "Keep doing what they are now", "More"), ordered = TRUE),
      regulation_protect_users     = if ("ex004c" %in% colnames(data))   transform_likert3_more_less(ex004c)    else factor(NA, levels = c("Less", "Keep doing what they are now", "More"), ordered = TRUE),
      # LIKERT_4 sm_wake_to_check (ex001) — W2 only.
      sm_wake_to_check             = if ("ex001" %in% colnames(data))    transform_likert4_freq(ex001)          else factor(NA, levels = c("Rarely or never", "Some of the time", "Frequently", "Always or almost always"), ordered = TRUE),
      # Phase 2 Batch 2: LIKERT_5 singletons (names per dictionary).
      ai_concern                   = if ("ai_concerned" %in% colnames(data)) transform_likert5_concerned_no_opinion(ai_concerned) else factor(NA, levels = c("Very concerned","Somewhat concerned","Not very concerned","Not at all concerned"), ordered = TRUE),
      ai_excitement                = if ("ai_excited"   %in% colnames(data)) transform_likert5_excited_no_opinion(ai_excited)     else factor(NA, levels = c("Very excited","Somewhat excited","Not very excited","Not at all excited"), ordered = TRUE),
      ai_xr_excitement             = if ("q_ai13"       %in% colnames(data)) transform_likert5_excite_only(q_ai13)                 else factor(NA, levels = c("Not at all excited","Not very excited","Somewhat excited","Very excited","Extremely excited"), ordered = TRUE),
      ai_xr_concern                = if ("q_ai14"       %in% colnames(data)) transform_likert5_concern_only(q_ai14)                else factor(NA, levels = c("Not at all concerned","Not very concerned","Somewhat concerned","Very concerned","Extremely concerned"), ordered = TRUE),
      survey_interest              = if ("cs_001"       %in% colnames(data)) transform_likert5_interesting(cs_001)                 else factor(NA, levels = c("Very interesting","Interesting","Neither interesting nor uninteresting","Uninteresting","Very uninteresting"), ordered = TRUE),
    ) %>%
    select(uasid, wave, final_weight, gender, age, race, pol_incl_leaners,
           political_ideology_self,
           feeling_therm_liberals, feeling_therm_conservatives,
           comfort_liberal_friends, comfort_conservative_friends,
           education, hhincome, num_ai_used, num_sm_used,
           refrained_from_posting,
           starts_with("regulation_"), vote_2024_preference,
           sm_wake_to_check,
           # Phase 2 Batch 1: LIKERT_3/4 batteries
           any_of(c("ex003a", "ex003b", "ex003c")),
           any_of(c("ds001a", "ds001b", "ds001c", "ds001d", "ds001e", "ds001f")),
           # Phase 2 Batch 2: LIKERT_5 batteries
           any_of(c("sc001a","sc001b","sc001c","sc001d","sc001e","sc001f",
                    "ex002a","ex002b","ex002c",
                    "ex006a","ex006b","ex006c","ex006d",
                    "ex005a","ex005b","ex005c")),
           any_of(paste0("ins001", letters[1:8])),
           any_of(paste0("q_ai11_", 1:7)),
           any_of(paste0("q_ai13_", 1:7)),
           any_of(paste0("ai_effect_", letters[1:7])),
           # Phase 2 Batch 2: LIKERT_5 singletons
           ai_concern, ai_excitement, ai_xr_excitement, ai_xr_concern, survey_interest,
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
