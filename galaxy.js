// Fondo 3D interactivo con cuatro galaxias procedurales (Three.js).
// Expone startGalaxy(canvas, { onState }) → API { enter(id), exit(), bindHome(el), bindExplore(el) }.
//
// - Vía Láctea: espiral barrada (barra + 4 brazos logarítmicos).
// - Andrómeda: espiral de brazos cerrados con anillo de formación estelar y satélites.
// - M87: elíptica gigante (perfil de Hernquist), cúmulos globulares y chorro relativista.
// - Sombrero: bulbo enorme, disco delgado y anillo de polvo, casi de canto.
// Las partículas usan un shader propio: tamaño por estrella, núcleo + halo suave, centelleo
// y una capa de "neblina" de partículas grandes y tenues que da el brillo difuso del disco.
// El polvo se dibuja con mezcla normal (oscurece), las estrellas con mezcla aditiva.

const GAL_VERT = `
attribute float aSize;
attribute vec3 aColor;
attribute float aSeed;
uniform float uTime;
uniform float uScale;
uniform float uTwinkle;
varying vec3 vColor;
varying float vAlpha;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float size = aSize * uScale / max(-mv.z, 0.1);
  // Las partículas menores que un píxel se agrandan pero se atenúan (sin parpadeo)
  float a = clamp(size / 1.5, 0.0, 1.0);
  size = clamp(size, 1.5, 96.0);
  float tw = 1.0 + uTwinkle * 0.22 * sin(uTime * (1.5 + aSeed * 3.0) + aSeed * 60.0);
  vColor = aColor * tw;
  vAlpha = a;
  gl_PointSize = size;
  gl_Position = projectionMatrix * mv;
}`;

const GAL_FRAG = `
precision highp float;
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d2 = dot(c, c) * 4.0;
  if (d2 > 1.0) discard;
  // núcleo nítido + halo gaussiano suave
  float k = exp(-d2 * 9.0) + 0.3 * exp(-d2 * 2.5);
  k *= 1.0 - d2;
  gl_FragColor = vec4(vColor * k * vAlpha * uOpacity, k * vAlpha * uOpacity);
}`;

