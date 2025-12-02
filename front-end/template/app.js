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

let map = null;
let userMarker = null;
let shelterMarker = null;

// Piccola lista di immagini/gif pubbliche (Unsplash + gif) per rendere l'interfaccia più vivace.
const animalMediaPool = [
  'https://images.unsplash.com/photo-1543852786-1cf6624b9987?w=800&q=60&auto=format&fit=crop&ixlib=rb-4.0.3&s=0a2a1f9d0f9b3c8b6e6b8b8d2a1f8f1d',
  'https://images.unsplash.com/photo-1518717758536-85ae29035b6d?w=800&q=60&auto=format&fit=crop&ixlib=rb-4.0.3&s=0b2d9b9f2a6f1a1b2c3d4e5f6a7b8c9d',
  'https://media.giphy.com/media/3o6Zt8MgUuvSbkZYWc/giphy.gif',
  'https://media.giphy.com/media/26BRuo6sLetdllPAQ/giphy.gif',
  'https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?w=800&q=60&auto=format&fit=crop&ixlib=rb-4.0.3&s=1a2b3c4d5e6f7g8h9i0j'
];

function pickRandomMedia() {
  return animalMediaPool[Math.floor(Math.random() * animalMediaPool.length)];
}

function resetMap() {
  if (!map) return;
  if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
  if (shelterMarker) { map.removeLayer(shelterMarker); shelterMarker = null; }
}

function initMap(lat=34.0219, lng=-118.4814, zoom=10) {
  if (!map) {
    map = L.map('map').setView([lat, lng], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
  } else {
    map.setView([lat, lng], zoom);
  }
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

    if (!resp.ok) {
      showFeedback(json.messaggio || 'Errore del server.', true);
      setButtonLoading(false);
      return;
    }

    if (!json.successo) {
      showFeedback(json.messaggio || 'Indirizzo non trovato.', true);
      setButtonLoading(false);
      return;
    }

    const dati = json.dati_rifugio;
    // Coercizione sicura in numeri per evitare problemi se il server restituisce stringhe
    const coordUserRaw = json.coordinate_utente || [];
    const coordShelterRaw = dati.posizione_rifugio || [];
    const coordUser = Array.isArray(coordUserRaw) ? coordUserRaw.map(Number) : [Number(coordUserRaw[0]), Number(coordUserRaw[1])];
    const coordShelter = Array.isArray(coordShelterRaw) ? coordShelterRaw.map(Number) : [Number(coordShelterRaw[0]), Number(coordShelterRaw[1])];

    // Validazione semplice delle coordinate
    if (!coordUser || coordUser.length < 2 || Number.isNaN(coordUser[0]) || Number.isNaN(coordUser[1])) {
      showFeedback('Lat/Long utente non valide fornite dal server.', true);
      setButtonLoading(false);
      return;
    }
    if (!coordShelter || coordShelter.length < 2 || Number.isNaN(coordShelter[0]) || Number.isNaN(coordShelter[1])) {
      showFeedback('Lat/Long rifugio non valide fornite dal server.', true);
      setButtonLoading(false);
      return;
    }

    nomeEl.textContent = dati.nome;
    indirizzoRifugioEl.textContent = dati.indirizzo;
    distanzaEl.textContent = `Distanza: ${dati.distanza_km} km`;

    // Immagine animale casuale
    animalImg.src = pickRandomMedia();

    // Link direzioni su Google Maps (aprire percorso dal punto utente al rifugio)
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

    // Map
    initMap(coordUser[0], coordUser[1], 12);
    resetMap();
    userMarker = L.marker([coordUser[0], coordUser[1]]).addTo(map).bindPopup('Tu').openPopup();
    shelterMarker = L.marker([coordShelter[0], coordShelter[1]]).addTo(map).bindPopup(dati.nome);
    const group = L.featureGroup([userMarker, shelterMarker]);
    map.fitBounds(group.getBounds().pad(0.4));

  } catch (err) {
    console.error('[NookPets] fetch error', err);
    showFeedback('Errore di rete o del server. Controlla la console.', true);
  } finally {
    setButtonLoading(false);
  }
});

// Inizializza mappa vuota al caricamento della pagina
initMap();

// Preload una immagine casuale all'avvio per migliorare UX
animalImg.src = pickRandomMedia();

// Autocomplete UI: dropdown container
let acContainer = null;
let acItems = [];
let acSelected = -1;
let acAbortController = null;

// ensure browser native autocomplete is off
if (indirizzoInput) {
  indirizzoInput.setAttribute('autocomplete', 'off');
}

function createAutocomplete() {
  // Append to body to avoid clipping/overflow issues inside containers
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
  // ensure it is a direct child of body
  document.body.appendChild(acContainer);
}

