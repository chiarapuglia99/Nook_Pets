// ==========================================
// SELEZIONE ELEMENTI DOM
// ==========================================
const form = document.getElementById('search-form');
const indirizzoInput = document.getElementById('indirizzo');
const feedback = document.getElementById('feedback');
const resultSection = document.getElementById('result');
const nomeEl = document.getElementById('nome');
const indirizzoRifugioEl = document.getElementById('indirizzo-rifugio');
const distanzaEl = document.getElementById('distanza');
const btn = document.getElementById('btn-submit');
const animalImg = document.getElementById('animal-img');
const directionsLink = document.getElementById('directions-link');

// Elementi Vista Focolai
const homeView = document.getElementById('home-view');
const btnFocolai = document.getElementById('btn-focolai');
const mapFocolaiContainer = document.getElementById('map-focolai-container');
const legendFocolaiEl = document.getElementById('legend-focolai');
const btnBack = document.getElementById('btn-back');

// ==========================================
// VARIABILI GLOBALI
// ==========================================
let map = null;
let userMarker = null;
let shelterMarker = null;
let mapFocolai = null;
let zoneLayer = null;
let animaliLayer = null;
let centriFocolaiLayer = null; // Variabile per i centri (Zone Rosse)

// Variabile per il controllo del percorso (Linea Blu)
let routingControl = null;

// Pool immagini
const animalMediaPool = [
  '../utils/doggie.gif',
  '../utils/funny_cat.gif',
  '../utils/parrot.gif',
  '../utils/rabbit.gif',
  '../utils/all_normal.gif'
];

// ==========================================
// FUNZIONI UTILITY
// ==========================================
function pickRandomMedia() {
  return animalMediaPool[Math.floor(Math.random() * animalMediaPool.length)];
}

function showFeedback(msg, isError = false, withSpinner = false) {
  feedback.textContent = msg;
  feedback.style.color = isError ? '#c53030' : '#374151';

  if (withSpinner) {
    if (!document.querySelector('.spinner')) {
      const s = document.createElement('span');
      s.className = 'spinner';
      feedback.appendChild(s);
    }
  } else {
    const s = document.querySelector('.spinner');
    if (s) s.remove();
  }
}

function setButtonLoading(loading) {
  btn.disabled = loading;
  if (loading) {
    btn.dataset.orig = btn.textContent;
    btn.textContent = 'Cerco...';
  } else {
    if (btn.dataset.orig) btn.textContent = btn.dataset.orig;
  }
}

// Funzione globale per copiare le coordinate (chiamata dai popup HTML)
window.copiaCoordinate = function(lat, lng) {
    navigator.clipboard.writeText(`${lat}, ${lng}`).then(() => {
        alert("Coordinate copiate negli appunti!");
    });
};

// ==========================================
// LOGICA MAPPA PRINCIPALE (RICERCA)
// ==========================================
function initMap(lat = 34.0219, lng = -118.4814, zoom = 10) {
  if (!map) {
    map = L.map('map').setView([lat, lng], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);
  } else {
    map.setView([lat, lng], zoom);
  }
}

function resetMap() {
  if (!map) return;
  if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
  if (shelterMarker) { map.removeLayer(shelterMarker); shelterMarker = null; }
  if (routingControl) { map.removeControl(routingControl); routingControl = null; }
}

initMap();
animalImg.src = pickRandomMedia();

