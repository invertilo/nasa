// Planetas del Sistema Solar en 3D, con superficie procedural en GLSL (sin texturas
// descargadas) y modo de comparación de tamaños a escala real.
// Expone startPlanets3D(stage, labelsEl) → { show(id), setMode('single'|'compare') } o null.
//
// - Cada planeta es una esfera con un shader propio: relieve por mapa de alturas (fbm y
//   cráteres) con normales perturbadas, nubes, casquetes polares, bandas de gas con flujo
//   diferencial, la Gran Mancha Roja, luces nocturnas en la Tierra.
// - La luz del Sol viene de una dirección fija: al girar se ve el lado nocturno.
// - Atmósfera: cáscara con brillo calculado por la distancia mínima del rayo al centro.
// - Anillos de Saturno (C, B, división de Cassini, A, brecha de Encke) y de Urano, con la
//   sombra del planeta sobre los anillos y la de los anillos sobre Saturno.
// - Exotierras (EXO_EARTHS): mismo sombreado que la Tierra con otros océanos, hielo, nubes y
//   la luz de su estrella (más rojiza en enanas rojas). Su superficie real es desconocida.
// Se descartó usar las fotos de la NASA como textura: son fotografías en perspectiva, no
// mapas equirectangulares, y deformarían la esfera. Las fotos se muestran aparte.

const PL_VERT = `
varying vec3 vObj;
void main(){
  vObj = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const PL_FRAG = `
precision highp float;
varying vec3 vObj;
uniform float uType;
uniform vec3 uSun;     // dirección al Sol (espacio del objeto)
uniform vec3 uCam;     // posición de la cámara (espacio del objeto, radio = 1)
uniform float uTime;
uniform vec3 uAtmo;
uniform float uAtmoK;
// Parámetros de los planetas tipo Tierra (la Tierra usa los valores por defecto)
uniform float uSeed;    // desplaza el ruido: otros continentes
uniform float uOcean;   // umbral de océano (más alto = más océano)
uniform float uIce;     // latitud |y| donde empiezan los casquetes
uniform float uCloud;   // umbral de nubes (más bajo = más nubes)
uniform vec3 uLand;     // tono del suelo con vegetación o roca
uniform vec3 uLight;    // color de la luz de la estrella anfitriona
` + GLSL_NOISE + `
vec3 toLin(vec3 c){ return pow(c, vec3(2.2)); }

// Cráteres: cuencos con borde elevado repartidos en una rejilla 3D aleatoria
float craters(vec3 p){
  vec3 i = floor(p);
  vec3 f = fract(p);
  float h = 0.0;
  for (int x = -1; x <= 1; x++){
    for (int y = -1; y <= 1; y++){
      for (int z = -1; z <= 1; z++){
        vec3 g = vec3(float(x), float(y), float(z));
        vec3 c = i + g;
        if (hash13(c + 71.0) < 0.4) continue;
        vec3 o = vec3(hash13(c), hash13(c + 17.0), hash13(c + 31.0));
        float size = 0.22 + 0.3 * hash13(c + 53.0);
        float d = length(g + o - f) / size;
        float bowl = d < 1.0 ? (d * d - 1.0) * 0.6 : 0.0;
        float rim = exp(-(d - 1.0) * (d - 1.0) * 16.0) * 0.3;
        h += bowl + rim;
      }
    }
  }
  return h;
}

float continents(vec3 p){ return fbm5(p * 1.7 + vec3(3.1, 1.7, 0.4) + uSeed); }

// Mapa de alturas (solo planetas rocosos)
float height(vec3 p){
  if (uType < 0.5) return fbm5(p * 3.0) * 0.6 + craters(p * 5.0) * 0.5 + craters(p * 11.0) * 0.22;
  if (uType > 1.5 && uType < 2.5){
    float c = continents(p);
    float land = smoothstep(uOcean, uOcean + 0.03, c);
    return land * ((c - uOcean) * 2.0 + fbm3(p * 9.0 + uSeed) * 0.35);
  }
  if (uType > 2.5 && uType < 3.5) return fbm5(p * 2.5) * 0.8 + craters(p * 6.0) * 0.3;
  return 0.0;
}

