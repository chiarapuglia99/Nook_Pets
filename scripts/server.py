from pathlib import Path
import sys
import os

# Assicuriamoci che la root del progetto sia nel sys.path così che `import scripts.*` funzioni
BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

try:
    from flask import Flask, request, jsonify, send_from_directory
    from flask_cors import CORS
except Exception as e:
    raise RuntimeError("Dipendenze mancanti: installa Flask e flask_cors (vedi requirements.txt)") from e

from scripts.posizione_utente import trova_rifugio_piu_vicino, load_rifugi_db, get_geolocator, calcola_coordinate

# =====================================
# Rilevamento dinamico della cartella front-end
# =====================================
# Procedura:
# 1. Consideriamo come static root BASE_DIR/'front-end' (se esiste).
# 2. Cerchiamo il file index.html all'interno di quella cartella o sue sottocartelle.
# 3. Se index.html si trova in una sottocartella (es. front-end/template/index.html), serviamo
#    l'index da lì ma manteniamo lo static_folder come front-end root in modo che /css/... funzioni.

STATIC_ROOT = BASE_DIR / 'front-end'
if not STATIC_ROOT.exists():
    # fallback a frontend o front_end
    if (BASE_DIR / 'frontend').exists():
        STATIC_ROOT = BASE_DIR / 'frontend'
    elif (BASE_DIR / 'front_end').exists():
        STATIC_ROOT = BASE_DIR / 'front_end'

# Trova index.html sotto STATIC_ROOT
index_file = None
if STATIC_ROOT.exists():
    matches = list(STATIC_ROOT.rglob('index.html'))
    if matches:
        index_file = matches[0]

# Se non abbiamo trovato index, tentiamo di trovare in candidate dirs (legacy)
if index_file is None:
    for cand in [BASE_DIR / 'front-end', BASE_DIR / 'frontend', BASE_DIR / 'front_end']:
        if cand.exists():
            matches = list(cand.rglob('index.html'))
            if matches:
                index_file = matches[0]
                # ensure STATIC_ROOT points to cand
                STATIC_ROOT = cand
                break

# se ancora nulla, fallback al STATIC_ROOT (potrebbe non esistere)
if index_file is None and STATIC_ROOT.exists():
    # index may be directly under STATIC_ROOT but missing; set index_file None and let 404 surface
    pass

FRONTEND_DIR = str(STATIC_ROOT)
INDEX_REL_PATH = None
INDEX_PARENT = None
if index_file is not None:
    try:
        INDEX_REL_PATH = str(index_file.relative_to(STATIC_ROOT))
    except Exception:
        INDEX_REL_PATH = str(index_file.name)
    INDEX_PARENT = str(index_file.parent)

print(f"[server] Static root: {FRONTEND_DIR}")
print(f"[server] Index file resolved: {index_file}")

# Creazione dell'app Flask e abilitazione di CORS per permettere richieste cross-origin
app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')
CORS(app)

# Carichiamo il DB dei rifugi all'avvio
try:
    load_rifugi_db()
    print("Database rifugi caricato in memoria.")
except Exception as e:
    print(f"Attenzione: impossibile caricare il database dei rifugi: {e}")

# Carichiamo lista strade per suggerimenti (autocomplete)
try:
    from scripts.db_queries.queries import load_street_names
    STREET_NAMES = load_street_names()
    print(f"Caricate {len(STREET_NAMES)} nomi di strade per suggerimenti.")
except Exception as e:
    STREET_NAMES = []
    print(f"Impossibile caricare nomi strade: {e}")

# Serve index.html dalla posizione trovata (se non trovata, lascia che Flask serva il file index.html nel static root)
@app.route('/')
def index():
    if INDEX_REL_PATH:
        return send_from_directory(FRONTEND_DIR, INDEX_REL_PATH)
    else:
        # fallback: serve index.html dalla static folder direttamente
        return app.send_static_file('index.html')

# Route helper: prova a servire file statici prima dalla static root, poi dalla index parent (se diverso)
def try_send_static(filename):
    # Attempt 1: from static root
    static_path = Path(FRONTEND_DIR) / filename
    if static_path.exists():
        return send_from_directory(FRONTEND_DIR, filename)
    # Attempt 2: from index parent (es. front-end/template)
    if INDEX_PARENT:
        alt_path = Path(INDEX_PARENT) / filename
        if alt_path.exists():
            return send_from_directory(INDEX_PARENT, filename)
    return None

# Se index.html fa riferimento a /app.js ma il file è sotto una sottocartella, servilo correttamente
@app.route('/app.js')
def app_js():
    res = try_send_static('app.js')
    if res:
        return res
    # some projects put app.js under 'template' folder
    if INDEX_PARENT:
        if (Path(INDEX_PARENT) / 'app.js').exists():
            return send_from_directory(INDEX_PARENT, 'app.js')
    return ('', 404)