// Handler Form
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const indirizzo = indirizzoInput.value.trim();
  if (!indirizzo) { showFeedback('Inserisci un indirizzo valido.', true); return; }

  setButtonLoading(true);
  showFeedback('Sto cercando il rifugio più vicino...', false, true);
  resultSection.classList.add('hidden');

  try {
    const resp = await fetch('/api/nearest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ indirizzo })
    });

    const json = await resp.json();
    if (!resp.ok || !json.successo) {
      showFeedback(json.messaggio || 'Indirizzo non trovato.', true);
      setButtonLoading(false);
      return;
    }

    const dati = json.dati_rifugio;
    const coordUserRaw = json.coordinate_utente || [];
    const coordShelterRaw = dati.posizione_rifugio || [];

    const coordUser = Array.isArray(coordUserRaw) ? coordUserRaw.map(Number) : [Number(coordUserRaw[0]), Number(coordUserRaw[1])];
    const coordShelter = Array.isArray(coordShelterRaw) ? coordShelterRaw.map(Number) : [Number(coordShelterRaw[0]), Number(coordShelterRaw[1])];

    nomeEl.textContent = dati.nome;
    indirizzoRifugioEl.textContent = dati.indirizzo;
    distanzaEl.textContent = `Distanza: ${dati.distanza_km} km`;
    animalImg.src = pickRandomMedia();

    if (coordUser && coordShelter) {
      const u = `${coordUser[0]},${coordUser[1]}`;
      const s = `${coordShelter[0]},${coordShelter[1]}`;
      directionsLink.href = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(u)}&destination=${encodeURIComponent(s)}&travelmode=driving`;
      directionsLink.classList.remove('hidden');
    }

    resultSection.classList.remove('hidden');
    showFeedback('Risultato trovato.');

    initMap(coordUser[0], coordUser[1], 12);
    resetMap();

    userMarker = L.marker([coordUser[0], coordUser[1]]).addTo(map).bindPopup('Tu').openPopup();
    shelterMarker = L.marker([coordShelter[0], coordShelter[1]]).addTo(map).bindPopup(dati.nome);

    const group = L.featureGroup([userMarker, shelterMarker]);
    map.fitBounds(group.getBounds().pad(0.4));

    // Aggiunta Routing Machine (Linea Blu)
    routingControl = L.Routing.control({
      waypoints: [L.latLng(coordUser[0], coordUser[1]), L.latLng(coordShelter[0], coordShelter[1])],
      lineOptions: { styles: [{ color: '#0066ff', opacity: 0.8, weight: 6 }] },
      createMarker: function() { return null; },
      addWaypoints: false, draggableWaypoints: false, fitSelectedRoutes: false, show: false
    }).addTo(map);

  } catch (err) {
    console.error(err);
    showFeedback('Errore di rete o del server.', true);
  } finally {
    setButtonLoading(false);
  }
});

// ==========================================
// LOGICA AUTOCOMPLETE
// ==========================================
let acContainer = null;
let acItems = [];
let acSelected = -1;
let acAbortController = null;

if (indirizzoInput) { indirizzoInput.setAttribute('autocomplete', 'off'); }

function createAutocomplete() {
  acContainer = document.createElement('div');
  acContainer.className = 'autocomplete-container';
  Object.assign(acContainer.style, {
    position: 'absolute', zIndex: 99999, background: 'white',
    border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px',
    boxShadow: '0 6px 18px rgba(2,6,23,0.08)', maxHeight: '260px',
    overflow: 'auto', display: 'none', padding: '6px 4px'
  });
  document.body.appendChild(acContainer);
}

function positionAutocomplete() {
  if (!acContainer) return;
  const rect = indirizzoInput.getBoundingClientRect();
  const scrollY = window.scrollY || window.pageYOffset;
  const scrollX = window.scrollX || window.pageXOffset;
  acContainer.style.top = `${rect.bottom + scrollY + 6}px`;
  acContainer.style.left = `${rect.left + scrollX}px`;
  acContainer.style.width = `${Math.max(rect.width, 220)}px`;
}

function clearAutocomplete() {
  if (!acContainer) return;
  acContainer.innerHTML = '';
  acContainer.style.display = 'none';
  acItems = [];
  acSelected = -1;
}

function renderAutocomplete(items) {
  if (!acContainer) createAutocomplete();
  acContainer.innerHTML = '';
  acItems = [];
  items.forEach((item, idx) => {
    const el = document.createElement('div');
    el.className = 'ac-item';
    Object.assign(el.style, { padding: '8px 10px', cursor: 'pointer', borderRadius: '6px', margin: '2px 0' });

    let displayText = typeof item === 'string' ? item : (item.display || item.name || '');
    let metaText = '';

    if (item && typeof item === 'object') {
        if (item.postcode) metaText = `CAP: ${item.postcode}`;
        else if (item.city && item.state) metaText = `${item.city}, ${item.state}`;
    }

    const title = document.createElement('div');
    title.textContent = displayText;
    title.style.fontWeight = '600'; title.style.fontSize = '0.95rem';
    el.appendChild(title);
    if (metaText) {
      const sub = document.createElement('div');
      sub.textContent = metaText;
      sub.style.fontSize = '0.82rem'; sub.style.color = '#6b7280';
      el.appendChild(sub);
    }

    el.addEventListener('click', () => selectAutocomplete(idx));
    el.addEventListener('mouseenter', () => {
       if (acSelected >= 0 && acItems[acSelected]) acItems[acSelected].style.background = '';
       acSelected = idx;
       el.style.background = 'rgba(0,102,255,0.06)';
    });
    el._ac_item = item;
    acContainer.appendChild(el);
    acItems.push(el);
  });

  if (items.length) { acContainer.style.display = 'block'; positionAutocomplete(); }
  else { clearAutocomplete(); }
}

async function selectAutocomplete(i) {
  if (!acItems[i]) return;
  const item = acItems[i]._ac_item;
  if (!item) return;
  const val = typeof item === 'string' ? item : (item.display || item.name);
  indirizzoInput.value = val;
  if (item.postcode && !val.includes(item.postcode)) {
    indirizzoInput.value += `, ${item.postcode}`;
  }

  clearAutocomplete();
  indirizzoInput.focus();

  let lat = item.lat != null ? Number(item.lat) : null;
  let lon = item.lon != null ? Number(item.lon) : null;
  if ((lat == null || lon == null) && typeof item === 'object') {
    try {
      showFeedback('Ricavo coordinate...', false, true);
      const res = await fetch('/api/geocode-street', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name: item.name, city: item.city, state: item.state, q: item.display})
      });
      if (res.ok) {
        const j = await res.json();
        if (j.lat && j.lon) { lat = j.lat; lon = j.lon; }
      }
    } catch(e) { console.warn('Geocode failed', e); }
    finally { showFeedback(''); }
  }

  if (lat && lon) {
    initMap(lat, lon, 14);
    resetMap();
    userMarker = L.marker([lat, lon]).addTo(map).bindPopup('Posizione selezionata').openPopup();
  }
}

async function fetchSuggestions(q) {
  if (acAbortController) acAbortController.abort();
  acAbortController = new AbortController();
  try {
    const res = await fetch(`/api/suggest-street?q=${encodeURIComponent(q)}`, {signal: acAbortController.signal});
    if (!res.ok) return [];
    const j = await res.json();
    return j.suggestions || [];
  } catch (e) { return []; }
}

function debounce(fn, ms) {
  let t;
  return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
}

indirizzoInput.addEventListener('input', debounce(async () => {
  const v = indirizzoInput.value.trim();
  if (!v) { clearAutocomplete(); return; }
  const items = await fetchSuggestions(v);
  renderAutocomplete(items.slice(0, 10));
}, 250));

window.addEventListener('resize', positionAutocomplete);
createAutocomplete();

// ==========================================
// LOGICA FOCOLAI - VERSIONE AVANZATA
// ==========================================

const TYPE_PALETTE = {
  'dog': ['#ef4444', '#991b1b'],     // Rosso
  'cat': ['#3b82f6', '#1e3a8a'],     // Blu
  'bird': ['#eab308', '#854d0e'],    // Giallo
  'rabbit': ['#a855f7', '#581c87'],  // Viola
  'other': ['#6b7280', '#1f2937']    // Grigio
};
const visibleTypes = {};

function getVal(props, keys) {
    if (!props) return null;
    const propKeys = Object.keys(props);
    for (let key of keys) {
        if (props[key] !== undefined) return props[key];
        const found = propKeys.find(k => k.toLowerCase() === key.toLowerCase());
        if (found) return props[found];
    }
    return null;
}

function getAnimalInfo(props) {
    const rawType = getVal(props, ['Animal Typ', 'Animal Type', 'animal_type', 'Type', 'species']) || 'Other';
    const cleanType = String(rawType).toLowerCase();
    let key = 'other';
    if (cleanType.includes('dog') || cleanType.includes('cane')) key = 'dog';
    else if (cleanType.includes('cat') || cleanType.includes('gatto')) key = 'cat';
    else if (cleanType.includes('bird') || cleanType.includes('uccello')) key = 'bird';
    else if (cleanType.includes('rabbit') || cleanType.includes('coniglio')) key = 'rabbit';
    return { label: rawType, key: key, palette: TYPE_PALETTE[key] || TYPE_PALETTE['other'] };
}

// Utility: estrai lat/lon da varie forme di geometry GeoJSON in modo sicuro
function extractCoords(geom) {
    if (!geom || !geom.coordinates) return null;
    const t = geom.type || 'Point';
    const c = geom.coordinates;
    let coords = null;
    try {
        if (t === 'Point') {
            coords = c; // [lon, lat]
        } else if (t === 'MultiPoint' || t === 'LineString') {
            coords = Array.isArray(c[0]) ? c[0] : c; // first point
        } else if (t === 'Polygon') {
            // polygon -> coordinates[0][0] is first ring first point
            coords = (Array.isArray(c[0]) && Array.isArray(c[0][0])) ? c[0][0] : null;
        } else {
            coords = Array.isArray(c[0]) ? c[0] : null;
        }
    } catch (e) { coords = null; }
    if (!coords || coords.length < 2) return null;
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (isNaN(lat) || isNaN(lon)) return null;
    return [lat, lon]; // ritorniamo [lat, lon] comodo per Leaflet
}

// Utility: traduce le chiavi specie interne in etichette italiane
function translateSpeciesKeyToItalian(key) {
    const m = { 'dog': 'Cane', 'cat': 'Gatto', 'bird': 'Uccello', 'rabbit': 'Coniglio', 'other': 'Altro' };
    return m[key] || (typeof key === 'string' ? (key.charAt(0).toUpperCase() + key.slice(1)) : 'Altro');
}

// Inizializzazione Layers
zoneLayer = L.geoJSON(null, {
  style: { color: '#dc2626', weight: 5, opacity: 0.7 },
  onEachFeature: (f, l) => l.bindPopup(`<b>ZONA PERICOLOSA:</b><br>${f.properties.name || 'Strada a rischio'}`)
});
animaliLayer = L.geoJSON(null);

function initFocolaiMap() {
  if (mapFocolai) { setTimeout(() => mapFocolai.invalidateSize(), 100); return; }
  mapFocolai = L.map('map-focolai').setView([34.0219, -118.4814], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapFocolai);
  zoneLayer.addTo(mapFocolai);
}

// =======================================================
// CARICAMENTO FOCOLAI (Zone, Animali, e Centri Zone Rosse)
// =======================================================
async function loadFocolai() {
  if (!mapFocolai) return;
  showFeedback('Carico analisi focolai...', false, true);

  try {
    // 1. Zone Pericolose
    const resZone = await fetch('/api/geojson/zone_pericolose');
    if (resZone.ok) {
        zoneLayer.clearLayers();
        zoneLayer.addData(await resZone.json());
    }

    // 2. Animali Malati
    const resAnim = await fetch('/api/geojson/animali_malati');
    if (resAnim.ok) {
        const data = await resAnim.json();
        if (animaliLayer) mapFocolai.removeLayer(animaliLayer);
        animaliLayer = L.geoJSON(data, {
            pointToLayer: (feature, latlng) => {
                const info = getAnimalInfo(feature.properties);
                return L.circleMarker(latlng, {
                    radius: 7, fillColor: info.palette[0], color: '#fff',
                    weight: 1.5, opacity: 1, fillOpacity: 0.9
                });
            },
            onEachFeature: (feature, layer) => {
                const p = feature.properties;
                const info = getAnimalInfo(p);
                layer._tipoKey = info.key;

                const rawName = getVal(p, ['Animal Nam', 'Animal Name', 'AnimalName', 'name']) || "Senza nome";
                const nome = (rawName.toLowerCase() === 'unknown' || rawName.trim() === '') ? "Senza nome" : rawName;
                const condizione = getVal(p, ['Intake Con', 'Intake Condition', 'Intake_Condition', 'condition']) || "Non specificato";
                const colPrimario = getVal(p, ['Primary Co', 'Primary Color', 'PrimaryColor', 'Color']) || "N/A";
                const colSecondario = getVal(p, ['Secondary Co', 'Secondary', 'Secondary C', 'Secondar_1', 'Secondary Color']) || "N/A";

                const content = `
                    <div style="font-family:sans-serif; font-size:14px; min-width:200px;">
                        <div style="background:${info.palette[0]}; color:white; padding:6px; border-radius:4px 4px 0 0; font-weight:bold;">
                            ${String(info.label).toUpperCase()}
                        </div>
                        <div style="padding:10px; background:#fff; border:1px solid #ddd; border-top:none;">
                            <div style="margin-bottom:6px;"><b>Nome:</b> ${nome}</div>
                            <div style="margin-bottom:6px;">
                                <b>Salute:</b> <span style="color:#c53030; background:#fee2e2; padding:2px 5px; border-radius:4px; font-weight:bold;">${condizione}</span>
                            </div>
                            <div style="color:#666; margin-bottom:2px;"><b>Colore:</b> ${colPrimario} / ${colSecondario}</div>
                        </div>
                    </div>
                `;
                layer.bindPopup(content);
            }
        });

        animaliLayer.addTo(mapFocolai);

        // Auto-Zoom
        const bounds = zoneLayer.getBounds();
        if(animaliLayer.getLayers().length > 0) bounds.extend(animaliLayer.getBounds());
        if (bounds.isValid()) mapFocolai.fitBounds(bounds.pad(0.1));

        buildLegend();
    }

    // 3. --- CARICAMENTO CENTRI FOCOLAI (GESTIONE NULL) ---
    const resCentri = await fetch('/api/geojson/zone_rosse');
    if (resCentri.ok) {
        const dataCentri = await resCentri.json();

        // Rimuovi layer precedente
        if (centriFocolaiLayer) mapFocolai.removeLayer(centriFocolaiLayer);

        // Inizializza un contatore per i focolai senza ID
        let unknownCounter = 1;

        centriFocolaiLayer = L.geoJSON(dataCentri, {
            pointToLayer: (feature, latlng) => {
                return L.circleMarker(latlng, {
                    radius: 15,
                    fillColor: '#ff0000',
                    color: '#000',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.5
                });
            },
            onEachFeature: (feature, layer) => {
                const props = feature.properties;
                // Coordinate per visualizzazione e copia
                const lat = feature.geometry.coordinates[1].toFixed(5);
                const lng = feature.geometry.coordinates[0].toFixed(5);

                // --- LOGICA GESTIONE ID NULL ---
                // Cerca l'ID tra le possibili chiavi
                const rawId = getVal(props, ['CLUSTER_ID', 'cluster_id', 'id', 'ID']);

                let displayTitle;

                if (rawId !== null && rawId !== undefined && rawId !== "") {
                    // Se l'ID esiste, usalo
                    displayTitle = `⚠️ FOCOLAIO ${rawId}`;
                } else {
                    // Se è null, usa un numero progressivo generato da noi
                    displayTitle = `ZONA ROSSA #${unknownCounter++}`;
                }
                // -------------------------------

                const popupContent = `
                    <div style="text-align:center; min-width:150px;">
                        <h3 style="margin:0; color:#dc2626; font-family:'Fredoka', sans-serif;">${displayTitle}</h3>
                        <p style="font-size:0.9rem; margin:5px 0;">Alta concentrazione rilevata.</p>
                        <div style="background:#f3f4f6; padding:5px; border-radius:4px; font-family:monospace; font-weight:bold;">
                            LAT: ${lat}<br>
                            LON: ${lng}
                        </div>
                        <button onclick="copiaCoordinate(${lat}, ${lng})" style="margin-top:5px; font-size:0.8rem; cursor:pointer;">
                            Copia Coordinate
                        </button>
                    </div>
                `;
                layer.bindPopup(popupContent);
            }
        });

        centriFocolaiLayer.addTo(mapFocolai);
        centriFocolaiLayer.bringToFront();
    }

    showFeedback('');
  } catch (e) {
    console.error(e);
    showFeedback('Errore caricamento dati focolai.', true);
  }
}