// Ángulo de longitud relativo a lon0, en (-π, π]
float dlon(vec3 p, float lon0){
  return mod(atan(p.z, p.x) - lon0 + 3.14159265, 6.2831853) - 3.14159265;
}

// Óvalo de tormenta en (lat0, lon0) con semiejes (a, b) en radianes
float storm(vec3 p, float lat0, float lon0, float a, float b){
  float lat = asin(clamp(p.y, -1.0, 1.0));
  float dx = dlon(p, lon0) * cos(lat) / a;
  float dy = (lat - lat0) / b;
  return 1.0 - smoothstep(0.55, 1.0, dx * dx + dy * dy);
}

void main(){
  vec3 n = normalize(vObj);
  vec3 L = normalize(uSun);
  vec3 V = normalize(uCam - n);
  float lat = n.y;
  vec3 alb = vec3(0.5);
  float spec = 0.0;
  float cloud = 0.0;
  vec3 emit = vec3(0.0);
  float limbDark = 0.0;

  // Normal con relieve: gradiente del mapa de alturas proyectado al plano tangente
  vec3 N = n;
  float h0 = 0.0;
  if (uType < 0.5 || (uType > 1.5 && uType < 3.5)){
    float e = 0.004;
    h0 = height(n);
    vec3 g = vec3(height(n + vec3(e, 0.0, 0.0)), height(n + vec3(0.0, e, 0.0)), height(n + vec3(0.0, 0.0, e))) - h0;
    g /= e;
    g -= n * dot(g, n);
    float k = uType < 0.5 ? 0.035 : (uType < 2.5 ? 0.025 : 0.03);
    N = normalize(n - g * k);
  }

  if (uType < 0.5){
    // Mercurio: gris, cráteres frescos más claros
    float t = fbm5(n * 4.0);
    alb = vec3(0.5, 0.48, 0.46) * (0.7 + 0.5 * t) + vec3(0.12) * clamp(h0, 0.0, 1.0);
  } else if (uType < 1.5){
    // Venus: capa de nubes de ácido sulfúrico, bandas en forma de V
    vec3 q = vec3(n.x * 1.5, n.y * 4.0, n.z * 1.5);
    float t = fbm5(q + vec3(uTime * 0.01, 0.0, 0.0));
    alb = mix(vec3(0.82, 0.68, 0.45), vec3(0.98, 0.9, 0.72), t);
    alb *= 0.92 + 0.08 * sin(abs(lat) * 12.0 + dlon(n, 0.0) * 2.0 + t * 4.0);
  } else if (uType < 2.5){
    // Tierra
    float c = continents(n) + (fbm3(n * 16.0 + uSeed) - 0.5) * 0.07;
    float land = smoothstep(uOcean, uOcean + 0.012, c);
    float depth = smoothstep(uOcean, uOcean - 0.2, c);
    // Aguas someras cerca de la costa (turquesa) y océano profundo (azul oscuro)
    float shallow = smoothstep(uOcean - 0.07, uOcean, c);
    vec3 ocean = mix(vec3(0.12, 0.42, 0.5), vec3(0.03, 0.12, 0.3), depth);
    ocean = mix(ocean, vec3(0.1, 0.36, 0.44), shallow * (1.0 - depth) * 0.6);
    float moist = fbm3(n * 3.0 + 11.0 + uSeed);
    float alat = abs(lat);
    float desert = smoothstep(0.42, 0.62, 1.0 - moist) * smoothstep(0.1, 0.25, alat) * (1.0 - smoothstep(0.42, 0.55, alat));
    // Variedad de suelo: bosques, pastos y zonas secas con grano fino
    vec3 green = mix(uLand * 0.7, uLand * vec3(1.5, 1.2, 1.1) + 0.03, fbm3(n * 7.0 + uSeed));
    green = mix(green, green * 1.25, smoothstep(0.5, 0.7, fbm3(n * 30.0 + uSeed)) * 0.5);
    vec3 ground = mix(green, vec3(0.76, 0.63, 0.42), desert);
    ground = mix(ground, vec3(0.42, 0.38, 0.33), smoothstep(0.35, 0.6, h0));
    alb = mix(ocean, ground, land);
    float ice = smoothstep(uIce - 0.02, uIce + 0.04, alat + (fbm3(n * 6.0 + uSeed) - 0.5) * 0.12);
    alb = mix(alb, vec3(0.93, 0.95, 1.0), ice);
    spec = (1.0 - land) * (1.0 - ice) * 0.5;
    // Nubes: capas fibrosas con borde definido, no manchas difusas
    float cw = fbm5(n * 4.2 + vec3(uTime * 0.012, uSeed, uTime * 0.006));
    cloud = smoothstep(uCloud, uCloud + 0.12, cw) * 0.9;
    // Luces de ciudades en el lado nocturno
    float city = smoothstep(0.62, 0.82, fbm3(n * 45.0)) * land * (1.0 - ice) * (1.0 - desert * 0.7);
    emit = vec3(1.0, 0.62, 0.25) * city * 0.9;
  } else if (uType < 3.5){
    // Marte: óxido de hierro, regiones oscuras, casquetes polares
    float dark = smoothstep(0.5, 0.62, fbm5(n * 2.2 + 5.0));
    alb = mix(vec3(0.76, 0.4, 0.21), vec3(0.42, 0.22, 0.13), dark);
    alb *= 0.85 + 0.25 * fbm3(n * 10.0);
    float cap = smoothstep(0.86, 0.9, abs(lat) + (fbm3(n * 5.0) - 0.5) * 0.08);
    alb = mix(alb, vec3(0.95, 0.94, 0.92), cap);
  } else if (uType < 5.5){
    // Júpiter (4) y Saturno (5): bandas con turbulencia y flujo diferencial por latitud
    bool jup = uType < 4.5;
    float flow = uTime * 0.02 * sin(lat * 9.0);
    vec3 q = vec3(n.x * 3.0, n.y * 15.0, n.z * 3.0);
    float turb = fbm5(q + vec3(flow, 0.0, -flow));
    float bands = sin(lat * (jup ? 22.0 : 17.0) + turb * (jup ? 3.6 : 1.8));
    vec3 belt = jup ? vec3(0.62, 0.43, 0.3) : vec3(0.8, 0.68, 0.48);
    vec3 zone = jup ? vec3(0.94, 0.89, 0.78) : vec3(0.95, 0.88, 0.7);
    alb = mix(belt, zone, smoothstep(-0.7, 0.8, bands) * 0.85 + 0.15 * turb);
    alb *= 0.88 + 0.22 * fbm3(vec3(n.x * 6.0, n.y * 34.0, n.z * 6.0));
    if (jup){
      float grs = storm(n, -0.39, 1.0 + uTime * 0.004, 0.21, 0.1);
      float swirl = fbm3(n * 18.0);
      alb = mix(alb, mix(vec3(0.78, 0.33, 0.2), vec3(0.88, 0.55, 0.38), swirl), grs);
      alb = mix(alb, vec3(0.97, 0.95, 0.9), storm(n, -0.6, 2.6, 0.06, 0.035) * 0.8);
    }
    alb *= mix(1.0, 0.72, smoothstep(0.72, 0.95, abs(lat)));
    limbDark = 1.0;
  } else if (uType < 6.5){
    // Urano: casi sin rasgos, metano que absorbe el rojo
    alb = vec3(0.62, 0.85, 0.88) * (0.96 + 0.04 * sin(lat * 10.0));
    alb = mix(alb, vec3(0.75, 0.92, 0.93), smoothstep(0.6, 0.95, lat) * 0.5);
    limbDark = 0.6;
  } else {
    // Neptuno: azul intenso, mancha oscura y nubes altas blancas
    float t = fbm5(vec3(n.x * 3.0, n.y * 16.0, n.z * 3.0) + vec3(uTime * 0.02, 0.0, 0.0));
    alb = mix(vec3(0.17, 0.3, 0.72), vec3(0.3, 0.48, 0.9), smoothstep(-0.4, 0.5, sin(lat * 14.0 + t * 2.0)));
    alb = mix(alb, vec3(0.08, 0.14, 0.4), storm(n, -0.35, 0.8, 0.18, 0.09) * 0.85);
    alb = mix(alb, vec3(0.95, 0.97, 1.0), smoothstep(0.66, 0.78, fbm3(vec3(n.x * 4.0, n.y * 26.0, n.z * 4.0) + 3.0)) * 0.8);
    limbDark = 0.8;
  }

  // ---------- Iluminación ----------
  float nlGeo = dot(n, L);
  float terminator = smoothstep(-0.06, 0.12, nlGeo);
  float diff = max(dot(N, L), 0.0) * terminator;
  vec3 a = toLin(alb);
  vec3 col = a * diff * 2.3 * uLight + a * 0.012;

  // Sombra de los anillos sobre Saturno
  if (uType > 4.5 && uType < 5.5 && abs(L.y) > 0.001){
    float t = -n.y / L.y;
    if (t > 0.0){
      float rr = length((n + L * t).xz);
      float ring = smoothstep(1.24, 1.3, rr) * (1.0 - smoothstep(2.2, 2.27, rr));
      ring *= 1.0 - 0.8 * smoothstep(1.94, 1.96, rr) * (1.0 - smoothstep(2.02, 2.04, rr));
      col *= 1.0 - ring * 0.65;
    }
  }

  float mu = max(dot(n, V), 0.0);
  col *= mix(1.0, 0.45 + 0.55 * pow(mu, 0.5), limbDark);

  if (cloud > 0.0){
    vec3 cl = uLight * (max(dot(n, L), 0.0) * terminator * 2.4 + 0.01);
    col = mix(col, cl, cloud * 0.9);
    spec *= 1.0 - cloud;
    emit *= 1.0 - cloud;
  }
  if (spec > 0.0){
    vec3 R = reflect(-L, N);
    col += vec3(1.0, 0.92, 0.8) * pow(max(dot(R, V), 0.0), 60.0) * spec * 1.4 * terminator;
  }
  col += toLin(emit) * smoothstep(0.08, -0.2, nlGeo);

  // Borde atmosférico iluminado
  float fres = pow(1.0 - mu, 3.0);
  col += toLin(uAtmo) * fres * uAtmoK * smoothstep(-0.25, 0.45, nlGeo) * 1.2;

  col = 1.0 - exp(-col * 1.15);
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`;

// Cáscara de atmósfera: brillo según la distancia mínima del rayo de vista al centro
const ATMO_VERT = `
uniform float uRa;
varying vec3 vObj;
void main(){
  vObj = position * uRa;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const ATMO_FRAG = `
precision highp float;
varying vec3 vObj;
uniform vec3 uSun;
uniform vec3 uCam;
uniform vec3 uAtmo;
uniform float uRa;
uniform float uK;
void main(){
  vec3 dir = normalize(vObj - uCam);
  float t = -dot(uCam, dir);
  vec3 cp = uCam + dir * t;
  float d = length(cp);
  float x = clamp((d - 1.0) / (uRa - 1.0), 0.0, 1.0);
  float glow = pow(1.0 - x, 3.0) * step(1.0, d);
  float lit = smoothstep(-0.35, 0.55, dot(normalize(cp), normalize(uSun)));
  vec3 c = pow(uAtmo, vec3(2.2)) * glow * lit * uK;
  c = 1.0 - exp(-c);
  gl_FragColor = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);
}`;

const RING_VERT = `
varying vec3 vObj;
void main(){
  vObj = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const RING_FRAG = `
precision highp float;
varying vec3 vObj;
uniform vec3 uSun;
uniform vec3 uCam;
uniform float uType;
` + GLSL_NOISE + `
float band(float r, float a, float b, float soft){
  return smoothstep(a, a + soft, r) * (1.0 - smoothstep(b - soft, b, r));
}
void main(){
  float r = length(vObj.xz);
  float alpha;
  vec3 c;
  if (uType < 5.5){
    // Saturno (radios en radios de Saturno): C 1,24–1,53 · B 1,53–1,95 · Cassini · A 2,03–2,27
    float fine = vnoise(vec3(r * 220.0, 0.0, 0.0)) * 0.6 + vnoise(vec3(r * 60.0, 3.0, 0.0)) * 0.4;
    alpha = band(r, 1.24, 1.53, 0.01) * 0.22 + band(r, 1.53, 1.95, 0.01) * 0.92 + band(r, 2.03, 2.27, 0.008) * 0.62;
    alpha *= 1.0 - 0.85 * band(r, 2.212, 2.226, 0.003);
    alpha *= 0.6 + 0.6 * fine;
    c = mix(vec3(0.62, 0.56, 0.47), vec3(0.93, 0.86, 0.72), smoothstep(1.45, 1.9, r));
  } else {
    // Urano: anillos estrechos y oscuros; épsilon (~2,0) el más visible
    alpha = exp(-pow((r - 2.0) / 0.012, 2.0)) * 0.8;
    alpha += exp(-pow((r - 1.64) / 0.006, 2.0)) * 0.35 + exp(-pow((r - 1.75) / 0.006, 2.0)) * 0.35;
    alpha += exp(-pow((r - 1.84) / 0.006, 2.0)) * 0.35 + exp(-pow((r - 1.9) / 0.006, 2.0)) * 0.3;
    c = vec3(0.62, 0.64, 0.64);
  }
  vec3 L = normalize(uSun);
  // Sombra del planeta: ¿el rayo hacia el Sol atraviesa la esfera de radio 1?
  float b = dot(vObj, L);
  float disc = b * b - (dot(vObj, vObj) - 1.0);
  float shadow = (disc > 0.0 && b < 0.0) ? 1.0 - 0.92 * smoothstep(0.0, 0.08, disc) : 1.0;
  float lit = mix(0.25, 1.0, smoothstep(0.0, 0.4, abs(L.y)));
  if (sign(uCam.y) != sign(L.y)) lit *= 0.5;   // cara no iluminada: luz que atraviesa
  vec3 col = pow(c, vec3(2.2)) * lit * shadow * 2.2;
  col = 1.0 - exp(-col);
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), clamp(alpha, 0.0, 1.0));
}`;

// Color y fuerza del borde atmosférico de cada planeta
const PLANET_ATMO = {
  mercury: [[0, 0, 0], 0], venus: [[1, 0.86, 0.6], 0.9], earth: [[0.4, 0.65, 1], 1.1], mars: [[0.95, 0.6, 0.4], 0.35],
  jupiter: [[0.95, 0.85, 0.7], 0.25], saturn: [[0.95, 0.88, 0.7], 0.25], uranus: [[0.6, 0.9, 1], 0.6], neptune: [[0.4, 0.6, 1], 0.8],
};

// Aspecto de la Tierra (valores por defecto de los uniformes de planetas tipo Tierra)
const EARTH_LOOK = { ocean: 0.5, ice: 0.82, cloud: 0.5, land: [0.13, 0.3, 0.1], seed: 0 };

// Une planetas del Sistema Solar y exotierras en una sola lista de "cuerpos" para la escena
function planetBodies(){
  const solar = PLANETS.map((p) => ({ ...p, group: 'solar' }));
  const exo = (typeof EXO_EARTHS !== 'undefined' ? EXO_EARTHS : []).map((e) => ({
    id: e.id, name: e.name, radiusKm: e.radiusEarth * 6371, tiltDeg: e.tiltDeg || 0, style: 2,
    // Rotación sincrónica: un "día" dura una órbita
    dayHours: e.periodDays * 24, look: e.look, starTempK: e.starTempK, group: 'exo',
  }));
  return solar.concat(exo);
}

function startPlanets3D(stage, labelsEl){
  const canvas = stage.querySelector('canvas');
  const renderer = createRenderer(canvas, { antialias: true, maxDpr: 1.75 });
  if (!renderer){
    showViewerFallback(stage, NO_WEBGL_TEXT);
    return null;
  }
  const T = THREE;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(32, 1, 0.01, 200);
  autoResize(renderer, camera, stage);

  // Luz casi de frente desde la izquierda: se ve el día y una franja de noche
  const SUN_DIR = new T.Vector3(-0.55, 0.25, 1).normalize();
  const sphereGeo = new T.SphereGeometry(1, 160, 112);
  const shellGeo = new T.SphereGeometry(1, 96, 64);
  const axisGeo = new T.BufferGeometry().setFromPoints([new T.Vector3(0, -1.45, 0), new T.Vector3(0, 1.45, 0)]);
  const axisMat = new T.LineDashedMaterial({ color: 0xa9c8ff, dashSize: 0.06, gapSize: 0.04, transparent: true, opacity: 0.55 });
  const disposables = [sphereGeo, shellGeo, axisGeo, axisMat];
  let time = 0;
  const BODIES = planetBodies();

  // Construye un cuerpo: holder (posición/escala) → tilt (inclinación del eje) → mesh (rotación)
  function build(p){
    const holder = new T.Group();
    const tilt = new T.Group();
    tilt.rotation.z = T.MathUtils.degToRad(p.tiltDeg);
    holder.add(tilt);
    const look = p.look || EARTH_LOOK;
    // Luz de la estrella anfitriona: enanas rojas dan una luz más cálida
    const light = p.starTempK ? blackbodyRGB(p.starTempK).map((v) => 0.35 + 0.65 * v) : [1, 1, 1];
    const [atmo, atmoK] = PLANET_ATMO[p.id] || [[0.4 * light[0] + 0.05, 0.62 * light[1], 1.0 * light[2]], 1.0];
    const mat = new T.ShaderMaterial({
      vertexShader: PL_VERT, fragmentShader: PL_FRAG,
      uniforms: {
        uType: { value: p.style }, uSun: { value: new T.Vector3() }, uCam: { value: new T.Vector3() },
        uTime: { value: 0 }, uAtmo: { value: new T.Vector3(...atmo) }, uAtmoK: { value: atmoK },
        uSeed: { value: look.seed }, uOcean: { value: 0.38 + look.ocean * 0.24 },
        uIce: { value: look.ice }, uCloud: { value: 0.74 - look.cloud * 0.44 },
        uLand: { value: new T.Vector3(...look.land) }, uLight: { value: new T.Vector3(...light) },
      },
    });
    const mesh = new T.Mesh(sphereGeo, mat);
    tilt.add(mesh);
    disposables.push(mat);
    const parts = { holder, tilt, mesh, mat, ring: null, shell: null };

    // Eje de rotación punteado: deja ver la inclinación
    parts.axis = new T.Line(axisGeo, axisMat);
    parts.axis.computeLineDistances();
    tilt.add(parts.axis);

    if (atmoK >= 0.6){
      const ra = p.id === 'venus' ? 1.06 : 1.045;
      const sm = new T.ShaderMaterial({
        vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG,
        uniforms: {
          uSun: { value: new T.Vector3() }, uCam: { value: new T.Vector3() },
          uAtmo: { value: new T.Vector3(...atmo) }, uRa: { value: ra }, uK: { value: atmoK * 1.4 },
        },
        side: T.BackSide, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      });
      parts.shell = new T.Mesh(shellGeo, sm);
      parts.shell.scale.setScalar(ra);
      tilt.add(parts.shell);
      disposables.push(sm);
    }
    if (p.rings){
      const inner = p.id === 'saturn' ? 1.2 : 1.6;
      const outer = p.id === 'saturn' ? 2.3 : 2.05;
      const rg = new T.RingGeometry(inner, outer, 256, 1);
      rg.rotateX(-Math.PI / 2);   // al plano ecuatorial (XZ)
      const rm = new T.ShaderMaterial({
        vertexShader: RING_VERT, fragmentShader: RING_FRAG,
        uniforms: { uSun: { value: new T.Vector3() }, uCam: { value: new T.Vector3() }, uType: { value: p.style } },
        side: T.DoubleSide, transparent: true, depthWrite: false,
      });
      parts.ring = new T.Mesh(rg, rm);
      tilt.add(parts.ring);
      disposables.push(rg, rm);
    }
    // Velocidad de giro visual: comprimida respecto de la real para que se aprecie
    parts.spinSpeed = 0.28 * Math.pow(24 / p.dayHours, 0.35);
    // Resortes de posición y escala para el paso entre modos
    parts.px = { x: 0, v: 0, target: 0 };
    parts.sc = { x: 0, v: 0, target: 0 };
    parts.extent = p.rings && p.id === 'saturn' ? 2.3 : 1;
    scene.add(holder);
    return parts;
  }

  const planets = {};
  BODIES.forEach((p) => { planets[p.id] = build(p); });

  // Etiquetas HTML para el modo comparación
  const labels = {};
  if (labelsEl){
    labelsEl.innerHTML = '';
    BODIES.forEach((p) => {
      const s = document.createElement('span');
      s.className = 'stage-label';
      s.textContent = p.name;
      labelsEl.appendChild(s);
      labels[p.id] = s;
    });
  }

  const orbit = createOrbit({
    yaw: 0.3, pitch: 0.18, dist: 4.3, minDist: 1.7, maxDist: 12,
    minPitch: -1.3, maxPitch: 1.3, rotateSpeed: 0.006, autoRotate: 0.08,
  });
  orbit.bind(stage);
  const centerX = { x: 0, v: 0, target: 0 };
  const center = new T.Vector3();
  let mode = 'single', currentId = 'earth';
  let lineup = [];

  // Fila de comparación: Sistema Solar, o la Tierra junto a las exotierras
  function compareSet(){
    const cur = BODIES.find((b) => b.id === currentId);
    if (cur && cur.group === 'exo') return BODIES.filter((b) => b.id === 'earth' || b.group === 'exo');
    return BODIES.filter((b) => b.group === 'solar');
  }

  function layoutCompare(){
    // Radios a escala real, normalizados al más grande de la fila (Mercurio queda diminuto: así es)
    const set = compareSet();
    lineup = set.map((b) => b.id);
    const maxR = Math.max(...set.map((b) => b.radiusKm));
    let x = 0, gap = 0.3;
    const items = set.map((p) => {
      const r = p.radiusKm / maxR;
      const half = r * planets[p.id].extent;
      // Separación extra para los cuerpos chicos, así sus nombres no se pisan
      gap = r < 0.1 ? 0.6 : 0.3;
      const cx = x + half;
      x += half * 2 + gap;
      return { id: p.id, r, cx };
    });
    const total = x - gap;
    BODIES.forEach((b) => { planets[b.id].sc.target = 0; });
    items.forEach((it) => {
      planets[it.id].px.target = it.cx - total / 2;
      planets[it.id].sc.target = it.r;
    });
    centerX.target = 0;
    const hfov = 2 * Math.atan(Math.tan(T.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    const fit = (total / 2) / Math.tan(hfov / 2) * 1.15;
    const fitV = 1.2 / Math.tan(T.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(fit, fitV);
    orbit.setLimits({ minDist: 0.4, maxDist: dist * 2 });
    orbit.flyTo({ pitch: 0.22, dist, yaw: 0 }, 0.6);
  }

  function layoutSingle(){
    lineup = [currentId];
    BODIES.forEach((p) => {
      planets[p.id].px.target = 0;
      planets[p.id].sc.target = p.id === currentId ? 1 : 0;
    });
    centerX.target = 0;
    const ringed = planets[currentId].extent > 1;
    orbit.setLimits({ minDist: 1.7, maxDist: 12 });
    orbit.flyTo({ dist: ringed ? 6.6 : 4.3, pitch: ringed ? 0.32 : 0.18 }, 0.6);
  }

  function show(id){
    if (!planets[id]) return;
    currentId = id;
    // El cuerpo anterior se encoge y el nuevo crece (resortes interrumpibles)
    if (mode === 'single') layoutSingle(); else layoutCompare();
  }

  function setMode(m){
    mode = m;
    if (labelsEl) labelsEl.hidden = m !== 'compare';
    if (m === 'compare') layoutCompare(); else layoutSingle();
  }

  // Estado inicial sin animación
  BODIES.forEach((p) => { planets[p.id].sc.x = planets[p.id].sc.target = p.id === currentId ? 1 : 0; });
  lineup = [currentId];
  if (labelsEl) labelsEl.hidden = true;

  const tmpV = new T.Vector3();
  const tmpQ = new T.Quaternion();
  const tiltSun = new T.Vector3();
  const projV = new T.Vector3();

  createLoop(stage, (dt) => {
    if (!VIEWER_REDUCED) time += dt;
    orbit.update(dt);
    springTo(centerX, dt, 0.6);
    center.set(centerX.x, 0, 0);
    orbit.apply(camera, center);

    const w = stage.clientWidth, h = stage.clientHeight;
    BODIES.forEach((p) => {
      const o = planets[p.id];
      springTo(o.px, dt, 0.55);
      springTo(o.sc, dt, 0.5);
      const s = Math.max(o.sc.x, 0);
      o.holder.visible = s > 0.002;
      const lab = labels[p.id];
      if (!o.holder.visible){ if (lab) lab.style.opacity = '0'; return; }
      o.holder.position.x = o.px.x;
      o.holder.scale.setScalar(s);
      o.axis.visible = mode === 'single';
      if (!VIEWER_REDUCED) o.mesh.rotation.y += dt * o.spinSpeed;
      o.holder.updateMatrixWorld(true);

      // Sol y cámara en el espacio del objeto (radio = 1)
      o.mesh.getWorldQuaternion(tmpQ).invert();
      o.mat.uniforms.uSun.value.copy(SUN_DIR).applyQuaternion(tmpQ);
      o.mat.uniforms.uCam.value.copy(o.mesh.worldToLocal(tmpV.copy(camera.position)));
      o.mat.uniforms.uTime.value = time;
      const tiltLocalCam = o.tilt.worldToLocal(tmpV.copy(camera.position));
      o.tilt.getWorldQuaternion(tmpQ).invert();
      tiltSun.copy(SUN_DIR).applyQuaternion(tmpQ);
      if (o.shell){
        o.shell.material.uniforms.uCam.value.copy(tiltLocalCam);
        o.shell.material.uniforms.uSun.value.copy(tiltSun);
      }
      if (o.ring){
        o.ring.material.uniforms.uCam.value.copy(tiltLocalCam);
        o.ring.material.uniforms.uSun.value.copy(tiltSun);
      }

      // Etiquetas bajo cada cuerpo en el modo comparación, escalonadas en tres filas
      const idx = lineup.indexOf(p.id);
      if (lab && mode === 'compare' && idx >= 0){
        projV.set(o.px.x, -Math.max(s, 0.02) - 0.08, 0).project(camera);
        const y = (1 - projV.y) / 2 * h + (idx % 3) * 18;
        lab.style.transform = `translate(${((projV.x + 1) / 2 * w).toFixed(1)}px, ${y.toFixed(1)}px) translateX(-50%)`;
        lab.style.opacity = '1';
      } else if (lab){
        lab.style.opacity = '0';
      }
    });
    renderer.render(scene, camera);
  });

  addEventListener('pagehide', (e) => {
    if (e.persisted) return;
    disposables.forEach((d) => d.dispose());
    renderer.dispose();
  });

  return { show, setMode, zoomBy: orbit.zoomBy, get mode(){ return mode; } };
}
