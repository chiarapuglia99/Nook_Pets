import pandas as pd
from pathlib import Path
import re

# Percorsi assoluti
base_dir = Path(__file__).resolve().parent.parent
input_path = base_dir / 'dataset' / 'animali-rifugi.csv'
output_path = base_dir / 'dataset' / 'animali-rifugi-clean.csv'

df = pd.read_csv(input_path)

# 1. Colonna Health da Sex
# Crea la colonna Health
if 'Health' not in df.columns:
    df['Health'] = None
mask = df['Sex'].isin(['Spayed', 'Neutered'])
df.loc[mask, 'Health'] = df.loc[mask, 'Sex']
df.loc[df['Health'] == 'Spayed', 'Sex'] = 'Female'
df.loc[df['Health'] == 'Neutered', 'Sex'] = 'Male'
# Regole aggiuntive
condition_female = (df['Sex'] == 'Female') & (df['Health'].isnull())
df.loc[condition_female, 'Health'] = 'Spayed'
condition_male = (df['Sex'] == 'Male') & (df['Health'].isnull())
df.loc[condition_male, 'Health'] = 'Neutered'

df['Health'] = df['Health'].fillna('Unknown')
print("Valori null sostituiti in 'Health':")
print(df['Health'].unique())

# 2. Colonna Animal Name: sostituisci NULL con Unknown e rimuovi asterisco iniziale
if 'Animal Name' in df.columns:
    df['Animal Name'] = df['Animal Name'].fillna('Unknown')
    df['Animal Name'] = df['Animal Name'].astype(str).str.lstrip('*')

# 3. Colonna DOB: sostituisci NULL con Unknown
if 'DOB' in df.columns:
    df['DOB'] = df['DOB'].fillna('Unknown')

# 4. Colonna Reason for Intake: sostituisci NULL con Unknown
if 'Reason for Intake' in df.columns:
    df['Reason for Intake'] = df['Reason for Intake'].fillna('Unknown')

# 5. Colonne latitude, longitude, geopoint: controllo valori null o 0 (non rimuovo, solo controllo)
cols_to_check = ['latitude', 'longitude', 'geopoint']
for col in cols_to_check:
    if col in df.columns:
        df[col] = df[col].replace(0, pd.NA)

# 6. Colonna Outcome Subtype: sostituisci NULL con Unknown
if 'Outcome Subtype' in df.columns:
    df['Outcome Subtype'] = df['Outcome Subtype'].fillna('Unknown')

# 7. Colonna Secondary Color: sostituisci NULL con Unknown
if 'Secondary Color' in df.columns:
    df['Secondary Color'] = df['Secondary Color'].fillna('Unknown')

# DEBUG: verifica colonne e valori unici
cols_to_debug = ['outcome_is_dead', 'outcome_is_other', 'outcome_is_alive']
for col in cols_to_debug:
    if col in df.columns:
        print(f"Colonna trovata: {col}")
        print(df[col].head(10))
        print(df[col].unique()[:20])
    else:
        print(f"Colonna NON trovata: {col}")

# DEBUG: stampa valori grezzi come stringa per identificare i punti
for col in ['outcome_is_dead', 'outcome_is_other', 'outcome_is_alive']:
    if col in df.columns:
        print(f"Valori grezzi in {col} (come stringa):")
        print(df[col].astype(str).head(20).to_list())
        print(df[col].astype(str).unique()[:20])

# 8. Rimozione del punto o simbolo iniziale da outcome_is_dead, outcome_is_other, outcome_is_alive
cols_to_clean = ['outcome_is_dead', 'outcome_is_other', 'outcome_is_alive']
# Rimuove qualsiasi carattere non alfanumerico iniziale
pattern = r'^[^\w\d]+'
for col in cols_to_clean:
    if col in df.columns:
        df[col] = df[col].fillna('').astype(str).str.replace(pattern, '', regex=True).str.strip()


# 9. Reason for Intake: rinomina e sostituisci NULL/"NULL" con Unknown
if 'Reason for Intake' in df.columns:
    df = df.rename(columns={'Reason for Intake': 'reason_for_Intake'})
    col_name = 'reason_for_Intake'
    df[col_name] = df[col_name].fillna('Unknown')
    df[col_name] = df[col_name].replace('NULL', 'Unknown')

# Salva il risultato
print(f"Salvataggio su {output_path}")
# Crea la cartella di destinazione se non esiste
Path(output_path).parent.mkdir(parents=True, exist_ok=True)
df.to_csv(output_path, index=False)
print("Pulizia completata.")
