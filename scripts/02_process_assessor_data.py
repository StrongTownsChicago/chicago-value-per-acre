import pandas as pd

print("Loading assessor data (large file, takes 1-2 minutes)...")
# Load in chunks to handle large file
chunks = []
for chunk in pd.read_csv('data/raw/assessor/Assessor_-_Assessed_Values_2024.csv', chunksize=100000):
    # Filter to 2024 tax year only while loading
    chunk_2024 = chunk[chunk['tax_year'] == 2024]
    chunks.append(chunk_2024)

assessor = pd.concat(chunks, ignore_index=True)
print(f"Total 2024 records: {len(assessor):,}")

# Clean monetary fields and convert to float (they are prepended with $ and may have commas)
assessor['board_tot'] = assessor['board_tot'].replace(r'[\$,]', '', regex=True).astype(float)
assessor['certified_tot'] = assessor['certified_tot'].replace(r'[\$,]', '', regex=True).astype(float)

# Use board_tot (final value) preferentially, fall back to certified_tot
assessor['final_value'] = assessor['board_tot'].fillna(assessor['certified_tot'])
assessor = assessor[assessor['final_value'].notnull()].copy()
print(f"Records with final values: {len(assessor):,}")

# Standardize PIN to first 10 digits for joining with GIS data
def clean_pin_10digit(pin):
    if pd.isna(pin):
        return None
    pin_str = str(pin).replace('-', '').replace(' ', '').strip()
    if '.' in pin_str:
        pin_str = pin_str.split('.')[0]
    # Take first 10 digits, zero-pad if shorter
    pin_str = pin_str[:10].zfill(10)
    return pin_str if len(pin_str) == 10 else None

assessor['pin_10'] = assessor['pin'].apply(clean_pin_10digit)
assessor = assessor[assessor['pin_10'].notnull()]

# Convert class to string before grouping 
assessor['class'] = assessor['class'].astype(str)

# Group by 10-digit PIN and sum values (aggregates condo units)
assessor = assessor.groupby('pin_10', as_index=False).agg({
    'final_value': 'sum',  # Sum all units in building
    'class': 'first'       # Keep first class code
})

# Keep essential columns
assessor = assessor[['pin_10', 'final_value', 'class']]

# Save
assessor.to_csv('data/processed/assessor_2024_clean.csv', index=False)
print(f"\nSaved {len(assessor):,} records to data/processed/assessor_2024_clean.csv")