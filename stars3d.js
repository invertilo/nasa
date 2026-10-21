// El Sol y estrellas parecidas en 3D, con comparación de tamaño a escala.
// Expone startStars3D(stage, labelsEl) → { show(star) } o null si no hay WebGL.
//
// - Fotosfera procedural: granulación convectiva animada (celdas brillantes con bordes
//   oscuros), manchas solares con umbra y penumbra (solo el Sol), fáculas cerca del borde.
// - Oscurecimiento del limbo cuadrático: I(μ) = 1 - 0,6(1-μ) - 0,2(1-μ)², con μ = cos θ.
//   El borde además se ve más rojo (se observan capas más frías).
// - Color según la temperatura efectiva (paleta de presentación, ver starDisplayColor).
// - El Sol queda siempre a la izquierda y la estrella elegida a la derecha, a escala.

const STAR_VERT = `
varying vec3 vObj;
void main(){
  vObj = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const STAR_FRAG = `
precision highp float;
varying vec3 vObj;
uniform vec3 uCam;
uniform float uTime;
uniform float uTemp;
uniform float uSpots;
uniform float uSeed;
uniform float uGran;   // escala de la granulación (más fina en estrellas grandes)
uniform vec3 uColor;   // color de presentación según la temperatura (lineal)
` + GLSL_NOISE + `
void main(){
  vec3 n = normalize(vObj);
  vec3 V = normalize(uCam - n);
  float mu = max(dot(n, V), 0.0);
  float t = uTime * 0.06;

  // Granulación: ruido "con crestas" invertido → celdas claras separadas por líneas oscuras
  vec3 q = n * uGran * 0.4 + vec3(uSeed);
  float g1 = 1.0 - abs(vnoise(q + vec3(t, 0.0, -t)) * 2.0 - 1.0);
  float g2 = 1.0 - abs(vnoise(q * 2.1 + vec3(-t, t, 0.0)) * 2.0 - 1.0);
  // Celdas brillantes con líneas oscuras bien marcadas (contraste de granulación solar real)
  float cell = g1 * 0.6 + g2 * 0.4;
  float gran = mix(0.8, 1.0, smoothstep(0.3, 0.85, cell));
  float super_ = fbm3(n * 5.0 + vec3(uSeed) + t * 0.2);
  gran *= 0.94 + 0.12 * super_;

  // Manchas solares en latitudes medias
  float spotN = fbm5(n * 3.2 + vec3(uSeed * 1.7, 0.0, uTime * 0.002));
  float lat = abs(n.y);
  float belt = smoothstep(0.08, 0.18, lat) * (1.0 - smoothstep(0.45, 0.6, lat));
  float pen = smoothstep(0.64, 0.68, spotN) * belt * uSpots;
  float umb = smoothstep(0.69, 0.72, spotN) * belt * uSpots;
  // Fáculas: zonas brillantes alrededor de las manchas, visibles cerca del limbo
  float fac = smoothstep(0.56, 0.64, spotN) * belt * uSpots * (1.0 - mu) * 0.6;

  float limb = 1.0 - 0.6 * (1.0 - mu) - 0.2 * (1.0 - mu) * (1.0 - mu);
  // Color de presentación por temperatura (ver starDisplayColor). Hacia el borde se ve
  // luz de capas más altas y frías: más oscura y más roja.
  vec3 bb = uColor * vec3(1.0, 0.82 + 0.18 * mu, 0.62 + 0.38 * mu);
  vec3 col = bb * limb * gran * 1.12;
  col *= 1.0 - pen * 0.45 - umb * 0.45;
  col += bb * fac * 0.5;
  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`;

// Colores de presentación por temperatura (sRGB). El cuerpo negro puro da casi blanco para
// todo lo que está entre 5000 y 7000 K; esta paleta, inspirada en las tablas de color estelar,
// exagera un poco el tono para que se lea: M rojiza, K naranja, G amarillo-blanco, A azulada.
const STAR_PALETTE = [
  [2500, [1.0, 0.45, 0.22]], [3000, [1.0, 0.55, 0.3]], [3800, [1.0, 0.68, 0.4]],
  [4400, [1.0, 0.76, 0.48]], [5300, [1.0, 0.87, 0.62]], [5800, [1.0, 0.94, 0.76]],
  [6500, [1.0, 0.98, 0.92]], [7500, [0.95, 0.96, 1.0]], [10000, [0.78, 0.85, 1.0]], [20000, [0.65, 0.75, 1.0]],
];
function starDisplayColor(t){
  const P = STAR_PALETTE;
  if (t <= P[0][0]) return P[0][1];
  for (let i = 1; i < P.length; i++){
    if (t <= P[i][0]){
      const k = (t - P[i - 1][0]) / (P[i][0] - P[i - 1][0]);
      return P[i][1].map((v, j) => P[i - 1][1][j] + (v - P[i - 1][1][j]) * k);
    }
  }
  return P[P.length - 1][1];
}

function startStars3D(stage, labelsEl){
  const canvas = stage.querySelector('canvas');
  const renderer = createRenderer(canvas, { antialias: true, maxDpr: 1.75 });
  if (!renderer){
    showViewerFallback(stage, NO_WEBGL_TEXT);
    return null;
  }
  const T = THREE;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(32, 1, 0.01, 400);
  let current = null;

  const geo = new T.SphereGeometry(1, 128, 96);
  const disposables = [geo];

  function makeStar(seed){
    const holder = new T.Group();
    const mat = new T.ShaderMaterial({
      vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
      uniforms: {
        uCam: { value: new T.Vector3() }, uTime: { value: 0 }, uTemp: { value: 5772 },
        uSpots: { value: 0 }, uSeed: { value: seed }, uGran: { value: 34 }, uColor: { value: new T.Color(1, 1, 1) },
      },
    });
    const mesh = new T.Mesh(geo, mat);
    holder.add(mesh);
    // Corona / resplandor: sprite aditivo detrás de la estrella
    // El disco ocupa hasta ~0,48 del radio de la textura: justo afuera, un borde brillante
    // (cromosfera) y luego la corona difusa que se desvanece.
    const tex = glowTexture([[0, 'rgba(255,255,255,1)'], [0.46, 'rgba(255,255,255,0.95)'], [0.5, 'rgba(255,255,255,0.5)'], [0.58, 'rgba(255,255,255,0.2)'], [0.75, 'rgba(255,255,255,0.06)'], [1, 'rgba(255,255,255,0)']]);
    const sm = new T.SpriteMaterial({ map: tex, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 });
    const halo = new T.Sprite(sm);
    halo.scale.setScalar(3.3);
    halo.material.opacity = 0.55;
    holder.add(halo);
    disposables.push(mat, tex, sm);
    scene.add(holder);
    return { holder, mesh, mat, halo, px: { x: 0, v: 0, target: 0 }, sc: { x: 1, v: 0, target: 1 } };
  }

  const sun = makeStar(0);
  const other = makeStar(17.3);
  sun.mat.uniforms.uSpots.value = 1;
  other.sc.x = other.sc.target = 0;

  // Estrellas de fondo muy tenues
  const N = 1500, bgPos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++){
    const v = new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(150);
    bgPos.set([v.x, v.y, v.z], i * 3);
  }
  const bgGeo = new T.BufferGeometry();
  bgGeo.setAttribute('position', new T.BufferAttribute(bgPos, 3));
  const bgMat = new T.PointsMaterial({ color: 0xbfd0ff, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.5 });
  scene.add(new T.Points(bgGeo, bgMat));
  disposables.push(bgGeo, bgMat);

  const orbit = createOrbit({
    yaw: 0, pitch: 0.12, dist: 5, minDist: 1.6, maxDist: 60,
    minPitch: -1.2, maxPitch: 1.2, rotateSpeed: 0.005,
  });
  orbit.bind(stage);
  const centerX = { x: 0, v: 0, target: 0 };
  const center = new T.Vector3();
  autoResize(renderer, camera, stage, () => layout());

  function tint(star, tempK){
    const [r, g, b] = starDisplayColor(tempK);
    star.halo.material.color.setRGB(r, g, b);
    // A lineal para el shader
    star.mat.uniforms.uColor.value.setRGB(r ** 2.2, g ** 2.2, b ** 2.2);
    star.mat.uniforms.uTemp.value = tempK;
  }
  tint(sun, 5772);

  // Coloca el Sol y la estrella elegida a escala, uno al lado del otro
  function layout(){
    if (!current) return;
    const r = current.radiusSun;
    const alone = current.id === 'sun';
    const gap = 0.9;
    if (alone){
      sun.px.target = 0;
      other.sc.target = 0;
      centerX.target = 0;
      orbit.flyTo({ dist: 4.6 }, 0.6);
      return;
    }
    sun.px.target = 0;
    other.px.target = 1 + gap + r;
    other.sc.target = r;
    centerX.target = (other.px.target + r - 1) / 2;
    const total = 2 + gap + 2 * r;
    const hfov = 2 * Math.atan(Math.tan(T.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    const fitH = (total / 2) / Math.tan(hfov / 2) * 1.25;
    const fitV = Math.max(1, r) * 1.5 / Math.tan(T.MathUtils.degToRad(camera.fov / 2));
    orbit.setLimits({ maxDist: Math.max(fitH, fitV) * 3 });
    orbit.flyTo({ dist: Math.max(fitH, fitV) }, 0.6);
  }

  const labSun = document.createElement('span');
  const labOther = document.createElement('span');
  if (labelsEl){
    labelsEl.innerHTML = '';
    labSun.className = labOther.className = 'stage-label';
    labSun.textContent = 'Sol';
    labelsEl.append(labSun, labOther);
  }

  function show(star){
    current = star;
    tint(other, star.tempK);
    other.mat.uniforms.uSpots.value = star.spots ? 0.8 : 0;
    // Granulación más fina en estrellas más grandes, más gruesa en enanas
    other.mat.uniforms.uGran.value = 34 * Math.sqrt(Math.max(star.radiusSun, 0.3));
    labOther.textContent = star.name;
    layout();
  }

  const tmpV = new T.Vector3();
  const projV = new T.Vector3();
  let time = 0;

  createLoop(stage, (dt) => {
    if (!VIEWER_REDUCED) time += dt;
    orbit.update(dt);
    springTo(centerX, dt, 0.6);
    center.set(centerX.x, 0, 0);
    orbit.apply(camera, center);
    const w = stage.clientWidth, h = stage.clientHeight;

    [[sun, labSun], [other, labOther]].forEach(([s, lab]) => {
      springTo(s.px, dt, 0.55);
      springTo(s.sc, dt, 0.5);
      const k = Math.max(s.sc.x, 0);
      s.holder.visible = k > 0.002;
      s.holder.position.x = s.px.x;
      s.holder.scale.setScalar(k);
      // Rotación diferencial: aquí basta un giro lento (el Sol tarda ~25 días en el ecuador)
      if (!VIEWER_REDUCED) s.mesh.rotation.y += dt * 0.05;
      s.holder.updateMatrixWorld(true);
      s.mat.uniforms.uCam.value.copy(s.mesh.worldToLocal(tmpV.copy(camera.position)));
      s.mat.uniforms.uTime.value = time;
      if (labelsEl){
        const show = s.holder.visible && current && current.id !== 'sun';
        lab.style.opacity = show ? '1' : '0';
        if (show){
          projV.set(s.px.x, -k * 1.08 - 0.05, 0).project(camera);
          lab.style.transform = `translate(${((projV.x + 1) / 2 * w).toFixed(1)}px, ${((1 - projV.y) / 2 * h).toFixed(1)}px) translateX(-50%)`;
        }
      }
    });
    renderer.render(scene, camera);
  });

  addEventListener('pagehide', (e) => {
    if (e.persisted) return;
    disposables.forEach((d) => d.dispose());
    renderer.dispose();
  });

  return { show, zoomBy: orbit.zoomBy };
}