function startGalaxy(canvas, { onState } = {}){
  const renderer = createRenderer(canvas, { alpha: true, antialias: false, maxDpr: 1.75 });
  if (!renderer){
    canvas.style.display = 'none';
    document.documentElement.classList.add('no-webgl');
    return null;
  }
  const T = THREE;
  renderer.setClearColor(0x000000, 0);

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(50, 1, 0.05, 2000);
  const small = Math.min(innerWidth, innerHeight) < 700;
  const DENSITY = small ? 0.5 : 1;   // menos partículas en móviles

  const gauss = () => {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const tmp = new T.Color();
  const col = (hex) => new T.Color(hex);

  const timeUniform = { value: 0 };
  const scaleUniform = { value: 300 };
  const twinkleUniform = { value: VIEWER_REDUCED ? 0 : 1 };
  const disposables = [];

  // Crea una nube de puntos a partir de una función generadora p(i) → {x,y,z,c,b,s}
  function cloud(count, gen, { dust = false, opacity = 1 } = {}){
    count = Math.max(1, Math.round(count * DENSITY));
    const pos = new Float32Array(count * 3);
    const color = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++){
      const p = gen(i);
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      color[i * 3] = p.c.r * p.b; color[i * 3 + 1] = p.c.g * p.b; color[i * 3 + 2] = p.c.b * p.b;
      size[i] = p.s;
      seed[i] = Math.random();
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new T.BufferAttribute(color, 3));
    geo.setAttribute('aSize', new T.BufferAttribute(size, 1));
    geo.setAttribute('aSeed', new T.BufferAttribute(seed, 1));
    const mat = new T.ShaderMaterial({
      vertexShader: GAL_VERT,
      fragmentShader: GAL_FRAG,
      uniforms: {
        uTime: timeUniform, uScale: scaleUniform,
        uTwinkle: dust ? { value: 0 } : twinkleUniform,
        uOpacity: { value: opacity },
      },
      transparent: true,
      depthWrite: false,
      // Polvo: mezcla que oscurece (resta luz) en vez de sumar
      blending: dust ? T.CustomBlending : T.AdditiveBlending,
      blendEquation: T.AddEquation,
      blendSrc: dust ? T.ZeroFactor : T.OneFactor,
      blendDst: dust ? T.OneMinusSrcAlphaFactor : T.OneFactor,
    });
    disposables.push(geo, mat);
    const pts = new T.Points(geo, mat);
    pts.frustumCulled = false;
    pts.userData.order = dust ? 2 : 0;
    return pts;
  }

  function coreGlow(color, scale, opacity = 1){
    const tex = glowTexture([[0, color], [0.25, color.replace(/[\d.]+\)$/, '0.35)')], [1, color.replace(/[\d.]+\)$/, '0)')]]);
    const mat = new T.SpriteMaterial({ map: tex, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity });
    disposables.push(tex, mat);
    const s = new T.Sprite(mat);
    s.scale.set(scale, scale, 1);
    s.userData.order = 1;
    return s;
  }

  // ---------- Modelos ----------

  // Espiral logarítmica: θ(r) = θ0 + ln(r/r0)/tan(pitch)
  function spiral({ R, arms, pitchDeg, r0, armColor, coreColor, knotColor, counts, armWidth = 0.32, ring = 0, barLen = 0 }){
    const g = new T.Group();
    const k = 1 / Math.tan(pitchDeg * Math.PI / 180);
    const armAngle = (r, arm) => arm.offset + Math.log(Math.max(r, r0) / r0) * k;
    const armList = Array.from({ length: arms.length }, (_, i) => ({ offset: arms[i].offset, w: arms[i].weight }));
    const totalW = armList.reduce((a, b) => a + b.w, 0);
    const pickArm = () => {
      let x = Math.random() * totalW;
      for (const a of armList){ if ((x -= a.w) <= 0) return a; }
      return armList[0];
    };
    // radio con disco exponencial
    const expR = (scale) => {
      let r;
      do { r = -Math.log(1 - Math.random()) * scale; } while (r > R);
      return r;
    };

    // Estrellas del disco: 75 % en brazos, 25 % repartidas
    g.add(cloud(counts.disk, () => {
      let r = expR(R * 0.33);
      // Dentro de r0 no hay brazos: estrellas repartidas (antes se apilaban en un anillo)
      const inArm = r > r0 && Math.random() < 0.75;
      if (ring && Math.random() < 0.25) r = ring + gauss() * 0.35;
      let th;
      if (inArm){
        const a = pickArm();
        th = armAngle(r, a) + gauss() * armWidth * (0.35 + r / R);
      } else {
        th = Math.random() * Math.PI * 2;
      }
      const rr = r + gauss() * 0.12;
      const t = Math.min(r / R, 1);
      tmp.copy(coreColor).lerp(armColor, Math.min(t * 1.6, 1));
      return {
        x: Math.cos(th) * rr, z: Math.sin(th) * rr,
        y: gauss() * (0.06 + 0.1 * (1 - t)),
        c: tmp, b: (inArm ? 0.55 : 0.32) * (0.5 + Math.random() * 0.7) * (1.1 - t * 0.5),
        s: 0.03 + Math.random() * 0.035,
      };
    }));

    // Regiones HII y cúmulos jóvenes (rosados y azules) sobre los brazos
    g.add(cloud(counts.knots, () => {
      const a = pickArm();
      const r = r0 + Math.random() * (R - r0) * 0.9;
      const th = armAngle(r, a) + gauss() * 0.12;
      const pink = Math.random() < 0.55;
      return {
        x: Math.cos(th) * r + gauss() * 0.06, z: Math.sin(th) * r + gauss() * 0.06, y: gauss() * 0.04,
        c: pink ? knotColor : col('#bcd4ff'), b: 0.4 + Math.random() * 0.4,
        s: 0.06 + Math.random() * 0.1,
      };
    }));

    // Polvo: en el borde interno (cóncavo) de cada brazo
    g.add(cloud(counts.dust, () => {
      const a = pickArm();
      const r = r0 * 1.6 + Math.random() * (R - r0 * 1.6) * 0.9;
      const th = armAngle(r, a) - 0.22 + gauss() * 0.07;
      return {
        x: Math.cos(th) * r, z: Math.sin(th) * r, y: gauss() * 0.03,
        c: col('#2a1a10'), b: 1, s: 0.14 + Math.random() * 0.14,
      };
    }, { dust: true, opacity: 0.32 }));

    // Neblina difusa: partículas grandes y tenues siguiendo los brazos
    g.add(cloud(counts.haze, () => {
      const a = pickArm();
      const r = r0 * 0.8 + expR(R * 0.4);
      const th = armAngle(r, a) + gauss() * 0.4;
      tmp.copy(coreColor).lerp(armColor, Math.min(r / R * 1.5, 1));
      return {
        x: Math.cos(th) * r, z: Math.sin(th) * r, y: gauss() * 0.08,
        c: tmp, b: 0.05, s: 0.6 + Math.random() * 0.6,
      };
    }));

    // Bulbo
    g.add(cloud(counts.bulge, () => {
      const s = r0 * 0.55;
      return {
        x: gauss() * s, y: gauss() * s * 0.6, z: gauss() * s,
        c: coreColor, b: 0.35 + Math.random() * 0.35, s: 0.03 + Math.random() * 0.03,
      };
    }));

    // Barra central (solo espirales barradas)
    if (barLen){
      g.add(cloud(counts.bar, () => {
        const x = gauss() * barLen * 0.45;
        return {
          x, z: gauss() * barLen * 0.13, y: gauss() * 0.07,
          c: coreColor, b: 0.3 + Math.random() * 0.3, s: 0.035 + Math.random() * 0.03,
        };
      }));
    }

    g.add(coreGlow('rgba(255,226,180,1)', r0 * 3.2, 0.7));
    return g;
  }

  function milkyWay(){
    const g = spiral({
      R: 6.2, r0: 1.25, pitchDeg: 13,
      arms: [
        { offset: 0, weight: 1 }, { offset: Math.PI, weight: 1 },
        { offset: Math.PI / 2, weight: 0.55 }, { offset: Math.PI * 1.5, weight: 0.55 },
      ],
      armColor: col('#9cc0ff'), coreColor: col('#ffd8a0'), knotColor: col('#ff9ec7'),
      counts: { disk: 80000, knots: 2200, dust: 9000, haze: 3500, bulge: 9000, bar: 9000 },
      barLen: 2.6,
    });
    return g;
  }

  function andromeda(){
    const g = spiral({
      R: 7.5, r0: 1.0, pitchDeg: 8,
      arms: [{ offset: 0.4, weight: 1 }, { offset: 0.4 + Math.PI, weight: 1 }],
      armColor: col('#c8d6ff'), coreColor: col('#ffe2b0'), knotColor: col('#ffb0d0'),
      counts: { disk: 55000, knots: 1400, dust: 8000, haze: 3000, bulge: 12000 },
      armWidth: 0.42, ring: 5.2,
    });
    // Satélites: M32 (compacta) y NGC 205 (alargada)
    const m32 = cloud(1500, () => ({ x: gauss() * 0.18 + 2.2, y: gauss() * 0.18 + 0.6, z: gauss() * 0.18 + 1.4, c: col('#ffe0b8'), b: 0.7, s: 0.03 }));
    const n205 = cloud(2500, () => ({ x: gauss() * 0.25 - 3.5, y: gauss() * 0.6 + 2.6, z: gauss() * 0.3 - 3.2, c: col('#ffe6c4'), b: 0.45, s: 0.03 }));
    g.add(m32, n205);
    return g;
  }

  function elliptical(){
    const g = new T.Group();
    const a = 1.1;
    // Perfil de Hernquist: r = a·√u / (1 - √u)
    g.add(cloud(60000, () => {
      let r;
      do { const s = Math.sqrt(Math.random()); r = a * s / (1 - s); } while (r > 9);
      const v = new T.Vector3(gauss(), gauss() * 0.88, gauss()).normalize().multiplyScalar(r);
      tmp.set('#ffe0b0').lerp(col('#ffc890'), Math.random() * 0.5);
      return { x: v.x, y: v.y, z: v.z, c: tmp, b: 0.3 + 0.3 * Math.exp(-r / 2), s: 0.035 + Math.random() * 0.03 };
    }));
    // Halo de cúmulos globulares (M87 tiene unos 12 000)
    g.add(cloud(1800, () => {
      const v = new T.Vector3(gauss(), gauss(), gauss()).normalize().multiplyScalar(2 + Math.random() * 10);
      return { x: v.x, y: v.y, z: v.z, c: col('#fff0d8'), b: 1.1, s: 0.07 };
    }));
    // Neblina central
    g.add(cloud(5000, () => {
      const v = new T.Vector3(gauss(), gauss() * 0.88, gauss()).multiplyScalar(1.4);
      return { x: v.x, y: v.y, z: v.z, c: col('#ffd8a8'), b: 0.022, s: 0.7 + Math.random() * 0.6 };
    }));
    // Chorro relativista: estrecho, con nudos brillantes, azulado (sincrotrón)
    g.add(cloud(4000, () => {
      const t = Math.pow(Math.random(), 0.8);
      const len = 5.5 * t;
      const knot = 0.5 + 0.5 * Math.cos(len * 6.0);
      const w = 0.02 + len * 0.025;
      return { x: len, y: gauss() * w, z: gauss() * w, c: col('#9fc4ff'), b: (0.5 + knot) * (1.2 - t * 0.6), s: 0.04 + Math.random() * 0.03 };
    }));
    g.children[g.children.length - 1].rotation.set(0.3, 0.6, 0.2);
    g.add(coreGlow('rgba(255,230,190,1)', 4.5, 1));
    return g;
  }

  function sombrero(){
    const g = new T.Group();
    // Bulbo enorme y achatado
    g.add(cloud(32000, () => {
      let r;
      do { const s = Math.sqrt(Math.random()); r = 0.9 * s / (1 - s); } while (r > 5.5);
      const v = new T.Vector3(gauss(), gauss() * 0.72, gauss()).normalize().multiplyScalar(r);
      return { x: v.x, y: v.y, z: v.z, c: col('#ffe4bc'), b: 0.42 + 0.5 * Math.exp(-r / 1.4), s: 0.035 + Math.random() * 0.03 };
    }));
    // Disco delgado con anillo brillante
    g.add(cloud(26000, () => {
      const r = Math.random() < 0.6 ? 4.6 + gauss() * 0.5 : 1.5 + Math.random() * 4.5;
      const th = Math.random() * Math.PI * 2;
      return { x: Math.cos(th) * r, z: Math.sin(th) * r, y: gauss() * 0.05, c: col('#ffeacc'), b: 0.4 + Math.random() * 0.3, s: 0.03 + Math.random() * 0.03 };
    }));
    // Anillo de polvo oscuro (la "ala" del sombrero)
    g.add(cloud(16000, () => {
      const r = 4.5 + gauss() * 0.35;
      const th = Math.random() * Math.PI * 2;
      return { x: Math.cos(th) * r, z: Math.sin(th) * r, y: gauss() * 0.05, c: col('#1a0f08'), b: 1, s: 0.16 + Math.random() * 0.12 };
    }, { dust: true, opacity: 0.55 }));
    g.add(coreGlow('rgba(255,236,200,1)', 5, 1));
    return g;
  }

  // Posiciones ilustrativas (no a escala) y orientación de cada disco
  const MODELS = {
    mw: { build: milkyWay, pos: [0, 0, 0], rot: [0, 0, 0], scale: 1, view: { yaw: 0.35, pitch: 0.55, dist: 9.5 }, spin: 0.035 },
    m31: { build: andromeda, pos: [-95, 30, -150], rot: [1.15, 0.4, 0.5], scale: 1.1, view: { yaw: 0.2, pitch: 0.18, dist: 14 }, spin: 0.02 },
    m87: { build: elliptical, pos: [130, -22, -240], rot: [0, 0, 0], scale: 1.2, view: { yaw: -0.4, pitch: 0.12, dist: 15 }, spin: 0.008 },
    m104: { build: sombrero, pos: [70, 44, -120], rot: [0.12, 0, 0.2], scale: 1, view: { yaw: 0.05, pitch: 0.1, dist: 11.5 }, spin: 0.015 },
  };
  const groups = {};
  for (const [id, m] of Object.entries(MODELS)){
    const holder = new T.Group();           // orientación fija
    holder.position.set(...m.pos);
    holder.rotation.set(...m.rot);
    holder.scale.setScalar(m.scale);
    const spinG = m.build();                // gira sobre su eje
    holder.add(spinG);
    scene.add(holder);
    groups[id] = { holder, spin: spinG, model: m };
  }

  // Estrellas de fondo: esfera que acompaña a la cámara (nunca se atraviesa)
  const sky = cloud(small ? 3000 : 6000, () => {
    const v = new T.Vector3(gauss(), gauss(), gauss()).normalize().multiplyScalar(600);
    const temp = 3500 + Math.pow(Math.random(), 2) * 9000;
    const [r, gg, b] = blackbodyRGB(temp);
    tmp.setRGB(r, gg, b);
    return { x: v.x, y: v.y, z: v.z, c: tmp, b: 0.35 + Math.random() * 0.65, s: 0.6 + Math.random() * 1.0 };
  });
  scene.add(sky);

  // ---------- Cámara ----------
  const HOME = { yaw: 0, pitch: 0.95, dist: 15 };
  const orbit = createOrbit({
    ...HOME, minDist: 3, maxDist: 40, minPitch: -1.4, maxPitch: 1.45, rotateSpeed: 0.004,
    enabled: () => true,
  });
  // Centro de la órbita: también con resortes para el vuelo entre galaxias
  const center = {
    x: { x: 0, v: 0, target: 0 }, y: { x: 1.2, v: 0, target: 1.2 }, z: { x: 0, v: 0, target: 0 },
  };
  const centerVec = new T.Vector3();
  let current = null;           // id de la galaxia en exploración, o null en modo fondo
  let flightResponse = 1.6;
  let mx = 0, my = 0, px = 0, py = 0;
  const viewShift = { x: 0, v: 0, target: 0 };

  function homeDist(){
    // En pantallas verticales se aleja la cámara para que la galaxia entre completa
    return camera.aspect < 1 ? HOME.dist / camera.aspect * 0.8 : HOME.dist;
  }

  autoResize(renderer, camera, window, () => {
    scaleUniform.value = renderer.domElement.height * 0.9;
    if (!current) orbit.jumpTo({ dist: homeDist() });
    orbit.setLimits({ maxDist: Math.max(40, homeDist() * 1.3) });
  });

  if (!VIEWER_REDUCED){
    addEventListener('pointermove', (e) => {
      mx = e.clientX / innerWidth * 2 - 1;
      my = e.clientY / innerHeight * 2 - 1;
    }, { passive: true });
  }

  function setCenter(p, instant){
    ['x', 'y', 'z'].forEach((k, i) => {
      center[k].target = p[i];
      if (instant){ center[k].x = p[i]; center[k].v = 0; }
    });
  }

  function enter(id){
    const g = groups[id];
    if (!g) return;
    current = id;
    const m = g.model;
    flightResponse = 1.6;
    setCenter(m.pos, VIEWER_REDUCED);
    // En pantallas verticales la cámara se aleja para que la galaxia entre a lo ancho
    const portrait = camera.aspect < 1 ? Math.min(2, 0.85 / camera.aspect) : 1;
    const view = { yaw: m.view.yaw, pitch: m.view.pitch, dist: m.view.dist * m.scale * portrait };
    if (VIEWER_REDUCED) orbit.jumpTo(view);
    else orbit.flyTo(view, flightResponse);
    orbit.setLimits({ minDist: 2.5 * m.scale, maxDist: 40 });
    if (onState) onState(id);
  }

  function exit(){
    current = null;
    setCenter([0, 1.2, 0], VIEWER_REDUCED);
    const view = { ...HOME, dist: homeDist() };
    if (VIEWER_REDUCED) orbit.jumpTo(view);
    else orbit.flyTo(view, 1.3);
    orbit.setLimits({ minDist: 3 });
    if (onState) onState(null);
  }

  // Las galaxias se dibujan de la más lejana a la más cercana, y dentro de cada una
  // primero estrellas, luego núcleo y por último polvo: así el polvo de una galaxia
  // lejana no oscurece a la que está delante.
  const ordered = Object.values(groups);
  function sortGalaxies(){
    const cp = camera.position;
    ordered.sort((a, b) => b.holder.position.distanceToSquared(cp) - a.holder.position.distanceToSquared(cp));
    ordered.forEach((g, rank) => {
      g.holder.traverse((o) => { o.renderOrder = rank * 10 + (o.userData.order || 0); });
    });
  }

  // ---------- Bucle ----------
  // El fondo siempre está a la vista; se baja a ~30 fps cuando el usuario está leyendo
  // más abajo y no está explorando, para no competir con las otras escenas 3D.
  let frameSkip = 0, lastT = performance.now();
  function frame(now){
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const deep = !current && scrollY > innerHeight * 1.2;
    if (deep && (frameSkip++ % 2)) return;
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;

    if (!VIEWER_REDUCED){
      timeUniform.value += dt;
      for (const g of Object.values(groups)) g.spin.rotation.y += dt * g.model.spin;
    }
    orbit.update(dt);
    let speed = 0;
    for (const k of ['x', 'y', 'z']){
      springTo(center[k], dt, flightResponse);
      speed += center[k].v * center[k].v;
    }
    centerVec.set(center.x.x, center.y.x, center.z.x);
    orbit.apply(camera, centerVec);

    // Paralaje suave con el puntero (solo en modo fondo)
    if (!current && !VIEWER_REDUCED){
      px += (mx * 0.9 - px) * 0.04;
      py += (my * -0.6 - py) * 0.04;
      camera.position.x += px;
      camera.position.y += py;
      camera.lookAt(centerVec);
    }
    // Al viajar rápido se abre un poco el campo de visión (sensación de velocidad)
    const fov = 50 + Math.min(Math.sqrt(speed) * 0.12, 16);
    // Al explorar, el panel inferior tapa parte de la vista: se corre el encuadre hacia arriba
    viewShift.target = current ? innerHeight * 0.16 : 0;
    springTo(viewShift, dt, 0.6);
    const W = innerWidth, H = innerHeight;
    camera.setViewOffset(W, H, 0, viewShift.x, W, H);
    if (Math.abs(camera.fov - fov) > 0.01) camera.fov = fov;
    camera.updateProjectionMatrix();

    sky.position.copy(camera.position);
    if (frameSkip++ % 20 === 0) sortGalaxies();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  addEventListener('pagehide', (e) => {
    if (e.persisted) return;
    disposables.forEach((d) => d.dispose());
    renderer.dispose();
  });

  return {
    enter, exit,
    get current(){ return current; },
    // Arrastrar sobre el hero gira la Vía Láctea (sin rueda: la rueda sigue haciendo scroll)
    bindHome(el){ orbit.bind(el, { wheel: false, keys: false }); },
    // En modo exploración: arrastrar, rueda, pellizco y teclado
    bindExplore(el){ orbit.bind(el, { wheel: true, keys: true }); },
    zoomBy: orbit.zoomBy,
  };
}
