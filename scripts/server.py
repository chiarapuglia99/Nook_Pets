from pathlib import Path
import sys
import os

# ==============================================================================
# CONFIGURAZIONE AMBIENTE E PATH
# ==============================================================================
# Assicuriamoci che la root del progetto sia nel sys.path
BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

try:
    from flask import Flask, request, jsonify, send_from_directory, send_file, make_response
    from flask_cors import CORS
except Exception as e:
    raise RuntimeError("Dipendenze mancanti: installa Flask e flask_cors (vedi requirements.txt)") from e

# Import script personalizzati (se presenti)
try:
    from scripts.posizione_utente import trova_rifugio_piu_vicino, load_rifugi_db, get_geolocator, calcola_coordinate
except ImportError:
    print("Warning: scripts.posizione_utente non trovato. Alcune funzioni saranno limitate.")
    trova_rifugio_piu_vicino = None
    load_rifugi_db = lambda: None
    get_geolocator = lambda: None
    calcola_coordinate = None

# ==============================================================================
# RILEVAMENTO CARTELLA FRONT-END
# ==============================================================================
STATIC_ROOT = BASE_DIR / 'front-end'
if not STATIC_ROOT.exists():
    # Tentativi alternativi
    for folder_name in ['frontend', 'front_end']:
        if (BASE_DIR / folder_name).exists():
            STATIC_ROOT = BASE_DIR / folder_name
            break

# Cerca index.html
index_file = None
if STATIC_ROOT.exists():
    matches = list(STATIC_ROOT.rglob('index.html'))
    if matches:
        index_file = matches[0]

FRONTEND_DIR = str(STATIC_ROOT) if STATIC_ROOT.exists() else None
INDEX_FULL_PATH = str(index_file) if index_file is not None else None
INDEX_PARENT = str(index_file.parent) if index_file is not None else None

print(f"[server] Static root: {FRONTEND_DIR}")
print(f"[server] Index file resolved: {index_file}")

# Creazione App
app = Flask(__name__, static_folder=FRONTEND_DIR if FRONTEND_DIR else None, static_url_path='')
CORS(app)


# Helper sicuro per inviare file
def safe_send_from_directory(base_dir: str, filename: str):
    if not base_dir: return None
    filename_normalized = filename.lstrip('/\\')
    filename_normalized = os.path.normpath(filename_normalized)
    base = Path(base_dir)
    target = base / filename_normalized
    try:
        base_res = base.resolve()
        target_res = target.resolve()
        target_res.relative_to(base_res)
    except Exception:
        return None
    if not target_res.exists():
        return None
    rel = str(target_res.relative_to(base_res))
    return send_from_directory(str(base_res), rel)


# ==============================================================================
# CARICAMENTO DATI IN MEMORIA
# ==============================================================================
# 1. DB Rifugi
if load_rifugi_db:
    try:
        load_rifugi_db()
        print("Database rifugi caricato in memoria.")
    except Exception as e:
        print(f"Attenzione: impossibile caricare il database dei rifugi: {e}")

# 2. Nomi Strade (per Autocomplete)
STREET_NAMES = []
try:
    from scripts.db_queries.queries import load_street_names

    STREET_NAMES = load_street_names()
    print(f"Caricate {len(STREET_NAMES)} nomi di strade per suggerimenti.")
except Exception as e:
    print(f"Impossibile caricare nomi strade: {e}")

GEOCODE_CACHE = {}


# ==============================================================================
# ROUTES FRONTEND
# ==============================================================================

@app.route('/')
def index():
    if INDEX_FULL_PATH:
        try:
            return send_file(INDEX_FULL_PATH)
        except Exception:
            pass
    if FRONTEND_DIR:
        return app.send_static_file('index.html')
    return "Index not found", 404


def try_send_static(filename):
    fn = filename.lstrip('/\\')
    if FRONTEND_DIR:
        res = safe_send_from_directory(FRONTEND_DIR, fn)
        if res: return res
    if INDEX_PARENT:
        res = safe_send_from_directory(INDEX_PARENT, fn)
        if res: return res
    return None