# Specific routes for common asset folders (css, js, assets) to handle cases where index.html
# resides in a subfolder but assets are located in sibling directories like ../css or ../assets
@app.route('/css/<path:filename>')
def css_file(filename):
    # prefer STATIC_ROOT/css
    css_path = Path(FRONTEND_DIR) / 'css' / filename
    if css_path.exists():
        return send_from_directory(Path(FRONTEND_DIR) / 'css', filename)
    # fallback: try index parent /css
    if INDEX_PARENT:
        alt = Path(INDEX_PARENT) / 'css' / filename
        if alt.exists():
            return send_from_directory(Path(INDEX_PARENT) / 'css', filename)
    return ('', 404)

@app.route('/js/<path:filename>')
def js_file(filename):
    js_path = Path(FRONTEND_DIR) / 'js' / filename
    if js_path.exists():
        return send_from_directory(Path(FRONTEND_DIR) / 'js', filename)
    if INDEX_PARENT:
        alt = Path(INDEX_PARENT) / 'js' / filename
        if alt.exists():
            return send_from_directory(Path(INDEX_PARENT) / 'js', filename)
    return ('', 404)

@app.route('/assets/<path:filename>')
def assets_file(filename):
    a_path = Path(FRONTEND_DIR) / 'assets' / filename
    if a_path.exists():
        return send_from_directory(Path(FRONTEND_DIR) / 'assets', filename)
    if INDEX_PARENT:
        alt = Path(INDEX_PARENT) / 'assets' / filename
        if alt.exists():
            return send_from_directory(Path(INDEX_PARENT) / 'assets', filename)
    return ('', 404)

# Aggiungiamo un catch-all per file statici non trovati che prova l'altra cartella
@app.route('/<path:filename>')
def static_proxy(filename):
    # Let Flask's static handling try first (it already handles static_folder), but this route will be used
    # when static file not found via default mechanism. Try to serve from index parent as fallback.
    res = try_send_static(filename)
    if res:
        return res
    return ('', 404)

# Definizione della route API per trovare il rifugio più vicino
@app.route('/api/nearest', methods=['POST'])
def api_nearest():
    # Estrazione dell'indirizzo dalla richiesta JSON
    # Se l'indirizzo manca o non è valido, restituisce un errore 400
    data = request.get_json(force=True)
    if not data or 'indirizzo' not in data:
        return jsonify({"successo": False, "messaggio": "Parametro 'indirizzo' mancante."}), 400

    # Validazione dell'indirizzo
    # Se l'indirizzo non è una stringa valida, restituisce un errore 400
    indirizzo = data.get('indirizzo')
    if not isinstance(indirizzo, str) or indirizzo.strip() == '':
        return jsonify({"successo": False, "messaggio": "Indirizzo non valido."}), 400

    # Trova il rifugio più vicino utilizzando la funzione definita in posizione_utente.py
    # Gestione delle eccezioni per problemi di geocoding o altri errori
    try:
        # Passiamo il geolocator condiviso per evitare di ricrearlo ogni richiesta
        risultato = trova_rifugio_piu_vicino(indirizzo, geolocator=get_geolocator())
        return jsonify(risultato)
    except Exception as e:
        return jsonify({"successo": False, "messaggio": str(e)}), 500


# API endpoint per suggerimenti di strade (autocomplete) - ritorna oggetti strutturati
@app.route('/api/suggest-street')
def suggest_street():
    q = (request.args.get('q') or '').strip()
    if not q:
        return jsonify({'suggestions': []})
    q_low = q.lower()
    # ricerca prefisso e anche occorrenze (prioritizza prefisso)
    prefix_matches = [s for s in STREET_NAMES if s['display'].lower().startswith(q_low) or s['name'].lower().startswith(q_low)]
    contains_matches = [s for s in STREET_NAMES if (q_low in s['display'].lower() or q_low in s['name'].lower()) and s not in prefix_matches]
    results = prefix_matches + contains_matches
    results = results[:20]

    # Arricchisci le suggestion con dati della cache di geocoding (se presenti)
    enriched = []
    try:
        for s in results:
            # copia per non mutare l'originale
            item = dict(s)
            # costruisci chiavi possibili usate in GEOCODE_CACHE
            keys = []
            if item.get('display'):
                keys.append(item['display'].strip().lower())
            # name, city, state combinations
            name = (item.get('name') or '').strip()
            city = (item.get('city') or '').strip()
            state = (item.get('state') or '').strip()
            if name:
                keys.append(name.lower())
                if city:
                    keys.append(f"{name}, {city}".lower())
                if city and state:
                    keys.append(f"{name}, {city}, {state}".lower())
            # try to find a cache entry
            found = False
            for k in keys:
                if k in GEOCODE_CACHE:
                    cached = GEOCODE_CACHE.get(k, {})
                    if cached.get('postcode'):
                        item['postcode'] = cached.get('postcode')
                    if cached.get('lat') is not None and cached.get('lon') is not None:
                        item['lat'] = cached.get('lat')
                        item['lon'] = cached.get('lon')
                    found = True
                    break
            enriched.append(item)
    except Exception:
        # in caso di problemi, fallback ai risultati originali
        enriched = results

    return jsonify({'suggestions': enriched})

