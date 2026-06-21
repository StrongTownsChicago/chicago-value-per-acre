# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Interactive 3D web map showing property tax value per acre across Chicago and Cook County, built with 2024 Cook County assessment data. Live at https://www.strongtownschicago.org/value-per-acre-map. Developed by Strong Towns Chicago.

## Testing (required)

**Every change must ship with high-value tests.** This is not optional. A change is not complete until it has tests that would fail if the change regressed, and those tests pass.

- **High-value, not box-ticking.** Test the logic that matters: pure functions, paint/expression builders, tax math, data-correctness gates against known targets. Do not write trivial tests for the sake of coverage. If a change has no meaningful behavior to test, say so explicitly and explain why.
- **Pick the right layer.** Pure JS helpers → `node --test 'tests/*.test.js'` (expose them with a guarded `module.exports`, inert in the browser). Python/pipeline logic and data outputs → `pytest` (`.venv/Scripts/python -m pytest tests/`). Heavy pipeline outputs (e.g. PTAXSIM model results) → a correctness gate that loads the produced artifact and asserts it against published/known figures, and skips cleanly if the artifact is absent.
- **Run them before claiming done.** Always run the relevant suite and report the result. Never describe a change as finished without showing tests passing.
- **Validate behavior, not just units.** Where a change affects the rendered map, also verify it in the browser (Chrome DevTools) in addition to unit tests.

Existing suites: `tests/scales.test.js` (map paint/legend/class helpers), `tests/test_vacant_scenario.py` (vacancy-model correctness gate).

## Development Setup

```bash
# Install Python dependencies (requires Python 3.13+, uv package manager)
uv sync

# Serve web app locally
cd web && npx http-server -p 8000 --cors
```

Tippecanoe is required for tile generation (step 05). On Mac: `brew install tippecanoe`. On Linux/WSL2: build from source.

## Data Pipeline

Scripts run sequentially. Each takes a region argument (`chicago` or `cook_county`), except 02 and 03 which run once for all regions.

```bash
python scripts/01_process_parcel_data.py chicago      # Spatial filter parcels to region
python scripts/02_process_assessor_data.py             # Clean assessment data (run once)
python scripts/03_process_address_data.py              # Clean address data (run once)
python scripts/04_join_parcel_data.py chicago           # Join datasets, calculate values
./scripts/05_generate_tiles.sh chicago standard         # Generate PMTiles (standard|high)
```

Optional tax data extraction (requires R + ptaxsim):

```bash
Rscript scripts/extract_tax_bills.R chicago
# Then re-run 04_join_parcel_data.py to include tax data
```

Raw data goes in `data/raw/`, processed outputs in `data/processed/`, tiles in `data/tiles/`. The entire `data/` directory is gitignored.

## Architecture

**Data pipeline** (Python/geopandas): 5 numbered scripts transform raw Cook County shapefiles and CSVs into PMTiles vector tiles. The critical script is `04_join_parcel_data.py` which merges parcels, assessments, addresses, and optional tax data, then calculates market value and value-per-acre using class-based assessment multipliers.

**Web frontend** (vanilla JS): Single-page app using MapLibre GL JS + PMTiles protocol. No build step. Key features: 2D/3D toggle, value/tax metric switch, Chicago/Cook County extent toggle, quality toggle, CTA transit overlay, click popups with parcel details.

**Tile hosting**: PMTiles served from Cloudflare R2 (S3-compatible). Static site on Cloudflare Pages.

## Key Domain Concepts

- **PIN10 vs PIN14**: Assessor data uses 14-digit PINs (last 4 for condo units). GIS/parcel data uses 10-digit PINs. All joins happen on PIN10, with condo values summed/aggregated.
- **Market value calculation**: `assessed_value × class_multiplier`. Multipliers: residential (10x), non-profit (5x), commercial/industrial (4x), exempt (0x). These derive from Cook County's fractional assessment levels.
- **Value per acre**: `market_value / acres`. This is the core metric displayed on the map.
- **Two display metrics**: Value per acre (2024 assessments) and tax per acre (2023 tax bills). Tax values are ~2% of market values, so scales differ by ~50x.

## Deployment

Upload tiles to R2 via AWS CLI, then push code to `main` for Cloudflare Pages auto-deploy. See `r2_aws.md` for R2 upload commands.

## File Conventions

- Scripts numbered `01`-`05` indicating execution order
- Region variants: `chicago` / `cook_county` (underscore-separated)
- Output files: `{region}_parcels_{stage}.geojson` (raw, final)
- Tile quality: `standard` (feature dropping for performance) vs `high` (all parcels, larger files)