function updateVisibility() {
    if (!animaliLayer) return;
    animaliLayer.eachLayer(layer => {
        const k = layer._tipoKey;
        const visible = visibleTypes[k] !== false;
        if (visible) {
            if (layer.getElement()) layer.getElement().style.display = '';
            layer.openPopup = layer.constructor.prototype.openPopup;
        } else {
            if (layer.getElement()) layer.getElement().style.display = 'none';
            layer.closePopup();
            layer.openPopup = () => {};
        }
    });
}

function toggleType(key) {
    visibleTypes[key] = !visibleTypes[key];
    // Aggiorna layer statici (animaliLayer)
    if (animaliLayer) {
        animaliLayer.eachLayer(layer => {
            try {
                if (layer._tipoKey === key) {
                    const visible = visibleTypes[key] !== false;
                    if (layer.getElement) layer.getElement().style.display = visible ? '' : 'none';
                    if (!visible) { layer.closePopup && layer.closePopup(); }
                }
            } catch (e) {}
        });
    }

    // Aggiorna markers animati
    if (animatedLayerGroup) {
        animatedLayerGroup.eachLayer(layer => {
            try {
                if (layer._tipoKey === key) {
                    const visible = visibleTypes[key] !== false;
                    if (layer.setStyle) layer.setStyle({ opacity: visible ? 0.9 : 0, fillOpacity: visible ? 0.9 : 0 });
                    else if (layer.getElement) layer.getElement().style.display = visible ? '' : 'none';
                    if (!visible) layer.closePopup && layer.closePopup();
                }
            } catch (e) {}
        });
    }

    const rowA = document.getElementById(`leg-row-${key}`);
    const rowB = document.getElementById(`randagi-leg-row-${key}`);
    if (rowA) rowA.style.opacity = visibleTypes[key] ? '1' : '0.4';
    if (rowB) rowB.style.opacity = visibleTypes[key] ? '1' : '0.4';
}

