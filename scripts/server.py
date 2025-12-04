"""
Il seguente snippet di codice implementa un server web Flask che fornisce
un'API per trovare il rifugio più vicino dato un indirizzo. Il server gestisce
anche i file statici presenti nella cartella front-end, con rilevamento dinamico
della posizione di index.html. Supporta CORS, permettendo richieste cross-origin dalla UI front-end.
Inoltre, include un endpoint API per suggerimenti di strade (autocomplete) e
geocodifica on-demand con caching in memoria.
"""
from pathlib import Path
import sys
import os

# Aggiunta della cartella principale del progetto al sys.path per importazioni locali
# Gestione del cross-platform, in quanto su Windows il path separator è diverso rispetto a Unix/Mac.
BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# Importazione delle dipendenze Flask e CORS, con gestione degli errori se mancanti
try:
    from flask import Flask, request, jsonify, send_from_directory
    from flask_cors import CORS
except Exception as e:
    raise RuntimeError("Dipendenze mancanti: installa Flask e flask_cors (vedi requirements.txt)") from e

from scripts.posizione_utente import trova_rifugio_piu_vicino, load_rifugi_db, get_geolocator, calcola_coordinate

# =====================================
# Rilevamento dinamico della cartella front-end
# =====================================
# La procedura è la seguente:
#   1. Consideriamo come static root BASE_DIR/'front-end', se esiste. Altrimenti, fallback a
#      BASE_DIR/'frontend' o BASE_DIR/'front_end' (legacy).
#   2. Cerchiamo index.html sotto static root (ricerca ricorsiva), se trovato lo usiamo.
#   3. Se non trovato, cerchiamo index.html in BASE_DIR/'front-end', 'frontend', 'front_end' (legacy),
#      in ordine, con ricerca ricorsiva. Se trovato, usiamo quello e impostiamo static root a quella cartella.
#   4. Se ancora non trovato, lasciamo static root come al punto 1 (potrebbe non esistere).
#   5. Impostiamo FRONTEND_DIR a static root se esiste, altrimenti None.
#   6. Impostiamo INDEX_REL_PATH come percorso relativo di index.html rispetto a FRONTEND_DIR, se trovato.
#   7. Impostiamo INDEX_PARENT come la cartella padre di index.html, se trovato.
# =====================================

# Step 1: determiniamo lo STATIC_ROOT
STATIC_ROOT = BASE_DIR / 'front-end'
if not STATIC_ROOT.exists():
    # fallback a frontend o front_end
    if (BASE_DIR / 'frontend').exists():
        STATIC_ROOT = BASE_DIR / 'frontend'
    elif (BASE_DIR / 'front_end').exists():
        STATIC_ROOT = BASE_DIR / 'front_end'

# Step 2: cerchiamo index.html sotto STATIC_ROOT
index_file = None
if STATIC_ROOT.exists():
    matches = list(STATIC_ROOT.rglob('index.html'))
    if matches:
        index_file = matches[0]

# Step 3: se non trovato, cerchiamo in altre cartelle candidate
if index_file is None:
    for cand in [BASE_DIR / 'front-end', BASE_DIR / 'frontend', BASE_DIR / 'front_end']:
        if cand.exists():
            matches = list(cand.rglob('index.html'))
            if matches:
                index_file = matches[0]
                # ensure STATIC_ROOT points to cand
                STATIC_ROOT = cand
                break

# Se ancora non trovato, lasciamo STATIC_ROOT com'è (potrebbe non esistere)
if index_file is None and STATIC_ROOT.exists():
    # index may be directly under STATIC_ROOT but missing; set index_file None and let 404 surface
    pass

# Su windows, assicurarsi che i path siano corretti
# altrimenti Flask potrebbe non trovare i file statici e dare errore.
FRONTEND_DIR = str(STATIC_ROOT) if STATIC_ROOT.exists() else None
INDEX_REL_PATH = None
INDEX_PARENT = None
if index_file is not None and FRONTEND_DIR:
    try:
        INDEX_REL_PATH = str(index_file.relative_to(Path(FRONTEND_DIR)))
    except Exception:
        INDEX_REL_PATH = str(index_file.name)
    INDEX_PARENT = str(index_file.parent)


# Creazione dell'app Flask con supporto CORS
app = Flask(__name__, static_folder=FRONTEND_DIR if FRONTEND_DIR else None, static_url_path='')
# Abilita CORS per tutte le route, permettendo richieste cross-origin dalla UI front-end
CORS(app)

