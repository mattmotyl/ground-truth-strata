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

source(here::here("r", "precompute", "utils", "exclusions.R"))
source(here::here("r", "precompute", "utils", "transforms.R"))

# ── Output exclusions ──────────────────────────────────────────────
# These exclusions apply to JSON output only. They do NOT affect the
# cleaned .rds files or the R cleaning scripts.
# Re-including any of these in a future release is a one-line change.

EXCLUDED_DOMAINS <- c(
  "AI_ATTITUDES"        # W4+ data unavailable; W1-W3 alone would mislead
)

EXCLUDED_VARIABLES <- c(
  # Time-spent items — sparse (us019 absent W6; W4-W5 only)
  "us019_hours", "us019_minutes",

  # Conditional follow-up items — only valid in conditional_breakdowns.json.
  # These are asked only of respondents who answered the parent question
  # affirmatively (e.g., us004 only if us003 = yes). Including them in
  # general correlations/trends would compute estimates on a selected
  # subgroup, not the full sample, producing misleading results.
  "us004", "us005",     # negative experience: impact + topic
  "us008", "us016",     # bad for world: impact + topic
  "us025", "us026",     # meaningful connection + useful: topic

  # In-person experience items (us020-us024) intentionally included.
  # These are the in-person counterparts to platform-indexed experience
  # items (us002/us003/us007/us010/us012) and appear only in W5-W6.
  # Build scripts derive waves_present_in_data from the cleaned tibble
  # so only W5-W6 rows will be emitted — no change needed elsewhere.

  # Administrative / sampling variables
  "citizenus", "statereside", "primary_respondent",
  "bornus", "stateborn", "language", "dateofbirth_year",
  "regis", "cs_001"
)

# Variables excluded from specific outputs only — not globally excluded.
# us001 (platform use, binary) is excluded from trends.json and
# group_comparisons.json because platform_rates.json already covers
# usage rates. It is INCLUDED in correlations.json — see Step 1a.
EXCLUDED_VARIABLES_TRENDS <- c(EXCLUDED_VARIABLES, "us001")
EXCLUDED_VARIABLES_GROUP_COMPARISONS <- c(EXCLUDED_VARIABLES, "us001")
EXCLUDED_VARIABLES_CORRELATIONS <- EXCLUDED_VARIABLES  # us001 intentionally kept

EXCLUDED_SUFFIXES <- c(
  "_other"              # free-text 'other specify' captures — out of scope
)

