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

// Elementi Vista Swipe Map (Confronto)
const btnSwipe = document.getElementById('btn-swipe');
const mapSwipeContainer = document.getElementById('map-swipe-container');
const btnSwipeBack = document.getElementById('btn-swipe-back');

// Elementi Vista Randagi
const btnRandagi = document.getElementById('btn-randagi');
const randagiContainer = document.getElementById('randagi-container');
const btnRandagiBack = document.getElementById('btn-randagi-back');
const randagiFeedback = document.getElementById('randagi-feedback');

// Elementi Vista Animali Difficili
const btnDifficili = document.getElementById('btn-difficili');
const difficiliContainer = document.getElementById('difficili-container');
const btnDifficiliBack = document.getElementById('btn-difficili-back');
const legendDifficiliEl = document.getElementById('legend-difficili');

// ==========================================
// 2. VARIABILI GLOBALI
// ==========================================
let map = null;
let userMarker = null;
let shelterMarker = null;
let routingControl = null;

// Variabili Focolai
let mapFocolai = null;
let zoneLayer = null;
let animaliLayer = null;
let centriFocolaiLayer = null;

// Variabili Swipe Map
let mapSwipe = null;
let swipeLeftGroup = null;
let swipeRightGroup = null;
// *** NUOVO: Variabili per analisi Radar (Dati Grezzi) ***
let rawDomesticData = null;
let rawWildData = null;

// Variabili Randagi
let mapRandagi = null;
let randagiLayer = null;
let pieChart = null;
let animatedLayerGroup = null;
let randagiGlobalTimer = null;

// Variabili Animali Difficili
let mapDifficili = null;
let difficiliLayer = null;

// Pool immagini
const animalMediaPool = [
  '../utils/doggie.gif',
  '../utils/funny_cat.gif',
  '../utils/parrot.gif',
  '../utils/rabbit.gif',
  '../utils/all_normal.gif'
];

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

