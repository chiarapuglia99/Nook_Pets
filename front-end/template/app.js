// ==========================================
// 1. SELEZIONE ELEMENTI DOM
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

// Elementi Vista Swipe Map
const btnSwipe = document.getElementById('btn-swipe');
const mapSwipeContainer = document.getElementById('map-swipe-container');
const btnSwipeBack = document.getElementById('btn-swipe-back');
const legendSwipeEl = document.getElementById('legend-swipe');

// Elementi Vista Randagi
const btnRandagi = document.getElementById('btn-randagi');
const randagiContainer = document.getElementById('randagi-container');
const btnRandagiBack = document.getElementById('btn-randagi-back');
const randagiFeedback = document.getElementById('randagi-feedback');

// Elementi Vista Animali Difficili
const btnDifficili = document.getElementById('btn-difficili');
const difficiliContainer = document.getElementById('difficili-container');
const btnDifficiliBack = document.getElementById('btn-difficili-back');

// *** UPDATE UI: RINOMINA SWIPE MAP (Come da file caricato) ***
if (btnSwipe) btnSwipe.textContent = "Analisi Prevalenza Animali Selvatici-Abbandonati";
const swipeHeader = document.querySelector('#map-swipe-container h2');
if (swipeHeader) swipeHeader.textContent = "Analisi Prevalenza Animali Selvatici-Abbandonati";

// ==========================================
// 2. VARIABILI GLOBALI
// ==========================================
let map = null;
let userMarker = null;
let shelterMarker = null;
let routingControl = null;

// Focolai
let mapFocolai = null;
let zoneLayer = null;
let animaliLayer = null;
let centriFocolaiLayer = null;

// Swipe Map
let mapSwipe = null;
let swipeLeftGroup = null;
let swipeRightGroup = null;
let rawDomesticData = null; // Owner Surrender
let rawWildData = null;     // Wildlife

// Randagi
let mapRandagi = null;
let pieChart = null;
let randagiDataFeatures = [];
let monthBuckets = {};
let sortedMonthKeys = [];
let currentMonthIndex = 0;
let animationTimer = null;
let isAnimating = false;
let randagiLayerGroup = null;

// Animali Difficili
let mapDifficili = null;
let difficiliLayer = null;
let difficiliLegendControl = null;

// Pool immagini
const animalMediaPool = [
  '../utils/doggie.gif',
  '../utils/funny_cat.gif',
  '../utils/parrot.gif',
  '../utils/rabbit.gif',
  '../utils/all_normal.gif'
];

// --- COSTANTI PER IL RECUPERO DATI ---
const SHELTER_KEYS = ['Shelter_Na', 'Shelter_Name', 'Shelter Name', 'shelter', 'Location', 'Kennel', 'Jurisdicti', 'Jurisdiction'];
const NAME_KEYS = ['Animal Nam', 'Animal Name', 'Animal_Name', 'name', 'Name'];
const DATE_KEYS = ['Intake Dat', 'Intake Date', 'intake_date', 'date_found', 'Date'];
const TYPE_KEYS = ['Animal Typ', 'Animal Type', 'species', 'type'];
const SEX_KEYS  = ['Sex', 'Gender', 'sesso'];

// ==========================================
// 3. FUNZIONI UTILITY
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

function showRandagiFeedback(msg, isError = false) {
    if (!randagiFeedback) return;
    randagiFeedback.textContent = msg;
    randagiFeedback.style.color = isError ? '#c53030' : '#374151';
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

window.copiaCoordinate = function(lat, lng) {
    navigator.clipboard.writeText(`${lat}, ${lng}`).then(() => {
        alert("Coordinate copiate negli appunti!");
    });
};

function getVal(props, keys) {
    if (!props) return null;
    const propKeys = Object.keys(props);
    for (let key of keys) {
        if (props[key] !== undefined && props[key] !== null) return props[key];
        const foundCase = propKeys.find(k => k.toLowerCase() === key.toLowerCase());
        if (foundCase && props[foundCase]) return props[foundCase];
        const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        const foundFuzzy = propKeys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanKey);
        if (foundFuzzy && props[foundFuzzy]) return props[foundFuzzy];
    }
    return null;
}

