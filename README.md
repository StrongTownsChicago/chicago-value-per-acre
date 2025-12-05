# Chicago/Cook County Value Per Acre Map

Interactive 3D map visualizing tax value per acre across Chicago and Cook County. Built with Cook County 2024 assessment data.

## Features

- Parcel-level value per acre visualization
- Toggle between 2D choropleth and 3D height map
- Basemap overlay with street context
- Click parcels for details + Cook County Assessor links

## Tech Stack

- **Frontend:** MapLibre GL JS, PMTiles
- **Processing:** Python (GeoPandas, Pandas)
- **Tiles:** Tippecanoe
- **Deployment:** Cloudflare Pages + R2 Storage (free tier)

## Quick Start

### Prerequisites

- Python 3.13+
- Tippecanoe ([install instructions](https://github.com/felt/tippecanoe))
- Git

## Data Sources

- **Parcels:** [Cook County 2024 Parcel Boundaries](https://hub-cookcountyil.opendata.arcgis.com/datasets/5c2e70b7f31349dc83924a98df8fdbbb_2024)
- **Assessments:** [Cook County Assessed Values](https://datacatalog.cookcountyil.gov/Property-Taxation/Assessor-Assessed-Values/uzyt-m557) (filter to 2024)
- **Boundaries:** [Chicago City Boundary](https://data.cityofchicago.org/Facilities-Geographic-Boundaries/Boundaries-City/ewy2-6yfk)
- **Addresses:** [Cook County Parcel Addresses](https://datacatalog.cookcountyil.gov/Property-Taxation/Assessor-Parcel-Addresses/3723-97qp)

### Setup

```bash
# Clone and setup
git clone https://github.com/StrongTownsChicago/chicago-value-per-acre
cd chicago-value-map
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install geopandas pandas numpy shapely pyogrio

# Download data (see Data Sources above to their respective subdirectories)
# Place in parcels => data/raw/parcels/, assessed values => data/raw/assessor/, boundaries => data/raw/boundaries/, addresses => data/raw/addresses

# Process data (for Chicago)
python scripts/01_process_parcel_data.py chicago
python scripts/02_process_assessor_data.py
python scripts/03_process_address_data.py
python scripts/04_join_parcel_data.py chicago

# Generate tiles (must be run on Linux or WSL as it depends on tippecanoe)
./scripts/04_generate_tiles.sh chicago standard
cp data/tiles/chicago_parcels.pmtiles web/tiles/

# Test locally
cd web && http-server -p 8000 --cors
```

## Methodology

Market values estimated from assessed values using Cook County's official assessment levels (10% residential, 20% nonprofit, 25% commercial). Final values sum condo units by 10-digit PIN. Value per acre = market value ÷ acres.

Map shows assessed tax values, not definitive market values.

## Project Structure

```
chicago-value-per-acre/
├── data/
│   ├── raw/           # Downloaded source data
│   ├── processed/     # Cleaned GeoJSON
│   └── tiles/         # Generated PMTiles
├── scripts/           # Python/Tippecanoe processing pipeline
└── web/               # Static site (HTML/CSS/JS)
    └── tiles/         # PMTiles for deployment
```

## License

MIT

## Acknowledgments

Data from Chicago and Cook County Open Data Portals.