function buildLegend() {
    if (!legendFocolaiEl || !animaliLayer) return;
    legendFocolaiEl.innerHTML = '<h5 style="margin:0 0 8px 0; font-size:0.9rem; font-weight:bold;">Legenda Specie</h5>';

    const keysFound = new Set();
    animaliLayer.eachLayer(l => keysFound.add(l._tipoKey));
    keysFound.forEach(key => {
        if(visibleTypes[key] === undefined) visibleTypes[key] = true;

        const pal = TYPE_PALETTE[key] || TYPE_PALETTE['other'];
        const row = document.createElement('div');
        row.id = `leg-row-${key}`;
        Object.assign(row.style, { display: 'flex', alignItems: 'center', cursor: 'pointer', marginBottom: '6px' });

        const dot = document.createElement('span');
        Object.assign(dot.style, {
            width: '18px', height: '18px',
            background: `linear-gradient(135deg, ${pal[0]} 50%, ${pal[1]} 50%)`,
            border: '1px solid #9ca3af', borderRadius: '50%', marginRight: '8px'
        });

        let labelTxt = key.charAt(0).toUpperCase() + key.slice(1);
        if(key === 'dog') labelTxt = 'Cane';
        if(key === 'cat') labelTxt = 'Gatto';
        if(key === 'bird') labelTxt = 'Uccello';

        const txt = document.createElement('span');
        txt.textContent = labelTxt;
        txt.style.fontSize = '0.9rem';
        row.appendChild(dot);
        row.appendChild(txt);
        row.onclick = () => toggleType(key);
        legendFocolaiEl.appendChild(row);
    });
    legendFocolaiEl.classList.remove('hidden');
}

