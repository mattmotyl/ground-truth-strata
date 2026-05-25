# Build public/data/meta.json — the manifest of waves, platforms, and
# variables consumed by the UI and the downstream build_*.R scripts.
#
# `waves_present_in_data` is derived from the actual cleaned tibble
# (count of non-NA values per wave), not copied from the dictionary's
# `waves_present`. Discrepancies between the two are recorded per
# variable in `presence_discrepancy` so the UI can surface them and so
# downstream build scripts can use the data-derived list of waves.
#
# Invoke:
#   Rscript r/precompute/build_meta.R

suppressPackageStartupMessages({
  library(tidyverse)
  library(here)
  library(jsonlite)
})

# ---- Sink diagnostic log (per Matt's R-output-via-sink convention) ----
audit_dir <- "M:/MM/Websites/strata-local/audit/output"
ts        <- format(Sys.time(), "%Y%m%d_%H%M%S")
sink_path <- if (dir.exists(audit_dir)) {
  file.path(audit_dir, paste0("BUILD_META_", ts, ".txt"))
} else {
  NULL
}
if (!is.null(sink_path)) sink(sink_path, split = TRUE)

tryCatch({

  # ---- Inputs ----
  rds_path <- here("r", "output", "cleaned", "all_waves_long.rds")
  if (!file.exists(rds_path)) {
    stop("Cleaned artifact missing — run r/clean/clean_all_waves.R first.")
  }
  cat("Reading", rds_path, "\n")
  cleaned <- readRDS(rds_path)

  cat("Reading docs/data-dictionary.json\n")
  dict <- read_json(here("docs", "data-dictionary.json"))

  cat("Reading r/data/wave_data.csv\n")
  wave_meta <- read_csv(here("r", "data", "wave_data.csv"), show_col_types = FALSE)

  cat("Sourcing r/clean/utils/platform_map.R\n")
  source(here("r", "clean", "utils", "platform_map.R"), local = TRUE)

  # ---- Platform-indexed prefix lookup (mirrors rename_variables prefix_map) ----
  # Adding a new platform-indexed family means updating BOTH
  # r/clean/utils/preprocessing/rename_variables.R::prefix_map AND this map.
  PLATFORM_PREFIX_MAP <- c(
    "us001"         = "uses",
    "us002"         = "freq",
    "us003"         = "nux",
    "us004"         = "nuximpact",
    "us005"         = "nuxtopic",
    "us007"         = "bftw",
    "us008"         = "bftwimpact",
    "us010"         = "mcxn",
    "us012"         = "useful",
    "us016"         = "bftwtopic",
    "us018a"        = "habit_auto",
    "us018b"        = "habit_think",
    "us018c"        = "habit_pos",
    "us018d"        = "habit_neg",
    "us018e"        = "habit_time",
    "us018f"        = "habit_learn",
    "us018g"        = "habit_rel",
    "us019_hours"   = "time_hrs",
    "us019_minutes" = "time_min",
    "us025"         = "mcxntopic",
    "us026"         = "usefultopic"
  )

  all_cols  <- colnames(cleaned)
  all_waves <- 1:6
  wave_masks <- setNames(lapply(all_waves, function(w) cleaned$wave == w),
                         as.character(all_waves))

  # ---- Helpers ----
  # The DATA SHAPE is platform-indexed if the variable name is in
  # PLATFORM_PREFIX_MAP — regardless of what dict$is_platform_indexed claims.
  # The dict marks us001 (platforms_used) as non-indexed because it is
  # logically one MULTISELECT question, but the data is exploded into
  # `uses_<platform>_w<wave>` columns and Phase 3 needs the data-shape view.
  is_data_platform_indexed <- function(variable_name) {
    !is.na(variable_name) && variable_name %in% names(PLATFORM_PREFIX_MAP)
  }

  find_cleaned_column <- function(variable_name, clean_variable_name) {
    candidates <- unique(c(clean_variable_name, variable_name))
    candidates <- candidates[!is.na(candidates) & nzchar(candidates)]
    hit <- candidates[candidates %in% all_cols]
    if (length(hit) > 0) hit[1] else NA_character_
  }

  find_platform_columns <- function(variable_name) {
    prefix <- PLATFORM_PREFIX_MAP[variable_name]
    if (is.na(prefix)) {
      return(tibble(column = character(0), platform_slug = character(0),
                    wave = integer(0)))
    }
    pattern <- paste0("^", prefix, "_(.+)_w(\\d+)$")
    matched <- grep(pattern, all_cols, value = TRUE)
    if (length(matched) == 0) {
      return(tibble(column = character(0), platform_slug = character(0),
                    wave = integer(0)))
    }
    parsed <- regmatches(matched, regexec(pattern, matched))
    tibble(
      column        = matched,
      platform_slug = vapply(parsed, `[`, character(1), 2),
      wave          = as.integer(vapply(parsed, `[`, character(1), 3))
    )
  }

  compute_waves_present <- function(var_rec) {
    if (is_data_platform_indexed(var_rec$variable_name)) {
      pc <- find_platform_columns(var_rec$variable_name)
      if (nrow(pc) == 0) return(integer(0))
      waves <- integer(0)
      for (w in all_waves) {
        cols_w <- pc$column[pc$wave == w]
        if (length(cols_w) == 0) next
        mask <- wave_masks[[as.character(w)]]
        sub  <- cleaned[mask, cols_w, drop = FALSE]
        if (any(vapply(sub, function(x) any(!is.na(x)), logical(1)))) {
          waves <- c(waves, w)
        }
      }
      sort(waves)
    } else {
      col <- find_cleaned_column(var_rec$variable_name, var_rec$clean_variable_name)
      if (is.na(col)) return(integer(0))
      waves <- integer(0)
      for (w in all_waves) {
        x <- cleaned[[col]][wave_masks[[as.character(w)]]]
        if (any(!is.na(x))) waves <- c(waves, w)
      }
      sort(waves)
    }
  }

  # Variables whose values live in EXPLODED CHILD columns in the raw CSV
  # and are NOT pulled through transform_data's final select() — Phase 3
  # must either re-cleane them or read the raw CSV directly. Per Phase 1
  # followup #10 "battery-expansion-pattern". The dictionary records each
  # of these as ONE logical variable; the raw CSV stores them as multiple
  # children:
  #   ai_used        -> ai_useds1..s14 (W1 MULTISELECT)
  #   q_ai8a_<N>     -> q_ai8a_<N>s1..s14 (per AI tool MULTISELECT)
  #   q_ai11_<N>     -> q_ai11_<N>a..n   (per AI tool LIKERT_5 battery)
  #   q_ai13_<N>     -> q_ai13_<N>a..m   (per AI tool LIKERT_5 battery)
  #   gms00<N>       -> gms00<N>s1..sX   (W6 context MULTISELECTs)
  NEEDS_EXPANSION_FROM_RAW <- c(
    "ai_used",
    paste0("q_ai8a_", 1:7),
    paste0("q_ai11_", 1:7),
    paste0("q_ai13_", 1:7),
    paste0("gms00",  1:5)
  )

  # Categorize each variable for downstream consumers and for triaging
  # discrepancy noise. STRING_OPEN lives in separate PII-scrubbed text
  # files (per Phase 1 followup "free-text-storage-location") — expected
  # absent from main CSV.
  classify_data_availability <- function(var_rec, waves_data, cleaned_column) {
    if (identical(var_rec$response_type, "STRING_OPEN")) {
      return("external_text_files")
    }
    if (var_rec$variable_name %in% NEEDS_EXPANSION_FROM_RAW) {
      return("needs_expansion_from_raw")
    }
    if (isTRUE(var_rec$is_platform_indexed) &&
        !is_data_platform_indexed(var_rec$variable_name)) {
      return("needs_runtime_expansion")
    }
    if (length(waves_data) > 0) return("in_cleaned_csv")
    "missing"
  }

  # ---- Build waves array (augment with n_in_cleaned) ----
  cleaned_n_per_wave <- cleaned |>
    count(wave, name = "n_in_cleaned") |>
    mutate(wave = as.integer(wave))

  waves_out <- wave_meta |>
    transmute(
      wave        = as.integer(wave_number),
      uas_num     = as.integer(uas_num),
      dates       = wave_dates,
      targeted_n  = as.integer(targeted_N),
      completed_n = as.integer(completed_N)
    ) |>
    left_join(cleaned_n_per_wave, by = "wave") |>
    arrange(wave)

  # ---- Build platforms array ----
  platforms_out <- tibble(
    code  = as.integer(names(platform_slug)),
    slug  = unname(platform_slug),
    label = unname(platform_label[names(platform_slug)])
  ) |>
    arrange(code)

  # ---- Build variables array ----
  cat("Computing per-variable waves_present_in_data...\n")
  t0 <- Sys.time()
  variables_out <- lapply(dict$variables, function(v) {
    waves_dict <- if (is.null(v$waves_present)) integer(0)
                  else as.integer(unlist(v$waves_present))
    waves_data <- compute_waves_present(v)

    cleaned_column <- if (is_data_platform_indexed(v$variable_name)) {
      paste0(PLATFORM_PREFIX_MAP[v$variable_name], "_<platform_slug>_w<wave>")
    } else {
      find_cleaned_column(v$variable_name, v$clean_variable_name)
    }

    data_availability <- classify_data_availability(v, waves_data, cleaned_column)

    # Only flag a discrepancy for variables that are EXPECTED to be in the
    # cleaned CSV. STRING_OPEN (external text files) and needs_runtime_expansion
    # (q_ai8a / q_ai11_N / q_ai13_N) are known not-in-main-CSV by design.
    presence_discrepancy <- if (data_availability != "in_cleaned_csv") {
      NULL
    } else {
      dict_only <- setdiff(waves_dict, waves_data)
      data_only <- setdiff(waves_data, waves_dict)
      if (length(dict_only) == 0 && length(data_only) == 0) {
        NULL
      } else {
        paste0(
          if (length(dict_only) > 0)
            paste0("dict_only=[", paste(dict_only, collapse = ","), "]")
          else "",
          if (length(dict_only) > 0 && length(data_only) > 0) "; " else "",
          if (length(data_only) > 0)
            paste0("data_only=[", paste(data_only, collapse = ","), "]")
          else ""
        )
      }
    }

    list(
      variable_name             = v$variable_name,
      clean_variable_name       = v$clean_variable_name,
      cleaned_column            = cleaned_column,
      construct                 = v$construct,
      domain                    = v$domain,
      response_type             = v$response_type,
      response_options          = v$response_options,
      is_platform_indexed       = is_data_platform_indexed(v$variable_name),
      dict_is_platform_indexed  = isTRUE(v$is_platform_indexed),
      platform_codes_applicable = v$platform_codes_applicable,
      is_reverse_coded          = isTRUE(v$is_reverse_coded),
      out_of_range_codes        = v$out_of_range_codes,
      waves_present_in_dict     = I(waves_dict),
      waves_present_in_data     = I(waves_data),
      data_availability         = data_availability,
      presence_discrepancy      = presence_discrepancy
    )
  })
  cat(sprintf("  done in %.1fs\n",
              as.numeric(difftime(Sys.time(), t0, units = "secs"))))

  # ---- Summary diagnostics ----
  avail_counts <- table(vapply(variables_out,
                               function(v) v$data_availability, character(1)))
  cat("\nVariables total:                            ", length(variables_out), "\n", sep = "")
  cat("  by data_availability:\n")
  for (cat_name in names(avail_counts)) {
    cat(sprintf("    %-25s %d\n", cat_name, avail_counts[[cat_name]]))
  }
  cat(sprintf("  platform-indexed (data-shape):            %d\n",
              sum(vapply(variables_out, function(v) v$is_platform_indexed, logical(1)))))
  cat(sprintf("  non-platform (data-shape):                %d\n",
              sum(vapply(variables_out, function(v) !v$is_platform_indexed, logical(1)))))

  disc <- Filter(function(v) !is.null(v$presence_discrepancy), variables_out)
  cat(sprintf("\nReal presence discrepancies (in_cleaned_csv with wave gaps): %d\n",
              length(disc)))
  if (length(disc) > 0) {
    cat("All discrepancies:\n")
    for (v in disc) {
      cat(sprintf("  [%s] %-20s (%s): %s\n",
                  v$response_type, v$variable_name, v$clean_variable_name,
                  v$presence_discrepancy))
    }
  }

  # ---- Assemble + write ----
  meta_obj <- list(
    generated_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%S"),
    `_meta`      = list(
      generated_by       = "r/precompute/build_meta.R",
      source_data        = "r/output/cleaned/all_waves_long.rds",
      source_dictionary  = "docs/data-dictionary.json",
      presence_rule      = paste(
        "waves_present_in_data is derived from the cleaned .rds: a variable",
        "is 'present in wave W' if its column(s) have >=1 non-NA value when",
        "filtered to wave==W. For platform-indexed variables, presence in",
        "wave W = any platform-suffixed column for that variable has >=1",
        "non-NA in wave W."
      ),
      cell_floor         = 30L,
      suppression_policy = "Cells with n < cell_floor are emitted with NA values and suppressed:true (not omitted).",
      data_availability_legend = list(
        in_cleaned_csv          = "Variable's cleaned column(s) exist in the .rds and have data — ready for build_*.R.",
        external_text_files     = "STRING_OPEN free-response item stored in separate PII-scrubbed per-question files outside the main CSV. Out of scope for numeric/categorical precompute.",
        needs_expansion_from_raw = paste(
          "Logical variable in dict whose values live as EXPLODED CHILD columns",
          "(q_ai*_<N>[a-z], q_ai8a_<N>s<opt>, gms00<N>s<opt>, ai_useds<opt>)",
          "in the raw CSV. transform_data does NOT pull these children, so they",
          "are absent from the cleaned .rds. Phase 3 builders that need these",
          "(correlations for MULTISELECT options) will have to either re-cleane",
          "from raw or extend r/clean/clean_all_waves.R to keep them. Tracked",
          "by Phase 1 followup #10 'battery-expansion-pattern'."
        ),
        needs_runtime_expansion = "Variable dict-marked is_platform_indexed=TRUE but not in the cleaning layer's prefix_map — non-standard naming requiring runtime expansion.",
        missing                 = "Variable expected in cleaned .rds but no matching column found. Indicates a real cleaning-layer gap to investigate."
      )
    ),
    waves     = waves_out,
    platforms = platforms_out,
    variables = variables_out
  )

  out_path <- here("public", "data", "meta.json")
  dir.create(dirname(out_path), showWarnings = FALSE, recursive = TRUE)
  write_json(meta_obj, out_path,
             auto_unbox = TRUE, na = "null", null = "null", pretty = FALSE)
  size_kb <- file.info(out_path)$size / 1024
  cat(sprintf("\nWrote %s (%.1f KB)\n", out_path, size_kb))

}, error = function(e) {
  cat("\n[FAIL] ", conditionMessage(e), "\n", sep = "")
}, finally = {
  while (sink.number() > 0) sink()
})
