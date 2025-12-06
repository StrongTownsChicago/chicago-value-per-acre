#!/usr/bin/env Rscript
library(ptaxsim)
library(dplyr)
library(jsonlite)

# Get command line arguments
args <- commandArgs(trailingOnly = TRUE)

if (length(args) != 1) {
  cat("Usage: Rscript extract_tax_bills.R <region>\n")
  cat("  region: chicago | cook_county\n")
  quit(status = 1)
}

region <- args[1]

if (!region %in% c("chicago", "cook_county")) {
  cat("Error: Region must be 'chicago' or 'cook_county'\n")
  quit(status = 1)
}

# Set input path based on region
input_path <- paste0("data/processed/", region, "_parcels_final.geojson")

if (!file.exists(input_path)) {
  cat("Error: Input file not found:", input_path, "\n")
  quit(status = 1)
}

cat("Processing", region, "parcels from", input_path, "\n")

# Connect to database
ptaxsim_db_conn <- DBI::dbConnect(
  RSQLite::SQLite(), 
  "./data/raw/tax_data/ptaxsim.db"
)

# Read GeoJSON and extract PINs
geojson <- fromJSON(input_path)
pins_10 <- unique(geojson$features$properties$pin_10)
pins_14 <- paste0(pins_10, "0000")

cat("Calculating tax bills for", length(pins_14), "PINs...\n")

# Calculate 2023 bills
bills <- tax_bill(2023, pins_14)

# Sum to get total per PIN
total <- bills %>%
  group_by(pin) %>%
  summarize(total_tax_2023 = sum(final_tax)) %>%
  mutate(pin_10 = substr(pin, 1, 10)) %>%
  select(pin_10, total_tax_2023)

cat("Calculated", nrow(total), "tax bills\n")

# Save
write.csv(
  total, 
  "data/processed/tax_bills_2023.csv", 
  row.names = FALSE
)

cat("Saved to data/processed/tax_bills_2023.csv\n")