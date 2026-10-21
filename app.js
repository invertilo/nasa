const CONFIG = {
  // URL base del Worker que guarda la clave de la NASA (secreto NASA_API_KEY), sin barra final.
  // Ejemplo: 'https://nasa-cosmos-proxy.TU-USUARIO.workers.dev'. Vacío = clave DEMO_KEY (límite bajo).
  nasaProxy: '/api',
  timeoutMs: 10000,
  // El Archivo de Exoplanetas (TAP) hoy no envía cabeceras CORS, así que el navegador bloquea
  // la consulta directa. Si tienes un proxy propio, pon aquí su prefijo (se le agrega la URL
  // codificada), por ejemplo 'https://mi-proxy.example/?url='. Vacío = consulta directa.
  exoplanetProxy: '/api/exo?url=',
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
const EARTH_RADIUS_KM = 6371;

const $ = (id) => document.getElementById(id);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ---------- Utilidades ---------- */

// La clave nunca va en el navegador: con proxy la agrega la función de /api; sin proxy se usa DEMO_KEY.
function nasaUrl(path, params = {}){
  const qs = new URLSearchParams(params);
  if (CONFIG.nasaProxy) return `${CONFIG.nasaProxy}/nasa?path=${encodeURIComponent(path)}&${qs}`;
  qs.set('api_key', 'DEMO_KEY');
  return `https://api.nasa.gov/${path}?${qs}`;
}

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
  const n = document.querySelectorAll('.disc').length;
  $('sum-disc').textContent = n ? String(n) : '—';
}

const num = (n, digits = 0) => Number(n).toLocaleString('es', { maximumFractionDigits: digits, minimumFractionDigits: digits });

function bigNum(n, unit = ''){
  const abs = Math.abs(n);
  const u = unit ? ' ' + unit : '';
  if (abs >= 1e12) return `${num(n / 1e12, 2)} billones${u}`;
  if (abs >= 1e9) return `${num(n / 1e9, 2)} mil millones${u}`;
  if (abs >= 1e6) return `${num(n / 1e6, 2)} millones${u}`;
  if (abs > 0 && abs < 1) return `${num(n, 4)}${u}`;
  return `${num(n)}${u}`;
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

/* ---------- Controles segmentados (pulgar de vidrio con resorte) ---------- */

function syncSeg(seg){
  let thumb = seg.querySelector('.seg-thumb');
  if (!thumb){
    thumb = document.createElement('span');
    thumb.className = 'seg-thumb';
    thumb.setAttribute('aria-hidden', 'true');
    seg.prepend(thumb);
    if ('ResizeObserver' in window) new ResizeObserver(() => syncSeg(seg)).observe(seg);
  }
  const on = seg.querySelector('button[aria-pressed="true"]');
  if (!on){ thumb.style.opacity = '0'; return; }
  thumb.style.opacity = '1';
  thumb.style.width = `${on.offsetWidth}px`;
  thumb.style.height = `${on.offsetHeight}px`;
  thumb.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
}

function setPressed(seg, attr, value){
  seg.querySelectorAll(`[${attr}]`).forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === value)));
  syncSeg(seg);
}

/* ---------- Detalles táctiles: presión inmediata e inclinación 3D ---------- */

function initPressFeedback(){
  // Respuesta en pointer-down, no al soltar (también en táctil, donde :active llega tarde)
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('button');
    if (b) b.classList.add('is-pressed');
  }, { passive: true });
  const release = () => document.querySelectorAll('button.is-pressed').forEach((b) => b.classList.remove('is-pressed'));
  ['pointerup', 'pointercancel', 'dragstart'].forEach((t) => document.addEventListener(t, release, { passive: true }));
}

function initTilt(){
  if (!finePointer || reduceMotion) return;
  // Inclinación limitada a 5° y reflejo que sigue al puntero. Se calcula en cada evento,
  // así que se puede interrumpir y revertir en cualquier momento.
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest('.tilt');
    document.querySelectorAll('.tilt.is-tilting').forEach((c) => {
      if (c !== card){ c.classList.remove('is-tilting'); c.style.transform = ''; }
    });
    if (!card) return;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    card.classList.add('is-tilting');
    card.style.transform = `perspective(900px) rotateX(${((0.5 - y) * 5).toFixed(2)}deg) rotateY(${((x - 0.5) * 5).toFixed(2)}deg) translateZ(0)`;
    card.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    card.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
  }, { passive: true });
  document.addEventListener('pointerleave', () => {
    document.querySelectorAll('.tilt.is-tilting').forEach((c) => { c.classList.remove('is-tilting'); c.style.transform = ''; });
  });
}

/* ---------- ISS ---------- */

// Globo ortográfico en canvas 2D: no gasta un contexto WebGL más.
const issTrail = [];
const issView = { lon: 0, lat: 0, tLon: 0, tLat: 0, raf: 0 };