@app.route('/app.js')
def app_js():
    res = try_send_static('app.js')
    return res if res else ('', 404)


@app.route('/css/<path:filename>')
def css_file(filename):
    res = None
    if FRONTEND_DIR:
        res = safe_send_from_directory(os.path.join(FRONTEND_DIR, 'css'), filename)
        if res: return res
    if INDEX_PARENT:
        res = safe_send_from_directory(os.path.join(INDEX_PARENT, 'css'), filename)
        if res: return res
    return ('', 404)


@app.route('/js/<path:filename>')
def js_file(filename):
    res = None
    if FRONTEND_DIR:
        res = safe_send_from_directory(os.path.join(FRONTEND_DIR, 'js'), filename)
        if res: return res
    if INDEX_PARENT:
        res = safe_send_from_directory(os.path.join(INDEX_PARENT, 'js'), filename)
        if res: return res
    return ('', 404)


@app.route('/assets/<path:filename>')
def assets_file(filename):
    res = None
    if FRONTEND_DIR:
        res = safe_send_from_directory(os.path.join(FRONTEND_DIR, 'assets'), filename)
        if res: return res
    if INDEX_PARENT:
        res = safe_send_from_directory(os.path.join(INDEX_PARENT, 'assets'), filename)
        if res: return res
    return ('', 404)


@app.route('/<path:filename>')
def static_proxy(filename):
    res = try_send_static(filename)
    return res if res else ('', 404)


# ==============================================================================
# API ENDPOINTS
# ==============================================================================

@app.route('/api/nearest', methods=['POST'])
def api_nearest():
    if not trova_rifugio_piu_vicino:
        return jsonify({"successo": False, "messaggio": "Funzionalità non disponibile lato server."}), 501

    data = request.get_json(force=True)
    if not data or 'indirizzo' not in data:
        return jsonify({"successo": False, "messaggio": "Parametro 'indirizzo' mancante."}), 400

    indirizzo = data.get('indirizzo')
    if not isinstance(indirizzo, str) or indirizzo.strip() == '':
        return jsonify({"successo": False, "messaggio": "Indirizzo non valido."}), 400

    try:
        locator = get_geolocator() if get_geolocator else None
        risultato = trova_rifugio_piu_vicino(indirizzo, geolocator=locator)
        return jsonify(risultato)
    except Exception as e:
        return jsonify({"successo": False, "messaggio": str(e)}), 500


@app.route('/api/suggest-street')
def suggest_street():
    """Autocompletamento indirizzi"""
    q = (request.args.get('q') or '').strip()
    if not q: return jsonify({'suggestions': []})
    q_low = q.lower()

    # Logica di filtro semplice
    prefix_matches = [s for s in STREET_NAMES if
                      s['display'].lower().startswith(q_low) or s['name'].lower().startswith(q_low)]
    contains_matches = [s for s in STREET_NAMES if
                        (q_low in s['display'].lower() or q_low in s['name'].lower()) and s not in prefix_matches]
    results = (prefix_matches + contains_matches)[:20]

    # Arricchimento con cache (se disponibile)
    enriched = []
    try:
        for s in results:
            item = dict(s)
            keys = []
            if item.get('display'): keys.append(item['display'].strip().lower())
            name = (item.get('name') or '').strip()
            city = (item.get('city') or '').strip()
            if name:
                keys.append(name.lower())
                if city: keys.append(f"{name}, {city}".lower())

            for k in keys:
                if k in GEOCODE_CACHE:
                    cached = GEOCODE_CACHE.get(k, {})
                    if cached.get('postcode'): item['postcode'] = cached.get('postcode')
                    if cached.get('lat') is not None:
                        item['lat'] = cached.get('lat')
                        item['lon'] = cached.get('lon')
                    break
            enriched.append(item)
    except Exception:
        enriched = results
    return jsonify({'suggestions': enriched})


