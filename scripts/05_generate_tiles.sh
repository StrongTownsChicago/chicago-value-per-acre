#!/bin/bash

# Usage: ./generate_tiles.sh <region> <quality>
# Region: chicago or cook_county
# Quality: standard or high

# Check arguments
if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <region> <quality>"
    echo "  region: chicago | cook_county"
    echo "  quality: standard | high"
    echo ""
    echo "Examples:"
    echo "  $0 chicago standard"
    echo "  $0 chicago high"
    echo "  $0 cook_county standard"
    exit 1
fi

REGION=$1
QUALITY=$2

# Validate region
if [[ "$REGION" != "chicago" && "$REGION" != "cook_county" ]]; then
    echo "Error: Region must be 'chicago' or 'cook_county'"
    exit 1
fi

# Validate quality
if [[ "$QUALITY" != "standard" && "$QUALITY" != "high" ]]; then
    echo "Error: Quality must be 'standard' or 'high'"
    exit 1
fi

# Set input/output paths based on region
INPUT="data/processed/${REGION}_parcels_final.geojson"
if [[ "$QUALITY" == "high" ]]; then
    OUTPUT="data/tiles/${REGION}_parcels_hq.pmtiles"
else
    OUTPUT="data/tiles/${REGION}_parcels.pmtiles"
fi

# Check if input exists
if [ ! -f "$INPUT" ]; then
    echo "Error: Input file not found: $INPUT"
    exit 1
fi

# Build tippecanoe command with quality-specific flags
echo "============================================"
echo "Generating PMTiles for $REGION ($QUALITY quality)..."
echo "Input:  $INPUT"
echo "Output: $OUTPUT"
echo "============================================"

# Common flags for both modes
COMMON_FLAGS=(
    -o "$OUTPUT"
    -Z 10
    -z 16
    -l parcels
    -y pin_10 -y pin_14 -y value_per_acre -y market_value -y acres -y class -y full_address
    --simplify-only-low-zooms
    --no-simplification-of-shared-nodes
    --detect-shared-borders
    --force
)

# Quality-specific flags
if [[ "$QUALITY" == "high" ]]; then
    echo "Mode: High Quality (all parcels visible, larger file size)"
    QUALITY_FLAGS=(
        -B 10
        -pk
        -pf
    )
else
    echo "Mode: Standard Quality (feature dropping for performance)"
    QUALITY_FLAGS=(
        --coalesce-densest-as-needed
    )
fi

# Run tippecanoe
tippecanoe "${COMMON_FLAGS[@]}" "${QUALITY_FLAGS[@]}" "$INPUT"

# Check if successful
if [ $? -eq 0 ]; then
    echo ""
    echo "✓ Tiles generated successfully!"
    echo "Output: $OUTPUT"
    ls -lh "$OUTPUT"
    
    # Show file size in MB
    SIZE_MB=$(du -m "$OUTPUT" | cut -f1)
    echo "Size: ${SIZE_MB} MB"
else
    echo ""
    echo "✗ Error generating tiles"
    exit 1
fi