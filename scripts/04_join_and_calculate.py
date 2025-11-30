import geopandas as gpd
import pandas as pd
import os

# Load data
print("Loading Chicago parcels...")
parcels = gpd.read_file('data/processed/chicago_parcels_raw.geojson')

print("Loading assessor data...")
assessor = pd.read_csv('data/processed/assessor_2024_clean.csv')

print("Loading addresses...")
addresses = pd.read_csv('data/processed/addresses_clean.csv')

# normalize PIN columns to string
assessor['pin_10'] = assessor['pin_10'].astype(str)
addresses['pin_10'] = addresses['pin_10'].astype(str)

# Standardize parcel PINs to 10 digits
def clean_pin_10digit(pin):
    if pd.isna(pin):
        return None
    pin_str = str(pin).replace('-', '').replace(' ', '').strip()
    if '.' in pin_str:
        pin_str = pin_str.split('.')[0]
    return pin_str[:10].zfill(10) if len(pin_str) >= 10 else pin_str.zfill(10)

# Find PIN field (might be 'PIN', 'PIN10', or 'pin')
pin_col = [c for c in parcels.columns if 'pin' in c.lower()][0]
print(f"PIN column in parcels: {pin_col}")

parcels['pin_10'] = parcels[pin_col].apply(clean_pin_10digit)

# Join
print("\nJoining datasets...")
joined = parcels.merge(assessor, on='pin_10', how='left')
joined = joined.merge(addresses, on='pin_10', how='left')

matched = joined['final_value'].notnull().sum()
print(f"Match rate: {matched/len(joined)*100:.1f}% ({matched:,}/{len(joined):,})")

# Filter to matched parcels only
joined = joined[joined['final_value'].notnull()].copy()

# Calculate acres
SQFT_PER_ACRE = 43560

# Get area field
area_col = [c for c in joined.columns if 'area' in c.lower() and 'pin' not in c.lower()][0]
print(f"Area column: {area_col}")

joined['acres'] = joined[area_col] / SQFT_PER_ACRE

# Apply class-specific multipliers to get market value
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

print("\nSample of final data:")
print(joined[['pin_10', 'value_per_acre', 'market_value', 'class']].head(20))
print("\nValue per acre range:")
print(f"Min: ${joined['value_per_acre'].min():,.0f}")
print(f"Max: ${joined['value_per_acre'].max():,.0f}")
print("\nClass distribution:")
print(joined['class'].value_counts().head(10))
print("\nTop 10 highest value/acre parcels:")
top10 = joined.nlargest(10, 'value_per_acre')[['pin_10', 'value_per_acre', 'market_value', 'acres', 'class']]
print(top10)

# Save
joined.to_file('data/processed/chicago_parcels_final.geojson', driver='GeoJSON')
print("\nSaved to data/processed/chicago_parcels_final.geojson")

# Check file size
size_mb = os.path.getsize('data/processed/chicago_parcels_final.geojson') / (1024*1024)
print(f"File size: {size_mb:.1f} MB")