// ==========================================
// 4. MAPPA PRINCIPALE & RICERCA
// ==========================================
function initMap(lat = 34.0219, lng = -118.4814, zoom = 10) {
  if (!map) {
    map = L.map('map').setView([lat, lng], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    map.on('click', async (e) => {
        resetMap();
        resultSection.classList.add('hidden');
        if (typeof clearAutocomplete === 'function') clearAutocomplete();

        const clickedLat = e.latlng.lat;
        const clickedLng = e.latlng.lng;

        userMarker = L.marker([clickedLat, clickedLng]).addTo(map).bindPopup('Posizione selezionata').openPopup();
        indirizzoInput.value = "Recupero indirizzo...";

        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${clickedLat}&lon=${clickedLng}`);
            if (!response.ok) throw new Error("Errore geocoding");
            const data = await response.json();
            if (data && data.display_name) indirizzoInput.value = data.display_name;
            else indirizzoInput.value = `${clickedLat.toFixed(5)}, ${clickedLng.toFixed(5)}`;
        } catch (err) {
            console.warn("Errore reverse geocoding:", err);
            indirizzoInput.value = `${clickedLat.toFixed(5)}, ${clickedLng.toFixed(5)}`;
        }
    });
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
if (animalImg) animalImg.src = pickRandomMedia();

if (form) {
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
          // URL Corretto con backticks
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
}

// ==========================================
// 5. AUTOCOMPLETE
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
  if (!acContainer || !indirizzoInput) return;
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

if (indirizzoInput) {
    indirizzoInput.addEventListener('input', debounce(async () => {
      const v = indirizzoInput.value.trim();
      if (!v) { clearAutocomplete(); return; }
      const items = await fetchSuggestions(v);
      renderAutocomplete(items.slice(0, 10));
    }, 250));
}
window.addEventListener('resize', positionAutocomplete);
createAutocomplete();

// ==========================================
// 6. FOCOLAI
// ==========================================
const TYPE_PALETTE = {
  'dog': ['#ef4444', '#991b1b'],
  'cat': ['#3b82f6', '#1e3a8a'],
  'bird': ['#eab308', '#854d0e'],
  'rabbit': ['#a855f7', '#581c87'],
  'other': ['#6b7280', '#1f2937']
};
const visibleTypes = {};

function getAnimalInfo(props) {
    const rawType = getVal(props, TYPE_KEYS) || 'Other';
    const cleanType = String(rawType).toLowerCase();
    let key = 'other';
    if (cleanType.includes('dog') || cleanType.includes('cane')) key = 'dog';
    else if (cleanType.includes('cat') || cleanType.includes('gatto')) key = 'cat';
    else if (cleanType.includes('bird') || cleanType.includes('uccello')) key = 'bird';
    else if (cleanType.includes('rabbit') || cleanType.includes('coniglio')) key = 'rabbit';
    return { label: rawType, key: key, palette: TYPE_PALETTE[key] || TYPE_PALETTE['other'] };
}

function extractCoords(geom) {
    if (!geom || !geom.coordinates) return null;
    const t = geom.type || 'Point';
    const c = geom.coordinates;
    let coords = null;
    try {
        if (t === 'Point') coords = c;
        else if (t === 'MultiPoint' || t === 'LineString') coords = Array.isArray(c[0]) ? c[0] : c;
        else if (t === 'Polygon') coords = (Array.isArray(c[0]) && Array.isArray(c[0][0])) ? c[0][0] : null;
        else coords = Array.isArray(c[0]) ? c[0] : null;
    } catch (e) { coords = null; }
    if (!coords || coords.length < 2) return null;
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (isNaN(lat) || isNaN(lon)) return null;
    return [lat, lon];
}

function translateSpeciesKeyToItalian(key) {
    const m = { 'dog': 'Cane', 'cat': 'Gatto', 'bird': 'Uccello', 'rabbit': 'Coniglio', 'other': 'Altro' };
    return m[key] || (typeof key === 'string' ? (key.charAt(0).toUpperCase() + key.slice(1)) : 'Altro');
}

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

function destroyFocolaiMap() {
    try {
        if (mapFocolai) {
            if (zoneLayer) try { zoneLayer.clearLayers(); } catch (e) {}
            if (animaliLayer) try { animaliLayer.clearLayers(); } catch (e) {}
            if (centriFocolaiLayer) try { centriFocolaiLayer.clearLayers(); } catch (e) {}
            mapFocolai.remove();
            mapFocolai = null;
        }
    } catch (e) { console.warn('destroyFocolaiMap error', e); }
}

async function loadFocolai() {
  if (!mapFocolai) return;
  showFeedback('Carico analisi focolai...', false, true);
  try {
    const resZone = await fetch('/api/geojson/zone_rosse');
    if (resZone.ok) {
        zoneLayer.clearLayers();
        zoneLayer.addData(await resZone.json());
    }
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
                const rawName = getVal(p, NAME_KEYS) || "Senza nome";
                const nome = (rawName.toLowerCase() === 'unknown' || rawName.trim() === '') ? "Senza nome" : rawName;
                const condizione = getVal(p, ['Intake Con', 'condition']) || "Non specificato";
                const colPrimario = getVal(p, ['Primary Co', 'Color']) || "N/A";
                const content = `<div style="font-family:sans-serif; font-size:14px; min-width:200px;"><div style="background:${info.palette[0]}; color:white; padding:6px; border-radius:4px 4px 0 0; font-weight:bold;">${String(info.label).toUpperCase()}</div><div style="padding:10px; background:#fff; border:1px solid #ddd; border-top:none;"><div style="margin-bottom:6px;"><b>Nome:</b> ${nome}</div><div style="margin-bottom:6px;"><b>Salute:</b> <span style="color:#c53030; background:#fee2e2; padding:2px 5px; border-radius:4px; font-weight:bold;">${condizione}</span></div><div style="color:#666; margin-bottom:2px;"><b>Colore:</b> ${colPrimario}</div></div></div>`;
                layer.bindPopup(content);
            }
        });
        animaliLayer.addTo(mapFocolai);
        const bounds = zoneLayer.getBounds();
        if(animaliLayer.getLayers().length > 0) bounds.extend(animaliLayer.getBounds());
        if (bounds.isValid()) mapFocolai.fitBounds(bounds.pad(0.1));
        buildLegend();
    }
    const resCentri = await fetch('/api/geojson/zone_rosse');
    if (resCentri.ok) {
        const dataCentri = await resCentri.json();
        if (centriFocolaiLayer) mapFocolai.removeLayer(centriFocolaiLayer);
        let unknownCounter = 1;
        centriFocolaiLayer = L.geoJSON(dataCentri, {
            pointToLayer: (feature, latlng) => {
                return L.circleMarker(latlng, { radius: 15, fillColor: '#ff0000', color: '#000', weight: 2, opacity: 1, fillOpacity: 0.5 });
            },
            onEachFeature: (feature, layer) => {
                const props = feature.properties;
                const lat = feature.geometry.coordinates[1].toFixed(5);
                const lng = feature.geometry.coordinates[0].toFixed(5);
                const rawId = getVal(props, ['CLUSTER_ID', 'id']);
                let displayTitle = (rawId) ? `⚠️ FOCOLAIO ${rawId}` : `ZONA ROSSA #${unknownCounter++}`;
                layer.bindPopup(`<div style="text-align:center; min-width:150px;"><h3 style="margin:0; color:#dc2626; font-family:'Fredoka', sans-serif;">${displayTitle}</h3><p style="font-size:0.9rem; margin:5px 0;">Alta concentrazione rilevata.</p><div style="background:#f3f4f6; padding:5px; border-radius:4px; font-family:monospace; font-weight:bold;">LAT: ${lat}<br>LON: ${lng}</div><button onclick="copiaCoordinate(${lat}, ${lng})" style="margin-top:5px; font-size:0.8rem; cursor:pointer;">Copia Coordinate</button></div>`);
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
    const rowA = document.getElementById(`leg-row-${key}`);
    if (rowA) rowA.style.opacity = visibleTypes[key] ? '1' : '0.4';
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
        let labelTxt = translateSpeciesKeyToItalian(key);
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

// ==========================================
// 7. SWIPE MAP (CONFRONTO OWNER SURRENDER vs WILDLIFE)
// ==========================================
function initSwipeMap() {
  if (mapSwipe) { setTimeout(() => mapSwipe.invalidateSize(), 100); return; }
  const urban = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
  const wild = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', { maxZoom: 19 });
  mapSwipe = L.map('map-swipe', { center: [34.0219, -118.4814], zoom: 11, layers: [urban] });
  swipeLeftGroup = L.layerGroup().addTo(mapSwipe);
  swipeRightGroup = L.layerGroup().addTo(mapSwipe);
  L.control.layers({ 'Urban': urban, 'Wild': wild }, {}).addTo(mapSwipe);
  wild.addTo(mapSwipe);
  setTimeout(() => {
    try { if (typeof L.control.sideBySide === 'function') L.control.sideBySide(urban, wild).addTo(mapSwipe); } catch(e){}
  }, 200);
}

// *** Helper per Popup con chiavi corrette (troncate) ***
function createSwipePopupContent(p) {
    const nome = p['Animal Nam'] || 'Sconosciuto';
    const tipo = p['Animal Typ'] || p['Animal Type'] || 'N/A';
    const intake = p['Intake Typ'] || 'N/A';
    const col1 = p['Primary Co'] || 'N/A';
    const col2 = p['Secondary'] || 'N/A';
    return `
      <div style="font-family: 'Fredoka', sans-serif; font-size: 0.9rem; min-width: 180px;">
          <h4 style="margin: 0 0 8px 0; color: #d35400; border-bottom: 1px solid #eee; padding-bottom: 4px;">${nome}</h4>
          <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px; font-size: 0.85rem;">
              <strong style="color: #555;">Tipo:</strong> <span>${tipo}</span>
              <strong style="color: #555;">Intake:</strong> <span>${intake}</span>
              <strong style="color: #555;">Colore 1:</strong> <span>${col1}</span>
              <strong style="color: #555;">Colore 2:</strong> <span>${col2}</span>
          </div>
      </div>
    `;
}

// *** MODIFICA: Due legende separate con TESTI AGGIORNATI E ZONA CONFLITTO RIMOSSA ***
function buildSwipeLegend() {
    if (!legendSwipeEl) return;
    const colOwner = "#ff7b7b"; // ROSSO (Punti Mappa)
    const colWild = "#7bdcff";  // BLU (Punti Mappa)
    const colConflict = "#8e44ad"; // VIOLA (Risultato Analisi)

    legendSwipeEl.innerHTML = `
        <div style="background: white; padding: 12px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: 1px solid #eee; margin-bottom: 10px;">
            <h4 style="margin: 0 0 8px 0; font-family: 'Fredoka', sans-serif; color: #333; font-size: 0.95rem; border-bottom: 2px solid #f3f4f6; padding-bottom: 5px;">
                📍 Legenda Punti Mappa
            </h4>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                <span style="width: 14px; height: 14px; background: ${colOwner}; border-radius: 50%; border: 1px solid rgba(0,0,0,0.2); display: inline-block;"></span>
                <span style="font-size: 0.85rem; color: #555;"><strong>OWNER SURRENDER</strong> (Domestici Abbandonati)</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="width: 14px; height: 14px; background: ${colWild}; border-radius: 50%; border: 1px solid rgba(0,0,0,0.2); display: inline-block;"></span>
                <span style="font-size: 0.85rem; color: #555;"><strong>WILDLIFE</strong> (Fauna Selvatica)</span>
            </div>
        </div>

        <div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: 1px solid #eee;">
            <h4 style="margin: 0 0 12px 0; font-family: 'Fredoka', sans-serif; color: #333; border-bottom: 2px solid #f3f4f6; padding-bottom: 8px;">
                🔍 Analisi Prevalenza (Click su Mappa)
            </h4>
            <p style="font-size: 0.85rem; color: #666; margin-bottom: 12px; font-style: italic;">
                Clicca per analizzare il raggio di 1.5km:
            </p>

            <div style="display: flex; gap: 10px; margin-bottom: 12px;">
                <div style="min-width: 24px; height: 24px; background: ${colOwner}; border-radius: 4px; border: 1px solid rgba(0,0,0,0.1);"></div>
                <div>
                    <strong style="color: ${colOwner}; font-size: 0.95rem;">Prevalenza: Fauna Abbandonata</strong>
                    <div style="font-size: 0.85rem; color: #444; margin-top: 2px;">
                        Alta concentrazione di abbandoni/rinunce.
                        <br><span style="color: #c0392b; font-weight: 500;">⚠️ Rischi:</span> Smarrimento, incidenti, degrado urbano.
                    </div>
                </div>
            </div>

            <div style="display: flex; gap: 10px; margin-bottom: 12px;">
                <div style="min-width: 24px; height: 24px; background: ${colWild}; border-radius: 4px; border: 1px solid rgba(0,0,0,0.1);"></div>
                <div>
                    <strong style="color: ${colWild}; font-size: 0.95rem;">Prevalenza: FAUNA SELVATICA</strong>
                    <div style="font-size: 0.85rem; color: #444; margin-top: 2px;">
                        Habitat naturale predominante.
                        <br><span style="color: #c0392b; font-weight: 500;">⚠️ Rischi:</span> Territorio ostile per animali abbandonati.
                    </div>
                </div>
            </div>
        </div>
    `;
    legendSwipeEl.classList.remove('hidden');
}

// Caricamento dati con FILE CORRETTO (Animali Domestici.geojson)
async function loadSwipeMap() {
  if (!mapSwipe) return;
  showFeedback('Carico Mappa Confronto...', false, true);
  try {
    // 1. Carica Animali Domestici (OWNER SURRENDER) - Sinistra
    const resLeft = await fetch('/api/geojson/Animali Domestici.geojson');
    if (resLeft.ok) {
      const data = await resLeft.json();
      rawDomesticData = data.features; // Salva dati
      swipeLeftGroup.clearLayers();
      L.geoJSON(data, {
        pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius:6, fillColor:'#ff7b7b', color:'#fff', weight:1, fillOpacity:0.9 }),
        onEachFeature: (feature, layer) => {
          const p = feature.properties || {};
          layer.bindPopup(createSwipePopupContent(p));
          layer.on('click', L.DomEvent.stopPropagation);
        }
      }).addTo(swipeLeftGroup);
    }

    // 2. Carica Fauna Selvatica (WILDLIFE) - Destra
    const resRight = await fetch('/api/geojson/Fauna Selvatica.geojson');
    const resHeat = await fetch('/api/geojson/Fauna Selvatica -Heatmap.geojson');

    swipeRightGroup.clearLayers();
    if (resRight.ok) {
      const data = await resRight.json();
      rawWildData = data.features; // Salva dati
      L.geoJSON(data, {
        pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius:6, fillColor:'#7bdcff', color:'#fff', weight:1, fillOpacity:0.9 }),
        onEachFeature: (feature, layer) => {
          const p = feature.properties || {};
          layer.bindPopup(createSwipePopupContent(p));
          layer.on('click', L.DomEvent.stopPropagation);
        }
      }).addTo(swipeRightGroup);
    }

    if (resHeat.ok) {
      const heatData = await resHeat.json();
      const heatPoints = [];
      for (const f of heatData.features) {
        const c = extractCoords(f.geometry);
        if (c) heatPoints.push([c[0], c[1], 0.6]);
      }
      if (heatPoints.length) L.heatLayer(heatPoints, { radius: 25, blur: 15, maxZoom: 17 }).addTo(swipeRightGroup);
    }

    // Listener per Radar di Conflitto
    mapSwipe.on('click', onSwipeMapClick);
    // Costruzione Legenda (Doppia: Punti + Analisi)
    buildSwipeLegend();

    showFeedback('Mappa caricata.');
  } catch (e) {
    console.error(e);
    showFeedback('Errore caricamento Swipe Map.', true);
  }
}

function destroySwipeMap() {
  try {
    if (mapSwipe) {
      mapSwipe.off('click', onSwipeMapClick);
      if (swipeLeftGroup) try { swipeLeftGroup.clearLayers(); } catch(e){}
      if (swipeRightGroup) try { swipeRightGroup.clearLayers(); } catch(e){}
      mapSwipe.remove();
      mapSwipe = null; swipeLeftGroup = null; swipeRightGroup = null;
      rawDomesticData = null;
      rawWildData = null;
    }
  } catch (e) { console.warn('destroySwipeMap error', e); }
}

// --- FUNZIONI MATEMATICHE PER RADAR DI CONFLITTO ---

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

// *** MODIFICA: Radar Logic (Owner Surrender vs Wildlife) ***
function onSwipeMapClick(e) {
    if (!rawDomesticData || !rawWildData) return;
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    const raggioKm = 1.5;

    // Conta Owner Surrender (Domestic)
    let countDom = 0;
    rawDomesticData.forEach(f => {
        const c = extractCoords(f.geometry);
        if (c) {
            const d = getDistanceFromLatLonInKm(lat, lng, c[0], c[1]);
            if (d <= raggioKm) countDom++;
        }
    });

    // Conta Wildlife
    let countWild = 0;
    rawWildData.forEach(f => {
        const c = extractCoords(f.geometry);
        if (c) {
            const d = getDistanceFromLatLonInKm(lat, lng, c[0], c[1]);
            if (d <= raggioKm) countWild++;
        }
    });

    let verdetto = "";
    let coloreVerdetto = "#333";

    if (countDom === 0 && countWild === 0) {
        verdetto = "Nessuna attività rilevata.";
    } else if (countDom > countWild * 1.5) {
        verdetto = "Prevalenza: 🏠 OWNER SURRENDER";
        coloreVerdetto = "#ff7b7b"; // Rosso
    } else if (countWild > countDom * 1.5) {
        verdetto = "Prevalenza: 🌲 FAUNA SELVATICA";
        coloreVerdetto = "#7bdcff"; // Blu
    } else {
        verdetto = "⚠️ ZONA DI CONFLITTO";
        coloreVerdetto = "#8e44ad"; // Viola
    }

    L.popup()
        .setLatLng(e.latlng)
        .setContent(`
            <div style="font-family:'Fredoka',sans-serif; text-align:center; min-width:200px;">
                <h4 style="margin:0 0 10px 0; border-bottom:1px solid #eee; padding-bottom:5px;">Analisi di Zona (1.5 km)</h4>
                <div style="display:flex; justify-content:space-around; margin-bottom:10px;">
                    <div style="color:#ff7b7b;">
                        <div style="font-size:1.2rem; font-weight:bold;">${countDom}</div>
                        <div style="font-size:0.8rem;">Abbandoni</div>
                    </div>
                    <div style="color:#7bdcff;">
                        <div style="font-size:1.2rem; font-weight:bold;">${countWild}</div>
                        <div style="font-size:0.8rem;">Selvatici</div>
                    </div>
                </div>
                <div style="background:${coloreVerdetto}; color:${coloreVerdetto === '#7bdcff' ? '#333' : 'white'}; padding:5px; border-radius:4px; font-weight:bold; font-size:0.9rem;">
                    ${verdetto}
                </div>
            </div>
        `)
        .openOn(mapSwipe);
}

// ==========================================
// 8. SEZIONE ANIMALI RANDAGI
// ==========================================

function initRandagiMap(lat = 34.0219, lng = -118.4814, zoom = 11) {
    if (!document.getElementById('map-randagi')) return;
    if (mapRandagi) { setTimeout(() => mapRandagi.invalidateSize(), 200); return; }
    mapRandagi = L.map('map-randagi', { preferCanvas: true }).setView([lat, lng], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapRandagi);
    randagiLayerGroup = L.layerGroup().addTo(mapRandagi);
}

function destroyRandagiMap() {
    stopAnimation();
    try {
        const controls = document.getElementById('randagi-controls-ui');
        if (controls) controls.remove();
        if (randagiLayerGroup) { randagiLayerGroup.clearLayers(); randagiLayerGroup = null; }
        if (mapRandagi) { mapRandagi.remove(); mapRandagi = null; }
        randagiDataFeatures = [];
        monthBuckets = {};
        sortedMonthKeys = [];
        if (randagiContainer) randagiContainer.classList.add('hidden');
    } catch (e) { console.warn(e); }
}

async function loadRandagiData() {
    showRandagiFeedback('Caricamento dati...', false);
    try {
        const res = await fetch(`/api/geojson/animali_randagi?_=${Date.now()}`);
        if (!res.ok) throw new Error('Errore fetch');
        const data = await res.json();
        if (!data || !data.features || data.features.length === 0) {
            showRandagiFeedback('Nessun dato trovato.', true);
            return;
        }
        randagiDataFeatures = data.features;
        initRandagiMap();

        monthBuckets = {};
        randagiDataFeatures.forEach(f => {
            const p = f.properties || {};
            let rawDate = getVal(p, DATE_KEYS);
            let monthKey = 'Unknown';
            if (rawDate) {
                const d = new Date(rawDate);
                if (!isNaN(d.getTime())) {
                    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
                    const y = d.getUTCFullYear();
                    monthKey = `${y}-${m}`;
                }
            }
            if (!monthBuckets[monthKey]) monthBuckets[monthKey] = [];
            f._monthKey = monthKey;

            const name = getVal(p, NAME_KEYS) || 'unknown';
            const species = getVal(p, TYPE_KEYS) || 'unknown';
            const dateStr = rawDate ? new Date(rawDate).toISOString().split('T')[0] : 'nodate';
            const shelterName = getVal(p, SHELTER_KEYS) || 'unknown';
            const compositeId = `${name}-${species}-${dateStr}-${shelterName}`.toLowerCase().replace(/[^a-z0-9]/g, '');
            f._safeId = compositeId;
            monthBuckets[monthKey].push(f);
        });

        sortedMonthKeys = Object.keys(monthBuckets).filter(k => k !== 'Unknown').sort();
        if (monthBuckets['Unknown']) sortedMonthKeys.push('Unknown');
        currentMonthIndex = sortedMonthKeys.length > 0 ? 0 : 0;

        setupRandagiControls();
        renderMonthState();
        showRandagiFeedback('');
    } catch (e) {
        console.error(e);
        showRandagiFeedback('Errore caricamento.', true);
    }
}

function setupRandagiControls() {
    const old = document.getElementById('randagi-controls-ui');
    if (old) old.remove();

    const wrapper = document.createElement('div');
    wrapper.id = 'randagi-controls-ui';
    wrapper.className = 'randagi-controls-wrapper';

    const navGroup = document.createElement('div');
    navGroup.className = 'nav-group';

    const btnPlay = document.createElement('button');
    btnPlay.className = 'btn-nav btn-play';
    btnPlay.id = 'randagi-btn-play';
    btnPlay.innerHTML = '▶ Animazione Totale';
    btnPlay.onclick = toggleAnimation;

    const btnPrev = document.createElement('button');
    btnPrev.className = 'btn-nav';
    btnPrev.innerHTML = '❮';
    btnPrev.onclick = () => { stopAnimation(); changeMonth(-1); };

    const display = document.createElement('div');
    display.id = 'randagi-month-display';
    display.className = 'month-display';
    display.textContent = 'Caricamento...';

    const btnNext = document.createElement('button');
    btnNext.className = 'btn-nav';
    btnNext.innerHTML = '❯';
    btnNext.onclick = () => { stopAnimation(); changeMonth(1); };

    navGroup.appendChild(btnPlay);
    navGroup.appendChild(btnPrev);
    navGroup.appendChild(display);
    navGroup.appendChild(btnNext);

    const legendDiv = document.createElement('div');
    legendDiv.id = 'randagi-dynamic-legend';
    legendDiv.className = 'randagi-legend-inline';

    wrapper.appendChild(navGroup);
    wrapper.appendChild(legendDiv);

    const mapEl = document.getElementById('map-randagi');
    mapEl.parentNode.insertBefore(wrapper, mapEl);
}

function changeMonth(delta) {
    if (sortedMonthKeys.length === 0) return;
    let newIndex = currentMonthIndex + delta;
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= sortedMonthKeys.length) newIndex = sortedMonthKeys.length - 1;
    if (newIndex !== currentMonthIndex) {
        currentMonthIndex = newIndex;
        renderMonthState();
    }
}