EXCLUDED_TYPES <- c(
  "STRING_OPEN"         # catches any open-text variables not already excluded
)
# ── End exclusions ─────────────────────────────────────────────────

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
  cleaned <- apply_reverse_coding(cleaned)
  cleaned <- derive_loneliness(cleaned)

  cat("Reading docs/data-dictionary.json\n")
  dict <- read_json(here("docs", "data-dictionary.json"))

  cat("Reading r/data/wave_data.csv\n")
  wave_meta <- read_csv(here("r", "data", "wave_data.csv"), show_col_types = FALSE)

  cat("Sourcing r/clean/utils/platform_map.R\n")
  source(here("r", "precompute", "utils", "platform_map.R"), local = TRUE)

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
    "us019_hours"    = "time_hrs",
    "us019_minutes"  = "time_min",
    "us019_time_min" = "time_min_total",
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

  # Compute waves_present given a vector of cleaned-tibble column names.
  # A wave is present if ANY of those columns has >=1 non-NA in that wave.
  waves_present_for_cols <- function(cols) {
    cols <- cols[cols %in% all_cols]
    if (length(cols) == 0) return(integer(0))
    waves <- integer(0)
    for (w in all_waves) {
      mask <- wave_masks[[as.character(w)]]
      sub  <- cleaned[mask, cols, drop = FALSE]
      if (any(vapply(sub, function(x) any(!is.na(x)), logical(1)))) {
        waves <- c(waves, w)
      }
    }
    sort(waves)
  }

  compute_waves_present <- function(var_rec, exp_class = NULL) {
    if (!is.null(exp_class)) {
      target_cols <- if (!is.null(exp_class$expansion_columns) &&
                         length(exp_class$expansion_columns) > 0) {
        exp_class$expansion_columns
      } else if (!is.na(exp_class$cleaned_column)) {
        exp_class$cleaned_column
      } else {
        character(0)
      }
      return(waves_present_for_cols(target_cols))
    }
    if (is_data_platform_indexed(var_rec$variable_name)) {
      pc <- find_platform_columns(var_rec$variable_name)
      return(waves_present_for_cols(pc$column))
    }
    col <- find_cleaned_column(var_rec$variable_name, var_rec$clean_variable_name)
    if (is.na(col)) return(integer(0))
    waves_present_for_cols(col)
  }

  # Variables whose values live in EXPLODED CHILD columns in the raw CSV
  # — clean_all_waves.R now pulls these (per Phase 3 expansion decision
  # 2026-05-25, Option B):
  #
  #   MULTISELECTs kept as binary option children in the cleaned tibble:
  #     ai_used        -> ai_useds<opt>     (W1)
  #     q_ai8a_<N>     -> q_ai8a_<N>s<opt>  (per AI tool MULTISELECT, W2-3)
  #     gms00<N>       -> gms00<N>s<opt>    (W6 context MULTISELECTs)
  #
  #   LIKERT_5 batteries aggregated to per-AI-tool means:
  #     q_ai11_<N>     -> q_ai11_<N>_mean   (usefulness, W2-3)
  #     q_ai13_<N>     -> q_ai13_<N>_mean   (harmfulness, W2-3)
  #
  # The list below remains useful for documentation. classify_expansion()
  # detects which expansion has actually landed in the cleaned tibble and
  # produces the right data_availability / cleaned_column / expansion_columns.
  NEEDS_EXPANSION_FROM_RAW <- c(
    "ai_used",
    paste0("q_ai8a_", 1:7),
    paste0("q_ai11_", 1:7),
    paste0("q_ai13_", 1:7),
    paste0("gms00",  1:5)
  )

  # Detect MULTISELECT exploded children or aggregated battery means in
  # the cleaned tibble. Returns NULL if not an expansion variable; else
  # a list with $data_availability + $cleaned_column + $expansion_columns.
  classify_expansion <- function(var_rec) {
    vn <- var_rec$variable_name
    if (vn == "ai_used") {
      kids <- grep("^ai_useds\\d+$", all_cols, value = TRUE)
      if (length(kids) > 0) {
        return(list(data_availability = "in_cleaned_csv_exploded",
                    cleaned_column    = NA_character_,
                    expansion_columns = kids))
      }
    }
    if (grepl("^q_ai8a_\\d+$", vn)) {
      n <- sub("^q_ai8a_(\\d+)$", "\\1", vn)
      kids <- grep(paste0("^q_ai8a_", n, "s\\d+$"), all_cols, value = TRUE)
      if (length(kids) > 0) {
        return(list(data_availability = "in_cleaned_csv_exploded",
                    cleaned_column    = NA_character_,
                    expansion_columns = kids))
      }
    }
    if (grepl("^gms00\\d+$", vn)) {
      n <- sub("^gms00(\\d+)$", "\\1", vn)
      kids <- grep(paste0("^gms00", n, "s\\d+$"), all_cols, value = TRUE)
      if (length(kids) > 0) {
        return(list(data_availability = "in_cleaned_csv_exploded",
                    cleaned_column    = NA_character_,
                    expansion_columns = kids))
      }
    }
    if (grepl("^q_ai1[13]_\\d+$", vn)) {
      mean_col <- paste0(vn, "_mean")
      if (mean_col %in% all_cols) {
        return(list(data_availability = "in_cleaned_csv",
                    cleaned_column    = mean_col,
                    expansion_columns = NULL,
                    aggregation_note  = "per-AI-tool rowMeans across LIKERT_5 sub-items a..n (raw children dropped)"))
      }
    }
    NULL
  }

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

    # Expansion path first — if children landed in the cleaned tibble,
    # use those to populate cleaned_column / expansion_columns / waves_data.
    exp_class <- classify_expansion(v)
    waves_data <- compute_waves_present(v, exp_class)

    cleaned_column <- if (!is.null(exp_class)) {
      exp_class$cleaned_column
    } else if (is_data_platform_indexed(v$variable_name)) {
      paste0(PLATFORM_PREFIX_MAP[v$variable_name], "_<platform_slug>_w<wave>")
    } else {
      find_cleaned_column(v$variable_name, v$clean_variable_name)
    }

    data_availability <- if (!is.null(exp_class)) {
      exp_class$data_availability
    } else {
      classify_data_availability(v, waves_data, cleaned_column)
    }

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
      expansion_columns         = if (!is.null(exp_class) &&
                                       !is.null(exp_class$expansion_columns))
                                    I(exp_class$expansion_columns)
                                  else NULL,
      aggregation_note          = if (!is.null(exp_class))
                                    exp_class$aggregation_note
                                  else NULL,
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

  # ---- Apply output exclusions (Step 1) — flag, don't drop ----
  # Excluded variables stay in meta.json so consumers like
  # build_conditional_breakdowns.R can still find their response_options.
  # Downstream build scripts (trends, platform_rates, group_comparisons,
  # correlations, distributions) skip flagged variables via
  # !isTRUE(v$excluded_from_outputs). Per-script vectors
  # (EXCLUDED_VARIABLES_TRENDS adds us001, etc.) still apply on top of
  # the flag — see the per-script Filter() calls.
  #
  # us001 is intentionally NOT flagged here — it stays available for
  # build_platform_rates and build_correlations (the latter derives the
  # platform_user_<slug> binaries from it).
  reasons <- vapply(variables_out, function(v) {
    exclusion_reason(v, EXCLUDED_VARIABLES, EXCLUDED_DOMAINS,
                     EXCLUDED_SUFFIXES, EXCLUDED_TYPES)
  }, character(1))

  variables_out <- Map(function(v, r) {
    v$excluded_from_outputs <- nzchar(r)
    v$exclusion_reason      <- if (nzchar(r)) r else NULL
    v
  }, variables_out, reasons)

  n_flagged <- sum(nzchar(reasons))
  cat(sprintf("\nExclusions applied: flagged %d of %d variables as excluded_from_outputs.\n",
              n_flagged, length(variables_out)))
  if (n_flagged > 0) {
    flagged_reasons <- reasons[nzchar(reasons)]
    rule_table <- table(flagged_reasons)
    cat("Flagged variables by rule:\n")
    for (rule in sort(names(rule_table))) {
      cat(sprintf("  %-22s %d\n", rule, as.integer(rule_table[[rule]])))
    }
    cat("Flagged variables (detail):\n")
    for (v in variables_out) {
      if (isTRUE(v$excluded_from_outputs)) {
        cat(sprintf("  [%-20s] %-30s (%s)\n",
                    v$exclusion_reason, v$variable_name,
                    if (!is.null(v$construct)) v$construct else ""))
      }
    }
  }

  # ---- Append derived variables (Step D) ----
  # Variables that aren't in the dictionary but are computed at
  # data-load time by r/precompute/utils/transforms.R. They need
  # synthetic meta records so downstream build scripts (which iterate
  # meta$variables) pick them up via the same scope predicates that
  # govern dict variables.
  #
  # Convention: derived records have `is_derived = TRUE` and a
  # `question_text` field carrying the human-readable definition of
  # the derived value. Dict-sourced records do NOT carry these fields
  # (the canonical question text for dict variables lives in
  # question-texts.json, built separately from data-dictionary.csv).
  # Consumers should treat missing `is_derived` as FALSE.
  if ("ex003_lonely" %in% all_cols) {
    waves_lonely <- waves_present_for_cols("ex003_lonely")
    ex003_lonely_rec <- list(
      variable_name             = "ex003_lonely",
      clean_variable_name       = "ex003_lonely",
      cleaned_column            = "ex003_lonely",
      expansion_columns         = NULL,
      aggregation_note          = paste(
        "Derived in r/precompute/utils/transforms.R::derive_loneliness().",
        "Binary: 1 if as.integer(ex003a) + as.integer(ex003b) +",
        "as.integer(ex003c) >= 6, else 0. UCLA 3-item loneliness",
        "scoring; available W2, W5, W6 only."
      ),
      construct                 = "Loneliness (UCLA 3-item, binary)",
      domain                    = "LONELINESS",
      response_type             = "BINARY_YESNO",
      response_options          = list("0" = "Not lonely",
                                       "1" = "Lonely"),
      is_platform_indexed       = FALSE,
      dict_is_platform_indexed  = FALSE,
      platform_codes_applicable = NULL,
      is_reverse_coded          = FALSE,
      out_of_range_codes        = NULL,
      waves_present_in_dict     = I(integer(0)),
      waves_present_in_data     = I(waves_lonely),
      data_availability         = "in_cleaned_csv",
      presence_discrepancy      = NULL,
      excluded_from_outputs     = FALSE,
      exclusion_reason          = NULL,
      is_derived                = TRUE,
      question_text             = "Lonely (sum of ex003a + ex003b + ex003c >= 6)"
    )
    variables_out[[length(variables_out) + 1]] <- ex003_lonely_rec
    cat(sprintf("Appended derived variable: ex003_lonely (waves_present_in_data = [%s])\n",
                paste(waves_lonely, collapse = ",")))
  } else {
    cat("[WARN] ex003_lonely not found in cleaned tibble; transforms.R::derive_loneliness may not have run. Skipping the derived meta record.\n")
  }

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
        in_cleaned_csv          = "Variable's cleaned_column exists in the .rds with data. Build scripts use cleaned_column directly.",
        in_cleaned_csv_exploded = "Variable is a MULTISELECT whose option binaries landed in the cleaned .rds as expansion_columns (one per option). Build scripts should iterate expansion_columns and treat each as a binary input.",
        external_text_files     = "STRING_OPEN free-response item stored in separate PII-scrubbed per-question files outside the main CSV. Out of scope for numeric/categorical precompute.",
        needs_expansion_from_raw = "Logical variable in dict whose values live as EXPLODED CHILD columns in the raw CSV that the cleaning pipeline does not pull. As of the 2026-05-25 expansion pass these should all be reclassified as in_cleaned_csv or in_cleaned_csv_exploded; any remaining entries here would indicate a regression.",
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