function drawISSGlobe(){
  const cv = $('iss-globe');
  const g = cv.getContext('2d');
  const W = cv.width, R = W / 2 - 4, cx = W / 2, cy = W / 2;
  const rad = Math.PI / 180;
  const lon0 = issView.lon * rad, lat0 = issView.lat * rad;
  const proj = (lat, lon) => {
    const la = lat * rad, lo = lon * rad;
    const cosc = Math.sin(lat0) * Math.sin(la) + Math.cos(lat0) * Math.cos(la) * Math.cos(lo - lon0);
    return {
      x: cx + R * Math.cos(la) * Math.sin(lo - lon0),
      y: cy - R * (Math.cos(lat0) * Math.sin(la) - Math.sin(lat0) * Math.cos(la) * Math.cos(lo - lon0)),
      v: cosc > 0,
    };
  };
  g.clearRect(0, 0, W, W);
  const sph = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
  sph.addColorStop(0, '#3d7bd9'); sph.addColorStop(0.6, '#13336e'); sph.addColorStop(1, '#050d24');
  g.fillStyle = sph;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  // Meridianos y paralelos
  g.strokeStyle = 'rgba(170,200,255,.22)';
  g.lineWidth = 1;
  const line = (pts) => {
    g.beginPath();
    let pen = false;
    pts.forEach(([la, lo]) => {
      const p = proj(la, lo);
      if (!p.v){ pen = false; return; }
      if (pen) g.lineTo(p.x, p.y); else { g.moveTo(p.x, p.y); pen = true; }
    });
    g.stroke();
  };
  for (let lo = -180; lo < 180; lo += 30) line(Array.from({ length: 37 }, (_, i) => [-90 + i * 5, lo]));
  for (let la = -60; la <= 60; la += 30) line(Array.from({ length: 73 }, (_, i) => [la, -180 + i * 5]));
  // Estela y posición de la ISS
  g.strokeStyle = 'rgba(255,210,154,.7)';
  g.lineWidth = 2;
  line(issTrail);
  const last = issTrail[issTrail.length - 1];
  if (last){
    const p = proj(last[0], last[1]);
    if (p.v){
      g.fillStyle = 'rgba(255,210,154,.3)';
      g.beginPath(); g.arc(p.x, p.y, 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffd29a';
      g.beginPath(); g.arc(p.x, p.y, 4, 0, Math.PI * 2); g.fill();
    }
  }
  // Brillo atmosférico
  g.strokeStyle = 'rgba(140,180,255,.5)';
  g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
}

function animateISSGlobe(){
  cancelAnimationFrame(issView.raf);
  // Gira el globo hacia la ISS con un resorte críticamente amortiguado (sin sobreimpulso)
  const s1 = { x: issView.lon, v: 0, target: issView.tLon };
  const s2 = { x: issView.lat, v: 0, target: issView.tLat };
  let last = performance.now();
  const step = (t) => {
    const dt = Math.min((t - last) / 1000, 0.05);
    last = t;
    springTo(s1, dt, 0.8);
    springTo(s2, dt, 0.8);
    issView.lon = s1.x; issView.lat = s2.x;
    drawISSGlobe();
    if (Math.abs(s1.target - s1.x) > 0.01 || Math.abs(s2.target - s2.x) > 0.01) issView.raf = requestAnimationFrame(step);
  };
  if (reduceMotion){ issView.lon = issView.tLon; issView.lat = issView.tLat; drawISSGlobe(); }
  else issView.raf = requestAnimationFrame(step);
}

async function loadISS(){
  try{
    const d = await fetchJSON('https://api.wheretheiss.at/v1/satellites/25544');
    const lat = d.latitude, lon = d.longitude;
    $('iss-alt').textContent = `${num(d.altitude)} km`;
    $('iss-lat').textContent = `${num(Math.abs(lat), 2)}° ${lat >= 0 ? 'N' : 'S'}`;
    $('iss-lon').textContent = `${num(Math.abs(lon), 2)}° ${lon >= 0 ? 'E' : 'O'}`;
    $('iss-vel').textContent = `${num(d.velocity)} km/h`;
    $('iss-vis').textContent = d.visibility === 'daylight' ? 'Con luz solar' : 'En sombra de la Tierra';
    issTrail.push([lat, lon]);
    if (issTrail.length > 120) issTrail.shift();
    // Elegir el camino corto en longitud para que el globo no dé la vuelta entera
    let tl = lon;
    while (tl - issView.lon > 180) tl -= 360;
    while (tl - issView.lon < -180) tl += 360;
    issView.tLon = tl;
    issView.tLat = lat * 0.6;
    animateISSGlobe();
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

function tapURL(query){
  const url = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync?' + new URLSearchParams({ query, format: 'json' });
  return CONFIG.exoplanetProxy ? CONFIG.exoplanetProxy + encodeURIComponent(url) : url;
}

// ¿El fallo es el bloqueo CORS del Archivo (y no hay proxy configurado)?
const isCorsBlock = (e) => e instanceof TypeError && !CONFIG.exoplanetProxy;

// Esferas a escala lineal (Tierra = 12 px). Si el planeta no cabe, se marca.
function sizeCompare(rade){
  if (rade == null) return '';
  const E = 12, max = 74;
  const px = E * rade;
  const capped = px > max;
  const size = Math.max(3, Math.min(px, max));
  const hot = rade > 6 ? '--c1:#fff3e0;--c2:#d9a066;--c3:#4a2a12' : rade > 2 ? '--c1:#e9f6ff;--c2:#7fb6e6;--c3:#1c3b66' : '--c1:#ffe9d6;--c2:#c98f6b;--c3:#40261a';
  return `<div class="size-cmp" aria-hidden="true">
    <figure><i class="orb earth" style="width:${E}px;height:${E}px"></i><figcaption>Tierra</figcaption></figure>
    <figure><i class="orb" style="width:${size}px;height:${size}px;${hot}"></i><figcaption>${capped ? 'no cabe a escala' : 'a escala'}</figcaption></figure>
  </div>`;
}

// Sin proxy, el navegador bloquea la consulta: se explica con calma (sin error rojo)
function discoveriesFailed(e){
  if (document.querySelector('.disc')){
    setState('disc-status', `No se pudo actualizar (${e.message}); se muestran los últimos datos.`, 'info');
    return;
  }
  const cors = isCorsBlock(e);
  $('discoveries').innerHTML = `<div class="card glass info-card">
    <p><strong>${cors ? 'Los descubrimientos en vivo necesitan un proxy.' : 'No se pudieron cargar los descubrimientos.'}</strong></p>
    <p class="muted">${cors
      ? 'El Archivo de Exoplanetas de la NASA no permite consultas directas desde una página web (no envía cabeceras CORS). Para activarlo, configura <code>CONFIG.exoplanetProxy</code> en <code>app.js</code> con tu propio proxy.'
      : esc(e.message)}</p>
    <p><a href="https://exoplanetarchive.ipac.caltech.edu/" target="_blank" rel="noopener">Ver los descubrimientos en el Archivo de Exoplanetas</a> · o explora los <a href="#planetas">exoplanetas tipo Tierra en 3D</a>.</p>
  </div>`;
  setState('disc-status', cors ? 'Datos en vivo desactivados hasta configurar el proxy.' : `No disponible (${e.message})`, cors ? 'info' : 'err');
  updateSummary();
}

async function loadDiscoveries(){
  const year = new Date().getFullYear();
  const query = `select top 8 pl_name,hostname,disc_year,disc_facility,pl_rade,pl_orbper,sy_dist from pscomppars where disc_year >= ${year - 2} order by disc_year desc`;
  const rows = await fetchJSON(tapURL(query));

  const seen = load('seenPlanets');
  const names = rows.map((r) => r.pl_name);
  const fresh = seen ? names.filter((n) => !seen.includes(n)) : [];

  $('discoveries').innerHTML = rows.map((r, i) => {
    const isNew = fresh.includes(r.pl_name);
    const radius = r.pl_rade != null ? `${num(r.pl_rade, 2)} R⊕` : '—';
    const period = r.pl_orbper != null ? `${num(r.pl_orbper, 1)} días` : '—';
    const dist = r.sy_dist != null ? `${num(r.sy_dist * LY_PER_PC)} años luz` : '—';
    return `<article class="disc card glass tilt${isNew ? ' is-new' : ''}" style="--i:${i}">
      ${isNew ? '<span class="badge">Nuevo</span>' : ''}
      <h3>${esc(r.pl_name)}</h3>
      <p class="muted">Estrella: ${esc(r.hostname)}</p>
      ${sizeCompare(r.pl_rade)}
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
    nasaUrl('neo/rest/v1/feed', { start_date: today, end_date: today })
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
    const d = await fetchJSON(nasaUrl('planetary/apod'));
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

// Referencias para la regla logarítmica (diámetros en km)
const SIZE_REFS = [
  { name: 'Tierra', km: 12742 },
  { name: 'Júpiter', km: 139820 },
  { name: 'Sol', km: 1.3927e6 },
  { name: 'Órbita de Mercurio', km: 1.16e8 },
  { name: 'Órbita de la Tierra', km: 2.992e8 },
  { name: 'Órbita de Neptuno', km: 9.0e9 },
  { name: 'Heliosfera', km: 3.6e10 },
];
const RULER_MIN = 3, RULER_MAX = 11;   // log10(km)
const rulerPct = (km) => Math.max(0, Math.min(100, (Math.log10(km) - RULER_MIN) / (RULER_MAX - RULER_MIN) * 100));

function initRuler(){
  const ruler = $('bh-ruler');
  SIZE_REFS.forEach((r, i) => {
    const t = document.createElement('div');
    const pct = rulerPct(r.km);
    t.className = `ruler-tick ${['up', 'down', 'up2', 'down2'][i % 4]}${pct < 8 ? ' start' : pct > 80 ? ' end' : ''}`;
    t.style.left = `${pct}%`;
    t.innerHTML = `<span>${esc(r.name)}</span>`;
    ruler.insertBefore(t, $('bh-mark'));
  });
}

let bhCurrent = BLACK_HOLES[0];
let bh3d = null;

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
  $('bh-sun').textContent = `${num(p.diamKm / (2 * SUN_RADIUS_KM), p.diamKm < 2 * SUN_RADIUS_KM ? 5 : 1)} veces el diámetro del Sol`;
  const pct = (p.rsKm / AU_KM) * 100;
  $('bh-au').textContent = pct < 0.001
    ? `${pct.toExponential(1).replace('e', ' × 10^')} % de la distancia Tierra–Sol`
    : `${num(pct, 3)} % de la distancia Tierra–Sol`;
  const fits = SIZE_REFS.find((r) => r.km >= p.diamKm);
  $('bh-fits').textContent = fits ? `${fits.name} (${bigNum(fits.km, 'km')})` : 'Más grande que la heliosfera';
  $('bh-disk-temp').textContent = `~${bhDiskTempK(massSun).toExponential(1).replace('e+', ' × 10^')} K`;
  $('bh-temp').textContent = `${p.tempK.toExponential(2)} K`;
  $('bh-cmb').textContent = p.tempK < 2.7 ? 'Más frío que el fondo cósmico (2,7 K)' : 'Más caliente que el fondo cósmico (2,7 K)';
  $('bh-mark').style.left = `${rulerPct(p.diamKm)}%`;

  setPressed($('bh-picker'), 'data-bh', bh.id);
  if (bh3d) bh3d.setMass(massSun);
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
  initRuler();
  renderBlackHole();
}

/* ---------- Planetas ---------- */

const planetImages = {};
let planetCurrent = PLANETS[2];
const ALL_PLANETS = PLANETS.concat(EXO_EARTHS.map((e) => ({ ...e, exo: true })));
let planets3d = null;

const PLANET_KIND = {
  mercury: 'Rocoso', venus: 'Rocoso', earth: 'Rocoso · con vida', mars: 'Rocoso',
  jupiter: 'Gigante gaseoso', saturn: 'Gigante gaseoso', uranus: 'Gigante helado', neptune: 'Gigante helado',
};

function fmtDay(hours){
  return hours > 48 ? `${num(hours / 24, 1)} días` : `${num(hours, 1)} horas`;
}

function setPlanetLabels(exo){
  $('pl-l-mass').textContent = exo ? 'Estrella' : 'Masa';
  $('pl-l-moons').textContent = exo ? 'Periodo orbital' : 'Lunas conocidas';
  $('pl-l-temp').textContent = exo ? 'Temperatura de la estrella' : 'Temperatura media';
  $('pl-l-dist').textContent = exo ? 'Distancia a la Tierra' : 'Distancia al Sol';
  $('pl-l-day').textContent = exo ? 'Rotación' : 'Duración del día';
}

function renderExoData(p){
  $('pl-name').textContent = p.name;
  $('pl-kind').textContent = 'Exoplaneta tipo Tierra · zona habitable';
  $('pl-exo-note').hidden = false;
  $('pl-exo-note').textContent = `${p.note} La superficie en 3D es imaginada: nadie la ha visto todavía.`;
  $('pl-radius').textContent = `${num(p.radiusEarth, 2)} × Tierra${p.radiusEst ? ' (estimado)' : ''} · ${num(p.radiusEarth * EARTH_RADIUS_KM)} km`;
  $('pl-mass').textContent = p.star;
  $('pl-moons').textContent = `${num(p.periodDays, 1)} días`;
  $('pl-temp').textContent = `${num(p.starTempK)} K (el Sol: 5772 K)`;
  $('pl-dist').textContent = `${bigNum(p.distanceLy)} años luz`;
  $('pl-day').textContent = 'Probablemente sincrónica (un día = un año)';
  $('pl-tilt').textContent = 'Desconocida (se muestra 0°)';
  $('pl-compare-note').textContent = 'En "Comparar tamaños" se ven junto a la Tierra, a escala.';
}

function renderPlanetData(){
  const p = planetCurrent;
  setPlanetLabels(!!p.exo);
  setPressed($('pl-picker'), 'data-planet', p.id);
  setPressed($('pl-exo-picker'), 'data-planet', p.id);
  if (p.exo){ renderExoData(p); return; }
  $('pl-exo-note').hidden = true;
  $('pl-name').textContent = p.name;
  $('pl-kind').textContent = PLANET_KIND[p.id];
  $('pl-radius').textContent = `${num(p.radiusKm)} km (${num(p.radiusKm / EARTH_RADIUS_KM, 2)} × Tierra)`;
  $('pl-mass').textContent = `${num(p.massEarth, p.massEarth < 1 ? 3 : 1)} × Tierra`;
  $('pl-moons').textContent = `${p.moons}`;
  $('pl-temp').textContent = `${num(p.tempC)} °C (media)`;
  $('pl-dist').textContent = `${num(p.distanceAU, 2)} UA`;
  $('pl-day').textContent = fmtDay(p.dayHours) + (p.retrograde ? ' · retrógrado' : '');
  $('pl-tilt').textContent = `${num(p.tiltDeg, 1)}°`;
  const earths = (p.radiusKm / EARTH_RADIUS_KM) ** 3;
  $('pl-compare-note').textContent = earths >= 1.5
    ? `En ${p.name} cabrían unas ${num(earths)} Tierras por volumen.`
    : `${p.name} tiene ${num(earths * 100)} % del volumen de la Tierra.`;
}

async function renderPlanetImage(){
  const p = planetCurrent;
  const cache = planetImages[p.id];

  if (cache){
    showPlanetImage(cache.items[cache.index], cache.items.length);
    return;
  }

  $('pl-image').innerHTML = '<div class="photo-frame"><p class="muted">Buscando foto…</p></div>';
  try{
    let items = await searchImages(p.search, 8);
    // Muchas exotierras no tienen fotos propias: se usa una ilustración genérica de la NASA
    if (!items.length && p.exo) items = await searchImages('exoplanet habitable zone', 8);
    if (!items.length) throw new Error('sin imágenes');
    planetImages[p.id] = { items, index: 0 };
    if (planetCurrent.id === p.id) showPlanetImage(items[0], items.length);
  }catch(e){
    if (planetCurrent.id === p.id){
      $('pl-image').innerHTML = `<div class="photo-frame"><p class="muted">No se pudo cargar la foto (${esc(e.message)}).</p></div>`;
    }
  }
}

// Imagen arriba y datos debajo (columna); el título se corta en varias líneas si es largo.
function showPlanetImage(item, total){
  $('pl-image').innerHTML = `
    <div class="photo-frame"><img src="${esc(item.src)}" alt="${esc(item.title)}" loading="lazy"></div>
    <div class="image-meta">
      <span class="photo-title">${esc(item.title)}${item.date ? ` · ${esc(item.date)}` : ''}</span>
      <span class="photo-actions">
        <a href="${esc(item.href)}" target="_blank" rel="noopener">Ver en NASA</a>
        ${total > 1 ? '<button type="button" id="pl-next" class="mini">Otra foto</button>' : ''}
      </span>
    </div>`;
  const next = $('pl-next');
  if (next){
    next.addEventListener('click', () => {
      const cache = planetImages[planetCurrent.id];
      cache.index = (cache.index + 1) % cache.items.length;
      showPlanetImage(cache.items[cache.index], cache.items.length);
    });
  }
}

function initPlanets(){
  const picker = $('pl-picker');
  picker.innerHTML = PLANETS.map((p) =>
    `<button type="button" data-planet="${esc(p.id)}" aria-pressed="false">${esc(p.name)}</button>`
  ).join('');

  $('pl-exo-picker').innerHTML = EXO_EARTHS.map((p) =>
    `<button type="button" data-planet="${esc(p.id)}" aria-pressed="false">${esc(p.name)}</button>`
  ).join('');

  const pick = (e) => {
    const btn = e.target.closest('[data-planet]');
    if (!btn) return;
    const prev = planetCurrent;
    planetCurrent = ALL_PLANETS.find((p) => p.id === btn.dataset.planet);
    renderPlanetData();
    renderPlanetImage();
    if (planets3d){
      // En comparación: si se cambia de grupo (Sistema Solar ↔ exotierras) se muestra la otra
      // fila; si se elige un cuerpo de la misma fila, se pasa a verlo solo.
      const sameGroup = !!prev.exo === !!planetCurrent.exo;
      if (planets3d.mode === 'compare' && sameGroup) setPlanetMode('single');
      else if (planets3d.mode === 'compare') setPlanetMode('compare');
      planets3d.show(planetCurrent.id);
    }
  };
  picker.addEventListener('click', pick);
  $('pl-exo-picker').addEventListener('click', pick);

  $('pl-mode').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (btn) setPlanetMode(btn.dataset.mode);
  });

  renderPlanetData();
  renderPlanetImage();
}

function setPlanetMode(mode){
  setPressed($('pl-mode'), 'data-mode', mode);
  $('pl-hint').textContent = mode === 'compare'
    ? (planetCurrent.exo ? 'A escala real, junto a la Tierra' : 'A escala real: Mercurio es un punto junto a Júpiter')
    : 'Arrastra para girar · rueda o pellizco para acercar';
  if (planets3d) planets3d.setMode(mode);
}

/* ---------- El Sol y estrellas parecidas ---------- */

let starCurrent = STARS[1];
let stars3d = null;
const liveStars = [];

function renderStar(){
  const s = starCurrent;
  $('st-name').textContent = s.name;
  $('st-type').textContent = s.type;
  $('st-radius').textContent = `${num(s.radiusSun, 3)} R☉ (${bigNum(s.radiusSun * SUN_RADIUS_KM, 'km')})`;
  $('st-temp').textContent = `${num(s.tempK)} K`;
  $('st-mass').textContent = s.massSun != null ? `${num(s.massSun, 3)} M☉` : '—';
  $('st-dist').textContent = s.id === 'sun' ? '8,3 minutos luz' : `${bigNum(s.distanceLy)} años luz`;
  const ratio = s.radiusSun;
  $('st-ratio').textContent = s.id === 'sun' ? 'Es el Sol'
    : ratio >= 1 ? `${num(ratio, 2)} veces más grande` : `${num(ratio * 100)} % del tamaño del Sol`;
  $('st-volume').textContent = s.id === 'sun' ? '1,3 millones de Tierras' : `${num(ratio ** 3, ratio ** 3 < 0.1 ? 4 : 2)} × el volumen del Sol`;
  $('st-link').href = `https://simbad.cds.unistra.fr/simbad/sim-basic?Ident=${encodeURIComponent(s.simbad)}`;
  setPressed($('st-picker'), 'data-star', s.id);
  setPressed($('st-live'), 'data-star', s.id);
  if (stars3d) stars3d.show(s);
}

function initStars(){
  $('st-picker').innerHTML = STARS.map((s) =>
    `<button type="button" data-star="${esc(s.id)}" aria-pressed="false">${esc(s.name)}</button>`
  ).join('');
  const pick = (e) => {
    const btn = e.target.closest('[data-star]');
    if (!btn) return;
    starCurrent = STARS.find((s) => s.id === btn.dataset.star) || liveStars.find((s) => s.id === btn.dataset.star);
    renderStar();
  };
  $('st-picker').addEventListener('click', pick);
  $('st-live').addEventListener('click', pick);
  renderStar();
}

// Estrellas anfitrionas de exoplanetas parecidas al Sol, las más cercanas (TAP en vivo)
async function loadSunLikeHosts(){
  const query = 'select distinct top 6 hostname,st_teff,st_rad,st_mass,sy_dist from pscomppars where st_teff between 5600 and 5950 and st_rad between 0.85 and 1.15 and sy_dist is not null order by sy_dist asc';
  try{
    setState('st-status', 'Buscando estrellas anfitrionas tipo Sol…', 'loading');
    const rows = await fetchJSON(tapURL(query));
    liveStars.length = 0;
    rows.forEach((r, i) => {
      if (r.st_rad == null || r.st_teff == null) return;
      liveStars.push({
        id: `live-${i}`, name: r.hostname, radiusSun: r.st_rad, tempK: r.st_teff, massSun: r.st_mass,
        distanceLy: r.sy_dist * LY_PER_PC, type: 'Anfitriona de exoplanetas · Exoplanet Archive', simbad: r.hostname,
      });
    });
    $('st-live').innerHTML = liveStars.map((s) =>
      `<button type="button" data-star="${esc(s.id)}" aria-pressed="false">${esc(s.name)}</button>`
    ).join('');
    $('st-live-wrap').hidden = !liveStars.length;
    syncSeg($('st-live'));
    setState('st-status', `${liveStars.length} anfitrionas en vivo · actualizado ${stamp()}`, 'ok');
  }catch(e){
    setState('st-status', isCorsBlock(e)
      ? 'Se muestran estrellas curadas. Para sumar anfitrionas en vivo del Archivo de Exoplanetas, configura CONFIG.exoplanetProxy.'
      : `Anfitrionas en vivo no disponibles (${e.message}); se muestran las curadas.`, 'info');
  }
}

/* ---------- Galaxias ---------- */

let galaxy = null;
let gxReturnFocus = null;

function fmtLy(ly){
  if (!ly) return 'Estamos dentro';
  return `${bigNum(ly)} años luz`;
}

function initGalaxies(){
  $('gx-list').innerHTML = GALAXIES.map((g) => `
    <article class="card glass tilt gx-card">
      <div class="gx-thumb" data-model="${esc(g.model)}" aria-hidden="true"></div>
      <span class="tag">${esc(g.kind)}</span>
      <h3>${esc(g.name)}</h3>
      <p>${esc(g.note)}</p>
      <div class="row"><span>Distancia</span><span>${esc(fmtLy(g.distanceLy))}</span></div>
      <button type="button" class="primary" data-galaxy="${esc(g.id)}">Entrar</button>
    </article>`).join('');

  $('gx-hud-picker').innerHTML = GALAXIES.map((g) =>
    `<button type="button" data-galaxy="${esc(g.id)}" aria-pressed="false">${esc(g.name.split(' (')[0])}</button>`
  ).join('');

  const enter = (e) => {
    const btn = e.target.closest('[data-galaxy]');
    if (!btn) return;
    if (!galaxy){
      toast('Las galaxias en 3D necesitan WebGL, que no está disponible en este navegador.');
      return;
    }
    if (!document.body.classList.contains('exploring')) gxReturnFocus = btn;
    galaxy.enter(btn.dataset.galaxy);
  };
  $('gx-list').addEventListener('click', enter);
  $('gx-hud-picker').addEventListener('click', enter);
  $('explore-mw').addEventListener('click', (e) => {
    if (!galaxy){ toast('Las galaxias en 3D necesitan WebGL, que no está disponible en este navegador.'); return; }
    gxReturnFocus = e.currentTarget;
    galaxy.enter('mw');
  });
  $('gx-exit').addEventListener('click', () => galaxy && galaxy.exit());
  $('gx-zoom-in').addEventListener('click', () => galaxy && galaxy.zoomBy(0.8));
  $('gx-zoom-out').addEventListener('click', () => galaxy && galaxy.zoomBy(1.25));
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && galaxy && galaxy.current) galaxy.exit();
  });
}

// Llamado por galaxy.js cuando se entra o se sale de una galaxia
function onGalaxyState(id){
  const exploring = !!id;
  const wasExploring = document.body.classList.contains('exploring');
  document.body.classList.toggle('exploring', exploring);
  $('gx-hud').hidden = !exploring;
  $('gx-hint').hidden = !exploring;
  if (exploring){
    const g = GALAXIES.find((x) => x.id === id);
    $('gx-hud-name').textContent = g.name;
    $('gx-hud-kind').textContent = g.kind;
    $('gx-hud-note').textContent = g.note;
    $('gx-hud-dist').textContent = fmtLy(g.distanceLy);
    $('gx-hud-diam').textContent = `${bigNum(g.diameterLy)} años luz`;
    $('gx-hud-stars').textContent = g.stars;
    $('gx-hud-bh').textContent = g.bh;
    setPressed($('gx-hud-picker'), 'data-galaxy', id);
    if (!wasExploring) $('gx-hud-name').focus({ preventScroll: true });
  } else if (wasExploring && gxReturnFocus){
    gxReturnFocus.focus({ preventScroll: true });
  }
}

/* ---------- Navegación: sección activa ---------- */

function initNav(){
  const links = [...document.querySelectorAll('#nav-links a')];
  const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      links.forEach((a) => a.removeAttribute('aria-current'));
      const a = map.get(en.target.id);
      if (a){
        a.setAttribute('aria-current', 'true');
        // Mantener visible el enlace activo en la barra desplazable (móvil)
        const bar = $('nav-links');
        const target = a.offsetLeft - bar.clientWidth / 2 + a.offsetWidth / 2;
        bar.scrollTo({ left: target, behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('main section[id]').forEach((s) => io.observe(s));
}

/* ---------- Animación de entrada de secciones y fondo ---------- */

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
  }, { threshold: 0.06 });
  sections.forEach((s) => {
    s.classList.add('reveal');
    io.observe(s);
  });
}

// El fondo se atenúa al bajar para que el texto sobre el vidrio siga legible
function initBackdropFade(){
  const canvas = $('galaxy');
  let ticking = false;
  const fade = () => {
    ticking = false;
    if (document.body.classList.contains('exploring')) return;
    const k = Math.min(scrollY / (innerHeight * 1.1), 1);
    canvas.style.opacity = String(1 - k * 0.5);
  };
  addEventListener('scroll', () => {
    if (!ticking){ ticking = true; requestAnimationFrame(fade); }
  }, { passive: true });
  fade();
}

/* ---------- Escenas 3D ---------- */

function init3D(){
  // Cada escena tiene su propio contexto WebGL y solo dibuja cuando está a la vista.
  galaxy = startGalaxy($('galaxy'), { onState: onGalaxyState });
  if (galaxy){
    galaxy.bindHome(document.querySelector('.hero'));
    galaxy.bindExplore($('galaxy'));
  } else {
    $('hero-hint').textContent = 'Tu navegador no tiene WebGL activo: el fondo 3D y las escenas interactivas no están disponibles, pero los datos en vivo sí.';
  }
  // Cada escena se inicia por separado: si una falla, las demás siguen
  const safe = (name, fn) => {
    try{ return fn(); }catch(e){ console.error(`Error al iniciar la escena 3D "${name}":`, e); return null; }
  };
  bh3d = safe('agujero negro', () => startBlackHole3D($('bh-stage')));
  if (bh3d) renderBlackHole();
  planets3d = safe('planetas', () => startPlanets3D($('pl-stage'), $('pl-labels')));
  if (planets3d) planets3d.show(planetCurrent.id);
  stars3d = safe('estrellas', () => startStars3D($('st-stage'), $('st-labels')));
  if (stars3d) stars3d.show(starCurrent);

  const scenes = { bh: bh3d, pl: planets3d, st: stars3d };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-zoom]');
    if (!b) return;
    const s = scenes[b.dataset.zoom];
    if (s) s.zoomBy(b.dataset.dir === 'in' ? 0.8 : 1.25);
  });
}