function getUniqueFeatures(features) {
    const seenIds = new Set();
    const unique = [];
    features.forEach(f => {
        if (!f._safeId) return;
        if (seenIds.has(f._safeId)) return;
        seenIds.add(f._safeId);
        unique.push(f);
    });
    return unique;
}

function renderMonthState() {
    if (sortedMonthKeys.length === 0) return;
    const key = sortedMonthKeys[currentMonthIndex];
    const display = document.getElementById('randagi-month-display');
    if (display) {
        if (key === 'Unknown') display.textContent = 'Data Sconosciuta';
        else {
            const [y, m] = key.split('-');
            const d = new Date(Number(y), Number(m)-1, 1);
            const label = d.toLocaleString('it-IT', { month: 'long', year: 'numeric' });
            display.textContent = label.charAt(0).toUpperCase() + label.slice(1);
        }
    }
    if (!isAnimating) {
        randagiLayerGroup.clearLayers();
        const features = monthBuckets[key] || [];
        const uniqueFeatures = getUniqueFeatures(features);
        addFeaturesToMap(uniqueFeatures);
        buildRandagiTable(uniqueFeatures);
        updateChartFromFeatures(uniqueFeatures);
    }
}

function addFeaturesToMap(features, updateLegend = true) {
    const counts = {};
    features.forEach(f => {
        const coords = extractCoords(f.geometry);
        if (!coords) return;
        const info = getAnimalInfo(f.properties);

        if (updateLegend) {
            counts[info.key] = (counts[info.key] || 0) + 1;
        }

        const marker = L.circleMarker(coords, {
            radius: 7, fillColor: info.palette[0], color: '#fff',
            weight: 1.5, opacity: 1, fillOpacity: 0.9
        });
        const p = f.properties;
        const nome = getVal(p, NAME_KEYS) || 'Senza nome';
        const shelter = getVal(p, SHELTER_KEYS) || 'Rifugio sconosciuto';
        marker.bindPopup(`<b>${nome}</b><br>${translateSpeciesKeyToItalian(info.key)}<br>${shelter}`);
        marker.on('click', () => highlightTableAnimal(f._safeId));
        marker.addTo(randagiLayerGroup);
    });
    if (updateLegend) {
        updateDynamicLegend(counts);
    }
}

