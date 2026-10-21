// Utilidades compartidas por las escenas 3D (galaxia, agujero negro, planetas, estrellas).
// Sin módulos: expone funciones globales. Three.js r160 no trae OrbitControls en el build
// clásico (los addons de r160 son módulos ES), así que aquí hay un control orbital propio,
// pequeño, con inercia y resortes críticamente amortiguados (estilo Apple: interrumpible,
// sigue al dedo 1:1 y hereda la velocidad al soltar).

const VIEWER_REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ¿Hay WebGL? Se prueba una sola vez con un canvas temporal que luego se descarta.
const webglAvailable = (() => {
  let ok = null;
  return () => {
    if (ok !== null) return ok;
    try{
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      ok = !!(window.THREE && gl);
      const lose = gl && gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }catch(_){ ok = false; }
    return ok;
  };
})();

// Muestra un aviso en español en lugar de la escena 3D.
function showViewerFallback(stage, text){
  const canvas = stage.querySelector('canvas');
  if (canvas) canvas.hidden = true;
  let msg = stage.querySelector('.stage-fallback');
  if (!msg){
    msg = document.createElement('p');
    msg.className = 'stage-fallback';
    stage.appendChild(msg);
  }
  msg.textContent = text;
  msg.hidden = false;
}

const NO_WEBGL_TEXT = 'Tu navegador no tiene WebGL activo (o la tarjeta gráfica lo bloqueó), así que esta escena 3D no se puede mostrar. Los datos de abajo siguen funcionando. Prueba activar la aceleración por hardware o usar otro navegador.';

// Crea un WebGLRenderer limitado en densidad de píxeles. Devuelve null si falla.
function createRenderer(canvas, { alpha = false, antialias = true, maxDpr = 1.75 } = {}){
  if (!webglAvailable()) return null;
  try{
    const r = new THREE.WebGLRenderer({ canvas, alpha, antialias, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, maxDpr));
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      const stage = canvas.closest('.stage');
      if (stage) showViewerFallback(stage, 'Se perdió el contexto gráfico (WebGL). Recarga la página para volver a ver la escena 3D.');
    });
    return r;
  }catch(_){
    return null;
  }
}

// Resorte críticamente amortiguado (amortiguación 1.0). "response" en segundos, como en
// las APIs de Apple: no es una duración fija, es qué tan rápido llega al objetivo.
// Siempre parte del valor actual, así que se puede redirigir en cualquier momento.
function springTo(s, dt, response){
  const w = (2 * Math.PI) / response;
  // Subpasos para que sea estable aunque un cuadro tarde mucho
  const n = Math.max(1, Math.ceil(dt / 0.008));
  const h = dt / n;
  for (let i = 0; i < n; i++){
    const a = w * w * (s.target - s.x) - 2 * w * s.v;
    s.v += a * h;
    s.x += s.v * h;
  }
}

