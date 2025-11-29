import geopandas as gpd

print("Loading Cook County parcels...")
parcels = gpd.read_file('data/raw/parcels/Parcels_-_Historical_-_2024.shp')
print(f"Total Cook County parcels: {len(parcels):,}")

print("\nLoading Chicago boundary...")
chicago = gpd.read_file('data/raw/boundaries')

# Ensure same CRS
if parcels.crs != chicago.crs:
    chicago = chicago.to_crs(parcels.crs)

# Fix any invalid geometries
parcels['geometry'] = parcels.geometry.make_valid()

# Spatial filter: use 'intersects' to include boundary parcels
print("\nFiltering to Chicago (this takes 2-3 minutes)...")
chicago_parcels = gpd.sjoin(parcels, chicago, how='inner', predicate='intersects')

# Remove duplicate columns from join
print(f"Chicago parcels: {len(chicago_parcels):,}")
chicago_parcels = chicago_parcels[parcels.columns]

# Remove duplicate PINs, keep largest geometry
chicago_parcels = chicago_parcels.sort_values('Shape_Area', ascending=False)
chicago_parcels = chicago_parcels.drop_duplicates(subset='PIN10', keep='first')

print(f"Chicago parcels: {len(chicago_parcels):,}")
print(f"Reduction: {(1 - len(chicago_parcels)/len(parcels))*100:.1f}%")

# Save
chicago_parcels.to_file('data/processed/chicago_parcels_raw.geojson', driver='GeoJSON')
print("\nSaved to data/processed/chicago_parcels_raw.geojson")