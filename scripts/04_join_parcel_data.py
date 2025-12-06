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
from shapely.ops import unary_union


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
    
    # Load tax data if available (optional)
    tax_bills = None
    tax_path = 'data/processed/tax_bills_2023.csv'
    if os.path.exists(tax_path):
        print("Loading 2023 tax bill data...")
        tax_bills = pd.read_csv(tax_path)
        tax_bills['pin_10'] = tax_bills['pin_10'].astype(str)
        print(f"  Loaded {len(tax_bills):,} tax records")
    else:
        print(f"Warning: Tax bill data not found at {tax_path}")
        print("  Skipping tax data. Run scripts/extract_tax_bills.R to generate.")
    
    # Normalize PIN columns to string
    assessor['pin_10'] = assessor['pin_10'].astype(str)
    addresses['pin_10'] = addresses['pin_10'].astype(str)

    
    # Standardize parcel PINs to 10 digits
    parcels['pin_10'] = parcels["PIN10"].apply(clean_pin_10digit)
    
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
    
    # In some cases, there are multiple geometries per PIN10 (e.g., condos/discontiguous parcels)
    # We aggregate these geometries to create a single geometry per PIN10
    print("\nAggregating geometries by PIN10...")
    pin10_count = len(joined)
    joined = joined.groupby('pin_10', as_index=False).agg({
        'geometry': lambda x: unary_union(x.tolist()) if len(x) > 1 else x.iloc[0],
        'final_value': 'first',
        'class': 'first',
        'pin_14': 'first',
        'full_address': 'first'
    })
    joined = gpd.GeoDataFrame(joined, geometry='geometry', crs=parcels.crs)
    print(f"Reduced from {pin10_count:,} to {len(joined):,} parcels")
    
    # Calculate acres and market value after geometry aggregation
    SQFT_PER_ACRE = 43560
    joined['acres'] = joined.geometry.area / SQFT_PER_ACRE
    
    # Apply class-specific multipliers to get market value
    print("\nCalculating market values...")
    joined['multiplier'] = joined['class'].apply(get_market_value_multiplier)
    joined['market_value'] = joined['final_value'] * joined['multiplier']
    
    # Calculate $/acre
    print("\nStage 1: Aggregating exact duplicates...")
    initial_count = len(joined)
    
    joined['geom_wkt'] = joined.geometry.apply(lambda g: g.wkt)
    
    joined = joined.groupby('geom_wkt', as_index=False).agg({
        'geometry': 'first',
        'market_value': 'sum',
        'acres': 'first',
        'pin_10': 'first',
        'pin_14': 'first',
        'class': 'first',
        'full_address': 'first'
    })
    
    joined = gpd.GeoDataFrame(joined, geometry='geometry', crs=parcels.crs)
    
    print(f"Reduced from {initial_count:,} to {len(joined):,} parcels")
    
    print("\nStage 2: Detecting spatial overlaps and containment...")
    sindex = joined.sindex
    overlap_map = {}
    
    total = len(joined)
    progress_interval = 10000
    
    for counter, (idx, row) in enumerate(joined.iterrows(), 1):
        if idx in overlap_map:
            continue
        
        candidates = list(sindex.intersection(row.geometry.bounds))
        
        # Find parcels that overlap or contain/are contained, but exclude edge-touching neighbors
        overlapping = []
        for i in candidates:
            if i == idx:
                continue
            geom_i = joined.iloc[i].geometry
            if not row.geometry.touches(geom_i) and row.geometry.intersects(geom_i):
                overlapping.append(i)
        
        if overlapping:
            leader = min(idx, *overlapping)
            for i in [idx] + overlapping:
                overlap_map[i] = leader
        
        if counter % progress_interval == 0 or counter == total:
            print(f"  Processed {counter:,}/{total:,} parcels ({counter/total*100:.1f}%)")
    
    if overlap_map:
        print(f"Found {len(set(overlap_map.values()))} overlap/containment groups")
        
        joined['overlap_group'] = joined.index.map(lambda i: overlap_map.get(i, i))
        
        overlap_grouped = joined.groupby('overlap_group', as_index=False).agg({
            'geometry': lambda x: unary_union(x.tolist()),
            'market_value': 'sum',
            'acres': 'first', # We recalculate acres from merged geometry later
            'pin_10': 'first',
            'pin_14': 'first',
            'class': 'first',
            'full_address': 'first'
        })
        
        joined = gpd.GeoDataFrame(overlap_grouped, geometry='geometry', crs=parcels.crs)
        
        # Recalculate acres from merged geometry
        joined['acres'] = joined.geometry.area / SQFT_PER_ACRE
        
        print(f"Reduced to {len(joined):,} parcels after merging")
    else:
        print("No spatial overlaps detected")
    
    joined['value_per_acre'] = joined['market_value'] / joined['acres']
    
    # Join tax data if available
    if tax_bills is not None:
        print("\nJoining tax bill data...")
        joined = joined.merge(tax_bills, on='pin_10', how='left')
        
        # Calculate tax per acre and effective tax rate
        joined['tax_per_acre'] = joined['total_tax_2023'] / joined['acres']
        joined['effective_tax_rate'] = (joined['total_tax_2023'] / joined['market_value']) * 100
        
        matched_tax = joined['total_tax_2023'].notnull().sum()
        tax_match_rate = matched_tax / len(joined) * 100
        print(f"  Tax match rate: {tax_match_rate:.1f}% ({matched_tax:,}/{len(joined):,})")
    
    print(f"\nFinal dataset: {len(joined):,} parcels")
    print("\nValue per acre statistics:")
    print(joined['value_per_acre'].describe())
    
    # Keep essential fields for web map
    if tax_bills is not None:
        keep_cols = ['pin_10', 'pin_14', 'value_per_acre', 'market_value', 
                     'total_tax_2023', 'tax_per_acre', 'effective_tax_rate',
                     'acres', 'class', 'full_address', 'geometry']
    else:
        keep_cols = ['pin_10', 'pin_14', 'value_per_acre', 'market_value', 
                     'acres', 'class', 'full_address', 'geometry']
    
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