/* ---------- Arranque ---------- */

function refreshAll(){
  loadISS();
  loadSpaceWeather();
  loadAlerts().catch((e) => setState('alerts-status', `No disponible (${e.message})`, 'err'));
  loadNEO().catch((e) => setState('neo-status', `No disponible (${e.message})`, 'err'));
  loadDiscoveries().catch(discoveriesFailed);
  loadAPOD();
}

/* ---------- Datos curiosos del día ---------- */

const DAY_MS = 86400000;
const dayIndex = () => Math.floor(Date.now() / DAY_MS);

// Elige `count` datos distintos del pool, cambiando cada día (el pool es de 11 elementos)
function pickDaily(pool, count){
  const base = dayIndex() * 3;
  const out = [];
  for (let i = 0; i < count; i++) out.push(pool[(base + i * 5) % pool.length]);
  return out;
}

const dailyCat = (cat) => `<span class="chip-tag">${esc(cat)}</span>`;

function dailyCard(fact, i){
  return `<article class="card daily-card" style="--i:${i}">
    ${dailyCat(fact.cat)}
    <h3>${esc(fact.title)}</h3>
    <p>${esc(fact.text)}</p>
  </article>`;
}

// Dato en vivo: un exoplaneta del tamaño de la Tierra que recibe luz parecida, tomado del Archivo
async function liveRadiationFacts(){
  const query = 'select top 30 pl_name,hostname,disc_year,pl_rade,pl_insol,pl_eqt,sy_dist from pscomppars where pl_rade between 0.8 and 1.6 and pl_insol between 0.3 and 2 and disc_year >= 2015 order by disc_year desc';
  const rows = await fetchJSON(tapURL(query));
  if (!rows.length) return [];
  const d = dayIndex();
  const picks = [rows[d % rows.length], rows[(d + 7) % rows.length]];
  const unique = picks[0] === picks[1] ? [picks[0]] : picks;
  return unique.map((r) => {
    const eqt = r.pl_eqt != null
      ? `una temperatura de equilibrio de unos ${num(r.pl_eqt - 273)} °C (sin atmósfera que la modifique)`
      : 'una temperatura de equilibrio que el Archivo no publica';
    return {
      cat: 'radiación',
      title: `${r.pl_name}: cuánta luz recibe`,
      text: `Recibe ${num(r.pl_insol, 2)} veces la energía que la Tierra recibe del Sol, con ${eqt}. Mide ${num(r.pl_rade, 2)} veces el radio de la Tierra y está a unos ${num(r.sy_dist * LY_PER_PC)} años luz. Sin traje, la falta de oxígeno te dejaría inconsciente en segundos; la radiación y la temperatura decidirían el resto, y no hay una cifra fiable para este mundo.`,
    };
  });
}

