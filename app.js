const CONFIG = {
  nasaKey: 'DEMO_KEY', // Reemplázala por tu clave de https://api.nasa.gov
  timeoutMs: 10000,
  intervals: {
    iss: 5 * 1000,
    space: 5 * 60 * 1000,
    neo: 60 * 60 * 1000,
  },
};

const G = 6.674e-11;          // m³ kg⁻¹ s⁻²
const C = 2.998e8;            // m/s
const MSUN = 1.989e30;        // kg
const HBAR = 1.0546e-34;      // J·s
const KB = 1.381e-23;         // J/K
const SUN_RADIUS_KM = 696000;
const AU_KM = 1.496e8;
const LY_PER_PC = 3.2616;

const $ = (id) => document.getElementById(id);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Utilidades ---------- */

function esc(text){
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function fetchJSON(url){
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.timeoutMs);
  try{
    const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }catch(e){
    throw e.name === 'AbortError' ? new Error('tiempo de espera agotado') : e;
  }finally{
    clearTimeout(timer);
  }
}

function setState(id, text, kind = ''){
  const el = $(id);
  el.textContent = text;
  el.className = `status ${kind}`.trim();
}

const stamp = () => new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function touchLast(){
  $('last').textContent = new Date().toLocaleString('es');
  updateSummary();
}

// Copia los valores principales a la franja de resumen del inicio
function updateSummary(){
  $('sum-alt').textContent = $('iss-alt').textContent;
  $('sum-kp').textContent = $('kp').textContent;
  $('sum-xray').textContent = $('xray').textContent;
  $('sum-neo').textContent = $('neo-count').textContent;
  $('sum-disc').textContent = String(document.querySelectorAll('.disc').length);
}

const num = (n, digits = 0) => Number(n).toLocaleString('es', { maximumFractionDigits: digits, minimumFractionDigits: digits });