@app.route('/api/geocode-street', methods=['POST'])
def geocode_street():
    """Geocodifica on-demand per selezione autocomplete"""
    data = request.get_json(force=True) or {}
    q = data.get('q')
    if not q:
        name = data.get('name')
        city = data.get('city')
        state = data.get('state')
        if not name: return jsonify({'error': 'Missing name or q'}), 400
        parts = [name]
        if city: parts.append(city)
        if state: parts.append(state)
        q = ', '.join(parts)

    key = q.strip().lower()
    if key in GEOCODE_CACHE:
        return jsonify(GEOCODE_CACHE[key])

    try:
        geolocator = get_geolocator() if get_geolocator else None
        if not geolocator: raise Exception("Geolocator not initialized")

        location = None
        try:
            location = geolocator.geocode(q, addressdetails=True, exactly_one=True, timeout=10)
        except TypeError:
            location = geolocator.geocode(q, exactly_one=True, timeout=10)

        result = {'lat': None, 'lon': None, 'postcode': None, 'display': q}
        if location:
            result['lat'] = float(location.latitude)
            result['lon'] = float(location.longitude)
            try:
                raw = getattr(location, 'raw', {}) or {}
                address = raw.get('address', {}) if isinstance(raw, dict) else {}
                pc = address.get('postcode')
                if pc: result['postcode'] = str(pc)
            except Exception:
                pass

        GEOCODE_CACHE[key] = result
        return jsonify(result)
    except Exception as e:
        # Fallback a calcola_coordinate se disponibile
        if calcola_coordinate:
            try:
                lat, lon = calcola_coordinate(q, geolocator=get_geolocator())
                if lat is not None:
                    result = {'lat': float(lat), 'lon': float(lon), 'postcode': None, 'display': q}
                    GEOCODE_CACHE[key] = result
                    return jsonify(result)
            except Exception:
                pass
        return jsonify({'error': f'Geocoding failed: {e}'}), 500


# ==============================================================================
# GEOJSON QGIS ROUTES
# ==============================================================================

GEOJSON_DIR = BASE_DIR / 'animali_qgis' / 'geojson'


def _serve_geojson_safe(filename: str):
    """Serve file GeoJSON dalla cartella 'animali_qgis/geojson' in modo sicuro."""
    try:
        target = (GEOJSON_DIR / filename).resolve()
        base = GEOJSON_DIR.resolve()
        target.relative_to(base)  # Security Check
    except Exception:
        return jsonify({'error': 'Invalid file path.'}), 400

    if not target.exists():
        # Restituisce FeatureCollection vuota per non rompere il frontend
        return jsonify({"type": "FeatureCollection", "features": []})

    try:
        resp = make_response(send_file(str(target)))
        resp.headers['Content-Type'] = 'application/geo+json; charset=utf-8'
        resp.headers['Cache-Control'] = 'public, max-age=300, stale-while-revalidate=60'
        return resp
    except Exception as e:
        return jsonify({'error': f'Unable to read file: {e}'}), 500


@app.route('/api/geojson/zone_rosse')
def api_zone_rosse():
    # Assicurati che il file 'zone_rosse.geojson' sia nella cartella 'animali_qgis/geojson'
    return _serve_geojson_safe('zone_rosse.geojson')


@app.route('/api/geojson/animali_malati')
def api_animali_malati():
    return _serve_geojson_safe('animali_malati.geojson')


@app.route('/api/geojson/animali_randagi_prova')
def api_animali_randagi_prova():
    # Serve il file animali_randagi_prova.geojson se presente nella cartella GEOJSON_DIR
    return _serve_geojson_safe('animali_randagi_prova.geojson')


@app.route('/api/geojson/animali_randagi')
def api_animali_randagi():
    # Serve il file animali_randagi.geojson se presente nella cartella GEOJSON_DIR
    return _serve_geojson_safe('animali_randagi.geojson')


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)