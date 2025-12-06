#!/usr/bin/env Rscript
library(ptaxsim)
library(dplyr)
library(jsonlite)

# Connect to database
ptaxsim_db_conn <- DBI::dbConnect(
  RSQLite::SQLite(), 
  "./data/raw/tax_data/ptaxsim.db"
)

# Read GeoJSON as JSON and extract PINs
geojson <- fromJSON("data/processed/chicago_parcels_final.geojson")
pins_10 <- unique(geojson$features$properties$pin_10)
pins_14 <- paste0(pins_10, "0000")

cat("Calculating tax bills for", length(pins_14), "PINs...\n")

# Calculate 2023 bills (may take a while)
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