function bigNum(n, unit = ''){
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${num(n / 1e9, 2)} mil millones${unit ? ' ' + unit : ''}`;
  if (abs >= 1e6) return `${num(n / 1e6, 2)} millones${unit ? ' ' + unit : ''}`;
  return `${num(n)}${unit ? ' ' + unit : ''}`;
}

function store(key, value){
  try{ localStorage.setItem(key, JSON.stringify(value)); }catch(_){ /* navegador sin almacenamiento */ }
}

function load(key){
  try{ return JSON.parse(localStorage.getItem(key)); }catch(_){ return null; }
}

/* ---------- Avisos (toast y notificaciones del navegador) ---------- */

let toastTimer;
function toast(text){
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 5000);
}

function notify(title, body){
  toast(`${title}: ${body}`);
  if ('Notification' in window && Notification.permission === 'granted'){
    new Notification(title, { body });
  }
}

function initNotifyButton(){
  const btn = $('notify-btn');
  if (!('Notification' in window) || Notification.permission !== 'default'){
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  btn.addEventListener('click', async () => {
    const result = await Notification.requestPermission();
    btn.hidden = result !== 'default';
  });
}

/* ---------- ISS ---------- */

async function loadISS(){
  try{
    const d = await fetchJSON('https://api.wheretheiss.at/v1/satellites/25544');
    const lat = d.latitude, lon = d.longitude;
    $('iss-alt').textContent = `${num(d.altitude)} km`;
    $('iss-lat').textContent = `${num(Math.abs(lat), 2)}° ${lat >= 0 ? 'N' : 'S'}`;
    $('iss-lon').textContent = `${num(Math.abs(lon), 2)}° ${lon >= 0 ? 'E' : 'O'}`;
    $('iss-vel').textContent = `${num(d.velocity)} km/h`;
    $('iss-vis').textContent = d.visibility === 'daylight' ? 'Con luz solar' : 'En sombra de la Tierra';
    setState('iss-status', `actualizado ${stamp()}`, 'ok');
    touchLast();
  }catch(e){
    setState('iss-status', `No disponible (${e.message})`, 'err');
  }
}

/* ---------- Clima espacial (NOAA) ---------- */

const FLARE_LETTER = { '-8': 'A', '-7': 'B', '-6': 'C', '-5': 'M', '-4': 'X' };

function flareClass(flux){
  if (!(flux > 0)) return '—';
  const exp = Math.max(-8, Math.min(-4, Math.floor(Math.log10(flux))));
  return `${FLARE_LETTER[exp]}${(flux / 10 ** exp).toFixed(1)}`;
}

function kpLevel(kp){
  if (kp < 4) return 'Calmo';
  if (kp < 5) return 'Inestable';
  if (kp < 6) return 'Tormenta leve (G1)';
  if (kp < 7) return 'Tormenta moderada (G2)';
  return 'Tormenta fuerte (G3+)';
}

async function loadKp(){
  const rows = await fetchJSON('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json');
  const kp = Number(rows[rows.length - 1].estimated_kp);
  if (!Number.isFinite(kp)) throw new Error('Kp sin datos');
  $('kp').textContent = kp.toFixed(2);
  $('kp-bar').style.width = `${Math.min(kp / 9, 1) * 100}%`;
  $('kp-level').textContent = kpLevel(kp);
}

async function loadXray(){
  const rows = await fetchJSON('https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json');
  const latest = rows.filter((r) => r.energy === '0.1-0.8nm' && r.flux > 0).pop();
  if (!latest) throw new Error('rayos X sin datos');
  $('xray').textContent = flareClass(latest.flux);
  $('xray-time').textContent = new Date(latest.time_tag).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

async function loadSpaceWeather(){
  const results = await Promise.allSettled([loadKp(), loadXray()]);
  const failed = results.filter((r) => r.status === 'rejected').map((r) => r.reason.message);
  if (failed.length === results.length) setState('sw-status', `No disponible (${failed.join('; ')})`, 'err');
  else if (failed.length) setState('sw-status', `Parcial: ${failed.join('; ')}`, 'err');
  else setState('sw-status', `actualizado ${stamp()}`, 'ok');
  if (failed.length < results.length) touchLast();
}

/* ---------- Avisos NOAA ---------- */

const ALERT_KINDS = ['WARNING', 'WATCH', 'ALERT', 'SUMMARY'];

function alertKind(message){
  return ALERT_KINDS.find((k) => message.includes(`${k}:`)) || 'INFO';
}

function alertText(message, kind){
  const line = message.split(/\r?\n/).find((l) => l.includes(`${kind}:`)) || '';
  return line.slice(line.indexOf(':') + 1).trim() || 'Aviso sin detalle';
}

async function loadAlerts(){
  const items = await fetchJSON('https://services.swpc.noaa.gov/products/alerts.json');
  const recent = items.slice(-6).reverse();
  const seen = load('seenAlerts');
  const ids = items.map((it) => it.product_id + it.issue_datetime);

  if (!recent.length){
    $('alerts').innerHTML = '<li class="muted">Sin avisos recientes.</li>';
  } else {
    $('alerts').innerHTML = recent.map((it) => {
      const kind = alertKind(it.message);
      const when = new Date(it.issue_datetime.replace(' ', 'T') + 'Z')
        .toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
      return `<li class="alert ${kind.toLowerCase()}">
        <strong>${esc(kind)}</strong>
        <span>${esc(alertText(it.message, kind))}</span>
        <time>${esc(when)}</time>
      </li>`;
    }).join('');
  }

  // Primera visita: guarda sin avisar. Después: avisa solo de avisos nuevos.
  if (seen){
    const fresh = recent.filter((it) => !seen.includes(it.product_id + it.issue_datetime));
    if (fresh.length){
      const kind = alertKind(fresh[0].message);
      notify('Nuevo aviso NOAA', alertText(fresh[0].message, kind));
    }
  }
  store('seenAlerts', ids);
  setState('alerts-status', `actualizado ${stamp()}`, 'ok');
  touchLast();
}

/* ---------- Nuevos descubrimientos (NASA Exoplanet Archive) ---------- */

async function loadDiscoveries(){
  const year = new Date().getFullYear();
  const query = `select top 8 pl_name,hostname,disc_year,disc_facility,pl_rade,pl_orbper,sy_dist from pscomppars where disc_year >= ${year - 2} order by disc_year desc`;
  const url = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync?' + new URLSearchParams({ query, format: 'json' });
  const rows = await fetchJSON(url);

  const seen = load('seenPlanets');
  const names = rows.map((r) => r.pl_name);
  const fresh = seen ? names.filter((n) => !seen.includes(n)) : [];

  $('discoveries').innerHTML = rows.map((r, i) => {
    const isNew = fresh.includes(r.pl_name);
    const radius = r.pl_rade != null ? `${num(r.pl_rade, 2)} R⊕` : '—';
    const period = r.pl_orbper != null ? `${num(r.pl_orbper, 1)} días` : '—';
    const dist = r.sy_dist != null ? `${num(r.sy_dist * LY_PER_PC)} años luz` : '—';
    return `<article class="disc card${isNew ? ' is-new' : ''}" style="--i:${i}">
      ${isNew ? '<span class="badge">Nuevo</span>' : ''}
      <h3>${esc(r.pl_name)}</h3>
      <p class="muted">Estrella: ${esc(r.hostname)}</p>
      <div class="row"><span>Descubierto</span><span>${esc(r.disc_year)}</span></div>
      <div class="row"><span>Telescopio</span><span>${esc(r.disc_facility)}</span></div>
      <div class="row"><span>Radio</span><span>${radius}</span></div>
      <div class="row"><span>Periodo orbital</span><span>${period}</span></div>
      <div class="row"><span>Distancia</span><span>${dist}</span></div>
    </article>`;
  }).join('');

  if (fresh.length){
    $('disc-count').textContent = fresh.length;
    $('disc-count').hidden = false;
    notify('Nuevos planetas', `${fresh.length} descubrimiento(s) recientes`);
  } else {
    $('disc-count').hidden = true;
  }
  store('seenPlanets', names);
  setState('disc-status', `actualizado ${stamp()}`, 'ok');
  touchLast();
}

/* ---------- Asteroides cercanos (NASA NeoWs) ---------- */

async function loadNEO(){
  const today = new Date().toISOString().slice(0, 10);
  const d = await fetchJSON(
    `https://api.nasa.gov/neo/rest/v1/feed?start_date=${today}&end_date=${today}&api_key=${CONFIG.nasaKey}`
  );
  const objs = d.near_earth_objects[today] || [];
  const approaches = objs
    .flatMap((o) => o.close_approach_data.map((c) => ({
      name: o.name,
      km: parseFloat(c.miss_distance.kilometers),
    })))
    .sort((a, b) => a.km - b.km);

  $('neo-count').textContent = d.element_count;
  $('neo-hazard').textContent = objs.filter((o) => o.is_potentially_hazardous_asteroid).length;

  if (approaches.length){
    const closest = approaches[0];
    $('neo-name').textContent = closest.name.replace(/[()]/g, '');
    $('neo-dist').textContent = `${num(closest.km)} km`;
    $('neo-lunar').textContent = `${num(closest.km / 384400, 2)} LD`;
  } else {
    $('neo-name').textContent = '—';
    $('neo-dist').textContent = '—';
    $('neo-lunar').textContent = '—';
  }
  setState('neo-status', `${today} · actualizado ${stamp()}`, 'ok');
  touchLast();
}

