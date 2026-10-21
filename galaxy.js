// Galaxia espiral 3D de fondo (Three.js). Expone startGalaxy(canvas).

function startGalaxy(canvas){
  if (!window.THREE){
    canvas.style.display = 'none';
    return;
  }
  const T = THREE;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(50, 1, 0.1, 300);

  // Grupo inclinado (vista casi de frente) y giro propio alrededor del eje del disco
  const tilt = new T.Group();
  tilt.rotation.set(-1.05, 0, 0.25);
  scene.add(tilt);
  const spin = new T.Group();
  tilt.add(spin);

  // Textura de punto suave: convierte cada partícula en un destello redondo
  const dotCanvas = document.createElement('canvas');
  dotCanvas.width = dotCanvas.height = 64;
  const dg = dotCanvas.getContext('2d');
  const dotGrad = dg.createRadialGradient(32, 32, 0, 32, 32, 32);
  dotGrad.addColorStop(0, 'rgba(255,255,255,1)');
  dotGrad.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  dotGrad.addColorStop(1, 'rgba(255,255,255,0)');
  dg.fillStyle = dotGrad;
  dg.fillRect(0, 0, 64, 64);
  const dotTex = new T.CanvasTexture(dotCanvas);

  const gauss = () => {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const RADIUS = 6, ARMS = 2, ARM_TIGHTNESS = 3.4;
  const CORE = new T.Color('#ffd9a0');
  const ARM = new T.Color('#8fb8ff');
  const KNOT = new T.Color('#ffb3d9');
  const BULGE = new T.Color('#ffcf8a');
  const DUST = new T.Color('#6d7bd6');
  const tmp = new T.Color();

  function makeLayer(count, { size, opacity, brightness, colorFn }){
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++){
      const { x, y, z, color, b } = colorFn();
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      col[i * 3] = color.r * b * brightness;
      col[i * 3 + 1] = color.g * b * brightness;
      col[i * 3 + 2] = color.b * b * brightness;
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    return new T.Points(geo, new T.PointsMaterial({
      size, map: dotTex, vertexColors: true, transparent: true, opacity,
      depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true,
    }));
  }

  // Disco con brazos logarítmicos y dispersión gaussiana
  function diskPoint(){
    const r = RADIUS * Math.pow(Math.random(), 1.3);
    const arm = Math.floor(Math.random() * ARMS) * (Math.PI * 2 / ARMS);
    const theta = arm + Math.log(1 + r) * ARM_TIGHTNESS + gauss() * 0.3 * (0.2 + r / RADIUS);
    const rr = r + gauss() * 0.25 * (0.3 + r / RADIUS);
    const thick = 0.12 * (0.3 + 0.7 * (1 - r / RADIUS));
    const knot = Math.random() < 0.06;
    tmp.copy(CORE).lerp(ARM, Math.min(r / RADIUS * 1.2, 1));
    if (knot) tmp.lerp(KNOT, 0.7);
    const center = 1 + (1 - r / RADIUS) * 0.6;
    return {
      x: Math.cos(theta) * rr,
      y: gauss() * thick,
      z: Math.sin(theta) * rr,
      color: tmp,
      b: (0.45 + Math.random() * 0.55) * center,
    };
  }

  // Bulbo central: esfera gaussiana, más cálida
  function bulgePoint(){
    const s = 0.55;
    tmp.copy(BULGE);
    return {
      x: gauss() * s, y: gauss() * s * 0.7, z: gauss() * s,
      color: tmp, b: 0.7 + Math.random() * 0.4,
    };
  }

  // Polvo tenue en el halo
  function dustPoint(){
    const r = RADIUS * (0.5 + Math.random() * 0.9);
    const a = Math.random() * Math.PI * 2;
    tmp.copy(DUST);
    return {
      x: Math.cos(a) * r, y: gauss() * 0.25, z: Math.sin(a) * r,
      color: tmp, b: 0.25 + Math.random() * 0.3,
    };
  }

  // Estrellas brillantes sueltas en los brazos
  function brightPoint(){
    const p = diskPoint();
    tmp.copy(ARM).lerp(new T.Color('#ffffff'), 0.6);
    p.color = tmp;
    p.b = 1;
    return p;
  }

  spin.add(makeLayer(90000, { size: 0.09, opacity: 0.85, brightness: 1, colorFn: diskPoint }));
  spin.add(makeLayer(14000, { size: 0.16, opacity: 0.7, brightness: 0.9, colorFn: bulgePoint }));
  spin.add(makeLayer(9000, { size: 0.12, opacity: 0.35, brightness: 0.6, colorFn: dustPoint }));
  spin.add(makeLayer(1200, { size: 0.32, opacity: 0.95, brightness: 1.3, colorFn: brightPoint }));

  // Resplandor del núcleo y nebulosa difusa
  function glowSprite(stops, scale, opacity){
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    stops.forEach(([o, col]) => grad.addColorStop(o, col));
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const s = new T.Sprite(new T.SpriteMaterial({
      map: new T.CanvasTexture(c), blending: T.AdditiveBlending,
      depthWrite: false, transparent: true, opacity,
    }));
    s.scale.set(scale, scale, 1);
    return s;
  }

  const core = glowSprite([
    [0, 'rgba(255,230,180,1)'],
    [0.2, 'rgba(255,190,120,0.5)'],
    [1, 'rgba(255,190,120,0)'],
  ], 4, 1);
  spin.add(core);

  const nebula = glowSprite([
    [0, 'rgba(120,140,255,0.35)'],
    [0.5, 'rgba(120,90,220,0.12)'],
    [1, 'rgba(120,90,220,0)'],
  ], 22, 0.9);
  tilt.add(nebula);

  // Estrellas de fondo, muy lejanas
  const BG = 2500;
  const bgPos = new Float32Array(BG * 3);
  for (let i = 0; i < BG; i++){
    const v = new T.Vector3(gauss(), gauss(), gauss()).normalize().multiplyScalar(60 + Math.random() * 80);
    bgPos.set([v.x, v.y, v.z], i * 3);
  }
  const bgGeo = new T.BufferGeometry();
  bgGeo.setAttribute('position', new T.BufferAttribute(bgPos, 3));
  scene.add(new T.Points(bgGeo, new T.PointsMaterial({
    size: 0.5, map: dotTex, color: 0xffffff, transparent: true, opacity: 0.7,
    depthWrite: false, blending: T.AdditiveBlending,
  })));

  let mx = 0, my = 0, camX = 0, camY = 0;
  let distance = 15;

  function resize(){
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // En pantallas verticales se aleja la cámara para que la galaxia quepa entera
    distance = camera.aspect < 1 ? 15 / camera.aspect * 0.8 : 15;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  if (!reduceMotion){
    addEventListener('pointermove', (e) => {
      mx = e.clientX / innerWidth * 2 - 1;
      my = e.clientY / innerHeight * 2 - 1;
    });
  }

  // El fondo se atenúa al bajar para no competir con el contenido
  function fade(){
    const k = Math.min(scrollY / 900, 1);
    canvas.style.opacity = String(1 - k * 0.55);
  }
  addEventListener('scroll', fade, { passive: true });
  fade();

  const clock = new T.Clock();
  function frame(){
    const dt = clock.getDelta();
    spin.rotation.y += dt * (reduceMotion ? 0.02 : 0.05);

    if (!reduceMotion){
      camX += (mx * 1.2 - camX) * 0.03;
      camY += ((my * -0.8) - camY) * 0.03;
      const pulse = 4 + Math.sin(clock.elapsedTime * 1.5) * 0.25;
      core.scale.setScalar(pulse);
    }
    camera.position.set(camX, 2 + camY, distance);
    camera.lookAt(0, -0.8, 0);

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();
}
