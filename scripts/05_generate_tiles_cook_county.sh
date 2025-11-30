#!/bin/bash

INPUT="data/processed/cook_county_parcels_final.geojson"
OUTPUT="data/tiles/cook_county_parcels.pmtiles"

echo "Generating PMTiles directly..."
tippecanoe \
  -o "$OUTPUT" \
  -Z 10 \
  -z 16 \
  -l parcels \
  -y pin_10 -y pin_14 -y value_per_acre -y market_value -y acres -y class -y full_address \
  --simplify-only-low-zooms \
  --no-simplification-of-shared-nodes \
  --detect-shared-borders \
  --coalesce-densest-as-needed \
  --force \
  "$INPUT"

echo "Tiles generated: $OUTPUT"
ls -lh "$OUTPUT"