/* ---------- APOD (con respaldo de la biblioteca de imágenes) ---------- */

async function loadAPOD(){
  try{
    const d = await fetchJSON(`https://api.nasa.gov/planetary/apod?api_key=${CONFIG.nasaKey}`);
    const media = d.media_type === 'video'
      ? `<p><a href="${esc(d.url)}" target="_blank" rel="noopener">Ver video de hoy</a></p>`
      : `<img src="${esc(d.url)}" alt="${esc(d.title)}" loading="lazy">`;
    $('apod-body').innerHTML = `${media}
      <h3>${esc(d.title)}</h3>
      <details><summary>Leer explicación</summary><p>${esc(d.explanation)}</p></details>`;
    setState('apod-status', `${d.date} · actualizado ${stamp()}`, 'ok');
  }catch(e){
    const fallback = await searchImages('nebula', 1).catch(() => []);
    if (fallback.length){
      const item = fallback[0];
      $('apod-body').innerHTML = `<img src="${esc(item.src)}" alt="${esc(item.title)}" loading="lazy">
        <h3>${esc(item.title)}</h3>
        <p class="muted">La imagen del día no está disponible; esta es una imagen de la biblioteca de la NASA.</p>`;
      setState('apod-status', `Respaldo · ${e.message}`, 'err');
    } else {
      $('apod-body').innerHTML = '<p class="muted">No se pudo cargar la imagen del día.</p>';
      setState('apod-status', `No disponible (${e.message})`, 'err');
    }
  }
}

