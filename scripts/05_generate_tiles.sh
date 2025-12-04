#!/bin/bash
INPUT="data/processed/chicago_parcels_final.geojson"
OUTPUT="data/tiles/chicago_parcels.pmtiles"

echo "Generating PMTiles..."
tippecanoe \
  -o "$OUTPUT" \
  -Z 10 \
  -z 16 \
  -B 10 \
  -l parcels \
  -y pin_10 -y pin_14 -y value_per_acre -y market_value -y acres -y class -y full_address \
  --simplify-only-low-zooms \
  --no-simplification-of-shared-nodes \
  --detect-shared-borders \
  -pk \
  -pf \
  --force \
  "$INPUT"

echo "Tiles generated: $OUTPUT"
ls -lh "$OUTPUT"