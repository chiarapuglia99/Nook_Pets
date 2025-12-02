import pandas as pd
import numpy as np
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError
from pathlib import Path
from typing import Optional, Tuple

# In questo snippet di codice, è stata implementata la logica
# per trovare il rifugio per animali. Di seguito sono elencati i passaggi principali:
#   1. Caricare il database dei rifugi dal file CSV.
#   2. Geocodificare l'indirizzo fornito dall'utente, con gli opportuni controlli.
#   3. Calcolare la distanza tra l'utente e ciascun rifugio.
#   4. Restituire il rifugio più vicino.

# ==========================================
# 1. CARICAMENTO DATI E INIZIALIZZAZIONE SERVIZI
# ==========================================

# Inizializzazione variabili globali.
# rifugi_db conterrà il DataFrame dei rifugi.
# geolocator è l'istanza condivisa di Nominatim.
rifugi_db: Optional[pd.DataFrame] = None
_geolocator: Optional[Nominatim] = None


# Funzione per caricare il database dei rifugi
def load_rifugi_db(path: Optional[str] = None) -> pd.DataFrame:
    """
    Funzione per caricare il database dei rifugi da un file CSV.
    Se non viene fornito un percorso, viene caricato il file di default nella cartella 'dataset'.
    @param path: Percorso opzionale del file CSV
    @return: DataFrame pandas con i dati dei rifugi
    """

    global rifugi_db
    # Viene caricato il dataset. Se non specificato, si assume il percorso di default.
    if path is None:
        base = Path(__file__).resolve().parents[1]
        default_path = base / 'dataset' / 'rifugi_locations.csv'
    else:
        default_path = Path(path)

    # Se il file non esiste, viene sollevata un'eccezione, visibile in console.
    if not default_path.exists():
        raise FileNotFoundError(f"Impossibile trovare il file dei rifugi: {default_path}")

    # Caricamento del DataFrame e assegnazione alla variabile globale
    rifugi_db = pd.read_csv(default_path)
    return rifugi_db


# Funzione per ottenere l'istanza condivisa di Nominatim
def get_geolocator() -> Nominatim:
    """
    Restituisce l'istanza condivisa di Nominatim per il geocoding. Serve a evitare di creare
    più istanze in memoria ad ogni chiamata della funzione di geocoding.
    @return: Istanza di Nominatim
    """
    global _geolocator
    # Se non esiste, la crea assegnando un user_agent unico.
    if _geolocator is None:
        _geolocator = Nominatim(user_agent="app_rifugi_animali_project_v1")
    return _geolocator


# ==========================================
# 2. GEOCODING & CALCOLI MATEMATICI
# ==========================================


# Funzione per calcolare la distanza Haversine tra due punti geografici
def haversine_distance(lat1, lon1, lat2, lon2):
    """
    Haversine è una funzione che calcola la distanza tra due punti sulla superficie terrestre
    dati la latitudine e la longitudine di entrambi i punti.
    In output sarà restituita la distanza in chilometri.
    @param lat1: Latitudine del punto 1
    @param lon1: Longitudine del punto 1
    @param lat2: Latitudine del punto 2
    @param lon2: Longitudine del punto 2
    @return: Distanza in chilometri tra i due punti
    """

    # Raggio della Terra in km
    R = 6371
    # Conversione dei gradi in radianti
    phi1, phi2 = np.radians(lat1), np.radians(lat2)
    # Differenza delle coordinate latitudinali
    dphi = np.radians(lat2 - lat1)
    # Differenza delle coordinate longitudinali
    dlambda = np.radians(lon2 - lon1)

    # Formula di Haversine calcola la distanza tra due punti sulla superficie di una sfera,
    # date le loro coordinate di latitudine e longitudine.
    # Viene utilizzata in navigazione e geodesia per trovare la distanza ortodromica (la più breve)
    a = np.sin(dphi / 2) ** 2 + np.cos(phi1) * np.cos(phi2) * np.sin(dlambda / 2) ** 2
    c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))
    return R * c


# Funzione per calcolare le coordinate geografiche da un indirizzo testuale
def calcola_coordinate(indirizzo_input: str, geolocator: Optional[Nominatim] = None) -> Tuple[Optional[float], Optional[float]]:
    """
    Trasforma un indirizzo testuale in coordinate geografiche (latitudine, longitudine).
    L'input è fornito dall'utente tramite l'interfaccia web, ed essendo quest'ultimo poco
    esperto, l'indirizzo potrebbe essere incompleto o ambiguo. La funzione tenta di gestire questi casi
    perfezionando l'input prima di inviarlo al servizio di geocoding.
    @param indirizzo_input: Indirizzo testuale fornito dall'utente
    @param geolocator: opzionale geolocator (utile per i test)
    @return: Tuple (latitudine, longitudine) o (None, None) se non trovato
    """

    if geolocator is None:
        geolocator = get_geolocator()

    # --- GESTIONE AMBIGUITÀ ---
    suffisso_default = ", Los Angeles County, CA, USA"

    # Controlla se l'indirizzo contiene già "CA" o "USA" (case insensitive)
    indirizzo_input_upper = indirizzo_input.upper()

    # Se manca, aggiunge il suffisso di default per Los Angeles County
    if "CA" not in indirizzo_input_upper and "USA" not in indirizzo_input_upper:
        indirizzo_da_cercare = f"{indirizzo_input}{suffisso_default}"

    # Altrimenti, usa l'indirizzo così com'è
    else:
        indirizzo_da_cercare = indirizzo_input

    # --- CHIAMATA AL SERVIZIO DI GEOCODING ---
    try:
        location = geolocator.geocode(
            indirizzo_da_cercare,
            country_codes="us",
            timeout=10
        )

        # Se la localizzazione è trovata, restituisce latitudine e longitudine, altrimenti None
        if location:
            return location.latitude, location.longitude
        else:
            return None, None

    # Gestione errori di connessione al servizio di geocoding
    except (GeocoderTimedOut, GeocoderServiceError) as e:
        print(f" Errore di connessione al servizio mappe: {e}")
        return None, None


