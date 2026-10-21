// Agujero negro de Schwarzschild 3D con trazado de rayos en GLSL.
// Expone startBlackHole3D(stage) → { setMass(massSun) } o null si no hay WebGL.
//
// Física (unidades: radio de Schwarzschild rs = 1, c = 1, M = 0,5):
// - Cada píxel lanza un rayo de luz hacia atrás desde la cámara. La trayectoria de un fotón
//   en Schwarzschild cumple exactamente x'' = -(3/2)·h²·x / r⁵ (h = |x × v|), que se integra
//   con Verlet de velocidad y paso adaptativo (más fino cerca del horizonte y del disco).
// - El disco de acreción es VOLUMÉTRICO: tiene grosor (semiespesor ~ 0,035·r), se integra
//   emisión y absorción a lo largo del rayo, y rota con velocidad kepleriana.
// - Temperatura del disco: perfil de Shakura–Sunyaev T ∝ r^(-3/4)·(1 - √(r_in/r))^(1/4),
//   con borde interno en la órbita circular estable más interna (ISCO, r = 3 rs).
// - Desplazamiento Doppler relativista + corrimiento gravitacional: g = δ·√(1 - rs/r);
//   la temperatura observada es g·T y la intensidad escala ~ g⁴ (el lado que se acerca brilla).
// - El anillo de fotones (r ≈ 1,5 rs) y las imágenes secundarias del disco salen solas de la
//   integración; no hay halos pintados a mano. La lente se ve sobre el campo de estrellas.
// La escala es normalizada; los valores físicos reales están en la tabla de la sección.

const BH_VERT = `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const BH_FRAG = `
precision highp float;
varying vec2 vUv;
uniform float uYaw;
uniform float uPitch;
uniform float uDist;
uniform float uAspect;
uniform float uTime;
uniform float uFocal;
uniform float uPix;      // tamaño angular de un píxel (rad), para estrellas sin parpadeo
uniform float uDiskT;    // temperatura visual de referencia del disco (K)
uniform float uExposure;
` + GLSL_NOISE + `
const float RIN = 3.0;    // ISCO
const float ROUT = 12.0;

vec3 blackbody(float t){
  t = clamp(t, 1000.0, 40000.0) / 100.0;
  vec3 c;
  if (t <= 66.0){
    c.r = 1.0;
    c.g = clamp(0.39008157876 * log(t) - 0.63184144378, 0.0, 1.0);
    c.b = t <= 19.0 ? 0.0 : clamp(0.54320678911 * log(t - 10.0) - 1.19625408914, 0.0, 1.0);
  } else {
    c.r = clamp(1.29293618606 * pow(t - 60.0, -0.1332047592), 0.0, 1.0);
    c.g = clamp(1.12989086089 * pow(t - 60.0, -0.0755148492), 0.0, 1.0);
    c.b = 1.0;
  }
  return pow(c, vec3(2.2));
}

// Una capa de estrellas: una estrella como máximo por celda, con color de cuerpo negro.
vec3 starLayer(vec3 d, float scale, float thresh, float gain){
  vec3 q = d * scale;
  vec3 id = floor(q);
  float h = hash13(id);
  if (h < thresh) return vec3(0.0);
  vec3 off = vec3(hash13(id + 11.1), hash13(id + 23.7), hash13(id + 37.3)) - 0.5;
  vec3 f = fract(q) - 0.5 - off * 0.7;
  // tamaño ~1,1 píxel en cualquier escala, para que no parpadeen al girar
  float sigma = max(uPix * scale * 0.75, 0.03);
  float core = exp(-dot(f, f) / (2.0 * sigma * sigma));
  float mag = pow((h - thresh) / (1.0 - thresh), 3.0);
  float temp = mix(3000.0, 12000.0, pow(hash13(id + 5.3), 1.8));
  return blackbody(temp) * core * mag * gain;
}

// Fondo de cielo: tres capas de estrellas y una banda galáctica tenue con polvo.
vec3 sky(vec3 d){
  vec3 nb = normalize(vec3(0.35, 1.0, 0.18));
  float lat = dot(d, nb);
  float band = exp(-lat * lat / 0.035);
  vec3 c = vec3(0.0);
  c += starLayer(d, 70.0, 0.994, 7.0);
  c += starLayer(d, 160.0, 0.989, 2.2);
  c += starLayer(d, 320.0, 0.982 - band * 0.05, 0.9);
  float neb = fbm5(d * 3.5);
  float dust = smoothstep(0.42, 0.7, fbm3(d * 9.0 + 2.0));
  vec3 bandCol = mix(vec3(0.62, 0.55, 0.47), vec3(0.85, 0.74, 0.6), neb);
  c += bandCol * band * (0.25 + 0.9 * neb * neb) * (1.0 - 0.8 * dust) * 0.05;
  // nubes de hidrógeno muy tenues, solo dentro de la banda
  c += vec3(0.8, 0.25, 0.3) * band * pow(fbm3(d * 6.0 + 9.0), 4.0) * 0.05;
  return c;
}