/* ---------- Biblioteca de imágenes de la NASA ---------- */

async function searchImages(query, pageSize = 5){
  const url = 'https://images-api.nasa.gov/search?' + new URLSearchParams({
    q: query, media_type: 'image', page_size: String(pageSize),
  });
  const data = await fetchJSON(url);
  return data.collection.items
    .filter((it) => it.links && it.links[0] && it.data && it.data[0])
    .map((it) => ({
      src: it.links[0].href,
      title: it.data[0].title,
      date: it.data[0].date_created ? new Date(it.data[0].date_created).getFullYear() : '',
      href: `https://images.nasa.gov/details/${it.data[0].nasa_id}`,
    }));
}

/* ---------- Agujeros negros ---------- */

function bhPhysics(massSun){
  const M = massSun * MSUN;
  const rsM = (2 * G * M) / (C * C);                           // radio de Schwarzschild
  const tempK = (HBAR * C ** 3) / (8 * Math.PI * G * M * KB);  // temperatura de Hawking
  return {
    rsKm: rsM / 1000,
    diamKm: (2 * rsM) / 1000,
    tempK,
  };
}

let bhCurrent = BLACK_HOLES[0];

function renderBlackHole(){
  const bh = bhCurrent;
  const massSun = 10 ** Number($('bh-mass').value);
  const p = bhPhysics(massSun);

  $('bh-name').textContent = bh.name;
  $('bh-type').textContent = bh.type;
  $('bh-note').textContent = bh.note;
  $('bh-link').href = `https://simbad.cds.unistra.fr/simbad/sim-basic?Ident=${encodeURIComponent(bh.simbad)}`;

  $('bh-mass-out').textContent = `${bigNum(massSun)} M☉`;
  $('bh-dist').textContent = `${bigNum(bh.distanceLy)} años luz`;
  $('bh-rs').textContent = bigNum(p.rsKm, 'km');
  $('bh-diam').textContent = bigNum(p.diamKm, 'km');
  $('bh-sun').textContent = `${num(p.diamKm / SUN_RADIUS_KM, 1)} veces el radio del Sol`;
  $('bh-au').textContent = `${num((p.rsKm / AU_KM) * 100, 3)} % de la distancia Tierra–Sol`;
  $('bh-temp').textContent = `${p.tempK.toExponential(2)} K`;
  $('bh-cmb').textContent = p.tempK < 2.7 ? 'Más frío que el fondo cósmico (2,7 K)' : 'Más caliente que el fondo cósmico (2,7 K)';

  // Escala logarítmica: el horizonte crece con la masa, sin salirse del recuadro
  const px = Math.max(18, Math.min(130, 18 + (Math.log10(p.diamKm) - 2) * 11));
  $('bh-hole').style.width = $('bh-hole').style.height = `${px}px`;
  $('bh-disk').style.width = $('bh-disk').style.height = `${px * 2.6}px`;

  document.querySelectorAll('[data-bh]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.bh === bh.id));
  });
}

function initBlackHoles(){
  const picker = $('bh-picker');
  picker.innerHTML = BLACK_HOLES.map((bh) =>
    `<button type="button" data-bh="${esc(bh.id)}" aria-pressed="false">${esc(bh.name)}</button>`
  ).join('');

  picker.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-bh]');
    if (!btn) return;
    bhCurrent = BLACK_HOLES.find((b) => b.id === btn.dataset.bh);
    $('bh-mass').value = Math.log10(bhCurrent.massSun).toFixed(2);
    renderBlackHole();
  });

  $('bh-mass').addEventListener('input', renderBlackHole);
  $('bh-mass').value = Math.log10(bhCurrent.massSun).toFixed(2);
  renderBlackHole();
}

/* ---------- Planetas ---------- */

const planetImages = {};
let planetCurrent = PLANETS[2];

function fmtDay(hours){
  return hours > 48 ? `${num(hours / 24, 1)} días` : `${num(hours, 1)} horas`;
}