// Gestione Navigazione
if (btnFocolai) btnFocolai.onclick = () => {
    homeView.classList.add('hidden');
    mapFocolaiContainer.classList.remove('hidden');
    initFocolaiMap();
    loadFocolai();
};

if (btnBack) btnBack.onclick = () => {
    mapFocolaiContainer.classList.add('hidden');
    homeView.classList.remove('hidden');
};

// =========================
// SEZIONE ANIMALI RANDAGI
// =========================
const btnRandagi = document.getElementById('btn-randagi');
const randagiContainer = document.getElementById('randagi-container');
const btnRandagiBack = document.getElementById('btn-randagi-back');
const randagiFeedback = document.getElementById('randagi-feedback');

let pieChart = null;
// layer per l'animazione dei marker (cumulativo)
let animatedLayerGroup = null;

// Funzione per mostrare feedback nella sezione Randagi
function showRandagiFeedback(msg, isError = false) {
    if (!randagiFeedback) return;
    randagiFeedback.textContent = msg;
    randagiFeedback.style.color = isError ? '#c53030' : '#374151';
}

let mapRandagi = null;
let randagiLayer = null;

function initRandagiMap(lat = 34.0219, lng = -118.4814, zoom = 11) {
    // Se la mappa è già inizializzata, forza l'invalidateSize per correggere rendering
    if (!document.getElementById('map-randagi')) return;
    if (mapRandagi) { setTimeout(() => mapRandagi.invalidateSize(), 200); return; }

    mapRandagi = L.map('map-randagi', { preferCanvas: true }).setView([lat, lng], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapRandagi);
}

