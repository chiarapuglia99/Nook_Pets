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

// --- NUOVA VARIABILE PER LA LINEA BLU ---
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

function showFeedback(msg, isError=false, withSpinner=false) {
  feedback.textContent = msg;
  feedback.style.color = isError ? '#c53030' : '#374151';
  if (withSpinner) {
    if (!document.querySelector('.spinner')) {
      const s = document.createElement('span');
      s.className = 'spinner'; feedback.appendChild(s);
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

// ==========================================
// LOGICA MAPPA PRINCIPALE (RICERCA)
// ==========================================
function initMap(lat=34.0219, lng=-118.4814, zoom=10) {
  if (!map) {
    map = L.map('map').setView([lat, lng], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap contributors'
    }).addTo(map);
  } else {
    map.setView([lat, lng], zoom);
  }
}

function resetMap() {
  if (!map) return;
  if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
  if (shelterMarker) { map.removeLayer(shelterMarker); shelterMarker = null; }

  // --- NUOVO: Rimuove la vecchia linea se esiste ---
  if (routingControl) {
      map.removeControl(routingControl);
      routingControl = null;
  }
}

// Inizializza mappa vuota
initMap();
animalImg.src = pickRandomMedia();

// Handler Form
form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const indirizzo = indirizzoInput.value.trim();
  if (!indirizzo) { showFeedback('Inserisci un indirizzo valido.', true); return; }

  setButtonLoading(true);
  showFeedback('Sto cercando il rifugio più vicino...', false, true);
  resultSection.classList.add('hidden');

  try {
    const resp = await fetch('/api/nearest', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
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

    // Normalizzazione coordinate
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

    // Creazione Marker Standard
    userMarker = L.marker([coordUser[0], coordUser[1]]).addTo(map).bindPopup('Tu').openPopup();
    shelterMarker = L.marker([coordShelter[0], coordShelter[1]]).addTo(map).bindPopup(dati.nome);
    const group = L.featureGroup([userMarker, shelterMarker]);
    map.fitBounds(group.getBounds().pad(0.4));

    // --- NUOVA FUNZIONALITA': LINEA BLU STILE GOOGLE MAPS ---
    routingControl = L.Routing.control({
      waypoints: [
        L.latLng(coordUser[0], coordUser[1]),
        L.latLng(coordShelter[0], coordShelter[1])
      ],
      lineOptions: {
        styles: [{ color: '#0066ff', opacity: 0.8, weight: 6 }] // Linea blu spessa
      },
      createMarker: function() { return null; }, // Niente marker doppi
      addWaypoints: false,      // Disabilita modifica percorso
      draggableWaypoints: false,
      fitSelectedRoutes: false, // Evita zoom automatici fastidiosi
      show: false               // Nasconde il pannello controlli (gestito anche via CSS)
    }).addTo(map);

  } catch (err) {
    console.error(err);
    showFeedback('Errore di rete o del server.', true);
  } finally {
    setButtonLoading(false);
  }
});

// ==========================================
// LOGICA AUTOCOMPLETE (Da Versione 1)
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
    Object.assign(el.style, {
        padding: '8px 10px', cursor: 'pointer', borderRadius: '6px', margin: '2px 0'
    });

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

  // Geocodifica on demand
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
// LOGICA FOCOLAI - VERSIONE AVANZATA (V2)
// ==========================================

const TYPE_PALETTE = {
  'dog': ['#ef4444', '#991b1b'],     // Rosso Chiaro, Rosso Scuro
  'cat': ['#3b82f6', '#1e3a8a'],     // Blu Chiaro, Blu Scuro
  'bird': ['#eab308', '#854d0e'],    // Giallo, Marrone
  'rabbit': ['#a855f7', '#581c87'],  // Viola Chiaro, Viola Scuro
  'other': ['#6b7280', '#1f2937']    // Grigio Chiaro, Grigio Scuro
};
const visibleTypes = {};

// Helper Robusto per Shapefile (trova chiavi troncate)
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

async function loadFocolai() {
  if (!mapFocolai) return;
  showFeedback('Carico database animali...', false, true);
  try {
    // 1. Zone
    const resZone = await fetch('/api/geojson/zone_pericolose');
    if (resZone.ok) {
        zoneLayer.clearLayers();
        zoneLayer.addData(await resZone.json());
    }
    // 2. Animali
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

                // Recupero dati robusto
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
                            <div style="color:#666; margin-bottom:2px;"><b>Colore Primario:</b> ${colPrimario}</div>
                            <div style="color:#666;"><b>Colore Secondario:</b> ${colSecondario}</div>
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
    showFeedback('');
  } catch (e) {
    console.error(e);
    showFeedback('Errore caricamento focolai.', true);
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
    updateVisibility();
    const row = document.getElementById(`leg-row-${key}`);
    if(row) row.style.opacity = visibleTypes[key] ? '1' : '0.4';
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