# Funzione helper per servire file in modo sicuro da una directory specificata
def safe_send_from_directory(base_dir: str, filename: str):
    """
    Serve un file da una directory specificata in modo sicuro, prevenendo path traversal.
    Ritorna None se il file non esiste o se la richiesta è potenzialmente pericolosa.
    1. Rimuove leading slashes/backslashes dal filename per evitare path assoluti.
    2. Normalizza il filename con os.path.normpath per rimuovere componenti pericolose come ..
    3. Risolve i path assoluti di base_dir e del target file.
    4. Verifica che il target risolto sia dentro base_dir risolto.
    5. Se il file esiste, lo serve; altrimenti ritorna None.
    @:param base_dir: La directory base da cui servire i file.
    @:param filename: Il nome del file richiesto (relativo a base_dir).
    @:return: La risposta di send_from_directory o None se non trovato/sicuro
    """
    if not base_dir:
        return None

    # Rimuove leading slashes/backslashes per rendere il path relativo (soprattutto per Windows)
    filename_normalized = filename.lstrip('/\\')
    # Ulteriore normalizzazione
    filename_normalized = os.path.normpath(filename_normalized)

    base = Path(base_dir)
    target = base / filename_normalized
    try:
        base_res = base.resolve()
        target_res = target.resolve()
        # Verifica che target sia dentro base
        target_res.relative_to(base_res)
    except Exception:
        return None
    if not target_res.exists():
        return None
    rel = str(target_res.relative_to(base_res))
    return send_from_directory(str(base_res), rel)

# Caricamento del database dei rifugi in memoria
try:
    load_rifugi_db()
    print("Database rifugi caricato in memoria.")
except Exception as e:
    print(f"Attenzione: impossibile caricare il database dei rifugi: {e}")

# Caricamento dei nomi delle strade per i suggerimenti, con gestione degli errori
try:
    from scripts.db_queries.queries import load_street_names
    STREET_NAMES = load_street_names()
    print(f"Caricate {len(STREET_NAMES)} nomi di strade per suggerimenti.")
except Exception as e:
    STREET_NAMES = []
    print(f"Impossibile caricare nomi strade: {e}")

# Route principale per servire index.html, con gestione della posizione dinamica e fallback
@app.route('/')
def index():
    # Prova a servire index.html dalla posizione rilevata dinamicamente usando la funzione sicura
    if FRONTEND_DIR and INDEX_REL_PATH:
        res = safe_send_from_directory(FRONTEND_DIR, INDEX_REL_PATH)
        if res:
            return res

    # Se non trovato sotto FRONTEND_DIR, prova a servirlo dalla cartella padre di INDEX (se disponibile)
    if INDEX_PARENT:
        res = safe_send_from_directory(INDEX_PARENT, 'index.html')
        if res:
            return res

    # Prova a servire tramite la static folder configurata in Flask (app.static_folder)
    try:
        return app.send_static_file('index.html')
    except Exception:
        pass

    # Ultimo tentativo: cerca manualmente il file index.html nelle possibili cartelle e lo ritorna come testo
    candidates = []
    if FRONTEND_DIR:
        candidates.append(Path(FRONTEND_DIR) / 'index.html')
    if INDEX_PARENT:
        candidates.append(Path(INDEX_PARENT) / 'index.html')
    for c in candidates:
        try:
            if c.exists():
                return (c.read_text(encoding='utf-8'), 200, {'Content-Type': 'text/html'})
        except Exception:
            # ignora errori di lettura e continua col prossimo candidato
            pass

    return ('', 404)

# Funzione helper per tentare di servire file statici da FRONTEND_DIR o INDEX_PARENT
def try_send_static(filename):
    # Rimuove leading slashes/backslashes per sicurezza
    fn = filename.lstrip('/\\')
    # Primo tentativo: da FRONTEND_DIR
    if FRONTEND_DIR:
        res = safe_send_from_directory(FRONTEND_DIR, fn)
        if res:
            return res
    # Secondo tentativo: da INDEX_PARENT
    if INDEX_PARENT:
        res = safe_send_from_directory(INDEX_PARENT, fn)
        if res:
            return res
    return None

# Se index.html fa riferimento a /app.js ma il file è sotto una sottocartella, gestiamo il caso
@app.route('/app.js')
def app_js():
    res = try_send_static('app.js')
    if res:
        return res
    return ('', 404)

# Specifiche route per cartelle comuni di file statici, con preferenza per FRONTEND_DIR
@app.route('/css/<path:filename>')
def css_file(filename):
    res = None
    # prefer STATIC_ROOT/css
    if FRONTEND_DIR:
        res = safe_send_from_directory(os.path.join(FRONTEND_DIR, 'css'), filename)
        if res:
            return res
    # fallback: try index parent /css
    if INDEX_PARENT:
        res = safe_send_from_directory(os.path.join(INDEX_PARENT, 'css'), filename)
        if res:
            return res
    return ('', 404)

# App.route per file JS nella cartella /js
@app.route('/js/<path:filename>')
def js_file(filename):
    res = None
    if FRONTEND_DIR:
        res = safe_send_from_directory(os.path.join(FRONTEND_DIR, 'js'), filename)
        if res:
            return res
    if INDEX_PARENT:
        res = safe_send_from_directory(os.path.join(INDEX_PARENT, 'js'), filename)
        if res:
            return res
    return ('', 404)

