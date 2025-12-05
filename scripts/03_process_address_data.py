import pandas as pd

print("Loading address data...")
# https://datacatalog.cookcountyil.gov/Property-Taxation/Assessor-Parcel-Addresses/3723-97qp
addresses = pd.read_csv('data/raw/addresses/Assessor_-_Parcel_Addresses_20251130.csv', dtype={
        'property_zip': 'string',
})

# Clean PIN to 10 digits
addresses['pin_10'] = addresses['pin10'].astype(str).str.zfill(10)

# Clean ZIP
addresses['property_zip'] = addresses['property_zip'].str.replace('.0', '', regex=False)

# Combine address components into single field
addresses['full_address'] = (
    addresses['property_address'].fillna('') + ', ' +
    addresses['property_city'].fillna('') + ', ' +
    addresses['property_state'].fillna('') + ' ' +
    addresses['property_zip'].fillna('')
).str.strip().str.rstrip(',').str.strip()

# Keep one address per PIN10
addresses = addresses.drop_duplicates(subset='pin_10', keep='first')
addresses = addresses[['pin_10', 'full_address']]

addresses.to_csv('data/processed/addresses_clean.csv', index=False)
print(f"Saved {len(addresses):,} addresses")