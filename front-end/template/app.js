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

// Nuovi elementi per la gestione delle viste (Home vs Focolai)
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

// Piccola lista di immagini/gif pubbliche
const animalMediaPool = [
  'https://images.unsplash.com/photo-1543852786-1cf6624b9987?w=800&q=60&auto=format&fit=crop&ixlib=rb-4.0.3&s=0a2a1f9d0f9b3c8b6e6b8b8d2a1f8f1d',
  'https://images.unsplash.com/photo-1518717758536-85ae29035b6d?w=800&q=60&auto=format&fit=crop&ixlib=rb-4.0.3&s=0b2d9b9f2a6f1a1b2c3d4e5f6a7b8c9d',
  'https://media.giphy.com/media/3o6Zt8MgUuvSbkZYWc/giphy.gif',
  'https://media.giphy.com/media/26BRuo6sLetdllPAQ/giphy.gif',
  'https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?w=800&q=60&auto=format&fit=crop&ixlib=rb-4.0.3&s=1a2b3c4d5e6f7g8h9i0j'
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

// ==========================================
// LOGICA MAPPA PRINCIPALE (RICERCA)
// ==========================================
function initMap(lat=34.0219, lng=-118.4814, zoom=10) {
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
}

// Inizializza mappa vuota al caricamento della pagina
initMap();
// Preload immagine casuale
animalImg.src = pickRandomMedia();

// Handler Form Ricerca
form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const indirizzo = indirizzoInput.value.trim();
  if (!indirizzo) {
    showFeedback('Inserisci un indirizzo valido.', true);
    return;
  }

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
    console.log('[NookPets] API response:', json);

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

    if (!coordUser || coordUser.length < 2 || !coordShelter || coordShelter.length < 2) {
      showFeedback('Coordinate non valide.', true);
      setButtonLoading(false);
      return;
    }

    nomeEl.textContent = dati.nome;
    indirizzoRifugioEl.textContent = dati.indirizzo;
    distanzaEl.textContent = `Distanza: ${dati.distanza_km} km`;
    animalImg.src = pickRandomMedia();

    if (coordUser && coordShelter) {
      const u = `${coordUser[0]},${coordUser[1]}`;
      const s = `${coordShelter[0]},${coordShelter[1]}`;
      directionsLink.href = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(u)}&destination=${encodeURIComponent(s)}&travelmode=driving`;
      directionsLink.classList.remove('hidden');
    } else {
      directionsLink.classList.add('hidden');
    }

    resultSection.classList.remove('hidden');
    showFeedback('Risultato trovato.');

    initMap(coordUser[0], coordUser[1], 12);
    resetMap();
    userMarker = L.marker([coordUser[0], coordUser[1]]).addTo(map).bindPopup('Tu').openPopup();
    shelterMarker = L.marker([coordShelter[0], coordShelter[1]]).addTo(map).bindPopup(dati.nome);
    const group = L.featureGroup([userMarker, shelterMarker]);
    map.fitBounds(group.getBounds().pad(0.4));

  } catch (err) {
    console.error('[NookPets] fetch error', err);
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
const GEOCODE_CACHE = {}; // Cache locale semplice per evitare chiamate ripetute

if (indirizzoInput) {
  indirizzoInput.setAttribute('autocomplete', 'off');
}

function createAutocomplete() {
  acContainer = document.createElement('div');
  acContainer.className = 'autocomplete-container';
  acContainer.style.position = 'absolute';
  acContainer.style.zIndex = 99999;
  acContainer.style.background = 'white';
  acContainer.style.border = '1px solid rgba(0,0,0,0.08)';
  acContainer.style.borderRadius = '8px';
  acContainer.style.boxShadow = '0 6px 18px rgba(2,6,23,0.08)';
  acContainer.style.maxHeight = '260px';
  acContainer.style.overflow = 'auto';
  acContainer.style.display = 'none';
  acContainer.style.padding = '6px 4px';
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
    el.style.padding = '8px 10px';
    el.style.cursor = 'pointer';
    el.style.borderRadius = '6px';
    el.style.margin = '2px 0';

    let displayText = typeof item === 'string' ? item : (item.display || item.name || '');
    let metaText = '';
    
    if (item && typeof item === 'object') {
        if (item.postcode) metaText = `CAP: ${item.postcode}`;
        else if (item.city && item.state) metaText = `${item.city}, ${item.state}`;
    }

    const title = document.createElement('div');
    title.textContent = displayText;
    title.style.fontWeight = '600';
    title.style.fontSize = '0.95rem';

    el.appendChild(title);
    if (metaText) {
      const sub = document.createElement('div');
      sub.textContent = metaText;
      sub.style.fontSize = '0.82rem';
      sub.style.color = '#6b7280';
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

  if (items.length) {
    acContainer.style.display = 'block';
    positionAutocomplete();
  } else {
    clearAutocomplete();
  }
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

  // Geocodifica on demand se mancano lat/lon
  let lat = item.lat != null ? Number(item.lat) : null;
  let lon = item.lon != null ? Number(item.lon) : null;

  if ((lat == null || lon == null) && typeof item === 'object') {
    try {
      showFeedback('Ricavo coordinate...', false, true);
      const res = await fetch('/api/geocode-street', {
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
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
// LOGICA FOCOLAI (Zone & Animali)
// ==========================================

// Configurazione Colori
const TYPE_PALETTE = {
  'cane': ['#ff6b6b', '#7f1d1d'],
  'gatto': ['#4dabf7', '#08306b'],
  'uccello': ['#ffd166', '#7a4f00'],
  'coniglio': ['#b39ddb', '#4a148c'],
  'sconosciuto': ['#9ca3af', '#374151']
};

const COLOR_NAME_MAP = {
  'WHITE': '#ffffff', 'BLACK': '#000000', 'GRAY': '#9ca3af', 'BROWN': '#8b5e3c',
  'BLUE': '#3b82f6', 'GREEN': '#10b981', 'RED': '#ef4444', 'YELLOW': '#f59e0b', 'ORANGE': '#f97316'
};

// Utilities Focolai
function getProp(p, candidates) {
  for (const k of candidates) {
    if (p && p[k] != null && String(p[k]).trim() !== '') return p[k];
  }
  return null;
}

function determinePalette(p) {
  const colorName = getProp(p, ['color_primary', 'primary_color']);
  if (colorName && COLOR_NAME_MAP[colorName.toUpperCase()]) {
    return [COLOR_NAME_MAP[colorName.toUpperCase()], '#333'];
  }
  const tipo = getAnimalTypeLabel(p).toLowerCase();
  return TYPE_PALETTE[tipo] || TYPE_PALETTE['sconosciuto'];
}

function getAnimalTypeLabel(p) {
  const raw = getProp(p, ['tipo', 'species', 'Animal Type', 'Animal_Type']);
  if (!raw) return 'Sconosciuto';
  const low = String(raw).toLowerCase();
  if (low.includes('cat') || low.includes('gatto')) return 'Gatto';
  if (low.includes('dog') || low.includes('cane')) return 'Cane';
  if (low.includes('bird')) return 'Uccello';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// 1. DEFINIZIONE LAYERS (Senza .addTo immediato)
zoneLayer = L.geoJSON(null, {
  style: () => ({ color: '#6366f1', weight: 2, opacity: 0.8, fillOpacity: 0.1 }),
  onEachFeature: (feature, layer) => {
    const nome = feature.properties.nome || 'Zona Monitorata';
    layer.bindPopup(`<b>${nome}</b>`);
  }
});

// Stato visibilità tipi
const visibleTypes = {};

// 2. FUNZIONE INIZIALIZZAZIONE MAPPA FOCOLAI
function initFocolaiMap() {
  if (mapFocolai) {
    // Importante: forza il ricalcolo delle dimensioni quando la mappa passa da hidden a visible
    setTimeout(() => { mapFocolai.invalidateSize(); }, 100);
    return;
  }

  // Crea mappa
  mapFocolai = L.map('map-focolai').setView([34.0219, -118.4814], 10);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap contributors'
  }).addTo(mapFocolai);

  // Aggiungi subito il layer zone (vuoto o popolato dopo)
  zoneLayer.addTo(mapFocolai);
}

// 3. CARICAMENTO DATI (Fetch Zone + Animali)
async function loadFocolai() {
  if (!mapFocolai) return;
  
  try {
    showFeedback('Caricamento dati focolai...', false, true);

    // Fetch Zone
    const respZone = await fetch('/api/geojson/zone_pericolose');
    if (respZone.ok) {
      const dataZone = await respZone.json();
      zoneLayer.clearLayers();
      zoneLayer.addData(dataZone);
    }

    // Fetch Animali
    const respAnimali = await fetch('/api/geojson/animali_malati');
    if (respAnimali.ok) {
      const dataAnimali = await respAnimali.json();
      
      // Pulisci vecchio layer animali se esiste
      if (animaliLayer) mapFocolai.removeLayer(animaliLayer);

      animaliLayer = L.geoJSON(dataAnimali, {
        pointToLayer: (feature, latlng) => {
          const palette = determinePalette(feature.properties);
          return L.circleMarker(latlng, {
            radius: 6, fillColor: palette[0], color: palette[1], weight: 1, fillOpacity: 0.9
          });
        },
        onEachFeature: (feature, layer) => {
          const p = feature.properties;
          const tipo = getAnimalTypeLabel(p);
          const note = getProp(p, ['note', 'notes']) || '';
          
          // Memorizza tipo per filtro
          layer._tipo = tipo.toLowerCase();

          const content = `<div style="font-weight:bold">${tipo}</div>
                           <div style="font-size:0.9em">${note}</div>`;
          layer.bindPopup(content);
        }
      }).addTo(mapFocolai);

      // Adatta zoom
      const group = L.featureGroup();
      if (zoneLayer.getLayers().length) group.addLayer(zoneLayer);
      if (animaliLayer.getLayers().length) group.addLayer(animaliLayer);
      if (group.getLayers().length) mapFocolai.fitBounds(group.getBounds().pad(0.2));

      // Crea Legenda
      buildLegend(dataAnimali);
    }
    
    showFeedback('');

  } catch (e) {
    console.error(e);
    showFeedback('Errore caricamento focolai.', true);
  }
}

// 4. LEGENDA E FILTRI
function updateAnimaliVisibility() {
  if (!animaliLayer) return;
  animaliLayer.eachLayer(layer => {
    const tipo = layer._tipo || 'sconosciuto';
    const isVisible = visibleTypes[tipo] !== false; // Default true
    
    if (isVisible) {
       if (layer._origStyle) layer.setStyle(layer._origStyle); // Ripristina
       else layer.setOpacity(1); 
       // Nota: Leaflet circleMarker non ha setOpacity semplice per fill, 
       // meglio reimpostare path style, ma per semplicità usiamo opacity o rimozione
       if (layer.getElement()) layer.getElement().style.display = '';
    } else {
       if (!layer._origStyle) layer._origStyle = { ...layer.options };
       if (layer.getElement()) layer.getElement().style.display = 'none';
    }
  });
}

function toggleType(tipoRaw) {
  const tipo = tipoRaw.toLowerCase();
  visibleTypes[tipo] = !visibleTypes[tipo];
  updateAnimaliVisibility();
  
  // Aggiorna UI Legenda (opacity)
  const rows = legendFocolaiEl.querySelectorAll('.legend-row');
  rows.forEach(r => {
    if (r.dataset.type === tipo) {
      r.style.opacity = visibleTypes[tipo] ? '1' : '0.4';
    }
  });
}

function buildLegend(geoJson) {
  if (!legendFocolaiEl) return;
  legendFocolaiEl.innerHTML = '';
  const typesFound = new Set();
  const sampleColors = {};

  // Analizza i tipi presenti
  geoJson.features.forEach(f => {
    const t = getAnimalTypeLabel(f.properties).toLowerCase();
    typesFound.add(t);
    if (!sampleColors[t]) sampleColors[t] = determinePalette(f.properties);
  });

  const wrapper = document.createElement('div');
  wrapper.className = 'legend-wrapper';

  typesFound.forEach(t => {
    visibleTypes[t] = true; // init visibile
    
    const row = document.createElement('div');
    row.className = 'legend-row';
    row.dataset.type = t;
    row.style.cursor = 'pointer';
    row.style.display = 'flex'; 
    row.style.alignItems = 'center'; 
    row.style.marginRight = '10px';

    const colorBox = document.createElement('span');
    colorBox.style.width = '16px'; 
    colorBox.style.height = '16px';
    colorBox.style.backgroundColor = sampleColors[t][0];
    colorBox.style.border = `2px solid ${sampleColors[t][1]}`;
    colorBox.style.borderRadius = '50%';
    colorBox.style.display = 'inline-block';
    colorBox.style.marginRight = '6px';

    const label = document.createElement('span');
    label.textContent = t.charAt(0).toUpperCase() + t.slice(1);

    row.appendChild(colorBox);
    row.appendChild(label);
    
    row.addEventListener('click', () => toggleType(t));
    wrapper.appendChild(row);
  });
  
  legendFocolaiEl.appendChild(wrapper);
  legendFocolaiEl.classList.remove('hidden');
}

// ==========================================
// GESTIONE CAMBIO VISTA (Home <-> Focolai)
// ==========================================

// Click su "Visualizza focolai"
if (btnFocolai) {
  btnFocolai.addEventListener('click', () => {
    // 1. Nascondi vista Home
    if (homeView) homeView.classList.add('hidden');
    
    // 2. Mostra vista Focolai
    if (mapFocolaiContainer) mapFocolaiContainer.classList.remove('hidden');
    
    // 3. Inizializza mappa e carica dati
    initFocolaiMap();
    loadFocolai();
  });
}

// Click su "Torna alla ricerca"
if (btnBack) {
  btnBack.addEventListener('click', () => {
    // 1. Nascondi focolai
    if (mapFocolaiContainer) mapFocolaiContainer.classList.add('hidden');
    
    // 2. Mostra home
    if (homeView) homeView.classList.remove('hidden');
  });
}