async function loadDaily(){
  const curated = pickDaily(DAILY_POOL, 3);
  $('daily-date').textContent = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
  try{
    const live = await liveRadiationFacts();
    const facts = [...live, ...curated].slice(0, 5);
    $('daily').innerHTML = facts.map(dailyCard).join('');
    setState('daily-status', live.length ? `Dos datos vienen del Archivo de Exoplanetas · ${stamp()}` : 'Datos curados de hoy', 'ok');
  }catch(e){
    // Sin conexión al Archivo: se muestran cinco datos curados, sin error en rojo
    const facts = pickDaily(DAILY_POOL, 5);
    $('daily').innerHTML = facts.map(dailyCard).join('');
    setState('daily-status', 'Datos curados de hoy. Los datos en vivo del Archivo no están disponibles ahora.', 'ok');
  }
}

function renderLifeWorlds(){
  $('life-grid').innerHTML = LIFE_WORLDS.map((w, i) => `
    <article class="card life-card" style="--i:${i}">
      <h3>${esc(w.name)} <span class="muted">· ${esc(w.body)}</span></h3>
      <p>${esc(w.why)}</p>
      <div class="row"><span>Estado</span><span>${esc(w.status)}</span></div>
    </article>`).join('');
}

// Vuelve a pedir las tarjetas que muestran un error (el estado tiene la clase .err)
function retryFailedCards(){
  const retries = [
    ['iss-status', loadISS],
    ['sw-status', loadSpaceWeather],
    ['alerts-status', loadAlerts],
    ['neo-status', loadNEO],
    ['disc-status', loadDiscoveries],
    ['apod-status', loadAPOD],
  ];
  retries.forEach(([id, load]) => {
    if ($(id).classList.contains('err')) Promise.resolve().then(load).catch(() => {});
  });
}