function positionAutocomplete() {
  if (!acContainer) return;
  const rect = indirizzoInput.getBoundingClientRect();
  const scrollY = window.scrollY || window.pageYOffset;
  const scrollX = window.scrollX || window.pageXOffset;
  const top = rect.bottom + scrollY + 6;
  const left = rect.left + scrollX;
  acContainer.style.top = `${top}px`;
  acContainer.style.left = `${left}px`;
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
  console.log('[NookPets] renderAutocomplete items count:', items.length);
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

    // item can be string or object {display, name, city, state, lat, lon, postcode}
    let displayText = '';
    let metaText = '';
    if (typeof item === 'string') {
      displayText = item;
    } else if (item && typeof item === 'object') {
      displayText = item.display || item.name || '';
      if (item.postcode) metaText = `CAP: ${item.postcode}`;
      else if (item.city && item.state) metaText = `${item.city}, ${item.state}`;
      else if (item.city) metaText = item.city;
      else if (item.state) metaText = item.state;
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

    el.addEventListener('click', ()=>{
      // use async selector wrapper
      selectAutocomplete(idx);
    });
    el.addEventListener('mouseenter', ()=>{
      setAutocompleteIndex(idx);
    });
    // store the raw item on the element for later
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

function setAutocompleteIndex(i) {
  if (acSelected >= 0 && acItems[acSelected]) acItems[acSelected].style.background = '';
  acSelected = i;
  if (acSelected >= 0 && acItems[acSelected]) acItems[acSelected].style.background = 'rgba(0,102,255,0.06)';
}

async function selectAutocomplete(i) {
  if (!acItems[i]) return;
  const el = acItems[i];
  const item = el._ac_item;
  if (!item) return;
  // item may be string or object
  if (typeof item === 'string') {
    indirizzoInput.value = item;
    clearAutocomplete();
    indirizzoInput.focus();
    return;
  }

  // If object, populate with display (name, city, state)
  indirizzoInput.value = item.display || item.name || '';

  // If postcode available, append it for precision (optional behavior)
  if (item.postcode) {
    // if display doesn't already contain postcode
    if (!indirizzoInput.value.includes(item.postcode)) {
      indirizzoInput.value = `${indirizzoInput.value}, ${item.postcode}`;
    }
  }

  clearAutocomplete();
  indirizzoInput.focus();

  // If lat/lon present, show marker on map and zoom
  let lat = item.lat != null ? Number(item.lat) : null;
  let lon = item.lon != null ? Number(item.lon) : null;

  if ((lat == null || lon == null) && (item.name || item.display)) {
    // ask server to geocode on-demand
    try {
      showFeedback('Ricavo coordinate per la strada selezionata...', false, true);
      const payload = { name: item.name, city: item.city, state: item.state };
      const res = await fetch('/api/geocode-street', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (res.ok) {
        const j = await res.json();
        if (j && j.lat != null && j.lon != null) {
          lat = Number(j.lat);
          lon = Number(j.lon);
        }
      }
    } catch (e) {
      console.warn('Geocode on-demand failed', e);
    } finally {
      showFeedback('');
    }
  }

  if (lat != null && lon != null && !Number.isNaN(lat) && !Number.isNaN(lon)) {
    try {
      initMap(lat, lon, 14);
      resetMap();
      shelterMarker = L.marker([lat, lon]).addTo(map).bindPopup(item.display || item.name).openPopup();
      map.setView([lat, lon], 14);
    } catch (e) {
      console.warn('Cannot place marker for suggestion', e);
    }
  }
}

// corrected fetchSuggestions with proper error handling
async function fetchSuggestions(q) {
  if (acAbortController) acAbortController.abort();
  acAbortController = new AbortController();
  try {
    const res = await fetch(`/api/suggest-street?q=${encodeURIComponent(q)}`, {signal: acAbortController.signal});
    if (!res.ok) {
      console.warn('[NookPets] suggest API returned non-OK', res.status);
      return [];
    }
    const j = await res.json();
    console.log('[NookPets] fetchSuggestions response length:', (j.suggestions||[]).length);
    return j.suggestions || [];
  } catch (e) {
    if (e && e.name === 'AbortError') return [];
    console.error('Autocomplete error', e);
    return [];
  }
}

// Debounce helper
function debounce(fn, ms) {
  let t = null;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

// Input handler that queries the suggest endpoint and renders results
const onInputChange = debounce(async (ev) => {
  const v = indirizzoInput.value.trim();
  if (!v) { clearAutocomplete(); return; }
  console.log('[NookPets] querying suggestions for:', v);
  const items = await fetchSuggestions(v);
  renderAutocomplete(items.slice(0, 12));
}, 220);

// Attach input and resize listeners
indirizzoInput.addEventListener('input', onInputChange);
window.addEventListener('resize', positionAutocomplete);

// Ensure autocomplete created initially
createAutocomplete();

// ...existing code...
