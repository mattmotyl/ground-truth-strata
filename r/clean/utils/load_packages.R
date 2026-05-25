# Package loader for the Strata cleaning pipeline.
#
# IMPORTANT: this file MUST NOT have any top-level side effects.
# run_script.R sources every .R file in utils/ at startup; any
# top-level library() / font_add() / file-read would source-fail on a
# fresh checkout and silently break the rest of the pipeline (see
# File 1 + File 6 audit). All loading is done explicitly via
# check_packages_and_load() — call it from your driver script.

check_packages_and_load <- function() {
  # Trimmed to packages the Strata cleaning pipeline actually uses.
  # The dropped packages (kableExtra, webshot/webshot2, magick,
  # extrafont/extrafontdb, showtext/showtextdb) were only needed for
  # the legacy USC-branded HTML report production
  # (create_pretty_table_showing_change_over_time.R). The Phase 3
  # precompute writes JSON; the Next.js UI will use system / web
  # fonts; neither needs the typesetting stack.
  packages <- c(
    "tidyverse",  # data manipulation
    "here",       # CWD-independent paths
    "jsonlite",   # data dictionary + Phase 3 precompute artifacts
    "ggrepel",    # plot label de-overlap (kept for any future built-in plots)
    "scales"      # comma() for log messages
  )

  installed <- rownames(installed.packages())
  loaded    <- .packages()

  for (package in packages) {
    if (!package %in% installed) {
      message(sprintf("Package '%s' not found. Installing...", package))
      install.packages(package, dependencies = TRUE)
    }
    if (!package %in% loaded) {
      library(package, character.only = TRUE)
    }
  }
}