function init(){
  initNotifyButton();
  initPressFeedback();
  initBlackHoles();
  initPlanets();
  initStars();
  initGalaxies();
  initNav();
  initReveal();
  initBackdropFade();
  initTilt();
  drawISSGlobe();
  try{
    init3D();
  }catch(e){
    // Un fallo en una escena 3D nunca debe tumbar los datos en vivo
    console.error('Error al iniciar las escenas 3D:', e);
  }
  document.querySelectorAll('.seg').forEach(syncSeg);

  $('refresh').addEventListener('click', refreshAll);
  $('disc-link').addEventListener('click', () => {
    const names = Array.from(document.querySelectorAll('.disc h3')).map((h) => h.textContent);
    store('seenPlanets', names);
    $('disc-count').hidden = true;
    document.querySelectorAll('.disc.is-new').forEach((el) => el.classList.remove('is-new'));
    document.querySelectorAll('.disc .badge').forEach((el) => el.remove());
  });

  refreshAll();
  loadSunLikeHosts();
  renderLifeWorlds();
  loadDaily();
  setInterval(loadDaily, 60 * 60 * 1000);
  // Reintento automático: cualquier tarjeta en error se vuelve a cargar cada 30 s,
  // sin esperar al ciclo largo ni obligar a recargar la página
  setInterval(retryFailedCards, 30 * 1000);
  setInterval(loadISS, CONFIG.intervals.iss);
  setInterval(() => { loadSpaceWeather(); loadAlerts().catch(() => {}); }, CONFIG.intervals.space);
  setInterval(() => {
    loadNEO().catch(() => {});
    loadDiscoveries().catch(discoveriesFailed);
    loadAPOD();
  }, CONFIG.intervals.neo);
}

init();