function toggleAnimation() {
    if (isAnimating) stopAnimation();
    else startAnimation();
}

function startAnimation() {
    if (sortedMonthKeys.length === 0) return;
    isAnimating = true;
    const btn = document.getElementById('randagi-btn-play');
    if (btn) { btn.innerHTML = '⏹ Stop'; btn.classList.add('active'); }
    randagiLayerGroup.clearLayers();
    currentMonthIndex = 0;
    const accumulatedFeatures = [];
    const seenIds = new Set();
    const animationCounts = { 'dog': 0, 'cat': 0, 'bird': 0, 'rabbit': 0, 'other': 0 };
    const step = () => {
        if (currentMonthIndex >= sortedMonthKeys.length) { stopAnimation(false); return; }
        const key = sortedMonthKeys[currentMonthIndex];
        const rawFeats = monthBuckets[key] || [];
        const newUniqueFeats = [];
        rawFeats.forEach(f => {
            if(!seenIds.has(f._safeId)) {
                seenIds.add(f._safeId);
                newUniqueFeats.push(f);
                accumulatedFeatures.push(f);
                const info = getAnimalInfo(f.properties);
                animationCounts[info.key] = (animationCounts[info.key] || 0) + 1;
            }
        });
        addFeaturesToMap(newUniqueFeats, false);
        updateDynamicLegend(animationCounts);
        renderMonthState();
        buildRandagiTable(accumulatedFeatures);
        updateChartFromFeatures(accumulatedFeatures);
        currentMonthIndex++;
    };
    step();
    animationTimer = setInterval(step, 800);
}

