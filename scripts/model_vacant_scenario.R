#!/usr/bin/env Rscript
# Model a revenue-neutral vacancy tax: raise the assessment level on vacant land
# (CCAO classes 1-00 and 1-90) from 10% to 25%, i.e. multiply their assessed
# value by 2.5, holding each taxing agency's 2023 levy fixed so its rate falls as
# the base grows. This redistributes burden onto vacant land and gives every other
# parcel a small reduction.
#
# Per-agency revenue neutrality (the accurate model, per Stephen Hoskins /
# Progress and Poverty Institute):
#   new_rate_a = levy_a / (base_a + uplift_a)
# where uplift_a is the taxable-EAV increase from vacant parcels in agency a's
# (non-TIF) jurisdiction. Then every parcel's bill is recomputed at the new rates,
# with vacant parcels also carrying their higher EAV.
#
# Computed county-wide (rates are county-wide); output is keyed by pin_10 so the
# join in 04_join_parcel_data.py can attach it for either region.
#
# Output: data/processed/vacant_scenario_2023.csv
#   pin_10, tax_current, tax_vacant25, vacant

# PTAXSIM 1.1.0 (required for the 2024 database) is installed in a user library
# because the system site-library is read-only here. Harmless elsewhere.
local({
  ul <- path.expand("~/Rlibs")
  if (dir.exists(ul)) .libPaths(c(ul, .libPaths()))
})
suppressMessages({
  library(ptaxsim)
  library(data.table)
})

YEAR <- 2024
VACANT_CLASSES <- c("100", "190")
UPLIFT <- 2.5 # 25% / 10%
DB <- "./data/raw/tax_data/ptaxsim-2024.0.0.db"
OUT <- "data/processed/vacant_scenario_2024.csv"

t0 <- Sys.time()
say <- function(...) cat(sprintf("[%s] ", format(Sys.time(), "%H:%M:%S")), ..., "\n")

ptaxsim_db_conn <- DBI::dbConnect(RSQLite::SQLite(), DB)

say("Loading all", YEAR, "PINs (class + tax code)...")
pins_tbl <- as.data.table(DBI::dbGetQuery(
  ptaxsim_db_conn,
  sprintf("SELECT pin, class, tax_code_num, tax_bill_total FROM pin WHERE year=%d", YEAR)
))
say("  ", nrow(pins_tbl), "PINs")
pins <- pins_tbl$pin

say("Looking up PIN assessments/exemptions...")
pin_dt <- lookup_pin(YEAR, pins)
setDT(pin_dt)
# tax code per pin (for routing uplift to agencies)
pin_dt <- merge(pin_dt, pins_tbl[, .(pin, tax_code_num)], by = "pin", all.x = TRUE)

exe_cols <- grep("^exe_", names(pin_dt), value = TRUE)
pin_dt[, exe_total := rowSums(.SD), .SDcols = exe_cols]
pin_dt[, is_vac := class %in% VACANT_CLASSES]
pin_dt[, taxable_eav_old := pmax(0, eav - exe_total)]
pin_dt[, eav_new := fifelse(is_vac, eav * UPLIFT, as.numeric(eav))]
pin_dt[, taxable_eav_new := pmax(0, eav_new - exe_total)]
pin_dt[, uplift := taxable_eav_new - taxable_eav_old]

say("Vacant PINs:", pin_dt[is_vac == TRUE, .N],
    "| sum AV:", format(pin_dt[is_vac == TRUE, sum(av)], big.mark = ","),
    "| total EAV uplift:", format(pin_dt[is_vac == TRUE, sum(uplift)], big.mark = ","))

say("Looking up agencies and TIFs...")
tc_vec <- lookup_tax_code(YEAR, pins)
agency_dt <- lookup_agency(YEAR, tc_vec)
setDT(agency_dt)
tif_dt <- lookup_tif(YEAR, tc_vec)
setDT(tif_dt)

# TIF tax codes capture incremental EAV. Two framings:
#  - EXCLUDE_TIF_FROM_BASE=TRUE: per-agency neutral. Vacant uplift in a TIF flows
#    to the TIF (tax_bill applies it via tif_dt) and does NOT grow the agency base,
#    so each agency collects exactly its 2023 levy; system total rises by TIF
#    capture.
#  - FALSE: total-neutral framing (Hoskins' one-pager). All vacant uplift grows
#    the agency base, so the full vacant increase is redistributed as relief.
EXCLUDE_TIF_FROM_BASE <- as.logical(Sys.getenv("EXCLUDE_TIF_FROM_BASE", "FALSE"))
tif_tax_codes <- unique(tif_dt$tax_code)
say("  TIF tax codes:", length(tif_tax_codes), "| EXCLUDE_TIF_FROM_BASE =", EXCLUDE_TIF_FROM_BASE)

base_pins <- if (EXCLUDE_TIF_FROM_BASE) pin_dt[!(tax_code_num %in% tif_tax_codes)] else pin_dt
uplift_by_tc <- base_pins[, .(uplift_tc = sum(uplift)), by = .(tax_code = tax_code_num)]

# Each agency's total base growth = sum of uplift across the tax codes it serves.
ag_tc <- unique(agency_dt[, .(tax_code, agency_num)])
ag_tc <- merge(ag_tc, uplift_by_tc, by = "tax_code", all.x = TRUE)
ag_tc[is.na(uplift_tc), uplift_tc := 0]
agency_uplift <- ag_tc[, .(agency_uplift = sum(uplift_tc)), by = agency_num]