float diskHalf(float rr){ return 0.022 * rr + 0.015; }

// Densidad y emisión del disco en p. dir = dirección del trazado (la luz va al revés).
vec3 diskEmission(vec3 p, vec3 dir, out float dens){
  dens = 0.0;
  float rr = length(p.xz);
  if (rr < RIN * 0.9 || rr > ROUT) return vec3(0.0);
  float hd = diskHalf(rr);
  float vert = exp(-(p.y * p.y) / (hd * hd));
  float radial = smoothstep(RIN * 0.9, RIN * 1.12, rr) * (1.0 - smoothstep(ROUT * 0.45, ROUT, rr));
  // rotación kepleriana: Ω = √(M/r³), M = 0,5 (acelerada para que se vea)
  float omega = 0.7071 / (rr * sqrt(rr));
  float ph = atan(p.z, p.x) - uTime * omega * 6.0;
  vec3 q1 = vec3(rr * 3.2, cos(ph) * 2.0, sin(ph) * 2.0) + vec3(0.0, p.y * 2.5, 0.0);
  vec3 q2 = vec3(rr * 1.1, cos(ph) * 6.0, sin(ph) * 6.0) + vec3(p.y * 4.0);
  float filaments = fbm3(q1);
  float clumps = fbm3(q2);
  float turb = 0.15 + 1.7 * filaments * filaments + 0.8 * smoothstep(0.45, 0.8, clumps);
  dens = vert * radial * turb;

  // Perfil de temperatura (normalizado para que el máximo sea uDiskT)
  float x = rr / RIN;
  float f = pow(x, -0.75) * pow(max(1.0 - inversesqrt(x), 0.0), 0.25) / 0.488;
  float T = uDiskT * f;

  // Doppler relativista + corrimiento gravitacional
  vec3 phiHat = normalize(vec3(-p.z, 0.0, p.x));
  float v = min(sqrt(0.5 / max(rr - 1.0, 0.05)), 0.95);
  float gamma = inversesqrt(1.0 - v * v);
  vec3 nEmit = -dir;
  float delta = 1.0 / (gamma * (1.0 - v * dot(phiHat, nEmit)));
  float g = delta * sqrt(max(1.0 - 1.0 / rr, 0.0));
  float Tobs = T * g;
  // Intensidad bolométrica ∝ g⁴ (beaming relativista): el lado que se acerca domina
  float I = g * g * g * g * f * f * f * f;
  return blackbody(Tobs) * I * dens;
}