// Control orbital: yaw/pitch/dist con inercia al soltar, zoom con rueda y pellizco,
// teclado (flechas, + y -). bind(el) engancha eventos a cualquier elemento.
function createOrbit(opts){
  const o = Object.assign({
    yaw: 0, pitch: 0.3, dist: 5,
    minDist: 1.5, maxDist: 30, minPitch: -1.35, maxPitch: 1.35,
    rotateSpeed: 0.006, autoRotate: 0, zoomResponse: 0.35,
  }, opts);

  const state = {
    yaw: { x: o.yaw, v: 0, target: o.yaw, spring: false },
    pitch: { x: o.pitch, v: 0, target: o.pitch, spring: false },
    dist: { x: o.dist, v: 0, target: o.dist, spring: false },
    dragging: false,
    lastInput: 0,
  };
  const pointers = new Map();
  let pinchStart = 0, pinchDist = 0;
  let history = [];

  const clampPitch = (p) => Math.max(o.minPitch, Math.min(o.maxPitch, p));
  const clampDist = (d) => Math.max(o.minDist, Math.min(o.maxDist, d));

  function zoomBy(factor){
    state.dist.target = clampDist(state.dist.target * factor);
    state.dist.spring = true;
    state.lastInput = performance.now();
  }

  function onDown(e){
    if (o.enabled && !o.enabled()) return;
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    // Los controles dentro de la escena (botones, enlaces) no inician un arrastre
    if (e.target.closest && e.target.closest('a,button,input,select,textarea,summary,label')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try{ e.currentTarget.setPointerCapture(e.pointerId); }catch(_){}
    state.dragging = true;
    // Agarrar algo en movimiento lo detiene en seco (interrumpible)
    state.yaw.v = state.pitch.v = 0;
    state.yaw.spring = state.pitch.spring = false;
    history = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
    if (pointers.size === 2){
      const [a, b] = [...pointers.values()];
      pinchStart = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      pinchDist = state.dist.target;
    }
    e.currentTarget.classList.add('is-grabbing');
    state.lastInput = performance.now();
  }

  function onMove(e){
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size >= 2){
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      state.dist.target = clampDist(pinchDist * (pinchStart / d));
      state.dist.spring = true;
      return;
    }
    // 1:1 con el puntero
    state.yaw.x -= dx * o.rotateSpeed;
    state.pitch.x = clampPitch(state.pitch.x + dy * o.rotateSpeed);
    state.yaw.target = state.yaw.x;
    state.pitch.target = state.pitch.x;
    const now = performance.now();
    history.push({ t: now, x: e.clientX, y: e.clientY });
    while (history.length > 2 && now - history[0].t > 100) history.shift();
    state.lastInput = now;
  }

  function onUp(e){
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size) return;
    state.dragging = false;
    e.currentTarget.classList.remove('is-grabbing');
    // Hereda la velocidad del gesto (rad/s) para que no haya costura al soltar
    if (history.length > 1 && !VIEWER_REDUCED){
      const a = history[0], b = history[history.length - 1];
      const dt = Math.max((b.t - a.t) / 1000, 0.016);
      state.yaw.v = -((b.x - a.x) / dt) * o.rotateSpeed;
      state.pitch.v = ((b.y - a.y) / dt) * o.rotateSpeed;
    }
  }

  function onWheel(e){
    if (o.enabled && !o.enabled()) return;
    e.preventDefault();
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomBy(Math.exp(delta * 0.0015));
  }

  function onKey(e){
    if (o.enabled && !o.enabled()) return;
    const step = 0.12;
    let used = true;
    o.response = 0.4;
    switch (e.key){
      case 'ArrowLeft': state.yaw.target = state.yaw.x + step; state.yaw.spring = true; break;
      case 'ArrowRight': state.yaw.target = state.yaw.x - step; state.yaw.spring = true; break;
      case 'ArrowUp': state.pitch.target = clampPitch(state.pitch.x - step); state.pitch.spring = true; break;
      case 'ArrowDown': state.pitch.target = clampPitch(state.pitch.x + step); state.pitch.spring = true; break;
      case '+': case '=': zoomBy(0.85); break;
      case '-': case '_': zoomBy(1 / 0.85); break;
      default: used = false;
    }
    if (used){ e.preventDefault(); state.lastInput = performance.now(); }
  }

  function bind(el, { wheel = true, keys = true } = {}){
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('lostpointercapture', onUp);
    if (wheel) el.addEventListener('wheel', onWheel, { passive: false });
    if (keys) el.addEventListener('keydown', onKey);
  }

  // Avanza la simulación. Devuelve true si algo se movió.
  function update(dt){
    const before = state.yaw.x + state.pitch.x * 7 + state.dist.x * 13;
    const idle = !state.dragging && performance.now() - state.lastInput > 2500;
    for (const key of ['yaw', 'pitch']){
      const s = state[key];
      if (state.dragging) continue;
      if (s.spring){
        springTo(s, dt, o.response || 0.45);
        if (Math.abs(s.target - s.x) < 1e-4 && Math.abs(s.v) < 1e-4) s.spring = false;
      } else {
        // Inercia con desaceleración exponencial (como el scroll de iOS)
        s.x += s.v * dt;
        s.v *= Math.pow(0.04, dt);
        s.target = s.x;
      }
    }
    // Rebote suave en los límites de inclinación
    const p = state.pitch;
    if (p.x > o.maxPitch || p.x < o.minPitch){
      p.target = clampPitch(p.x); p.spring = true;
    }
    if (o.autoRotate && idle && !VIEWER_REDUCED && !state.yaw.spring) state.yaw.x += o.autoRotate * dt;
    springTo(state.dist, dt, state.dist.response || o.zoomResponse);
    const after = state.yaw.x + state.pitch.x * 7 + state.dist.x * 13;
    return Math.abs(after - before) > 1e-6;
  }

  // Animación programática (por ejemplo, el vuelo hacia una galaxia)
  function flyTo({ yaw, pitch, dist }, response){
    if (yaw !== undefined){
      // Elige el giro más corto
      let t = yaw;
      while (t - state.yaw.x > Math.PI) t -= Math.PI * 2;
      while (t - state.yaw.x < -Math.PI) t += Math.PI * 2;
      state.yaw.target = t; state.yaw.spring = true;
    }
    if (pitch !== undefined){ state.pitch.target = clampPitch(pitch); state.pitch.spring = true; }
    if (dist !== undefined){ state.dist.target = clampDist(dist); state.dist.response = response; }
    o.response = response || 0.45;
  }

  function jumpTo({ yaw, pitch, dist }){
    if (yaw !== undefined){ state.yaw.x = state.yaw.target = yaw; state.yaw.v = 0; }
    if (pitch !== undefined){ state.pitch.x = state.pitch.target = pitch; state.pitch.v = 0; }
    if (dist !== undefined){ state.dist.x = state.dist.target = dist; state.dist.v = 0; }
  }

  function setLimits(lim){
    Object.assign(o, lim);
    state.dist.target = clampDist(state.dist.target);
  }

  // Posición de la cámara en coordenadas esféricas alrededor de "center"
  function apply(camera, center){
    const { yaw, pitch, dist } = state;
    const cp = Math.cos(pitch.x);
    camera.position.set(
      center.x + dist.x * cp * Math.sin(yaw.x),
      center.y + dist.x * Math.sin(pitch.x),
      center.z + dist.x * cp * Math.cos(yaw.x),
    );
    camera.lookAt(center);
  }

  return { state, bind, update, apply, flyTo, jumpTo, zoomBy, setLimits, options: o };
}