agency_dt_new <- copy(agency_dt)
agency_dt_new <- merge(agency_dt_new, agency_uplift, by = "agency_num", all.x = TRUE)
agency_dt_new[is.na(agency_uplift), agency_uplift := 0]
agency_dt_new[, agency_total_eav := agency_total_eav + agency_uplift]
agency_dt_new[, agency_uplift := NULL]
setcolorder(agency_dt_new, names(agency_dt))

# pin_dt back to the exact lookup_pin schema, with vacant EAV uplifted.
# tax_bill() requires the lookup data.table keys, which merges/subsets drop.
base_cols <- c("year", "pin", "class", "av", "eav", exe_cols)
pin_dt_new <- copy(pin_dt)
pin_dt_new[, eav := eav_new]
pin_dt_new <- pin_dt_new[, ..base_cols]
pin_dt_cur <- pin_dt[, ..base_cols]
setkey(pin_dt_new, year, pin)
setkey(pin_dt_cur, year, pin)
setkeyv(agency_dt_new, if (is.null(key(agency_dt))) c("year", "tax_code", "agency_num") else key(agency_dt))

say("Computing CURRENT bills...")
bills_cur <- tax_bill(YEAR, pins, tax_code_vec = tc_vec,
                      agency_dt = agency_dt, pin_dt = pin_dt_cur, tif_dt = tif_dt)
setDT(bills_cur)

say("Computing COUNTERFACTUAL bills (vacant at 25%)...")
bills_new <- tax_bill(YEAR, pins, tax_code_vec = tc_vec,
                      agency_dt = agency_dt_new, pin_dt = pin_dt_new, tif_dt = tif_dt)
setDT(bills_new)

say("Aggregating to PIN-14, then PIN-10...")
cur <- bills_cur[, .(tax_current = sum(final_tax)), by = pin]
new <- bills_new[, .(tax_vacant25 = sum(final_tax)), by = pin]
res <- merge(cur, new, by = "pin")
res <- merge(res, pin_dt[, .(pin, is_vac)], by = "pin", all.x = TRUE)
res[, pin_10 := substr(pin, 1, 10)]

# Both bills are computed by tax_bill(), so their ratio is a clean measure of the
# policy effect. tax_bill() recomputation runs a few percent off the stored bill
# totals, so anchor to each parcel's ACTUAL 2023 bill: current = real bill, new =
# real bill x (computed_new / computed_current). This keeps current matching
# reality while preserving the modeled percent change.
comp <- res[, .(
  comp_cur = sum(tax_current),
  comp_new = sum(tax_vacant25),
  vacant = as.integer(any(is_vac))
), by = pin_10]
real10 <- pins_tbl[, .(real_cur = sum(tax_bill_total, na.rm = TRUE)),
                   by = .(pin_10 = substr(pin, 1, 10))]
out <- merge(comp, real10, by = "pin_10", all.x = TRUE)
out[is.na(real_cur), real_cur := 0]
out[, ratio := fifelse(comp_cur > 0, comp_new / comp_cur, 1)]
out[, tax_current := real_cur]
out[, tax_vacant25 := real_cur * ratio]

# ---- validation: 2024 actuals, with Hoskins' 2023 published figures for
# reference only (2024 differs: Chicago was reassessed for the 2024 triennial). ----
say("============ VALIDATION (tax year", YEAR, ") ============")
vac <- out[vacant == 1]
non <- out[vacant == 0]
fmtm <- function(x) sprintf("$%.1fM", x / 1e6)
say("Vacant parcels (pin_10):", nrow(vac), " (2023 ref: 63,200)")
say("  tax current:", fmtm(sum(vac$tax_current)), " (2023 ref: $114M)")
say("  tax new:    ", fmtm(sum(vac$tax_vacant25)), " (2023 ref: $269M)")
say("  increase:   ", fmtm(sum(vac$tax_vacant25) - sum(vac$tax_current)), " (2023 ref: +$156M)")
say("  avg current:", sprintf("$%.0f", mean(vac$tax_current)), " (2023 ref: $1,800)")
say("  avg new:    ", sprintf("$%.0f", mean(vac$tax_vacant25)), " (2023 ref: $4,300)")
say("Non-vacant parcels:", nrow(non))
say("  total current:", fmtm(sum(non$tax_current)))
say("  total new:    ", fmtm(sum(non$tax_vacant25)))
say("  avg change:   ",
    sprintf("%.2f%%", 100 * (sum(non$tax_vacant25) - sum(non$tax_current)) / sum(non$tax_current)),
    " (2023 ref: -0.85%)")
tot_cur <- sum(out$tax_current); tot_new <- sum(out$tax_vacant25)
say("Revenue neutrality: total current", fmtm(tot_cur), "-> total new", fmtm(tot_new),
    sprintf("(%.3f%%)", 100 * (tot_new - tot_cur) / tot_cur))
say("Vacant share of tax base: current",
    sprintf("%.1f%%", 100 * sum(vac$tax_current) / tot_cur),
    "-> new", sprintf("%.1f%%", 100 * sum(vac$tax_vacant25) / tot_new),
    "(2023 ref: 0.6% -> 1.5%)")

say("Writing", OUT)
fwrite(out[, .(pin_10, tax_current = round(tax_current), tax_vacant25 = round(tax_vacant25), vacant)], OUT)

DBI::dbDisconnect(ptaxsim_db_conn)
say("DONE in", round(difftime(Sys.time(), t0, units = "mins"), 1), "min")