function stopAnimation(resetToSingle = true) {
    isAnimating = false;
    if (animationTimer) { clearInterval(animationTimer); animationTimer = null; }
    const btn = document.getElementById('randagi-btn-play');
    if (btn) { btn.innerHTML = '▶ Animazione Totale'; btn.classList.remove('active'); }
    if (resetToSingle && sortedMonthKeys.length > 0) {
        if (currentMonthIndex >= sortedMonthKeys.length) currentMonthIndex = sortedMonthKeys.length - 1;
        renderMonthState();
    }
}

function updateChartFromFeatures(features) {
    const counts = { 'Male': 0, 'Female': 0, 'Unknown': 0 };
    features.forEach(f => {
        const p = f.properties || {};
        let s = getVal(p, SEX_KEYS) || '';
        s = s.toString().trim().toLowerCase();
        if (s.startsWith('m')) counts['Male']++;
        else if (s.startsWith('f')) counts['Female']++;
        else counts['Unknown']++;
    });
    setTimeout(() => buildRandagiCharts(counts), 50);
}

function buildRandagiCharts(countsSesso) {
    const ctx = document.getElementById('randagi-pie');
    if (!ctx) return;
    if (pieChart) {
        pieChart.data.datasets[0].data = [countsSesso['Male'], countsSesso['Female'], countsSesso['Unknown']];
        pieChart.update();
        return;
    }
    const labels = ['Maschio', 'Femmina', 'Sconosciuto'];
    const data = [countsSesso['Male'], countsSesso['Female'], countsSesso['Unknown']];
    pieChart = new Chart(ctx.getContext('2d'), {
        type: 'pie',
        data: { labels: labels, datasets: [{ data: data, backgroundColor: ['#3b82f6', '#ef4444', '#9ca3af'] }] },
        options: {
            plugins: { legend: { position: 'bottom' } },
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 400 }
        }
    });
}