// Modifica loadRandagiData: dopo la costruzione dei grafici aggiungiamo i marker sulla mappa
async function loadRandagiData() {
    showRandagiFeedback('Caricamento dati randagi...', false);
    try {
        // Richiesta con cache-buster per evitare 304 Not Modified e forzare il server a restituire il corpo
        const res = await fetch(`/api/geojson/animali_randagi?_=${Date.now()}`);
         if (!res.ok) { throw new Error('Impossibile caricare animali randagi'); }
         const data = await res.json();

         // Se il server restituisce un FeatureCollection vuoto, informiamo l'utente e terminiamo
         if (data && data.type === 'FeatureCollection' && Array.isArray(data.features) && data.features.length === 0) {
            showRandagiFeedback('Nessun dato per animali randagi trovato (file mancante o vuoto).', true);
            return;
         }

         // Conteggi per sesso e tipo
         const countsSesso = { 'Male': 0, 'Female': 0, 'Unknown': 0 };
         const countsTipo = {};
         // Conteggi ritrovamenti raggruppati per mese (YYYY-MM)
         const countsRitrovamenti = {};
         // Bucket mensili: mappa monthKey -> array di feature
         const monthBuckets = {};

        (data.features || []).forEach(f => {
            const p = f.properties || {};
            // Estrai sesso
            let s = (p.sex || p.Sex || p.SESSO || p.gender || p.Gender || '').toString().trim().toLowerCase();
            if (!s || s === 'unknown' || s === 'na' || s === 'n/d') s = 'Unknown';
            else if (s.startsWith('m')) s = 'Male';
            else if (s.startsWith('f')) s = 'Female';
            else s = 'Unknown';

            countsSesso[s] = (countsSesso[s] || 0) + 1;

            // Estrai tipo (species) e aggiorna countsTipo
            let t = (p.species || p.type || p.animal_type || p['Animal Type'] || p['Animal Typ'] || '').toString().trim().toLowerCase();
            if (!t) t = (p['Animal Typ'] || p['Animal T_3'] || '').toString().trim().toLowerCase();
            if (!t) t = 'other';
            if (t.includes('dog') || t.includes('cane')) t = 'dog';
            else if (t.includes('cat') || t.includes('gatto')) t = 'cat';
            else if (t.includes('bird') || t.includes('uccello')) t = 'bird';
            else if (t.includes('rabbit') || t.includes('coniglio')) t = 'rabbit';
            else t = 'other';
            countsTipo[t] = (countsTipo[t] || 0) + 1;

             // Estrai la data di ritrovamento e raggruppa per mese (YYYY-MM)
             let rawDate = getVal(p, ['Intake Dat', 'intake_date', 'intake date', 'intake_datetime', 'intake_time', 'intake', 'found_date', 'date_found', 'Date', 'datetime', 'ritrovamento']) || '';
             let monthKey = 'Unknown';
             if (rawDate) {
                 try {
                     const d = new Date(String(rawDate));
                     if (!isNaN(d.getTime())) {
                         const y = d.getUTCFullYear();
                         const m = String(d.getUTCMonth() + 1).padStart(2, '0');
                         monthKey = `${y}-${m}`;
                     } else {
                         const m = String(rawDate).match(/(\d{4}-\d{2})/);
                         if (m && m[1]) monthKey = m[1];
                     }
                 } catch (err) { monthKey = 'Unknown'; }
             }
             countsRitrovamenti[monthKey] = (countsRitrovamenti[monthKey] || 0) + 1;
             if (!monthBuckets[monthKey]) monthBuckets[monthKey] = [];
             monthBuckets[monthKey].push(f);
         });

         // Costruiamo il grafico pie per il sesso (ora con etichette italiane e tooltip con percentuali)
         buildRandagiCharts(countsSesso);

          // Inizializza mappa se necessario
          initRandagiMap();

          // Rimuovi layer precedente se presente
          if (randagiLayer && mapRandagi) { mapRandagi.removeLayer(randagiLayer); randagiLayer = null; }

        // Costruisci legenda specie nella vista randagi (countsTipo calcolato sopra)
        buildRandagiLegend(countsTipo);

         // Avvia l'animazione mese-per-mese usando i monthBuckets
         animateRandagiByMonth(monthBuckets);

          showRandagiFeedback('');
     } catch (e) {
         console.error(e);
         showRandagiFeedback('Errore nel caricamento dei dati randagi.', true);
     }
 }


function buildRandagiCharts(countsSesso) {
     // Pie chart sesso
     const pieCtx = document.getElementById('randagi-pie').getContext('2d');
     const rawLabels = Object.keys(countsSesso);
     // Mappa etichette in italiano
     const labelMap = { 'Male': 'Maschio', 'Female': 'Femmina', 'Unknown': 'Sconosciuto' };
     const pieLabels = rawLabels.map(l => labelMap[l] || l);
     const pieData = rawLabels.map(l => countsSesso[l]);
     const pieColors = rawLabels.map(l => l === 'Male' ? '#3b82f6' : (l === 'Female' ? '#ef4444' : '#9ca3af'));

     if (pieChart) pieChart.destroy();
     pieChart = new Chart(pieCtx, {
         type: 'pie',
         data: { labels: pieLabels, datasets: [{ data: pieData, backgroundColor: pieColors }] },
         options: {
             plugins: {
                 legend: { position: 'bottom' },
                 tooltip: {
                     callbacks: {
                         label: function(context) {
                             const idx = context.dataIndex;
                             const label = context.label || '';
                             const value = context.dataset.data[idx] || 0;
                             const total = context.dataset.data.reduce((s, v) => s + v, 0) || 1;
                             const perc = ((value / total) * 100).toFixed(1);
                             return `${label}: ${value} (${perc}%)`;
                         }
                     }
                 }
             },
             responsive: true,
             maintainAspectRatio: false
         }
     });
 }