void main(){
  vec3 camPos = uDist * vec3(cos(uPitch) * sin(uYaw), sin(uPitch), cos(uPitch) * cos(uYaw));
  vec3 fwd = normalize(-camPos);
  vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, fwd);
  vec2 sp = vUv * 2.0 - 1.0;
  sp.x *= uAspect;
  vec3 rd = normalize(fwd * uFocal + right * sp.x + up * sp.y);

  vec3 pos = camPos;
  vec3 vel = rd;
  vec3 Lv = cross(pos, vel);
  float h2 = dot(Lv, Lv);

  vec3 col = vec3(0.0);
  float trans = 1.0;
  bool captured = false;
  float escapeR = max(uDist * 1.25, 32.0);

  for (int i = 0; i < 420; i++){
    float r2 = dot(pos, pos);
    float r = sqrt(r2);
    if (r < 1.0){ captured = true; break; }
    if (r > escapeR && dot(pos, vel) > 0.0) break;

    float rr = length(pos.xz);
    float hd = diskHalf(rr);
    float ay = abs(pos.y);
    bool inBand = rr > RIN * 0.85 && rr < ROUT * 1.05;
    bool nearDisk = inBand && ay < 3.5 * hd + 0.05;

    // Paso adaptativo: proporcional a r, fino dentro del disco, y sin saltarse el plano
    float dl = clamp(0.085 * r, 0.015, 1.4);
    if (nearDisk) dl = min(dl, max(0.45 * hd, 0.025));
    else if (inBand) dl = min(dl, max(ay - 3.5 * hd, 0.0) + 0.4 * hd + 0.02);

    // Verlet de velocidad sobre x'' = -1,5·h²·x/r⁵, con paso espacial constante
    float s = dl / length(vel);
    vec3 acc = -1.5 * h2 * pos / (r2 * r2 * r);
    pos += vel * s + 0.5 * acc * s * s;
    float r2n = dot(pos, pos);
    vec3 acc2 = -1.5 * h2 * pos / (r2n * r2n * sqrt(r2n));
    vel += 0.5 * (acc + acc2) * s;

    if (nearDisk){
      float dens;
      vec3 e = diskEmission(pos, normalize(vel), dens);
      col += trans * e * dl * 0.9;
      trans *= exp(-dens * dl * 1.6);
      if (trans < 0.01) break;
    }
  }

  if (!captured) col += trans * sky(normalize(vel));

  // Exposición, curva fílmica ACES aproximada y gamma
  col *= uExposure;
  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  gl_FragColor = vec4(col, 1.0);
}`;

// Temperatura real aproximada del borde interno del disco (orden de magnitud), para un disco
// delgado que acreta a ~10 % del límite de Eddington: T ≈ 10⁷ K · (M / 10 M☉)^(-1/4).
function bhDiskTempK(massSun){
  return 1e7 * Math.pow(massSun / 10, -0.25);
}

// El disco real emite en ultravioleta o rayos X; para verlo se mapea esa temperatura a una
// temperatura "visual" entre 3500 K (supermasivos, más fríos) y 15 500 K (estelares, más calientes).
function bhVisualTemp(massSun){
  const lt = Math.log10(bhDiskTempK(massSun));      // ~4,5 a ~7,3
  const k = Math.max(0, Math.min(1, (lt - 5) / 2.4));
  return 3500 + k * 12000;
}

function startBlackHole3D(stage){
  const canvas = stage.querySelector('canvas');
  const renderer = createRenderer(canvas, { antialias: false, maxDpr: 1.5 });
  if (!renderer){
    showViewerFallback(stage, NO_WEBGL_TEXT);
    return null;
  }
  const T = THREE;
  const uniforms = {
    uYaw: { value: 0.6 },
    uPitch: { value: 0.16 },
    uDist: { value: 26 },
    uAspect: { value: 1 },
    uTime: { value: 0 },
    uFocal: { value: 1.6 },
    uPix: { value: 0.003 },
    uDiskT: { value: 8000 },
    uExposure: { value: 0.9 },
  };

  const scene = new T.Scene();
  const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geo = new T.PlaneGeometry(2, 2);
  const mat = new T.ShaderMaterial({ vertexShader: BH_VERT, fragmentShader: BH_FRAG, uniforms });
  scene.add(new T.Mesh(geo, mat));

  // Resolución dinámica: el trazado de rayos es caro, así que si los cuadros tardan
  // demasiado se baja la escala interna (y se sube de nuevo cuando sobra margen).
  const baseDpr = Math.min(devicePixelRatio || 1, 1.5);
  let scale = 1, slowFrames = 0, fastFrames = 0;
  let cssW = 1, cssH = 1;
  function applySize(){
    renderer.setPixelRatio(baseDpr * scale);
    renderer.setSize(cssW, cssH, false);
    uniforms.uAspect.value = cssW / cssH;
    uniforms.uPix.value = 2 / uniforms.uFocal.value / (cssH * baseDpr * scale);
  }
  autoResize(renderer, null, stage, (w, h) => { cssW = w; cssH = h; applySize(); });

  const orbit = createOrbit({
    yaw: 0.6, pitch: 0.14, dist: 26, minDist: 7, maxDist: 45,
    minPitch: -1.2, maxPitch: 1.25, rotateSpeed: 0.005, autoRotate: 0.06,
  });
  orbit.bind(stage);

  let time = 0;
  createLoop(stage, (dt) => {
    if (!VIEWER_REDUCED) time += dt;
    orbit.update(dt);
    const s = orbit.state;
    uniforms.uYaw.value = s.yaw.x;
    uniforms.uPitch.value = s.pitch.x;
    uniforms.uDist.value = s.dist.x;
    uniforms.uTime.value = time;
    renderer.render(scene, cam);

    // dt es el tiempo real entre cuadros (incluye el trabajo de la GPU del cuadro anterior)
    if (dt > 0.03){ slowFrames++; fastFrames = 0; }
    else if (dt < 0.018){ fastFrames++; slowFrames = 0; }
    if (slowFrames > 20 && scale > 0.5){ scale = Math.max(0.5, scale * 0.8); slowFrames = 0; applySize(); }
    if (fastFrames > 120 && scale < 1){ scale = Math.min(1, scale * 1.15); fastFrames = 0; applySize(); }
  });

  addEventListener('pagehide', (e) => {
    if (e.persisted) return;
    geo.dispose(); mat.dispose(); renderer.dispose();
  });

  return {
    setMass(massSun){ uniforms.uDiskT.value = bhVisualTemp(massSun); },
    zoomBy: orbit.zoomBy,
  };
}
