# Rename platform-indexed raw column names to a more analysis-friendly
# form: <prefix>_<platform>_<follow>_w<wave>. The mapping below covers
# every platform-indexed family present in the cleaned output of
# transform_data() across all 6 waves.
#
# Three column shapes are supported:
#   1. us001sN              — the original "did you use platform N" multiselect flag
#   2. us<digits>_<plat>_<follow?>            — the W1+ per-platform batteries
#                                                (us002, us003, us004, us005, us007, us008,
#                                                 us010, us012, us016, us025, us026)
#   3. us<digits><letter>_<plat>_             — the W4+ habit/attitude scale (us018a..g)
#   4. us<digits>_<word>_<plat>_              — the W4+ time-spent battery
#                                                (us019_hours, us019_minutes)
#
# An optional add_suffix_to_demographics flag also appends _w<wave> to
# selected derived demographic columns that vary across waves.
rename_variables <- function(data, add_suffix_to_demographics = FALSE) {

  # Semantic prefix per raw-column family. Adding a new platform-indexed
  # family means adding an entry here AND, if it doesn't already match
  # one of the four supported shapes, adding a regex branch below.
  prefix_map <- c(
    # original W1+ batteries
    "us001_"        = "uses_",         # did you use this platform
    "us002_"        = "freq_",         # platform-use frequency
    "us003_"        = "nux_",          # personal negative experience yes/no
    "us004_"        = "nuximpact_",    # impact of negative experience (multiselect)
    "us005_"        = "nuxtopic_",     # topic of negative experience (multiselect)
    "us007_"        = "bftw_",         # bad-for-the-world content yes/no
    "us008_"        = "bftwimpact_",   # impact of bad-for-the-world content (multiselect)
    "us010_"        = "mcxn_",         # meaningful connection yes/no
    "us012_"        = "useful_",       # learned-something-useful yes/no
    "us016_"        = "bftwtopic_",    # topic of bad-for-the-world content
    # W4+ habit / attitude scale (us018a-g asked once per platform)
    "us018a_"       = "habit_auto_",     # "...that I do automatically"
    "us018b_"       = "habit_think_",    # "...that I do without thinking"
    "us018c_"       = "habit_pos_",      # "...that has a positive effect on me"
    "us018d_"       = "habit_neg_",      # "...that has a negative effect on me"
    "us018e_"       = "habit_time_",     # "...that I spend too much time using"
    "us018f_"       = "habit_learn_",    # "...that facilitates my learning and growth"
    "us018g_"       = "habit_rel_",      # "...that strengthens and supports my relationships"
    # W4+ time-spent per-platform
    "us019_hours_"  = "time_hrs_",
    "us019_minutes_"= "time_min_",
    # W6+ topic follow-ups for meaningful connection and useful learning
    "us025_"        = "mcxntopic_",
    "us026_"        = "usefultopic_"
  )

  # Demographic columns that vary across waves and should optionally get
  # a _w<N> suffix for cross-wave column-binding.
  wave_varying_demographics <- c(
    "pol_incl_leaners", "conservatism",
    "warmth_lib", "warmth_con", "warmth_friend_lib", "warmth_friend_con",
    "num_ai_used", "num_sm_used",
    "felt_silenced", "vote",
    "atts_gov_reg_tech", "atts_tech_election", "atts_tech_harm"
  )

  wave_numbers <- unique(data$wave)
  if (length(wave_numbers) != 1) {
    stop("Multiple or no wave numbers detected in the dataset. ",
         "rename_variables() operates on a single wave at a time.")
  }
  wave_number <- wave_numbers[1]
  wave_suffix <- paste0("_w", wave_number)

  # Helper: look up a prefix in prefix_map; if missing, raise so we never
  # silently produce a "NA<platform>" column name (the Wave 6 bug that
  # prompted this audit).
  resolve_prefix <- function(prefix_key) {
    out <- prefix_map[prefix_key]
    if (is.na(out)) {
      stop("rename_variables: no entry in prefix_map for '", prefix_key,
           "'. Add it to prefix_map at the top of this file.")
    }
    out
  }

  new_names <- vapply(names(data), function(variable_name) {

    # 1) us001sN -> uses_<platform>_w<wave>
    if (grepl("^us001s\\d+$", variable_name)) {
      platform_id <- sub("^us001s(\\d+)$", "\\1", variable_name)
      return(paste0(resolve_prefix("us001_"),
                    as.character(platform_slug[platform_id]),
                    wave_suffix))
    }

    # 3) us<digits><letter>_<plat>_  (us018a-g)
    if (grepl("^us\\d+[a-z]_\\d+_$", variable_name)) {
      m <- regmatches(variable_name,
                      regexec("^(us\\d+[a-z])_(\\d+)_$", variable_name))[[1]]
      prefix_key  <- paste0(m[2], "_")
      platform_id <- m[3]
      return(paste0(resolve_prefix(prefix_key),
                    as.character(platform_slug[platform_id]),
                    wave_suffix))
    }

    # 4) us<digits>_<word>_<plat>_  (us019_hours, us019_minutes)
    if (grepl("^us\\d+_[a-z]+_\\d+_$", variable_name)) {
      m <- regmatches(variable_name,
                      regexec("^(us\\d+_[a-z]+)_(\\d+)_$", variable_name))[[1]]
      prefix_key  <- paste0(m[2], "_")
      platform_id <- m[3]
      return(paste0(resolve_prefix(prefix_key),
                    as.character(platform_slug[platform_id]),
                    wave_suffix))
    }

    # 2) us<digits>_<plat>_<follow?>  (us002-us016, us025, us026)
    if (grepl("^us\\d+_\\d+_", variable_name)) {
      parts       <- unlist(strsplit(variable_name, "_"))
      prefix      <- parts[1]
      platform_id <- parts[2]
      follow      <- parts[3]
      prefix_key  <- paste0(prefix, "_")
      follow_key  <- if (!is.na(follow) && nchar(follow) > 0) paste0("_", follow) else ""
      return(paste0(resolve_prefix(prefix_key),
                    as.character(platform_slug[platform_id]),
                    follow_key, wave_suffix))
    }

    # Demographic wave-suffix path (only when explicitly requested)
    if (isTRUE(add_suffix_to_demographics) &&
        variable_name %in% wave_varying_demographics) {
      return(paste0(variable_name, wave_suffix))
    }

    variable_name
  }, character(1), USE.NAMES = FALSE)

  # Collision guard. The original implementation would silently emit
  # duplicate column names (e.g., when prefix_map was missing entries the
  # NA-prepended names collided across the us025/us026 families). Fail
  # loud rather than silently produce a corrupted data frame.
  if (anyDuplicated(new_names) > 0) {
    dupes <- unique(new_names[duplicated(new_names)])
    stop("rename_variables produced duplicate column names: ",
         paste(dupes, collapse = ", "))
  }

  names(data) <- new_names
  data
}