@app.route('/assets/<path:filename>')
def assets_file(filename):
    res = None
    if FRONTEND_DIR:
        res = safe_send_from_directory(os.path.join(FRONTEND_DIR, 'assets'), filename)
        if res:
            return res
    if INDEX_PARENT:
        res = safe_send_from_directory(os.path.join(INDEX_PARENT, 'assets'), filename)
        if res:
            return res
    return ('', 404)

# Viene aggiunta una route generica per servire altri file statici
@app.route('/<path:filename>')
def static_proxy(filename):
    # Prova a servire il file statico dalla cartella front-end rilevata dinamicamente
    res = try_send_static(filename)
    if res:
        return res
    return ('', 404)

# Definizione della route API per trovare il rifugio più vicino
@app.route('/api/nearest', methods=['POST'])
def api_nearest():
    # Estrazione del parametro 'indirizzo' dal JSON della richiesta
    data = request.get_json(force=True)
    if not data or 'indirizzo' not in data:
        return jsonify({"successo": False, "messaggio": "Parametro 'indirizzo' mancante."}), 400

    # Validazione di 'indirizzo', deve essere una stringa non vuota altrimenti errore
    indirizzo = data.get('indirizzo')
    if not isinstance(indirizzo, str) or indirizzo.strip() == '':
        return jsonify({"successo": False, "messaggio": "Indirizzo non valido."}), 400

    # Chiamata alla funzione per trovare il rifugio più vicino, gestendo eventuali eccezioni
    try:
        # Il geolocator viene passato per consentire mocking/testing
        risultato = trova_rifugio_piu_vicino(indirizzo, geolocator=get_geolocator())
        return jsonify(risultato)
    except Exception as e:
        return jsonify({"successo": False, "messaggio": str(e)}), 500


# API endpoint per suggerimenti di strade (autocomplete)
@app.route('/api/suggest-street')
def suggest_street():
    q = (request.args.get('q') or '').strip()
    if not q:
        return jsonify({'suggestions': []})
    q_low = q.lower()

    # Cerca corrispondenze che iniziano con la query, poi quelle che la contengono
    prefix_matches = [s for s in STREET_NAMES if s['display'].lower().startswith(q_low) or s['name'].lower().startswith(q_low)]
    contains_matches = [s for s in STREET_NAMES if (q_low in s['display'].lower() or q_low in s['name'].lower()) and s not in prefix_matches]
    results = prefix_matches + contains_matches
    results = results[:20]

    # Arricchisci i risultati con lat/lon/postcode da GEOCODE_CACHE se disponibili
    enriched = []
    try:
        for s in results:
            # Copia dell'item per evitare modifiche all'originale
            item = dict(s)
            # Costruiamo possibili chiavi di ricerca per la cache
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
            # Cerca nella cache
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
    # Ritorna un esempio di indirizzo con lat/lon
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

# Aggiunta di una semplice cache in memoria per i risultati di geocoding
# La cache mappa da query normalizzata (lowercase, stripped) a dizionario con lat, lon, postcode, display
GEOCODE_CACHE = {}

@app.route('/api/geocode-street', methods=['POST'])
def geocode_street():
    """
    Geocodifica on-demand di un indirizzo stradale.
    Accetta JSON con:
    - q: indirizzo completo (opzionale)
    - name: nome della strada (opzionale se q fornito)
    - city: città (opzionale)
    - state: stato (opzionale)
    Ritorna JSON con:
    - lat: latitudine (float o null)
    - lon: longitudine (float o null)
    - postcode: codice postale (stringa o null)
    - display: indirizzo usato per la geocodifica
    In caso di errore, ritorna codice 500 con messaggio di errore.
    1. Se 'q' non è fornito, lo costruisce da name, city, state.
    2. Controlla la cache GEOCODE_CACHE per risultati precedenti.
    3. Usa geolocator per ottenere lat/lon e tenta di estrarre il postcode.
    4. In caso di fallimento, tenta di usare calcola_coordinate se disponibile.
    5. Memorizza il risultato nella cache e lo ritorna.
    6. In caso di errore, ritorna messaggio di errore.
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

    # Utilizzo del geolocator per ottenere lat/lon e postcode
    try:
        geolocator = get_geolocator()
        # Cerca di geocodificare l'indirizzo
        location = None
        try:
            # Preferenza per addressdetails se supportato
            location = geolocator.geocode(q, addressdetails=True, exactly_one=True, timeout=10)
        except TypeError:
            # Alcuni geolocator non supportano addressdetails
            location = geolocator.geocode(q, exactly_one=True, timeout=10)

        result = {'lat': None, 'lon': None, 'postcode': None, 'display': q}
        if location:
            try:
                result['lat'] = float(location.latitude)
                result['lon'] = float(location.longitude)
            except Exception:
                pass
            # Tenta di estrarre il postcode dai dettagli dell'indirizzo
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
        # Cerca di usare calcola_coordinate come fallback, se disponibile
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