// Nuova funzione: costruisce la legenda delle specie per la vista randagi
 function buildRandagiLegend(countsTipo) {
    if (!randagiContainer) return;
    let legend = document.getElementById('randagi-legend');
    if (!legend) {
        legend = document.createElement('div');
        legend.id = 'randagi-legend';
        Object.assign(legend.style, { marginTop: '8px', padding: '8px', background: '#fff', borderRadius: '8px', boxShadow: '0 6px 18px rgba(2,6,23,0.04)' });
        randagiContainer.appendChild(legend);
    }
    legend.innerHTML = '<strong>Legenda specie</strong>';

    const pal = { 'dog': '#ef4444', 'cat': '#3b82f6', 'bird': '#eab308', 'rabbit': '#a855f7', 'other': '#6b7280' };
    const nameMap = { 'dog': 'Cane', 'cat': 'Gatto', 'bird': 'Uccello', 'rabbit': 'Coniglio', 'other': 'Altro' };

    Object.keys(countsTipo).forEach(key => {
        if (!visibleTypes[key]) visibleTypes[key] = true;
        const row = document.createElement('div');
        Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', cursor: 'pointer' });
        const dot = document.createElement('span');
        Object.assign(dot.style, { width: '14px', height: '14px', background: pal[key] || '#9ca3af', borderRadius: '50%', display: 'inline-block' });
        const txt = document.createElement('span');
        txt.textContent = `${nameMap[key] || key} (${countsTipo[key]})`;
        row.appendChild(dot);
        row.appendChild(txt);
        row.onclick = () => toggleType(key);
        row.id = `randagi-leg-row-${key}`;
        legend.appendChild(row);
    });
}