// Bucle de render que solo corre mientras el elemento está en pantalla y la pestaña visible.
function createLoop(el, frame){
  let visible = false, running = false, last = 0, raf = 0;
  function tick(t){
    if (!visible || document.hidden){ running = false; return; }
    const dt = Math.min((t - (last || t)) / 1000, 0.05);
    last = t;
    frame(dt, t / 1000);
    raf = requestAnimationFrame(tick);
  }
  function start(){
    if (running || !visible || document.hidden) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(tick);
  }
  if ('IntersectionObserver' in window){
    new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1].isIntersecting;
      if (visible) start();
    }, { rootMargin: '120px' }).observe(el);
  } else {
    visible = true;
    start();
  }
  document.addEventListener('visibilitychange', start);
  return { start, stop(){ visible = false; cancelAnimationFrame(raf); running = false; }, get visible(){ return visible; } };
}

// Ajusta el tamaño del renderer al de su contenedor (ResizeObserver).
// Si el es window, usa el tamaño de la ventana.
function autoResize(renderer, camera, el, onResize){
  const isWin = el === window;
  function resize(){
    const w = Math.max(isWin ? innerWidth : el.clientWidth, 1);
    const h = Math.max(isWin ? innerHeight : el.clientHeight, 1);
    renderer.setSize(w, h, false);
    if (camera && camera.isPerspectiveCamera){
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    if (onResize) onResize(w, h);
  }
  if (!isWin && 'ResizeObserver' in window) new ResizeObserver(resize).observe(el);
  else addEventListener('resize', resize);
  resize();
  return resize;
}

// Textura de resplandor radial (para halos y coronas) generada en un canvas 2D.
function glowTexture(stops, size = 256){
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const half = size / 2;
  const grad = g.createRadialGradient(half, half, 0, half, half, half);
  stops.forEach(([o, col]) => grad.addColorStop(o, col));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Color aproximado de un cuerpo negro (aproximación de Tanner Helland), en sRGB 0–1.
function blackbodyRGB(kelvin){
  const t = Math.max(1000, Math.min(40000, kelvin)) / 100;
  let r, g, b;
  if (t <= 66){
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const c = (v) => Math.max(0, Math.min(255, v)) / 255;
  return [c(r), c(g), c(b)];
}

// Ruido de valor GLSL compartido (hash + ruido 3D + fbm), usado por varios shaders.
const GLSL_NOISE = `
float hash13(vec3 p){
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 x){
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1.0,0.0,0.0)), f.x),
        mix(hash13(i + vec3(0.0,1.0,0.0)), hash13(i + vec3(1.0,1.0,0.0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0.0,0.0,1.0)), hash13(i + vec3(1.0,0.0,1.0)), f.x),
        mix(hash13(i + vec3(0.0,1.0,1.0)), hash13(i + vec3(1.0,1.0,1.0)), f.x), f.y),
    f.z);
}
float fbm5(vec3 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.02 + 7.13; a *= 0.5; }
  return s;
}
float fbm3(vec3 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++){ s += a * vnoise(p); p = p * 2.03 + 3.7; a *= 0.5; }
  return s;
}
`;