// ==========================================
// 4. LOGICA MAPPA PRINCIPALE (RICERCA)
// ==========================================
function initMap(lat = 34.0219, lng = -118.4814, zoom = 10) {
  if (!map) {
    map = L.map('map').setView([lat, lng], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
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
            if (data && data.display_name) {
                indirizzoInput.value = data.display_name;
            } else {
                indirizzoInput.value = `${clickedLat.toFixed(5)}, ${clickedLng.toFixed(5)}`;
            }
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
animalImg.src = pickRandomMedia();

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
// 5. LOGICA AUTOCOMPLETE
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
// 6. LOGICA FOCOLAI
// ==========================================
const TYPE_PALETTE = {
  'dog': ['#ef4444', '#991b1b'],
  'cat': ['#3b82f6', '#1e3a8a'],
  'bird': ['#eab308', '#854d0e'],
  'rabbit': ['#a855f7', '#581c87'],
  'other': ['#6b7280', '#1f2937']
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

// Inizializzazione Layers Focolai
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
    // 1. Zone Pericolose
    const resZone = await fetch('/api/geojson/zone_rosse');
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

        const bounds = zoneLayer.getBounds();
        if(animaliLayer.getLayers().length > 0) bounds.extend(animaliLayer.getBounds());
        if (bounds.isValid()) mapFocolai.fitBounds(bounds.pad(0.1));

        buildLegend();
    }

    // 3. Centri Focolai
    const resCentri = await fetch('/api/geojson/zone_rosse');
    if (resCentri.ok) {
        const dataCentri = await resCentri.json();
        if (centriFocolaiLayer) mapFocolai.removeLayer(centriFocolaiLayer);
        let unknownCounter = 1;

        centriFocolaiLayer = L.geoJSON(dataCentri, {
            pointToLayer: (feature, latlng) => {
                return L.circleMarker(latlng, {
                    radius: 15, fillColor: '#ff0000', color: '#000',
                    weight: 2, opacity: 1, fillOpacity: 0.5
                });
            },
            onEachFeature: (feature, layer) => {
                const props = feature.properties;
                const lat = feature.geometry.coordinates[1].toFixed(5);
                const lng = feature.geometry.coordinates[0].toFixed(5);
                const rawId = getVal(props, ['CLUSTER_ID', 'cluster_id', 'id', 'ID']);
                let displayTitle = (rawId !== null && rawId !== undefined && rawId !== "") ? `⚠️ FOCOLAIO ${rawId}` : `ZONA ROSSA #${unknownCounter++}`;

                const popupContent = `
                    <div style="text-align:center; min-width:150px;">
                        <h3 style="margin:0; color:#dc2626; font-family:'Fredoka', sans-serif;">${displayTitle}</h3>
                        <p style="font-size:0.9rem; margin:5px 0;">Alta concentrazione rilevata.</p>
                        <div style="background:#f3f4f6; padding:5px; border-radius:4px; font-family:monospace; font-weight:bold;">
                            LAT: ${lat}<br>LON: ${lng}
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
    // Toggle anche per i randagi
    if (animatedLayerGroup) {
        animatedLayerGroup.eachLayer(layer => {
            try {
                if (layer._tipoKey === key) {
                    const visible = visibleTypes[key] !== false;
                    if (layer.setStyle) layer.setStyle({ opacity: visible ? 0.9 : 0, fillOpacity: visible ? 0.9 : 0 });
                    else if (layer.getElement) layer.getElement().style.display = visible ? '' : 'none';
                    if (!visible) layer.closePopup && layer.closePopup();
                }
            }
            catch (e) {}
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
// 7. SWIPE MAP (CONFLITTO & RADAR)
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

// *** MODIFICA: Funzione Helper per Popup con chiavi corrette (troncate) ***
function createSwipePopupContent(p) {
    const nome = p['Animal Nam'] || 'Sconosciuto';
    const intake = p['Intake Typ'] || 'N/A';
    const col1 = p['Primary Co'] || 'N/A';
    const col2 = p['Secondary'] || 'N/A';
    return `
      <div style="font-family: 'Fredoka', sans-serif; font-size: 0.9rem; min-width: 180px;">
          <h4 style="margin: 0 0 8px 0; color: #d35400; border-bottom: 1px solid #eee; padding-bottom: 4px;">${nome}</h4>
          <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px; font-size: 0.85rem;">
              <strong style="color: #555;">Intake:</strong> <span>${intake}</span>
              <strong style="color: #555;">Colore 1:</strong> <span>${col1}</span>
              <strong style="color: #555;">Colore 2:</strong> <span>${col2}</span>
          </div>
      </div>
    `;
}

// *** MODIFICA: Caricamento dati con salvataggio per Radar ***
async function loadSwipeMap() {
  if (!mapSwipe) return;
  showFeedback('Carico Swipe Map...', false, true);
  try {
    // 1. Carica Animali Domestici (SX)
    const resLeft = await fetch('/api/geojson/Animali Domestici.geojson');
    if (resLeft.ok) {
      const data = await resLeft.json();
      rawDomesticData = data.features; // Salva dati grezzi
      swipeLeftGroup.clearLayers();
      L.geoJSON(data, {
        pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius:6, fillColor:'#ff7b7b', color:'#fff', weight:1, fillOpacity:0.9 }),
        onEachFeature: (feature, layer) => {
          const p = feature.properties || {};
          layer.bindPopup(createSwipePopupContent(p));
          // Previene che il click sul marker attivi anche il click sulla mappa (Radar)
          layer.on('click', L.DomEvent.stopPropagation);
        }
      }).addTo(swipeLeftGroup);
    }

    // 2. Carica Fauna Selvatica (DX)
    const resRight = await fetch('/api/geojson/Fauna Selvatica.geojson');
    const resHeat = await fetch('/api/geojson/Fauna Selvatica -Heatmap.geojson');

    swipeRightGroup.clearLayers();
    if (resRight.ok) {
      const data = await resRight.json();
      rawWildData = data.features; // Salva dati grezzi
      L.geoJSON(data, {
        pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius:6, fillColor:'#7bdcff', color:'#fff', weight:1, fillOpacity:0.9 }),
        onEachFeature: (feature, layer) => {
          const p = feature.properties || {};
          layer.bindPopup(createSwipePopupContent(p));
          // Previene che il click sul marker attivi anche il click sulla mappa (Radar)
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

    // *** NUOVO: Listener per Radar di Conflitto ***
    mapSwipe.on('click', onSwipeMapClick);

    showFeedback('Swipe Map caricata.');
  } catch (e) {
    console.error(e);
    showFeedback('Errore caricamento Swipe Map.', true);
  }
}

function destroySwipeMap() {
  try {
    if (mapSwipe) {
      // Rimuovi listener
      mapSwipe.off('click', onSwipeMapClick);
      if (swipeLeftGroup) try { swipeLeftGroup.clearLayers(); } catch(e){}
      if (swipeRightGroup) try { swipeRightGroup.clearLayers(); } catch(e){}
      mapSwipe.remove();
      mapSwipe = null; swipeLeftGroup = null; swipeRightGroup = null;
      // Resetta dati grezzi
      rawDomesticData = null;
      rawWildData = null;
    }
  } catch (e) { console.warn('destroySwipeMap error', e); }
}

// --- FUNZIONI MATEMATICHE PER RADAR DI CONFLITTO ---

// Calcola distanza in km tra due coordinate
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Raggio Terra in km
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

// Gestore click per Analisi Radar
function onSwipeMapClick(e) {
    if (!rawDomesticData || !rawWildData) return;

    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    const raggioKm = 1.5;

    // Conta domestici
    let countDom = 0;
    rawDomesticData.forEach(f => {
        const c = extractCoords(f.geometry);
        if (c) {
            const d = getDistanceFromLatLonInKm(lat, lng, c[0], c[1]);
            if (d <= raggioKm) countDom++;
        }
    });

    // Conta selvatici
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
        verdetto = "Prevalenza: 🏠 ANIMALI DOMESTICI";
        coloreVerdetto = "#d35400"; // Arancio
    } else if (countWild > countDom * 1.5) {
        verdetto = "Prevalenza: 🌲 FAUNA SELVATICA";
        coloreVerdetto = "#2980b9"; // Blu
    } else {
        verdetto = "⚠️ ZONA DI CONFLITTO (Misto)";
        coloreVerdetto = "#8e44ad"; // Viola
    }

    L.popup()
        .setLatLng(e.latlng)
        .setContent(`
            <div style="font-family:'Fredoka',sans-serif; text-align:center; min-width:200px;">
                <h4 style="margin:0 0 10px 0; border-bottom:1px solid #eee; padding-bottom:5px;">Analisi di Zona (1.5 km)</h4>
                <div style="display:flex; justify-content:space-around; margin-bottom:10px;">
                    <div style="color:#d35400;">
                        <div style="font-size:1.2rem; font-weight:bold;">${countDom}</div>
                        <div style="font-size:0.8rem;">Domestici</div>
                    </div>
                    <div style="color:#2980b9;">
                        <div style="font-size:1.2rem; font-weight:bold;">${countWild}</div>
                        <div style="font-size:0.8rem;">Selvatici</div>
                    </div>
                </div>
                <div style="background:${coloreVerdetto}; color:white; padding:5px; border-radius:4px; font-weight:bold; font-size:0.9rem;">
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
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapRandagi);
}

function destroyRandagiMap() {
    try {
        if (randagiGlobalTimer) { clearInterval(randagiGlobalTimer); randagiGlobalTimer = null; }
        const controls = document.getElementById('randagi-anim-controls');
        if (controls && controls.parentNode) controls.parentNode.removeChild(controls);
        const label = document.getElementById('randagi-anim-label');
        if (label && label.parentNode) label.parentNode.removeChild(label);
        const table = document.getElementById('randagi-table-container');
        if (table && table.parentNode) table.parentNode.removeChild(table);
        const leg = document.getElementById('randagi-legend');
        if (leg) leg.remove();

        if (animatedLayerGroup) { try { animatedLayerGroup.clearLayers(); } catch (e) {} animatedLayerGroup = null; }
        if (mapRandagi) { mapRandagi.remove(); mapRandagi = null; }
        if (randagiContainer) { randagiContainer.classList.add('hidden'); }
    } catch (e) { console.warn('destroyRandagiMap error', e); }
}

async function loadRandagiData() {
    showRandagiFeedback('Caricamento dati randagi...', false);
    try {
        const res = await fetch(`/api/geojson/animali_randagi?_=${Date.now()}`);
        if (!res.ok) { throw new Error('Impossibile caricare animali randagi'); }
        const data = await res.json();
        if (data && data.type === 'FeatureCollection' && Array.isArray(data.features) && data.features.length === 0) {
            showRandagiFeedback('Nessun dato per animali randagi trovato (file mancante o vuoto).', true);
            return;
        }

        buildRandagiTable(data.features || []);
        const countsSesso = { 'Male': 0, 'Female': 0, 'Unknown': 0 };
        const countsTipo = {};
        const monthBuckets = {};
        (data.features || []).forEach(f => {
            const p = f.properties || {};
            let s = (p.sex || p.Sex || p.SESSO || p.gender || p.Gender || '').toString().trim().toLowerCase();
            if (!s || s === 'unknown' || s === 'na') s = 'Unknown';
            else if (s.startsWith('m')) s = 'Male';
            else if (s.startsWith('f')) s = 'Female';
            else s = 'Unknown';
            countsSesso[s] = (countsSesso[s] || 0) + 1;

            let t = (p.species || p.type || p.animal_type || '').toString().trim().toLowerCase();
            if (!t) t = (p['Animal Typ'] || '').toString().trim().toLowerCase();
            if (!t) t = 'other';
            if (t.includes('dog') || t.includes('cane')) t = 'dog';
            else if (t.includes('cat') || t.includes('gatto')) t = 'cat';
            else if (t.includes('bird') || t.includes('uccello')) t = 'bird';
            else if (t.includes('rabbit') || t.includes('coniglio')) t = 'rabbit';
            else t = 'other';
            countsTipo[t] = (countsTipo[t] || 0) + 1;

            let rawDate = getVal(p, ['Intake Dat', 'intake_date', 'date_found', 'found_date', 'Date', 'datetime']) || '';
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
            if (!monthBuckets[monthKey]) monthBuckets[monthKey] = [];
            monthBuckets[monthKey].push(f);
        });

        buildRandagiCharts(countsSesso);
        initRandagiMap();
        if (randagiLayer && mapRandagi) { mapRandagi.removeLayer(randagiLayer); randagiLayer = null; }
        buildRandagiLegend(countsTipo);
        window.randagiBuckets = monthBuckets;
        animateRandagiByMonth(monthBuckets);
        showRandagiFeedback('');
    } catch (e) {
        console.error(e);
        showRandagiFeedback('Errore nel caricamento dei dati randagi.', true);
    }
}

function buildRandagiCharts(countsSesso) {
     const pieCtx = document.getElementById('randagi-pie').getContext('2d');
     const rawLabels = Object.keys(countsSesso);
     const labelMap = { 'Male': 'Maschio', 'Female': 'Femmina', 'Unknown': 'Sconosciuto' };
     const pieLabels = rawLabels.map(l => labelMap[l] || l);
     const pieData = rawLabels.map(l => countsSesso[l]);
     const pieColors = rawLabels.map(l => l === 'Male' ? '#3b82f6' : (l === 'Female' ? '#ef4444' : '#9ca3af'));
     if (pieChart) pieChart.destroy();
     pieChart = new Chart(pieCtx, {
         type: 'pie',
         data: { labels: pieLabels, datasets: [{ data: pieData, backgroundColor: pieColors }] },
         options: {
             plugins: { legend: { position: 'bottom' } },
             responsive: true, maintainAspectRatio: false
         }
     });
}

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

function buildRandagiTable(features) {
    if (!randagiContainer) return;
    let existing = document.getElementById('randagi-table-container');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.id = 'randagi-table-container';
    Object.assign(container.style, { marginTop: '12px', background: '#fff', padding: '8px', borderRadius: '8px', maxHeight: '260px', overflow: 'auto', boxShadow: '0 6px 18px rgba(2,6,23,0.04)' });

    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';

    table.innerHTML = `<thead>
        <tr>
            <th style="text-align:left; padding:6px; border-bottom:1px solid #eee">Nome</th>
            <th style="text-align:left; padding:6px; border-bottom:1px solid #eee">Specie</th>
            <th style="text-align:left; padding:6px; border-bottom:1px solid #eee">Data</th>
            <th style="text-align:left; padding:6px; border-bottom:1px solid #eee">Rifugio</th>
            <th style="text-align:left; padding:6px; border-bottom:1px solid #eee">Coordinate</th>
        </tr>
    </thead>`;

    const tbody = document.createElement('tbody');
    const seen = new Set();

    (features || []).forEach(f => {
        try {
            const p = f.properties || {};
            const geom = f.geometry || {};
            let id = getVal(p, ['id','ID','Id','objectid']);
            let name = getVal(p, ['Animal Nam', 'Animal Name', 'name']) || '';
            let date = getVal(p, ['Intake Dat','intake_date','date_found']) || '';
            const coords = extractCoords(geom) || [];
            const coordStr = coords.length >= 2 ? `${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}` : '';
            const key = id ? String(id) : `${String(name).trim().toLowerCase()}|${String(date).trim()}|${coordStr}`;

            if (seen.has(key)) return;
            seen.add(key);

            let specie = getVal(p, ['species','type','animal_type','Animal Type', 'Animal Typ']) || '';
            specie = translateSpeciesKeyToItalian(specie.toLowerCase());

            let shelter = getVal(p, ['Shelter_Na', 'Shelter_Name', 'Shelter Name', 'shelter_name']) || 'N/A';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding:6px; border-bottom:1px solid #f3f3f3">${name || 'Senza nome'}</td>
                <td style="padding:6px; border-bottom:1px solid #f3f3f3">${specie}</td>
                <td style="padding:6px; border-bottom:1px solid #f3f3f3">${date || '-'}</td>
                <td style="padding:6px; border-bottom:1px solid #f3f3f3; color:#0066ff; font-weight:500;">${shelter}</td>
                <td style="padding:6px; border-bottom:1px solid #f3f3f3">${coordStr || '-'}</td>
            `;
            tbody.appendChild(tr);
        } catch (e) { }
    });
    table.appendChild(tbody);
    container.appendChild(table);

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset caricamento';
    Object.assign(resetBtn.style, { marginTop: '8px', padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', border: 'none', background: '#ef4444', color: '#fff' });
    resetBtn.onclick = () => { resetRandagiLoading(); };
    container.appendChild(resetBtn);
    randagiContainer.appendChild(container);
}

function resetRandagiLoading() {
    try {
        const play = document.getElementById('randagi-play');
        const pause = document.getElementById('randagi-pause');
        if (play) play.disabled = false;
        if (pause) pause.disabled = true;

        if (animatedLayerGroup) {
            try { animatedLayerGroup.clearLayers(); } catch (e) {}
            if (mapRandagi && mapRandagi.hasLayer(animatedLayerGroup)) mapRandagi.removeLayer(animatedLayerGroup);
            animatedLayerGroup = null;
        }

        const controls = document.getElementById('randagi-anim-controls');
        if (controls && controls.parentNode) controls.parentNode.removeChild(controls);
        const label = document.getElementById('randagi-anim-label');
        if (label && label.parentNode) label.parentNode.removeChild(label);

        if (window.randagiBuckets) {
            showRandagiFeedback('Animazione resettata. Premi Play per iniziare.');
            animateRandagiByMonth(window.randagiBuckets, { speedPct: 50, autoStart: false });
        } else {
            showRandagiFeedback('Caricamento resettato.');
        }
    } catch (e) { console.warn('resetRandagiLoading error', e); }
}

function animateRandagiByMonth(monthBuckets, opts = {}) {
    if (!mapRandagi) return;
    if (animatedLayerGroup) {
        try { animatedLayerGroup.eachLayer(l => { if (l.remove) l.remove(); }); } catch(e){}
        if (mapRandagi.hasLayer(animatedLayerGroup)) mapRandagi.removeLayer(animatedLayerGroup);
    }
    animatedLayerGroup = L.layerGroup().addTo(mapRandagi);
    const rawKeys = Object.keys(monthBuckets || {});
    const knownKeys = rawKeys.filter(k => k !== 'Unknown' && /^\d{4}-\d{2}$/.test(k)).sort();
    const otherKeys = rawKeys.filter(k => !/^\d{4}-\d{2}$/.test(k) && k !== 'Unknown');
    const months = knownKeys.concat(otherKeys);
    if (rawKeys.includes('Unknown')) months.push('Unknown');
    let labelEl = document.getElementById('randagi-anim-label');
    if (!labelEl) {
        labelEl = document.createElement('div');
        labelEl.id = 'randagi-anim-label';
        Object.assign(labelEl.style, { position: 'absolute', top: '10px', right: '10px', padding: '6px 10px', background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: '6px', zIndex: 1000, fontWeight: '600' });
        mapRandagi.getContainer().appendChild(labelEl);
    }

    let controlsEl = document.getElementById('randagi-anim-controls');
    if (!controlsEl) {
        controlsEl = document.createElement('div');
        controlsEl.id = 'randagi-anim-controls';
        Object.assign(controlsEl.style, { position: 'absolute', top: '50px', right: '10px', padding: '8px', background: 'rgba(255,255,255,0.95)', borderRadius: '10px', zIndex: 1000, display: 'flex', gap: '8px', alignItems: 'center', boxShadow: '0 6px 20px rgba(15,23,42,0.12)', flexDirection: 'column', minWidth: '180px' });
        const rowTop = document.createElement('div');
        Object.assign(rowTop.style, { display: 'flex', gap: '8px', width: '100%', justifyContent: 'space-between' });
        const btnPlay = document.createElement('button');
        btnPlay.id = 'randagi-play'; btnPlay.innerHTML = '▶️ <span style="font-weight:600;">Play</span>';
        const btnPause = document.createElement('button'); btnPause.id = 'randagi-pause'; btnPause.innerHTML = '⏸️ <span style="font-weight:600;">Pausa</span>';
        [btnPlay, btnPause].forEach(b => {
            b.style.padding = '8px 10px'; b.style.border = 'none'; b.style.background = 'linear-gradient(180deg,#ffffff,#f3f4f6)'; b.style.borderRadius = '8px'; b.style.cursor = 'pointer'; b.style.boxShadow = '0 4px 10px rgba(2,6,23,0.08)'; b.style.fontSize = '0.95rem';
        });
        btnPlay.style.color = '#065f46'; btnPause.style.color = '#7f1d1d'; btnPause.disabled = true;
        rowTop.appendChild(btnPlay); rowTop.appendChild(btnPause);

        const sliderRow = document.createElement('div');
        Object.assign(sliderRow.style, { display: 'flex', alignItems: 'center', gap: '8px', width: '100%' });
        const speedLabel = document.createElement('div'); speedLabel.id = 'randagi-speed-label';
        speedLabel.style.fontSize = '0.85rem'; speedLabel.style.minWidth = '90px';
        const speed = document.createElement('input'); speed.type = 'range'; speed.min = '1'; speed.max = '100';
        speed.step = '1'; speed.value = String(opts.speedPct || 50);
        speed.style.flex = '1';
        sliderRow.appendChild(speedLabel); sliderRow.appendChild(speed);
        const resetBtnSmall = document.createElement('button'); resetBtnSmall.textContent = 'Reset';
        Object.assign(resetBtnSmall.style, { padding: '6px 8px', borderRadius: '8px', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', width: '100%' });
        controlsEl.appendChild(rowTop); controlsEl.appendChild(sliderRow);
        controlsEl.appendChild(resetBtnSmall);
        mapRandagi.getContainer().appendChild(controlsEl);

        const minMs = 80; const maxMs = 2400;
        function pctToMs(pct) { return Math.round(maxMs - (Math.max(0, Math.min(100, Number(pct))) / 100) * (maxMs - minMs)); }
        function updateSpeedLabel() { speedLabel.textContent = `Velocità: ${speed.value}%`; }
        updateSpeedLabel();

        let idx = 0; let isRunning = false;
        let intervalMsLocal = pctToMs(Number(speed.value));

        function stepOnce() {
            if (idx >= months.length) { stopTimer(); labelEl.textContent = 'Fine (Reset per rivedere)'; return; }
            const monthKey = months[idx++];
            labelEl.textContent = `Mese: ${formatMonthLabel(monthKey)}`;
            const feats = monthBuckets[monthKey] || [];
            feats.forEach(f => {
                try {
                    const geom = f.geometry; if (!geom) return;
                    const latlon = extractCoords(geom); if (!latlon) return;
                    const info = getAnimalInfo(f.properties || {});
                    const marker = L.circleMarker(latlon, {
                        radius: 8, fillColor: (info.palette ? info.palette[0] : '#6b7280'),
                        color: '#222', weight: 1.25, opacity: 1, fillOpacity: 1
                    });
                    marker._tipoKey = info.key || 'other';
                    const p = f.properties || {};
                    const nome = getVal(p, ['Animal Nam', 'name']) || 'Senza nome';
                    marker.bindPopup(`<b>${translateSpeciesKeyToItalian(info.key)}</b><br>Nome: ${nome}`);
                    marker.addTo(animatedLayerGroup);
                } catch (e) { }
            });
        }
        function startTimer() {
            if (isRunning) return;
            isRunning = true;
            btnPlay.disabled = true; btnPause.disabled = false;
            if (idx >= months.length) { idx = 0; animatedLayerGroup.clearLayers(); }
            stepOnce(); randagiGlobalTimer = setInterval(() => stepOnce(), intervalMsLocal);
        }
        function stopTimer() {
            isRunning = false;
            if (randagiGlobalTimer) { clearInterval(randagiGlobalTimer); randagiGlobalTimer = null; }
            btnPlay.disabled = false;
            btnPause.disabled = true;
        }
        btnPlay.onclick = () => startTimer();
        btnPause.onclick = () => stopTimer();
        speed.oninput = (e) => { updateSpeedLabel(); intervalMsLocal = pctToMs(Number(e.target.value)); if (isRunning) { stopTimer(); startTimer(); } };
        resetBtnSmall.onclick = () => { resetRandagiLoading(); };
        if (opts.autoStart !== false) startTimer();
        else labelEl.textContent = 'Pronto - Premi Play';
    }
    function formatMonthLabel(k) {
        if (k === 'Unknown') return 'Sconosciuto';
        const [y, m] = k.split('-');
        return new Date(Number(y), Number(m) - 1, 1).toLocaleString('it-IT', { month: 'short', year: 'numeric' });
    }
}

// ==========================================
// 9. SEZIONE ANIMALI DIFFICILI (CORRETTO & ROBUSTO)
// ==========================================

function getIntakeValue(props) {
    if (!props) return 0;
    const val = props['intake_dur_mean'] ||
                props['intake_duration_mean'] ||
                props['intake_dur'] ||
                props['intake_mea'] ||
                props['intake_d_1'] ||
                props['Mean'] ||
                0;
    return Number(val);
}

function getDifficiliColor(d) {
    return d > 90 ? '#800026' :
           d > 60 ? '#BD0026' :
           d > 45 ? '#E31A1C' :
           d > 30 ? '#FC4E2A' :
           d > 15 ? '#FD8D3C' :
           d > 0  ? '#FEB24C' :
                    '#FFEDA0';
}

function styleDifficili(feature) {
    const val = getIntakeValue(feature.properties);
    return {
        fillColor: getDifficiliColor(val),
        weight: 1,
        opacity: 1,
        color: 'white',
        dashArray: '3',
        fillOpacity: 0.7
    };
}

function highlightDifficili(e) {
    const layer = e.target;
    layer.setStyle({ weight: 3, color: '#666', dashArray: '', fillOpacity: 0.9 });
    layer.bringToFront();
}

function resetHighlightDifficili(e) {
    difficiliLayer.resetStyle(e.target);
}

function onEachFeatureDifficili(feature, layer) {
    layer.on({
        mouseover: highlightDifficili,
        mouseout: resetHighlightDifficili,
        click: (e) => layer.openPopup()
    });
    const rawVal = getIntakeValue(feature.properties);
    const giorni = Math.round(rawVal);
    const nome = feature.properties.city || feature.properties.Name || feature.properties.name || feature.properties.NAME || "Zona";

    const popupContent = `
        <div style="font-family:'Fredoka', sans-serif; text-align:center;">
            <h4 style="margin:0 0 5px 0; color:#c2410c;">${nome}</h4>
            <div style="font-size:0.9rem;">Permanenza Media:</div>
            <div style="font-size:1.5rem; font-weight:bold; color:#BD0026;">${giorni} giorni</div>
            <div style="font-size:0.8rem; color:#666; margin-top:5px;">Tempo prima dell'adozione</div>
        </div>
    `;
    layer.bindPopup(popupContent);
}

function initDifficiliMap() {
    if (mapDifficili) { setTimeout(() => mapDifficili.invalidateSize(), 100); return; }
    mapDifficili = L.map('map-difficili').setView([34.0522, -118.2437], 10);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap, © CartoDB',
        maxZoom: 19
    }).addTo(mapDifficili);
}

async function loadDifficiliData() {
    if (!mapDifficili) return;
    legendDifficiliEl.innerHTML = '<p style="font-size:0.9rem; color:#666;">Caricamento dati...</p>';
    try {
        const res = await fetch('/api/geojson/animali_difficili');
        if (!res.ok) throw new Error(`Errore Server: ${res.status}`);

        const data = await res.json();
        if (difficiliLayer) mapDifficili.removeLayer(difficiliLayer);
        difficiliLayer = L.geoJson(data, {
            style: styleDifficili,
            onEachFeature: onEachFeatureDifficili
        }).addTo(mapDifficili);
        if (data.features && data.features.length > 0) {
            mapDifficili.fitBounds(difficiliLayer.getBounds());
        } else {
            legendDifficiliEl.innerHTML = '<p style="color:orange;">Nessun dato trovato nel file.</p>';
        }
        buildDifficiliLegend();
    } catch (e) {
        console.error("ERRORE CARICAMENTO:", e);
        legendDifficiliEl.innerHTML = '<p style="color:red;">Errore caricamento dati.<br>Controlla console (F12).</p>';
    }
}

function buildDifficiliLegend() {
    legendDifficiliEl.innerHTML = '<h4 style="margin:0 0 10px 0; font-size:0.9rem; text-transform:uppercase; color:#555;">Giorni di Attesa prima dell\'adozione</h4>';
    const grades = [0, 15, 30, 45, 60, 90];
    grades.forEach((grade, i) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.marginBottom = '5px';
        const colorBox = document.createElement('span');
        colorBox.style.background = getDifficiliColor(grade + 1);
        colorBox.style.width = '18px';
        colorBox.style.height = '18px';
        colorBox.style.marginRight = '8px';
        colorBox.style.border = '1px solid #ccc';
        const text = document.createElement('span');
        text.style.fontSize = '0.9rem';
        text.innerHTML = grade + (grades[i + 1] ? '–' + grades[i + 1] : '+');
        row.appendChild(colorBox);
        row.appendChild(text);
        legendDifficiliEl.appendChild(row);
    });
}

function destroyDifficiliMap() {
    try {
        if (mapDifficili) {
            if (difficiliLayer) mapDifficili.removeLayer(difficiliLayer);
            mapDifficili.remove();
            mapDifficili = null;
            difficiliLayer = null;
        }
    } catch (e) { console.warn('destroyDifficiliMap error', e); }
}

// ==========================================
// 10. EVENT LISTENERS PULSANTI NAVIGAZIONE
// ==========================================

// Pulsante Focolai
if (btnFocolai) btnFocolai.onclick = () => {
    homeView.classList.add('hidden');
    if (randagiContainer) randagiContainer.classList.add('hidden');
    mapSwipeContainer.classList.add('hidden');
    difficiliContainer.classList.add('hidden');

    destroySwipeMap();
    destroyRandagiMap();
    destroyDifficiliMap();

    mapFocolaiContainer.classList.remove('hidden');
    initFocolaiMap();
    loadFocolai();
};
if (btnBack) btnBack.onclick = () => {
    mapFocolaiContainer.classList.add('hidden');
    homeView.classList.remove('hidden');
    destroyFocolaiMap();
};
// Pulsante Randagi
if (btnRandagi) btnRandagi.onclick = () => {
    homeView.classList.add('hidden');
    mapFocolaiContainer.classList.add('hidden');
    mapSwipeContainer.classList.add('hidden');
    difficiliContainer.classList.add('hidden');

    destroySwipeMap();
    destroyFocolaiMap();
    destroyDifficiliMap();

    randagiContainer.classList.remove('hidden');
    loadRandagiData();
};
if (btnRandagiBack) btnRandagiBack.onclick = () => {
    randagiContainer.classList.add('hidden');
    homeView.classList.remove('hidden');
    destroyRandagiMap();
};
// Pulsante Swipe Map
if (btnSwipe) btnSwipe.onclick = () => {
    homeView.classList.add('hidden');
    mapFocolaiContainer.classList.add('hidden');
    if (randagiContainer) randagiContainer.classList.add('hidden');
    difficiliContainer.classList.add('hidden');

    destroyFocolaiMap();
    destroyRandagiMap();
    destroyDifficiliMap();

    mapSwipeContainer.classList.remove('hidden');
    initSwipeMap();
    loadSwipeMap();
};
if (btnSwipeBack) btnSwipeBack.onclick = () => {
    mapSwipeContainer.classList.add('hidden');
    homeView.classList.remove('hidden');
    destroySwipeMap();
};
// Pulsante Animali Difficili
if (btnDifficili) btnDifficili.onclick = () => {
    homeView.classList.add('hidden');
    mapFocolaiContainer.classList.add('hidden');
    if (randagiContainer) randagiContainer.classList.add('hidden');
    mapSwipeContainer.classList.add('hidden');

    destroyFocolaiMap();
    destroyRandagiMap();
    destroySwipeMap();

    difficiliContainer.classList.remove('hidden');
    initDifficiliMap();
    loadDifficiliData();
};
if (btnDifficiliBack) btnDifficiliBack.onclick = () => {
    difficiliContainer.classList.add('hidden');
    homeView.classList.remove('hidden');
    destroyDifficiliMap();
};