function renderPlanetData(){
  const p = planetCurrent;
  $('pl-name').textContent = p.name;
  $('pl-radius').textContent = `${num(p.radiusKm)} km (${num(p.radiusKm / 6371, 2)} × Tierra)`;
  $('pl-mass').textContent = `${num(p.massEarth, p.massEarth < 1 ? 3 : 1)} × Tierra`;
  $('pl-moons').textContent = `${p.moons}`;
  $('pl-temp').textContent = `${num(p.tempC)} °C (media)`;
  $('pl-dist').textContent = `${num(p.distanceAU, 2)} UA`;
  $('pl-day').textContent = fmtDay(p.dayHours);

  document.querySelectorAll('[data-planet]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.planet === p.id));
  });
}

async function renderPlanetImage(){
  const p = planetCurrent;
  const cache = planetImages[p.id];

  if (cache){
    showPlanetImage(cache.items[cache.index], cache.index, cache.items.length);
    return;
  }

  $('pl-image').innerHTML = '<p class="muted">Buscando imagen…</p>';
  try{
    const items = await searchImages(p.search, 8);
    if (!items.length) throw new Error('sin imágenes');
    planetImages[p.id] = { items, index: 0 };
    showPlanetImage(items[0], 0, items.length);
  }catch(e){
    $('pl-image').innerHTML = `<p class="muted">No se pudo cargar la imagen (${esc(e.message)}).</p>`;
  }
}

function showPlanetImage(item, index, total){
  $('pl-image').innerHTML = `
    <img src="${esc(item.src)}" alt="${esc(item.title)}" loading="lazy">
    <div class="image-meta">
      <span>${esc(item.title)}${item.date ? ` · ${esc(item.date)}` : ''}</span>
      <span>
        <a href="${esc(item.href)}" target="_blank" rel="noopener">Ver en NASA</a>
        ${total > 1 ? '<button type="button" id="pl-next" class="mini">Otra imagen</button>' : ''}
      </span>
    </div>`;
  const next = $('pl-next');
  if (next){
    next.addEventListener('click', () => {
      const cache = planetImages[planetCurrent.id];
      cache.index = (cache.index + 1) % cache.items.length;
      showPlanetImage(cache.items[cache.index], cache.index, cache.items.length);
    });
  }
}

function initPlanets(){
  const picker = $('pl-picker');
  picker.innerHTML = PLANETS.map((p) =>
    `<button type="button" data-planet="${esc(p.id)}" aria-pressed="false">${esc(p.name)}</button>`
  ).join('');

  picker.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-planet]');
    if (!btn) return;
    planetCurrent = PLANETS.find((p) => p.id === btn.dataset.planet);
    renderPlanetData();
    renderPlanetImage();
  });

  renderPlanetData();
  renderPlanetImage();
}

/* ---------- Animación de entrada de secciones ---------- */

function initReveal(){
  const sections = document.querySelectorAll('main section');
  if (reduceMotion || !('IntersectionObserver' in window)){
    sections.forEach((s) => s.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting){
        en.target.classList.add('in');
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.08 });
  sections.forEach((s) => {
    s.classList.add('reveal');
    io.observe(s);
  });
}

/* ---------- Arranque ---------- */

function refreshAll(){
  loadISS();
  loadSpaceWeather();
  loadAlerts().catch((e) => setState('alerts-status', `No disponible (${e.message})`, 'err'));
  loadNEO().catch((e) => setState('neo-status', `No disponible (${e.message})`, 'err'));
  loadDiscoveries().catch((e) => setState('disc-status', `No disponible (${e.message})`, 'err'));
  loadAPOD();
}

function init(){
  initNotifyButton();
  initBlackHoles();
  initPlanets();
  initReveal();
  startGalaxy($('galaxy'));

  $('refresh').addEventListener('click', refreshAll);
  $('disc-link').addEventListener('click', () => {
    const names = Array.from(document.querySelectorAll('.disc h3')).map((h) => h.textContent);
    store('seenPlanets', names);
    $('disc-count').hidden = true;
    document.querySelectorAll('.disc.is-new').forEach((el) => el.classList.remove('is-new'));
    document.querySelectorAll('.disc .badge').forEach((el) => el.remove());
  });

  refreshAll();
  setInterval(loadISS, CONFIG.intervals.iss);
  setInterval(() => { loadSpaceWeather(); loadAlerts().catch(() => {}); }, CONFIG.intervals.space);
  setInterval(() => {
    loadNEO().catch(() => {});
    loadDiscoveries().catch(() => {});
    loadAPOD();
  }, CONFIG.intervals.neo);
}

init();
