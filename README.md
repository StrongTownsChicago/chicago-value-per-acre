# Chicago/Cook County Value Per Acre Map

Interactive 3D map visualizing property tax value per acre across Chicago and Cook County. Built with Cook County 2024 assessment data by [Strong Towns Chicago](https://strongtownschicago.org).

**[View Live Map →](https://www.strongtownschicago.org/value-per-acre-map)**

## Features

- **Parcel-level visualization** of Cook County/Chicago properties
- **Toggle between 2D/3D views** with height-scaled extrusions
- **Two geographic extents:** Chicago-only or full Cook County
- **Quality modes:** Standard (fast) or High Quality (all parcels at all zoom levels)
- **Click parcels** for details and direct links to Cook County Assessor records
- **CTA transit overlay** with color-coded rail lines

## Quick Start

### Prerequisites

- Python 3.13+
- [uv](https://github.com/astral-sh/uv) - Fast Python package manager
- [Tippecanoe](https://github.com/felt/tippecanoe) (for tile generation)
- Git

### Installation

```bash
# Clone repository
git clone https://github.com/StrongTownsChicago/chicago-value-per-acre
cd chicago-value-per-acre

# Install dependencies
uv sync
```

### Download Data

Create directory structure and download data:

```bash
mkdir -p data/raw/{parcels,assessor,boundaries,addresses}
```

**Required datasets:**

1. **Parcels (shapefile):** [Cook County 2024 Parcel Boundaries](https://hub-cookcountyil.opendata.arcgis.com/datasets/5c2e70b7f31349dc83924a98df8fdbbb_2024)  
   → Extract to `data/raw/parcels/`

2. **Assessments (CSV):** [Cook County Assessed Values](https://datacatalog.cookcountyil.gov/Property-Taxation/Assessor-Assessed-Values/uzyt-m557)  
   → Filter to 2024, download as CSV → `data/raw/assessor/`

3. **Chicago Boundary (GeoJSON):** [City Boundaries](https://data.cityofchicago.org/Facilities-Geographic-Boundaries/Boundaries-City/ewy2-6yfk)  
   → Download as GeoJSON → `data/raw/boundaries/`

4. **Addresses (CSV):** [Cook County Parcel Addresses](https://datacatalog.cookcountyil.gov/Property-Taxation/Assessor-Parcel-Addresses/3723-97qp)  
   → Download as CSV → `data/raw/addresses/`

### Processing Pipeline

**For Chicago:**

```bash
# 1. Process parcel geometries (spatial filter to Chicago boundary)
python scripts/01_process_parcel_data.py chicago

# 2. Clean assessor data
python scripts/02_process_assessor_data.py

# 3. Clean address data
python scripts/03_process_address_data.py

# 4. Join parcels with assessor + address data
python scripts/04_join_parcel_data.py chicago

# 5. Generate vector tiles
./scripts/05_generate_tiles.sh chicago standard  # Fast, feature dropping
# OR
./scripts/05_generate_tiles.sh chicago high      # All parcels, larger file
```

**For Cook County:**

```bash
# Same workflow, replace 'chicago' with 'cook_county'
python scripts/01_process_parcel_data.py cook_county
python scripts/02_process_assessor_data.py  # Only run once
python scripts/03_process_address_data.py   # Only run once
python scripts/04_join_parcel_data.py cook_county
./scripts/05_generate_tiles.sh cook_county standard
```

### Local Development

```bash
# Copy tiles to web directory
cp data/tiles/chicago_parcels.pmtiles web/tiles/

# Serve locally (requires Node.js)
cd web
npx http-server -p 8000 --cors
```

Open http://localhost:8000

## Methodology

**Market Value Calculation:**

- Assessed values converted to market values using [Cook County's official assessment levels](https://prodassets.cookcountyassessoril.gov/s3fs-public/form_documents/classcode.pdf).

**Value Per Acre:**

```
Market Value = Assessed Value × Class Multiplier
Value Per Acre = Market Value ÷ Parcel Acres
```

**Condo Handling:** Multi-unit properties are summed by 10-digit PIN to show total building value.

## Project Structure

```
chicago-value-per-acre/
├── data/
│   ├── raw/              # Downloaded source data
│   ├── processed/        # Cleaned GeoJSON files
│   └── tiles/            # Generated PMTiles
├── scripts/
│   ├── 01_process_parcel_data.py       # Spatial filter & dedupe
│   ├── 02_process_assessor_data.py # Clean assessment data
│   ├── 03_process_address_data.py  # Clean address data
│   ├── 04_join_parcel_data.py      # Join geometry + data
│   └── 05_generate_tiles.sh        # Generate PMTiles
└── web/
    ├── index.html
    ├── js/app.js          # MapLibre GL JS map
    ├── css/style.css
    └── tiles/             # PMTiles for deployment
```

## Tile Quality Modes

**Standard Quality** (default):

- Uses tippecanoe's `--coalesce-densest-as-needed` flag
- Drops features at low zoom levels to stay under 500KB tile size limit
- Best for less powerful devices and slower connections

**High Quality:**

- Shows all parcels at all zoom levels (zoom 10-16)
- Uses `-pk` (no tile size limit) and `-pf` (no feature limit)
- Does not work on less powerful devices

## Deployment

Built for static hosting. Currently it is deployed via Cloudflare.

- Static site hosted on Cloudflare Pages
- PMTiles hosted in Cloudflare R2 bucket

## Data Sources

- **Parcels:** [Cook County GIS - 2024 Historical Parcels](https://hub-cookcountyil.opendata.arcgis.com/datasets/5c2e70b7f31349dc83924a98df8fdbbb_2024)
- **Assessments:** [Cook County Assessor - Assessed Values 2024](https://datacatalog.cookcountyil.gov/Property-Taxation/Assessor-Assessed-Values/uzyt-m557)
- **Addresses:** [Cook County Assessor - Parcel Addresses](https://datacatalog.cookcountyil.gov/Property-Taxation/Assessor-Parcel-Addresses/3723-97qp)
- **Chicago Boundary:** [Chicago Data Portal - City Boundaries](https://data.cityofchicago.org/Facilities-Geographic-Boundaries/Boundaries-City/ewy2-6yfk)
- **CTA Lines:** [Chicago Data Portal - CTA Rail Lines](https://data.cityofchicago.org/Transportation/CTA-L-Rail-Lines/xbyr-jnvx)

## License

MIT

## Acknowledgments

- Data from [Cook County Open Data](https://datacatalog.cookcountyil.gov/) and [Chicago Data Portal](https://data.cityofchicago.org/)