# ==========================================
# 3. LOGICA APPLICATIVA
# ==========================================

# Funzione principale per trovare il rifugio più vicino
def trova_rifugio_piu_vicino(indirizzo_utente: str, rifugi_df: Optional[pd.DataFrame] = None, geolocator: Optional[Nominatim] = None) -> dict:
    """
    Funzione principale chiamata dall'interfaccia utente.
    1. Geocodifica l'indirizzo.
    2. Calcola le distanze.
    3. Restituisce il rifugio migliore.

    Accetta opzionalmente un DataFrame dei rifugi (utile per test e per evitare variabili globali).
    """

    # Passo A: Ottenere coordinate utente
    lat_utente, lon_utente = calcola_coordinate(indirizzo_utente, geolocator=geolocator)

    if lat_utente is None:
        return {
            "successo": False,
            "messaggio": "Indirizzo non trovato. Prova ad inserire anche la Città o il CAP."
        }

    # Passo B: Trovare il DataFrame da usare
    if rifugi_df is None:
        if rifugi_db is None:
            raise ValueError("Database dei rifugi non caricato. Chiama load_rifugi_db() prima di usare questa funzione.")
        df_calcolo = rifugi_db.copy()
    else:
        df_calcolo = rifugi_df.copy()

    print(f"📍 Posizione Utente identificata: {lat_utente}, {lon_utente}")

    # Assicuriamoci che le colonne esistano
    required_cols = {"Latitude", "Longitude", "Shelter_Name", "Address", "City"}
    if not required_cols.issubset(set(df_calcolo.columns)):
        missing = required_cols - set(df_calcolo.columns)
        raise KeyError(f"Colonne mancanti nel dataset dei rifugi: {missing}")

    # Passo B: Calcolo distanze su tutto il database
    df_calcolo['distanza_km'] = haversine_distance(
        lat_utente, lon_utente,
        df_calcolo['Latitude'], df_calcolo['Longitude']
    )

    # Passo C: Trovare il minimo e formattare la risposta
    rifugio_top = df_calcolo.sort_values('distanza_km').iloc[0]

    # Convertiamo i valori numpy a tipi Python nativi per la serializzazione JSON
    lat_rif = float(rifugio_top['Latitude'])
    lon_rif = float(rifugio_top['Longitude'])
    lat_u = float(lat_utente)
    lon_u = float(lon_utente)
    distanza = float(round(rifugio_top['distanza_km'], 2))

    risultato = {
        "successo": True,
        "dati_rifugio": {
            "nome": str(rifugio_top['Shelter_Name']),
            "indirizzo": f"{rifugio_top['Address']}, {rifugio_top['City']}",
            "distanza_km": distanza,
            "posizione_rifugio": (lat_rif, lon_rif)
        },
        "coordinate_utente": (lat_u, lon_u)
    }
    return risultato


# ==========================================
# 4. SIMULAZIONE INTERFACCIA UTENTE
# ==========================================

# Simulazione di un caso d'uso reale dell'applicazione
if __name__ == "__main__":
    print("\n--- AVVIO SIMULAZIONE APP ---")

    try:
        # Caricamento del database dei rifugi, in caso di errore
        # viene stampato in console il messaggio
        load_rifugi_db()
        print("Database rifugi caricato correttamente.")
    except Exception as e:
        print(f"Errore caricamento database rifugi: {e}")

    # In questo caso di esempio, l'input utente è un indirizzo incompleto
    input_utente = "4000 E Anaheim St"

    risposta = trova_rifugio_piu_vicino(input_utente)

    # Se la ricerca ha successo, vengono stampati i dati del rifugio più vicino,
    # altrimenti un errore.
    if risposta["successo"]:
        dati = risposta["dati_rifugio"]
        print("\nRISULTATO PER L'UTENTE:")
        print(f"Il rifugio più vicino è: {dati['nome']}")
        print(f"Indirizzo: {dati['indirizzo']}")
        print(f"Distanza: {dati['distanza_km']} km")
        print("-" * 30)
    else:
        print(f"\nERRORE: {risposta['messaggio']}")