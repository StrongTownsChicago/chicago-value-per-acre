#!/usr/bin/env Rscript
# Extract 2023 property tax bills per pin_10 from PTAXSIM.
#
# Bills the REAL 14-digit leaf PINs and sums them to pin_10. It must not
# reconstruct PINs as paste0(pin_10, "0000"): in Cook County the last four PIN
# digits are the unit number, so condo/leasehold units carry non-zero suffixes
# (…1001, …1002, …) and never end in 0000. The old reconstruction silently
# dropped every condo (~19.6k buildings, ~$2.3B in tax) — they showed as missing
# tax data on the map. Standard (non-condo) parcels are unchanged: their single
# leaf is the …0000 PIN, so summing leaves reproduces the old value exactly.
#
# Billing is county-wide; the per-pin_10 output is region-agnostic and is joined
# by pin_10 in 04_join_parcel_data.py. The optional region arg is accepted for
# CLI compatibility but does not change the output.
#
# Usage: Rscript scripts/extract_tax_bills.R [chicago|cook_county]

suppressMessages({
  library(ptaxsim)
  library(data.table)
})

args <- commandArgs(trailingOnly = TRUE)
if (length(args) >= 1 && !args[1] %in% c("chicago", "cook_county")) {
  cat("Error: Region must be 'chicago' or 'cook_county'\n")
  quit(status = 1)
}

YEAR <- 2023

ptaxsim_db_conn <- DBI::dbConnect(
  RSQLite::SQLite(),
  "./data/raw/tax_data/ptaxsim.db"
)

cat("Loading real", YEAR, "leaf PINs...\n")
pins <- DBI::dbGetQuery(
  ptaxsim_db_conn,
  sprintf("SELECT pin FROM pin WHERE year = %d", YEAR)
)$pin
cat("  ", format(length(pins), big.mark = ","), "leaf PINs\n")

cat("Calculating tax bills...\n")
bills <- as.data.table(tax_bill(YEAR, pins))

# Sum agency line items to a per-PIN bill, then sum leaf PINs to pin_10.
per_pin <- bills[, .(bill = sum(final_tax)), by = pin]
per_pin[, pin_10 := substr(pin, 1, 10)]
total <- per_pin[, .(total_tax_2023 = round(sum(bill))), by = pin_10]

cat("Calculated", format(nrow(total), big.mark = ","), "pin_10 tax bills\n")

DBI::dbDisconnect(ptaxsim_db_conn)

write.csv(total, "data/processed/tax_bills_2023.csv", row.names = FALSE)
cat("Saved to data/processed/tax_bills_2023.csv\n")