function buildRandagiTable(features) {
    if (!randagiContainer) return;
    const oldContainer = document.getElementById('randagi-table-container');
    if (oldContainer) oldContainer.remove();

    const container = document.createElement('div');
    container.id = 'randagi-table-container';
    Object.assign(container.style, { background: '#fff', borderRadius: '8px', maxHeight: '300px', overflow: 'auto', border: '1px solid #e5e7eb', marginTop: '10px' });
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.innerHTML = `<thead style="position:sticky; top:0; background:#f9fafb; z-index:10; box-shadow:0 1px 2px rgba(0,0,0,0.05);"><tr><th style="padding:10px; text-align:left; border-bottom:1px solid #ddd;">Nome</th><th style="padding:10px; text-align:left; border-bottom:1px solid #ddd;">Specie</th><th style="padding:10px; text-align:left; border-bottom:1px solid #ddd;">Data</th><th style="padding:10px; text-align:left; border-bottom:1px solid #ddd;">Rifugio</th></tr></thead>`;
    const tbody = document.createElement('tbody');

    features.forEach(f => {
        const p = f.properties || {};
        const tr = document.createElement('tr');
        tr.id = `row-${f._safeId}`;
        tr.style.cursor = 'pointer';
        tr.style.borderBottom = '1px solid #f3f3f3';

        const nome = getVal(p, NAME_KEYS) || 'Senza nome';
        const specie = translateSpeciesKeyToItalian(getAnimalInfo(p).key);
        const data = getVal(p, DATE_KEYS) || '-';
        const rifugio = getVal(p, SHELTER_KEYS) || 'Rifugio non spec.';

        tr.innerHTML = `<td style="padding:10px; font-weight:600;">${nome}</td><td style="padding:10px;">${specie}</td><td style="padding:10px; color:#666; font-size:0.9rem;">${data}</td><td style="padding:10px; color:#0066ff;">${rifugio}</td>`;
        tr.onclick = () => highlightTableAnimal(f._safeId, false);
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
    randagiContainer.appendChild(container);
}

function highlightTableAnimal(safeId, scroll = true) {
    document.querySelectorAll('#randagi-table-container tr.highlight-row').forEach(r => { r.classList.remove('highlight-row'); });
    const row = document.getElementById(`row-${safeId}`);
    if (row) {
        row.classList.add('highlight-row');
        if (scroll) { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }
}

function updateDynamicLegend(counts) {
    const container = document.getElementById('randagi-dynamic-legend');
    if (!container) return;
    container.innerHTML = '';
    const pal = { 'dog': '#ef4444', 'cat': '#3b82f6', 'bird': '#eab308', 'rabbit': '#a855f7', 'other': '#6b7280' };
    Object.keys(counts).forEach(k => {
        const item = document.createElement('div');
        Object.assign(item.style, { display:'flex', alignItems:'center', gap:'5px', fontSize:'0.85rem', marginRight:'10px' });
        item.innerHTML = `<span style="width:10px; height:10px; background:${pal[k]||'#999'}; border-radius:50%;"></span> ${translateSpeciesKeyToItalian(k)} (${counts[k]})`;
        container.appendChild(item);
    });
}

// ==========================================
// 9. ANIMALI DIFFICILI (UPDATE LEGENDA INTERNA)
// ==========================================
function getIntakeValue(props) {
    if (!props) return 0;
    const val = props['intake_dur_mean'] || props['intake_duration_mean'] || props['intake_dur'] || 0;
    return Number(val);
}

function getDifficiliColor(d) {
    return d > 90 ? '#800026' : d > 60 ? '#BD0026' : d > 45 ? '#E31A1C' : d > 30 ? '#FC4E2A' : d > 15 ? '#FD8D3C' : d > 0  ? '#FEB24C' : '#FFEDA0';
}

function styleDifficili(feature) {
    const val = getIntakeValue(feature.properties);
    return { fillColor: getDifficiliColor(val), weight: 1, opacity: 1, color: 'white', dashArray: '3', fillOpacity: 0.7 };
}

function onEachFeatureDifficili(feature, layer) {
    layer.on({
        mouseover: (e) => { const l = e.target; l.setStyle({ weight: 3, color: '#666', dashArray: '', fillOpacity: 0.9 }); l.bringToFront(); },
        mouseout: (e) => { difficiliLayer.resetStyle(e.target); },
        click: () => layer.openPopup()
    });
    const rawVal = getIntakeValue(feature.properties);
    const giorni = Math.round(rawVal);
    const nome = feature.properties.city || feature.properties.Name || "Zona";
    layer.bindPopup(`<div style="font-family:'Fredoka', sans-serif; text-align:center;"><h4 style="margin:0 0 5px 0; color:#c2410c;">${nome}</h4><div style="font-size:0.9rem;">Permanenza Media:</div><div style="font-size:1.5rem; font-weight:bold; color:#BD0026;">${giorni} giorni</div></div>`);
}

function initDifficiliMap() {
    if (mapDifficili) { setTimeout(() => mapDifficili.invalidateSize(), 100); return; }
    mapDifficili = L.map('map-difficili').setView([34.0522, -118.2437], 10);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(mapDifficili);
}

async function loadDifficiliData() {
    if (!mapDifficili) return;
    try {
        const res = await fetch('/api/geojson/animali_difficili');
        if (!res.ok) throw new Error(`Errore Server: ${res.status}`);
        const data = await res.json();
        if (difficiliLayer) mapDifficili.removeLayer(difficiliLayer);
        difficiliLayer = L.geoJson(data, { style: styleDifficili, onEachFeature: onEachFeatureDifficili }).addTo(mapDifficili);
        if (data.features && data.features.length > 0) mapDifficili.fitBounds(difficiliLayer.getBounds());
        buildDifficiliLegend();
    } catch (e) {
        console.error("ERRORE CARICAMENTO:", e);
    }
}

function buildDifficiliLegend() {
    // Se esiste già una legenda, la rimuoviamo per evitare duplicati
    if (difficiliLegendControl) {
        mapDifficili.removeControl(difficiliLegendControl);
        difficiliLegendControl = null;
    }

    // Creiamo un controllo Leaflet posizionato in basso a destra
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function (map) {
        const div = L.DomUtil.create('div', 'info legend legend-difficili-leaf');
        let content = `
            <h4>Permanenza nel rifugio pre-adozione</h4>
            <p>Giorni medi di permanenza in rifugio prima dell'adozione.</p>
        `;
        const grades = [0, 15, 30, 45, 60, 90];
        const labels = [
            "Molto veloce (<15 gg)",
            "Veloce (15-30 gg)",
            "Medio (30-45 gg)",
            "Lento (45-60 gg)",
            "Difficile (60-90 gg)",
            "Critico (>90 gg)"
        ];

        grades.forEach((grade, i) => {
            const color = getDifficiliColor(grade + 1);
            const text = labels[i] ? labels[i] : (grade + '+');

            content += `
                <div class="legend-row">
                    <span class="legend-color-box" style="background:${color}"></span>
                    <span class="legend-label">${text}</span>
                </div>`;
        });
        div.innerHTML = content;
        L.DomEvent.disableClickPropagation(div);
        return div;
    };

    legend.addTo(mapDifficili);
    difficiliLegendControl = legend;
}

function destroyDifficiliMap() {
    try {
        if (mapDifficili) {
            if (difficiliLegendControl) {
                mapDifficili.removeControl(difficiliLegendControl);
                difficiliLegendControl = null;
            }
            if (difficiliLayer) mapDifficili.removeLayer(difficiliLayer);
            mapDifficili.remove();
            mapDifficili = null; difficiliLayer = null;
        }
    } catch (e) { console.warn('destroyDifficiliMap error', e); }
}

// ==========================================
// 10. NAVIGAZIONE
// ==========================================
if (btnFocolai) btnFocolai.onclick = () => {
    homeView.classList.add('hidden');
    if (randagiContainer) randagiContainer.classList.add('hidden');
    mapSwipeContainer.classList.add('hidden');
    difficiliContainer.classList.add('hidden');
    destroySwipeMap(); destroyRandagiMap(); destroyDifficiliMap();
    mapFocolaiContainer.classList.remove('hidden');
    initFocolaiMap(); loadFocolai();
};
if (btnBack) btnBack.onclick = () => {
    mapFocolaiContainer.classList.add('hidden'); homeView.classList.remove('hidden'); destroyFocolaiMap();
};
if (btnRandagi) btnRandagi.onclick = () => {
    homeView.classList.add('hidden'); mapFocolaiContainer.classList.add('hidden'); mapSwipeContainer.classList.add('hidden'); difficiliContainer.classList.add('hidden');
    destroySwipeMap(); destroyFocolaiMap(); destroyDifficiliMap();
    randagiContainer.classList.remove('hidden');
    loadRandagiData();
};
if (btnRandagiBack) btnRandagiBack.onclick = () => {
    randagiContainer.classList.add('hidden'); homeView.classList.remove('hidden'); destroyRandagiMap();
};
if (btnSwipe) btnSwipe.onclick = () => {
    homeView.classList.add('hidden'); mapFocolaiContainer.classList.add('hidden'); if (randagiContainer) randagiContainer.classList.add('hidden'); difficiliContainer.classList.add('hidden');
    destroyFocolaiMap(); destroyRandagiMap(); destroyDifficiliMap();
    mapSwipeContainer.classList.remove('hidden');
    initSwipeMap(); loadSwipeMap();
};
if (btnSwipeBack) btnSwipeBack.onclick = () => {
    mapSwipeContainer.classList.add('hidden'); homeView.classList.remove('hidden'); destroySwipeMap();
};
if (btnDifficili) btnDifficili.onclick = () => {
    homeView.classList.add('hidden'); mapFocolaiContainer.classList.add('hidden'); if (randagiContainer) randagiContainer.classList.add('hidden'); mapSwipeContainer.classList.add('hidden');
    destroyFocolaiMap(); destroyRandagiMap(); destroySwipeMap();
    difficiliContainer.classList.remove('hidden');
    initDifficiliMap(); loadDifficiliData();
};
if (btnDifficiliBack) btnDifficiliBack.onclick = () => {
    difficiliContainer.classList.add('hidden'); homeView.classList.remove('hidden'); destroyDifficiliMap();
};