// Funzione che anima l'apparizione dei randagi mese per mese sulla mappa
function animateRandagiByMonth(monthBuckets, opts = {}) {
    if (!mapRandagi) return;
    // pulisci layer precedente
    if (animatedLayerGroup) {
        try { animatedLayerGroup.eachLayer(l => { if (l.remove) l.remove(); }); } catch(e){}
        if (mapRandagi.hasLayer(animatedLayerGroup)) mapRandagi.removeLayer(animatedLayerGroup);
    }
    animatedLayerGroup = L.layerGroup().addTo(mapRandagi);

    // prepara months ordinati (YYYY-MM), Unknown in fondo
    const rawKeys = Object.keys(monthBuckets || {});
    const knownKeys = rawKeys.filter(k => k !== 'Unknown' && /^\d{4}-\d{2}$/.test(k)).sort();
    const otherKeys = rawKeys.filter(k => !/^\d{4}-\d{2}$/.test(k) && k !== 'Unknown');
    const months = knownKeys.concat(otherKeys);
    if (rawKeys.includes('Unknown')) months.push('Unknown');

    // overlay mese corrente + controlli
    let labelEl = document.getElementById('randagi-anim-label');
    if (!labelEl) {
        labelEl = document.createElement('div');
        labelEl.id = 'randagi-anim-label';
        Object.assign(labelEl.style, { position: 'absolute', top: '10px', right: '10px', padding: '6px 10px', background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: '6px', zIndex: 1000, fontWeight: '600' });
        mapRandagi.getContainer().appendChild(labelEl);
    }

    // controlli play/pause e slider velocità
    let controlsEl = document.getElementById('randagi-anim-controls');
    if (!controlsEl) {
        controlsEl = document.createElement('div');
        controlsEl.id = 'randagi-anim-controls';
        Object.assign(controlsEl.style, { position: 'absolute', top: '50px', right: '10px', padding: '8px', background: 'rgba(255,255,255,0.95)', borderRadius: '10px', zIndex: 1000, display: 'flex', gap: '8px', alignItems: 'center', boxShadow: '0 6px 20px rgba(15,23,42,0.12)' });
        const btnPlay = document.createElement('button'); btnPlay.id = 'randagi-play'; btnPlay.innerHTML = '▶️&nbsp;<span style="font-weight:600;">Play</span>';
        const btnPause = document.createElement('button'); btnPause.id = 'randagi-pause'; btnPause.innerHTML = '⏸️&nbsp;<span style="font-weight:600;">Pausa</span>';
        const speed = document.createElement('input'); speed.type = 'range'; speed.min = '200'; speed.max = '2000'; speed.step = '100'; speed.value = String(opts.intervalMs || 900);
        speed.title = 'Velocità (ms)';
        // Style buttons to look nicer
        [btnPlay, btnPause].forEach(b => {
            b.style.padding = '8px 12px';
            b.style.border = 'none';
            b.style.background = 'linear-gradient(180deg,#ffffff,#f3f4f6)';
            b.style.borderRadius = '8px';
            b.style.cursor = 'pointer';
            b.style.boxShadow = '0 4px 10px rgba(2,6,23,0.08)';
            b.style.fontSize = '0.95rem';
        });
        btnPlay.style.color = '#065f46';
        btnPause.style.color = '#7f1d1d';
        controlsEl.appendChild(btnPlay); controlsEl.appendChild(btnPause); controlsEl.appendChild(speed);
         mapRandagi.getContainer().appendChild(controlsEl);

         // Impostazioni iniziali pulsanti
         btnPause.disabled = true;
         btnPlay.onclick = () => startTimer();
         btnPause.onclick = () => stopTimer();
         speed.oninput = (e) => {
             intervalMsLocal = Number(e.target.value);
             if (isRunning) {
                 stopTimer(); startTimer();
             }
         };
        // Hover e focus effects per i pulsanti
        [btnPlay, btnPause].forEach(b => {
            b.addEventListener('mouseenter', () => { b.style.transform = 'translateY(-2px) scale(1.02)'; b.style.boxShadow = '0 8px 18px rgba(2,6,23,0.12)'; });
            b.addEventListener('mouseleave', () => { b.style.transform = ''; b.style.boxShadow = '0 4px 10px rgba(2,6,23,0.08)'; });
            b.addEventListener('focus', () => { b.style.outline = '2px solid rgba(2,132,199,0.16)'; });
            b.addEventListener('blur', () => { b.style.outline = 'none'; });
        });
     }

    function formatMonthLabel(k) {
        if (k === 'Unknown') return 'Sconosciuto';
        const [y, m] = k.split('-');
        return new Date(Number(y), Number(m) - 1, 1).toLocaleString('it-IT', { month: 'short', year: 'numeric' });
    }

    const allAddedMarkers = [];
    let idx = 0;
    let timer = null;
    let isRunning = false;
    let intervalMsLocal = opts.intervalMs || 900;

    function stepOnce() {
        if (idx >= months.length) { stopTimer(); labelEl.textContent = 'Fine'; return; }
        const monthKey = months[idx++];
        labelEl.textContent = `Mese: ${formatMonthLabel(monthKey)}`;

        const feats = monthBuckets[monthKey] || [];
        feats.forEach(f => {
            try {
                const geom = f.geometry;
                if (!geom) return;
                const latlon = extractCoords(geom);
                if (!latlon) return;
                const [lat, lon] = latlon;
                const info = getAnimalInfo(f.properties || {});
                // Rendi i puntini più visibili: maggiore raggio, stroke scuro e pieno
                const marker = L.circleMarker([lat, lon], {
                    radius: 8,
                    fillColor: (info && info.palette && info.palette[0]) ? info.palette[0] : '#6b7280',
                    color: '#222',
                    weight: 1.25,
                    opacity: 1,
                    fillOpacity: 1
                });
                marker._tipoKey = info && info.key ? info.key : 'other'; // importante per il toggle
                const p = f.properties || {};
                const rawName = getVal(p, ['Animal Nam', 'Animal Name', 'AnimalName', 'name']) || "Senza nome";
                const nome = (typeof rawName === 'string' && (rawName.toLowerCase() === 'unknown' || rawName.trim() === '')) ? 'Senza nome' : rawName;
                let s = (p.sex || p.Sex || p.SESSO || p.gender || p.Gender || '').toString().trim().toLowerCase();
                if (!s || s === 'unknown' || s === 'na' || s === 'n/d') s = 'Sconosciuto';
                else if (s.startsWith('m')) s = 'Maschio';
                else if (s.startsWith('f')) s = 'Femmina';
                else s = 'Sconosciuto';
                const dateFound = getVal(p, ['Intake Dat','intake_date','intake date','date_found','found_date','Date','datetime','ritrovamento']) || null;
                const specieIt = translateSpeciesKeyToItalian(info && info.key ? info.key : 'other');
                const popup = `
                    <div style="font-family:sans-serif; font-size:14px; min-width:180px;">
                        <div style="background:${(info && info.palette && info.palette[0]) ? info.palette[0] : '#6b7280'}; color:white; padding:6px; border-radius:4px 4px 0 0; font-weight:bold;">
                            ${String(specieIt).toUpperCase()}
                        </div>
                        <div style="padding:10px; background:#fff; border:1px solid #ddd; border-top:none;">
                            <div style="margin-bottom:6px;"><b>Nome:</b> ${nome}</div>
                            <div style="margin-bottom:6px;"><b>Sesso:</b> ${s}</div>
                            ${dateFound ? `<div style="margin-bottom:6px;"><b>Intake:</b> ${dateFound}</div>` : ''}
                        </div>
                    </div>
                `;
                marker.bindPopup(popup);
                marker.addTo(animatedLayerGroup);
                // Assicurati che il marker sia visibile in primo piano
                try { if (marker.bringToFront) marker.bringToFront(); } catch (e) {}
                allAddedMarkers.push(marker);
            } catch (e) { console.error('Errore feature randagi:', e); /* ignore feature errors */ }
        });

        try {
            const groupBounds = L.featureGroup(allAddedMarkers).getBounds();
            if (groupBounds.isValid()) mapRandagi.fitBounds(groupBounds.pad(0.15));
        } catch (e) {}
    }

    function startTimer() {
        if (isRunning) return;
        isRunning = true;
        // aggiornamento stato pulsanti
        try { const bp = document.getElementById('randagi-play'); const bpa = document.getElementById('randagi-pause'); if(bp) bp.disabled = true; if(bpa) bpa.disabled = false; } catch(e){}
        timer = setInterval(() => stepOnce(), intervalMsLocal);
        // run immediate step if starting first time
        if (idx === 0) stepOnce();
    }
    function stopTimer() {
        isRunning = false;
        if (timer) { clearInterval(timer); timer = null; }
        // aggiornamento stato pulsanti
        try { const bp = document.getElementById('randagi-play'); const bpa = document.getElementById('randagi-pause'); if(bp) bp.disabled = false; if(bpa) bpa.disabled = true; } catch(e){}
    }

    // auto-start
    startTimer();
}

// Pulsanti navigazione randagi
if (btnRandagi) btnRandagi.onclick = () => {
    homeView.classList.add('hidden');
    mapFocolaiContainer.classList.add('hidden');
    randagiContainer.classList.remove('hidden');
    // Carica i dati e costruisci i grafici
    loadRandagiData();
};

if (btnRandagiBack) btnRandagiBack.onclick = () => {
    randagiContainer.classList.add('hidden');
    homeView.classList.remove('hidden');
};
