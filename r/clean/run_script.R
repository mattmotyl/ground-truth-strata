# Source all R files in the cleaning utilities tree.
#
# This script DEFINES the cleaning functions (transform_data, rename_variables,
# the transform_* helpers, the platform_slug/platform_label lookups). It does
# NOT invoke the pipeline — callers (an analysis script or a future
# r/clean/clean_all_waves.R driver) source this file and then call
# transform_data(N) themselves.
#
# Paths are resolved via here::here(), so this script works regardless of
# the caller's working directory.

# Load packages explicitly here, so any consumer that sources this file
# inherits a ready-to-use environment. This used to happen implicitly via
# top-level library() calls inside load_packages.R; the File 6 cleanup
# removed those (they would source-fail on any machine missing a package
# and silently break the rest of the pipeline). The set below mirrors the
# trimmed list in load_packages.R::check_packages_and_load().
suppressPackageStartupMessages({
  library(tidyverse)
  library(here)
  library(jsonlite)
})

source_all_files_in_directory <- function(directory) {
  files <- list.files(directory, pattern = "\\.R$", ignore.case = TRUE,
                      full.names = TRUE)
  for (file in files) {
    tryCatch(
      source(file),
      error = function(e) {
        message("[run_script.R] Failed to source ", file, ": ",
                conditionMessage(e))
      }
    )
  }
}

# Source the preprocessing helpers first (transform_*, rename_variables,
# process_text_data) so any later utility files can rely on them.
source_all_files_in_directory(here::here("r", "clean", "utils", "preprocessing"))

# Then the top-level utility files (color, get_moe, platform_map,
# load_packages, etc.). list.files() is non-recursive by default so this
# does NOT re-source the preprocessing files.
source_all_files_in_directory(here::here("r", "clean", "utils"))

# The historical "summary/" directory holding analysis-output scripts from
# the SMI project is intentionally NOT sourced here — those scripts belong
# to a separate workflow that's out of scope for the Strata pipeline.
