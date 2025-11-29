import geopandas as gpd

print("Loading Cook County parcels...")
parcels = gpd.read_file('data/raw/parcels/Parcels_-_Historical_-_2024.shp')
print(f"Total Cook County parcels: {len(parcels):,}")

# Fix invalid geometries
parcels['geometry'] = parcels.geometry.make_valid()

# Remove duplicate PINs, keep largest geometry
parcels = parcels.sort_values('Shape_Area', ascending=False)
parcels = parcels.drop_duplicates(subset='PIN10', keep='first')

print(f"After deduplication: {len(parcels):,}")

# Reproject to WGS84
if parcels.crs != 'EPSG:4326':
    print("Reprojecting to EPSG:4326...")
    parcels = parcels.to_crs('EPSG:4326')

# Save
parcels.to_file('data/processed/cook_county_parcels_raw.geojson', driver='GeoJSON')
print("\nSaved to data/processed/cook_county_parcels_raw.geojson")