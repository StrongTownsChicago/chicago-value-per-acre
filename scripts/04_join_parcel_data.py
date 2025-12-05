#!/usr/bin/env python3
"""
Join parcel geometries with assessor data and addresses.

Usage:
    python join_parcel_data.py chicago
    python join_parcel_data.py cook_county
"""

import sys
import geopandas as gpd
import pandas as pd
import os

def get_market_value_multiplier(class_code):
    """
    Cook County assessment levels:
    - Class 1-3 (Residential): 10% assessed → 10x multiplier
    - Class 4 (Not-for-profit): 20% assessed → 5x multiplier
    - Class 5 (Commercial/Industrial): 25% assessed → 4x multiplier
    - Class 6-8 (Incentive): varies, but generally commercial/industrial base → 4x multiplier
    - Class 9 (Incentive Multi-family): 10% assessed → 10x multiplier
    - Class 0, EX, RR (Exempt): 0% assessed → 0x multiplier
    
    https://prodassets.cookcountyassessoril.gov/s3fs-public/form_documents/classcode.pdf
    """
    if pd.isna(class_code):
        return 10
    
    major_class = str(class_code)[0]
    
    if major_class in ['1', '2', '3', '9']:  # 9 = incentive multi-family at 10%
        return 10
    elif major_class == '4':
        return 5
    elif major_class in ['5', '6', '7', '8']:  # Incentive classes 6-8 vary, but commercial/industrial base
        return 4
    elif major_class == '0' or class_code in ['EX', 'RR']:
        return 0  # Exempt
    else:
        return 10  # Default

def clean_pin_10digit(pin):
    """Standardize PINs to 10 digits"""
    if pd.isna(pin):
        return None
    pin_str = str(pin).replace('-', '').replace(' ', '').strip()
    if '.' in pin_str:
        pin_str = pin_str.split('.')[0]
    return pin_str[:10].zfill(10) if len(pin_str) >= 10 else pin_str.zfill(10)

def join_parcel_data(region):
    """
    Join parcel geometries with assessor and address data.
    
    Args:
        region: 'chicago' or 'cook_county'
    """
    # Validate region
    if region not in ['chicago', 'cook_county']:
        print("Error: Region must be 'chicago' or 'cook_county'")
        sys.exit(1)
    
    print(f"{'='*70}")
    print(f"JOINING PARCEL DATA FOR {region.upper().replace('_', ' ')}")
    print(f"{'='*70}\n")
    
    # Set file paths based on region
    input_path = f'data/processed/{region}_parcels_raw.geojson'
    output_path = f'data/processed/{region}_parcels_final.geojson'
    
    # Check if input exists
    if not os.path.exists(input_path):
        print(f"Error: Input file not found: {input_path}")
        print(f"Run process_parcels.py first: python process_parcels.py {region}")
        sys.exit(1)
    
    # Load data
    print(f"Loading {region} parcels...")
    parcels = gpd.read_file(input_path)
    print(f"  Loaded {len(parcels):,} parcels")
    
    print("\nLoading assessor data...")
    assessor = pd.read_csv('data/processed/assessor_2024_clean.csv')
    print(f"  Loaded {len(assessor):,} assessor records")
    
    print("Loading addresses...")
    addresses = pd.read_csv('data/processed/addresses_clean.csv')
    print(f"  Loaded {len(addresses):,} address records")
    
    # Normalize PIN columns to string
    assessor['pin_10'] = assessor['pin_10'].astype(str)
    addresses['pin_10'] = addresses['pin_10'].astype(str)
    
    # Find PIN field (might be 'PIN', 'PIN10', or 'pin')
    pin_col = [c for c in parcels.columns if 'pin' in c.lower()][0]
    print(f"\nPIN column in parcels: {pin_col}")
    
    # Standardize parcel PINs to 10 digits
    parcels['pin_10'] = parcels[pin_col].apply(clean_pin_10digit)
    
    # Join datasets
    print("\nJoining datasets...")
    joined = parcels.merge(assessor, on='pin_10', how='left')
    joined = joined.merge(addresses, on='pin_10', how='left')
    
    matched = joined['final_value'].notnull().sum()
    match_rate = matched / len(joined) * 100
    print(f"Match rate: {match_rate:.1f}% ({matched:,}/{len(joined):,})")
    
    # Filter to matched parcels only
    joined = joined[joined['final_value'].notnull()].copy()
    print(f"Keeping {len(joined):,} matched parcels")
    
    # Calculate acres
    SQFT_PER_ACRE = 43560
    
    # Get area field
    area_col = [c for c in joined.columns if 'area' in c.lower() and 'pin' not in c.lower()][0]
    print(f"Area column: {area_col}")
    
    joined['acres'] = joined[area_col] / SQFT_PER_ACRE
    
    # Apply class-specific multipliers to get market value
    print("\nCalculating market values...")
    joined['multiplier'] = joined['class'].apply(get_market_value_multiplier)
    joined['market_value'] = joined['final_value'] * joined['multiplier']
    
    # Calculate $/acre
    joined['value_per_acre'] = joined['market_value'] / joined['acres']
    
    print(f"\nFinal dataset: {len(joined):,} parcels")
    print("\nValue per acre statistics:")
    print(joined['value_per_acre'].describe())
    
    # Keep essential fields for web map
    keep_cols = ['pin_10', 'pin_14', 'value_per_acre', 'market_value', 'acres', 'class', 'full_address', 'geometry']
    joined = joined[keep_cols]
    
    # Reproject to WGS84 for web mapping
    if joined.crs != 'EPSG:4326':
        print("\nReprojecting to EPSG:4326 for web...")
        joined = joined.to_crs('EPSG:4326')
    
    # Display summary statistics
    print("\n" + "-"*70)
    print("SUMMARY STATISTICS")
    print("-"*70)
    print("\nSample of final data:")
    print(joined[['pin_10', 'value_per_acre', 'market_value', 'class']].head(20))
    
    print("\nValue per acre range:")
    print(f"  Min: ${joined['value_per_acre'].min():,.0f}")
    print(f"  Max: ${joined['value_per_acre'].max():,.0f}")
    print(f"  Median: ${joined['value_per_acre'].median():,.0f}")
    print(f"  Mean: ${joined['value_per_acre'].mean():,.0f}")
    
    print("\nClass distribution (top 10):")
    print(joined['class'].value_counts().head(10))
    
    print("\nTop 10 highest value/acre parcels:")
    top10 = joined.nlargest(10, 'value_per_acre')[['pin_10', 'value_per_acre', 'market_value', 'acres', 'class']]
    print(top10.to_string(index=False))
    
    # Save
    print(f"\nSaving to {output_path}...")
    joined.to_file(output_path, driver='GeoJSON')
    
    # Check file size
    size_mb = os.path.getsize(output_path) / (1024*1024)
    print(f"File size: {size_mb:.1f} MB")
    
    print("\n" + "="*70)
    print("COMPLETED SUCCESSFULLY")
    print("="*70)
    print(f"Region: {region.upper().replace('_', ' ')}")
    print(f"Parcels: {len(joined):,}")
    print(f"Output: {output_path}")
    print(f"Size: {size_mb:.1f} MB")
    print("="*70)

def main():
    if len(sys.argv) != 2:
        print(__doc__)
        print("\nExamples:")
        print("  python join_parcel_data.py chicago")
        print("  python join_parcel_data.py cook_county")
        sys.exit(1)
    
    region = sys.argv[1].lower()
    join_parcel_data(region)

if __name__ == '__main__':
    main()