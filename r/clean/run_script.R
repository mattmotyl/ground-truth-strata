# Function to source all R files in a given directory
source_all_files_in_directory <- function(directory) {
  files <- list.files(directory, pattern = "\\.R$", full.names = TRUE)
  for (file in files) {
    source(file)
  }
}

# Source all preprocessing scripts
source_all_files_in_directory("utils/preprocessing")

# Source all utility scripts
source_all_files_in_directory("utils")

# Source all summarization scripts
source_all_files_in_directory("summary")
