# Load necessary packages ----
library(tidyverse)
library(kableExtra) # to create tables
library(ggrepel) # to reduce overlapping labels on plots
library(webshot) # to enable save_kable
library(webshot2) # to enable save_kable
library(magick) # to improve save_kable
library(scales) # for comma() function to improve readability of giant numbers
library(extrafont)
library(extrafontdb)
library(showtext) # to allow installing of the USC OpenType Font -- Open Sans
library(showtextdb) # must add font to database

# first time you run the script, you'll have to run this
font_add("Open Sans",regular="utils/fonts/OpenSans-VariableFont_wdth,wght.ttf",
         italic="utils/fonts/OpenSans-Italic-VariableFont_wdth,wght.ttf",
         bold = "utils/fonts/OpenSans-Bold.ttf")
showtext_auto()

# function to check whether necessary packages are installed, if not then install, if so make sure they are loaded ----
check_packages_and_load<-function() {
  # Declare packages
  packages <- c("tidyverse", # for all that is good in the world
                "kableExtra", # to create tables
                "ggrepel", # to reduce overlapping labels on plots
                "webshot", # to enable save_kable
                "webshot2", # to enable save_kable
                "magick", # to improve save_kable
                "scales", # for comma() function to improve readability of giant numbers
                "extrafont",
                "extrafontdb",
                "showtext", # allows installing of USC font -- Open Sans
                "showtextdb") # must add font to database
  
  # Loop through each package
  for (package in packages) {
    # Install package
    # Note: `installed.packages()` returns a vector of all the installed packages
    if (!package %in% installed.packages()) {
      print(paste("Package ", package, "not found. Installing Package!"))
      # Install it
      install.packages(
        package,
        dependencies = TRUE
      )
    }
    # Load package
    # Note: `.packages()` returns a vector of all the loaded packages
    if (!package %in% .packages()) {
      print(paste("Package", package, "found. Loading Package!"))
      # Load it
      library(
        package,
        character.only = TRUE
      )
    }
    if(package %in% .packages()) {
      print(paste("Package", package, "found and is already loaded."))
    }
  }
  font_add("Open Sans",regular="utils/fonts//OpenSans-VariableFont_wdth,wght.ttf",
           italic="utils/fonts/OpenSans-Italic-VariableFont_wdth,wght.ttf",
           bold = "utils/fonts/OpenSans-Bold.ttf") # first time you run the script, you'll have to run this
  showtext_auto()
}
