#!/usr/bin/env python3
"""
Process parcel data for Chicago or Cook County.

Usage:
    python process_parcel_data.py chicago
    python process_parcel_data.py cook_county
"""

import sys
import geopandas as gpd

def process_parcels(region):
    """
    Process parcel data for specified region.
    
    Args:
        region: 'chicago' or 'cook_county'
    """
    # Validate region
    if region not in ['chicago', 'cook_county']:
        print("Error: Region must be 'chicago' or 'cook_county'")
        sys.exit(1)
    
    print(f"{'='*60}")
    print(f"Processing {region.upper().replace('_', ' ')} parcels")
    print(f"{'='*60}\n")
    
    # Load Cook County parcels
    print("Loading Cook County parcels from shapefile...")
    # https://hub-cookcountyil.opendata.arcgis.com/datasets/5c2e70b7f31349dc83924a98df8fdbbb_2024
    parcels = gpd.read_file('data/raw/parcels/Parcels_-_Historical_-_2024.shp')
    print(f"Total Cook County parcels: {len(parcels):,}")
    
    # Fix invalid geometries early
    print("Fixing invalid geometries...")
    parcels['geometry'] = parcels.geometry.make_valid()
    
    # If Chicago, do spatial filter to remove non-Chicago parcels
    if region == 'chicago':
        print("\nLoading Chicago boundary...")
        # https://data.cityofchicago.org/Facilities-Geographic-Boundaries/Boundaries-City/ewy2-6yfk
        chicago = gpd.read_file('data/raw/boundaries')
        
        # Ensure same CRS
        if parcels.crs != chicago.crs:
            print("Reprojecting Chicago boundary to match parcels CRS...")
            chicago = chicago.to_crs(parcels.crs)
        
        # Spatial filter: use 'intersects' to include boundary parcels
        print("\nFiltering to Chicago (this can take several minutes)...")
        parcels = gpd.sjoin(parcels, chicago, how='inner', predicate='intersects')
        
        # Remove duplicate columns from spatial join
        parcels = parcels[parcels.columns[parcels.columns.isin(gpd.read_file('data/raw/parcels/Parcels_-_Historical_-_2024.shp', rows=1).columns)]]
        
        print(f"After filtering to Chicago: {len(parcels):,}")
    
    # Reproject to WGS84 (standard web projection)
    if parcels.crs != 'EPSG:4326':
        print("\nReprojecting to EPSG:4326 (WGS84)...")
        parcels = parcels.to_crs('EPSG:4326')
    
    # Save
    output_path = f'data/processed/{region}_parcels_raw.geojson'
    print(f"\nSaving to {output_path}...")
    parcels.to_file(output_path, driver='GeoJSON')
    
    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    print(f"Region: {region.upper().replace('_', ' ')}")
    print(f"Final parcel count: {len(parcels):,}")
    print(f"Output: {output_path}")
    print(f"CRS: {parcels.crs}")
    print("="*60)

def main():
    if len(sys.argv) != 2:
        print(__doc__)
        print("\nExamples:")
        print("  python process_parcels.py chicago")
        print("  python process_parcels.py cook_county")
        sys.exit(1)
    
    region = sys.argv[1].lower()
    process_parcels(region)

if __name__ == '__main__':
    main()