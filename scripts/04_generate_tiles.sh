#!/bin/bash

INPUT="data/processed/chicago_parcels_final.geojson"
OUTPUT="data/tiles/chicago_parcels.pmtiles"

echo "Generating PMTiles directly..."
tippecanoe \
  -o "$OUTPUT" \
  -Z 10 \
  -z 16 \
  -l parcels \
  --simplify-only-low-zooms \
  --no-simplification-of-shared-nodes \
  --detect-shared-borders \
  --coalesce-densest-as-needed \
  --force \
  "$INPUT"

echo "Tiles generated: $OUTPUT"
ls -lh "$OUTPUT"