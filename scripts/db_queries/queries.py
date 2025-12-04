import pandas as pd
from pathlib import Path
from typing import List
from geopy.geocoders import Nominatim
from geopy.extra.rate_limiter import RateLimiter
import time

DATA_DIR = Path(__file__).resolve().parents[2] / 'dataset'


def merge_streets(save_path: Path = None) -> pd.DataFrame:
    """
    Carica i file CSV delle strade di Long Beach, Los Angeles e Orange City,
    unifica i nomi delle strade rimuovendo duplicati e salva il risultato in un CSV.
    @:param save_path: Path dove salvare il CSV unificato (default: dataset/strade_all_unique.csv)
    @:return: DataFrame con le strade unificate
    Formato del DataFrame risultante:
        - name: nome della strada
        - city: città (Long Beach, Los Angeles, Orange)
        - state: stato (sempre 'CA')
    """
    files = [
        (DATA_DIR / 'strade_long_beach_cleaned.csv', 'Long Beach'),
        (DATA_DIR / 'strade_los_angeles_cleaned.csv', 'Los Angeles'),
        (DATA_DIR / 'strade_orange_city_cleaned.csv', 'Orange'),
    ]

    rows = []
    for f, city in files:
        if not f.exists():
            continue
        try:
            df = pd.read_csv(f, usecols=lambda c: c.lower() == 'name' or c == 'name')
        except Exception:
            df = pd.read_csv(f)
            if 'name' not in df.columns:
                continue
            df = df[['name']]

        # normalize name column
        df['name'] = df['name'].astype(str).str.strip()
        df = df[df['name'].notna()]
        df = df[df['name'] != '']
        # create rows with city/state
        for nm in df['name'].tolist():
            rows.append({'name': nm, 'city': city, 'state': 'CA'})

    if not rows:
        result = pd.DataFrame(columns=['name', 'city', 'state'])
        if save_path is None:
            save_path = DATA_DIR / 'strade_all_unique.csv'
        result.to_csv(save_path, index=False)
        return result

    all_df = pd.DataFrame(rows)
    # normalize whitespace and case for deduplication but keep original capitalization
    all_df['name_norm'] = all_df['name'].str.replace(r"\s+", " ", regex=True).str.lower()
    all_df['city_norm'] = all_df['city'].str.lower().str.strip()

    # drop duplicates based on name_norm + city_norm
    all_df = all_df.drop_duplicates(subset=['name_norm', 'city_norm'])

    result = all_df[['name', 'city', 'state']].sort_values(['city', 'name']).reset_index(drop=True)

    if save_path is None:
        save_path = DATA_DIR / 'strade_all_unique.csv'

    result.to_csv(save_path, index=False)
    return result


def enrich_with_geocode(enriched_path: Path = None, user_agent: str = 'nook_pets_geocoder', delay: float = 1.0):
    """
    Arricchisce il CSV unificato con latitudine, longitudine e postcode per ogni strada usando Nominatim.
    ATTENZIONE: usa il service Nominatim e rispetta le policy (rate limit). Questo script implementa un
    semplice rate limiter (delay tra le richieste). Per dataset grandi impiega molto tempo.

    Parametri:
      - enriched_path: Path dove salvare il CSV arricchito (default: dataset/strade_all_enriched.csv)
      - user_agent: user agent per Nominatim
      - delay: secondi di pausa tra le richieste (default 1.0)
    """
    if enriched_path is None:
        enriched_path = DATA_DIR / 'strade_all_enriched.csv'

    base = DATA_DIR / 'strade_all_unique.csv'
    if not base.exists():
        merge_streets(base)

    df = pd.read_csv(base)
    # aggiungi colonne
    df['lat'] = pd.NA
    df['lon'] = pd.NA
    df['postcode'] = pd.NA

    geolocator = Nominatim(user_agent=user_agent)
    geocode = RateLimiter(geolocator.geocode, min_delay_seconds=delay)

    for idx, row in df.iterrows():
        try:
            query = f"{row['name']}, {row.get('city','')}, {row.get('state','')}"
            location = geocode(query, addressdetails=True)
            if location:
                df.at[idx, 'lat'] = location.latitude
                df.at[idx, 'lon'] = location.longitude
                # try to extract postcode from address details
                details = location.raw.get('address', {})
                postcode = details.get('postcode') or details.get('postcode')
                if postcode:
                    df.at[idx, 'postcode'] = postcode
            # pause is handled by RateLimiter but we keep a tiny sleep to be polite
            time.sleep(delay * 0.1)
        except Exception as e:
            print(f"Geocode error idx={idx} name={row['name']}: {e}")
            time.sleep(delay)

    df.to_csv(enriched_path, index=False)
    return enriched_path


def load_street_names() -> List[dict]:
    """
    Carica (o genera) il CSV unificato e restituisce la lista di dict con campi:
      { 'name', 'city', 'state', 'display', 'lat', 'lon', 'postcode' }
    Se esiste `strade_all_enriched.csv` lo userà per includere lat/lon/postcode.
    """
    out = DATA_DIR / 'strade_all_enriched.csv'
    if not out.exists():
        out = DATA_DIR / 'strade_all_unique.csv'
        if not out.exists():
            merge_streets(out)

    try:
        df = pd.read_csv(out)
        entries = []
        if 'name' in df.columns:
            for _, r in df.iterrows():
                name = str(r['name']).strip()
                city = str(r.get('city', '')).strip()
                state = str(r.get('state', '')).strip()
                display = name
                if city:
                    display = f"{display}, {city}"
                if state:
                    display = f"{display}, {state}"

                lat = None
                lon = None
                postcode = None
                if 'lat' in r and not pd.isna(r['lat']):
                    try:
                        lat = float(r['lat'])
                    except Exception:
                        lat = None
                if 'lon' in r and not pd.isna(r['lon']):
                    try:
                        lon = float(r['lon'])
                    except Exception:
                        lon = None
                if 'postcode' in r and not pd.isna(r['postcode']):
                    postcode = str(r['postcode']).strip()

                entries.append({'name': name, 'city': city, 'state': state, 'display': display, 'lat': lat, 'lon': lon, 'postcode': postcode})
        return entries
    except Exception:
        return []
