# Chicago Value Per Acre Map

Interactive 3D map visualizing tax value per acre across Chicago. Built with Cook County 2024 assessment data.

## Features

- Parcel-level value per acre visualization (~600K parcels)
- Toggle between 2D choropleth and 3D height map
- Class-specific assessment multipliers (residential 10%, commercial 25%)
- Basemap overlay with street context
- Click parcels for details + Cook County Assessor links

## Tech Stack

- **Frontend:** MapLibre GL JS, PMTiles
- **Processing:** Python (GeoPandas, Pandas)
- **Tiles:** Tippecanoe
- **Deployment:** Cloudflare Pages (free tier)

## Quick Start

### Prerequisites

- Python 3.13+
- Tippecanoe ([install instructions](https://github.com/felt/tippecanoe))
- Git

### Setup

```bash
# Clone and setup
git clone https://github.com/yourusername/chicago-value-map
cd chicago-value-map
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install geopandas pandas numpy shapely pyogrio

# Download data (see Data Sources below)
# Place in data/raw/parcels/, data/raw/assessor/, data/raw/boundaries/

# Process data
python scripts/01_filter_chicago_parcels.py
python scripts/02_process_assessor_data.py
python scripts/03_join_and_calculate.py

# Generate tiles
./scripts/04_generate_tiles.sh
cp data/tiles/chicago_parcels.pmtiles web/tiles/

# Test locally
cd web && python -m http.server 8000
```

### Deploy

Push to GitHub, connect to Cloudflare Pages:

- Build directory: `web`
- No build command needed
- If PMTiles >100MB, upload to Cloudflare R2 and update tile URL

## Data Sources

- **Parcels:** [Cook County 2024 Parcel Boundaries](https://hub-cookcountyil.opendata.arcgis.com/datasets/5c2e70b7f31349dc83924a98df8fdbbb_2024)
- **Assessments:** [Cook County Assessed Values](https://datacatalog.cookcountyil.gov/Property-Taxation/Assessor-Assessed-Values/uzyt-m557) (filter to 2024)
- **Boundaries:** [Chicago City Boundary](https://data.cityofchicago.org/Facilities-Geographic-Boundaries/Boundaries-City/ewy2-6yfk)

## Methodology

Market values estimated from assessed values using Cook County's official assessment levels (10% residential, 20% nonprofit, 25% commercial). Final values sum condo units by 10-digit PIN. Value per acre = market value ÷ acres.

Map shows assessed tax values, not definitive market values.

## Project Structure

```
chicago-value-map/
├── data/
│   ├── raw/           # Downloaded source data
│   ├── processed/     # Cleaned GeoJSON
│   └── tiles/         # Generated PMTiles
├── scripts/           # Python processing pipeline
└── web/               # Static site (HTML/CSS/JS)
    └── tiles/         # PMTiles for deployment
```

## License

MIT

## Acknowledgments

Data from Cook County Open Data Portal.