@app.route('/api/debug-sample')
def debug_sample():
    # ritorna una voce campione con lat/lon per test rapido della UI
    try:
        for s in STREET_NAMES:
            if s.get('lat') is not None and s.get('lon') is not None:
                return jsonify({'sample': s})
    except Exception:
        pass
    # fallback: ritorna un punto noto a Long Beach
    sample = {
        'name': 'Pacific Avenue',
        'city': 'Long Beach',
        'state': 'CA',
        'display': 'Pacific Avenue, Long Beach, CA',
        'lat': 33.7701,
        'lon': -118.1937,
        'postcode': '90802'
    }
    return jsonify({'sample': sample})

# Aggiunta dell'endpoint per geocodifica on-demand
# Geocodifica un indirizzo e restituisce lat/lon/postcode
# Usa una cache in-memory per evitare chiamate ripetute
GEOCODE_CACHE = {}

@app.route('/api/geocode-street', methods=['POST'])
def geocode_street():
    """Geocode on-demand a street entry. Accepts JSON with either:
       { "name": "Cherry Avenue", "city": "Long Beach", "state": "CA" }
       or { "q": "Cherry Avenue, Long Beach, CA" }
       Returns { lat, lon, postcode, display }
    """
    data = request.get_json(force=True) or {}
    q = data.get('q')
    name = data.get('name')
    city = data.get('city')
    state = data.get('state')

    if not q:
        if not name:
            return jsonify({'error': 'Missing name or q parameter'}), 400
        parts = [name]
        if city:
            parts.append(city)
        if state:
            parts.append(state)
        q = ', '.join(parts)

    key = q.strip().lower()
    if key in GEOCODE_CACHE:
        return jsonify({'lat': GEOCODE_CACHE[key].get('lat'), 'lon': GEOCODE_CACHE[key].get('lon'), 'postcode': GEOCODE_CACHE[key].get('postcode'), 'display': GEOCODE_CACHE[key].get('display')})

    # Use geolocator directly to obtain address details (postcode) when possible
    try:
        geolocator = get_geolocator()
        # try to get detailed address to extract postcode
        location = None
        try:
            # prefer addressdetails if supported
            location = geolocator.geocode(q, addressdetails=True, exactly_one=True, timeout=10)
        except TypeError:
            # some geolocators might not accept addressdetails param; fallback
            location = geolocator.geocode(q, exactly_one=True, timeout=10)

        result = {'lat': None, 'lon': None, 'postcode': None, 'display': q}
        if location:
            try:
                result['lat'] = float(location.latitude)
                result['lon'] = float(location.longitude)
            except Exception:
                pass
            # attempt to extract postcode from raw address details
            try:
                raw = getattr(location, 'raw', {}) or {}
                address = raw.get('address', {}) if isinstance(raw, dict) else {}
                postcode = address.get('postcode') if isinstance(address, dict) else None
                if postcode:
                    result['postcode'] = str(postcode)
            except Exception:
                # ignore
                pass
        # cache result
        GEOCODE_CACHE[key] = result
        return jsonify(result)
    except Exception as e:
        # fallback: try calcola_coordinate if present
        try:
            if calcola_coordinate is not None:
                lat, lon = calcola_coordinate(q, geolocator=get_geolocator())
                result = {'lat': None, 'lon': None, 'postcode': None, 'display': q}
                if lat is not None and lon is not None:
                    result['lat'] = float(lat)
                    result['lon'] = float(lon)
                GEOCODE_CACHE[key] = result
                return jsonify(result)
        except Exception:
            pass
        return jsonify({'error': f'Geocoding failed: {e}'}), 500

# Avvio del server Flask in modalità debug, con PORT configurabile tramite variabile d'ambiente
if __name__ == '__main__':
    host = os.environ.get('HOST', '127.0.0.1')
    port = int(os.environ.get('PORT', os.environ.get('FLASK_RUN_PORT', '5000')))
    try:
        print(f"Avvio server su http://{host}:{port} ...")
        # use_reloader=False evita che il processo venga duplicato quando lanciato in background
        app.run(debug=True, host=host, port=port, use_reloader=False, threaded=True)
    except OSError as e:
        print(f"Errore avvio server: {e}")
        raise
