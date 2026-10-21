// Datos curados. Valores aproximados tomados de publicaciones públicas
// (EHT 2019/2022, Gaia DR3, NASA Planetary Fact Sheet). Revisar antes de usar en un trabajo formal.

const BLACK_HOLES = [
  {
    id: 'sgra',
    name: 'Sagitario A*',
    type: 'Supermasiva · centro de la Vía Láctea',
    massSun: 4.3e6,
    distanceLy: 26700,
    note: 'Imagen de su sombra publicada por el Event Horizon Telescope en 2022.',
    simbad: 'Sgr A*',
  },
  {
    id: 'm87',
    name: 'M87*',
    type: 'Supermasiva · galaxia M87',
    massSun: 6.5e9,
    distanceLy: 55000000,
    note: 'Primera imagen del horizonte de sucesos, Event Horizon Telescope (2019).',
    simbad: 'M 87',
  },
  {
    id: 'cygx1',
    name: 'Cygnus X-1',
    type: 'Estelar · binaria de rayos X',
    massSun: 21.2,
    distanceLy: 7200,
    note: 'Uno de los primeros candidatos sólidos a agujero negro, desde los años 70.',
    simbad: 'Cyg X-1',
  },
  {
    id: 'gaiabh1',
    name: 'Gaia BH1',
    type: 'Estelar · binaria sin emisión de rayos X',
    massSun: 9.6,
    distanceLy: 5100,
    note: 'Detectado por el movimiento de su estrella compañera medido con Gaia (2022).',
    simbad: 'Gaia BH1',
  },
];

// Radios en km, masa en masas terrestres, temperatura media en °C,
// distancia media al Sol en UA, periodo de rotación en horas.
// tiltDeg: inclinación del eje de rotación; retrograde: gira al revés (Venus, Urano).
// style: índice del sombreado procedural en planets3d.js; rings: tiene anillos visibles en 3D.
const PLANETS = [
  { id: 'mercury', name: 'Mercurio', radiusKm: 2440, massEarth: 0.055, moons: 0, tempC: 167, distanceAU: 0.39, dayHours: 4223, tiltDeg: 0.03, style: 0, search: 'Mercury planet' },
  { id: 'venus', name: 'Venus', radiusKm: 6052, massEarth: 0.815, moons: 0, tempC: 464, distanceAU: 0.72, dayHours: 2802, tiltDeg: 177.4, retrograde: true, style: 1, search: 'Venus planet' },
  { id: 'earth', name: 'Tierra', radiusKm: 6371, massEarth: 1, moons: 1, tempC: 15, distanceAU: 1, dayHours: 24, tiltDeg: 23.4, style: 2, search: 'Earth from space' },
  { id: 'mars', name: 'Marte', radiusKm: 3390, massEarth: 0.107, moons: 2, tempC: -63, distanceAU: 1.52, dayHours: 24.6, tiltDeg: 25.2, style: 3, search: 'Mars planet' },
  { id: 'jupiter', name: 'Júpiter', radiusKm: 69911, massEarth: 317.8, moons: 95, tempC: -110, distanceAU: 5.2, dayHours: 9.9, tiltDeg: 3.1, style: 4, search: 'Jupiter planet' },
  { id: 'saturn', name: 'Saturno', radiusKm: 58232, massEarth: 95.2, moons: 274, tempC: -140, distanceAU: 9.54, dayHours: 10.7, tiltDeg: 26.7, style: 5, rings: true, search: 'Saturn planet' },
  { id: 'uranus', name: 'Urano', radiusKm: 25362, massEarth: 14.5, moons: 28, tempC: -195, distanceAU: 19.2, dayHours: 17.2, tiltDeg: 97.8, retrograde: true, style: 6, rings: true, search: 'Uranus planet' },
  { id: 'neptune', name: 'Neptuno', radiusKm: 24622, massEarth: 17.1, moons: 16, tempC: -200, distanceAU: 30.1, dayHours: 16.1, tiltDeg: 28.3, style: 7, search: 'Neptune planet' },
];

// Estrellas parecidas al Sol (y dos de contraste). Radio y masa en unidades solares,
// temperatura efectiva en K, distancia en años luz. Valores aproximados de la literatura
// (SIMBAD, catálogos de gemelas solares); el Sol: R = 696 000 km, T = 5772 K.
const STARS = [
  { id: 'sun', name: 'Sol', radiusSun: 1, tempK: 5772, massSun: 1, distanceLy: 0.0000158, type: 'G2 V · nuestra estrella', simbad: 'Sun', spots: true },
  { id: 'acena', name: 'Alfa Centauri A', radiusSun: 1.22, tempK: 5790, massSun: 1.08, distanceLy: 4.37, type: 'G2 V · la estrella tipo Sol más cercana', simbad: 'alf Cen A' },
  { id: 'acenb', name: 'Alfa Centauri B', radiusSun: 0.86, tempK: 5260, massSun: 0.91, distanceLy: 4.37, type: 'K1 V · compañera de Alfa Centauri A', simbad: 'alf Cen B', spots: true },
  { id: 'tauceti', name: 'Tau Ceti', radiusSun: 0.79, tempK: 5344, massSun: 0.78, distanceLy: 11.9, type: 'G8 V · con candidatos a planetas', simbad: 'tau Cet' },
  { id: '18sco', name: '18 Scorpii', radiusSun: 1.02, tempK: 5817, massSun: 1.02, distanceLy: 45.3, type: 'G2 V · una de las gemelas solares más parecidas', simbad: '18 Sco', spots: true },
  { id: 'kepler452', name: 'Kepler-452', radiusSun: 1.11, tempK: 5757, massSun: 1.04, distanceLy: 1800, type: 'G2 V · anfitriona de Kepler-452 b', simbad: 'Kepler-452' },
  { id: 'proxima', name: 'Próxima Centauri', radiusSun: 0.154, tempK: 3042, massSun: 0.122, distanceLy: 4.24, type: 'M5.5 V · enana roja con manchas y fulguraciones', simbad: 'Proxima Centauri', spots: true },
  { id: 'sirius', name: 'Sirio A', radiusSun: 1.71, tempK: 9940, massSun: 2.06, distanceLy: 8.6, type: 'A1 V · más caliente que el Sol, contraste', simbad: 'Sirius' },
];

// Galaxias explorables. Los modelos 3D son procedurales e ilustrativos; las posiciones
// relativas en la escena NO están a escala (Andrómeda está a 2,5 millones de años luz,
// M87 a unos 54 millones). Datos aproximados (NASA/ESA, NED).
const GALAXIES = [
  {
    id: 'mw', name: 'Vía Láctea', kind: 'Espiral barrada · SBbc', model: 'barred',
    distanceLy: 0, diameterLy: 100000, stars: '100 000 a 400 000 millones', bh: 'Sagitario A* · 4,3 millones M☉',
    note: 'Nuestra galaxia, vista desde fuera: una barra central y cuatro brazos. El Sol está a unos 26 000 años luz del centro.',
  },
  {
    id: 'm31', name: 'Andrómeda (M31)', kind: 'Espiral · SA(s)b', model: 'spiral',
    distanceLy: 2.5e6, diameterLy: 152000, stars: 'alrededor de un billón', bh: 'M31* · unos 140 millones M☉',
    note: 'La galaxia grande más cercana. Se acerca a la Vía Láctea y chocarán dentro de unos 4500 millones de años.',
  },
  {
    id: 'm87', name: 'M87 (Virgo A)', kind: 'Elíptica gigante · E0', model: 'elliptical',
    distanceLy: 5.35e7, diameterLy: 130000, stars: 'varios billones', bh: 'M87* · 6500 millones M☉',
    note: 'Una bola de estrellas viejas con un chorro relativista de 5000 años luz que sale de su agujero negro central.',
  },
  {
    id: 'm104', name: 'Sombrero (M104)', kind: 'Espiral/lenticular · SAa', model: 'sombrero',
    distanceLy: 3.1e7, diameterLy: 50000, stars: 'unos 100 000 millones', bh: 'unos 1000 millones M☉',
    note: 'Casi de canto: un bulbo enorme y brillante cortado por un anillo de polvo oscuro.',
  },
];

// Exoplanetas parecidos a la Tierra (radio cercano a 1 R⊕, en o cerca de la zona habitable).
// Radio en R⊕ (radiusEst: true = no medido; se estima a partir de la masa mínima), periodo en
// días, distancia en años luz, temperatura de la estrella en K. Fuente: NASA Exoplanet Archive
// (valores aproximados). La SUPERFICIE de estos planetas es desconocida: en 3D se muestra una
// superficie imaginada (océanos, continentes y nubes procedurales), no una observación.
// look: parámetros del sombreado (ocean: fracción de océano 0–1, ice: latitud del casquete,
// cloud: cobertura de nubes 0–1, land: tono del suelo, seed: variación del relieve).
const EXO_EARTHS = [
  { id: 'trappist1e', name: 'TRAPPIST-1 e', radiusEarth: 0.92, periodDays: 6.1, distanceLy: 40.7, star: 'TRAPPIST-1 (enana roja M8)', starTempK: 2566, tiltDeg: 0, note: 'Probablemente con rotación sincrónica: una cara siempre de día.', look: { ocean: 0.65, ice: 0.7, cloud: 0.45, land: [0.45, 0.36, 0.3], seed: 2.1 }, search: 'TRAPPIST-1e' },
  { id: 'trappist1f', name: 'TRAPPIST-1 f', radiusEarth: 1.045, periodDays: 9.2, distanceLy: 40.7, star: 'TRAPPIST-1 (enana roja M8)', starTempK: 2566, tiltDeg: 0, note: 'Más fría que TRAPPIST-1 e; podría estar cubierta de hielo.', look: { ocean: 0.55, ice: 0.45, cloud: 0.35, land: [0.55, 0.5, 0.46], seed: 5.3 }, search: 'TRAPPIST-1f' },
  { id: 'proximab', name: 'Próxima Centauri b', radiusEarth: 1.07, radiusEst: true, periodDays: 11.2, distanceLy: 4.24, star: 'Próxima Centauri (enana roja M5.5)', starTempK: 3042, tiltDeg: 0, note: 'El exoplaneta conocido más cercano. Solo se conoce su masa mínima.', look: { ocean: 0.4, ice: 0.75, cloud: 0.3, land: [0.5, 0.33, 0.24], seed: 8.7 }, search: 'Proxima Centauri b' },
  { id: 'toi700d', name: 'TOI-700 d', radiusEarth: 1.07, periodDays: 37.4, distanceLy: 101.4, star: 'TOI-700 (enana roja M2)', starTempK: 3480, tiltDeg: 0, note: 'Descubierto por TESS en 2020 dentro de la zona habitable.', look: { ocean: 0.6, ice: 0.8, cloud: 0.5, land: [0.3, 0.34, 0.2], seed: 11.2 }, search: 'TOI-700 d' },
  { id: 'kepler1649c', name: 'Kepler-1649 c', radiusEarth: 1.06, periodDays: 19.5, distanceLy: 301, star: 'Kepler-1649 (enana roja M5)', starTempK: 3240, tiltDeg: 0, note: 'Encontrado en 2020 al revisar datos antiguos de Kepler; recibe ~75 % de la luz que recibe la Tierra.', look: { ocean: 0.5, ice: 0.72, cloud: 0.55, land: [0.42, 0.4, 0.28], seed: 14.6 }, search: 'Kepler-1649c' },
  { id: 'kepler186f', name: 'Kepler-186 f', radiusEarth: 1.17, periodDays: 129.9, distanceLy: 580, star: 'Kepler-186 (enana roja M1)', starTempK: 3755, tiltDeg: 0, note: 'Primer planeta de tamaño terrestre hallado en la zona habitable de otra estrella (2014).', look: { ocean: 0.52, ice: 0.78, cloud: 0.45, land: [0.36, 0.32, 0.2], seed: 17.9 }, search: 'Kepler-186f' },
  { id: 'teegardenb', name: 'Teegarden b', radiusEarth: 1.02, radiusEst: true, periodDays: 4.9, distanceLy: 12.5, star: 'Estrella de Teegarden (enana roja M7)', starTempK: 2904, tiltDeg: 0, note: 'Uno de los planetas con mayor índice de similitud con la Tierra.', look: { ocean: 0.58, ice: 0.82, cloud: 0.4, land: [0.33, 0.36, 0.22], seed: 21.4 }, search: 'Teegarden star planet' },
  { id: 'kepler442b', name: 'Kepler-442 b', radiusEarth: 1.34, periodDays: 112.3, distanceLy: 1206, star: 'Kepler-442 (enana naranja K)', starTempK: 4402, tiltDeg: 0, note: 'Supertierra en la zona habitable de una estrella naranja, más estable que una enana roja.', look: { ocean: 0.48, ice: 0.83, cloud: 0.5, land: [0.28, 0.38, 0.18], seed: 25.1 }, search: 'Kepler-442b' },
];

// Datos curiosos para la rotación diaria. Cifras aproximadas de misiones y estudios públicos.
// Cada dato tiene una categoría: radiación, habitabilidad, vida o curiosidad.
const DAILY_POOL = [
  { cat: 'radiación', title: 'Radiación en Marte', text: 'En la superficie de Marte, el rover Curiosity midió cerca de 0,6 milisieverts al día. El promedio de la Tierra es de unos 2,4 milisieverts al año, así que en Marte se recibe casi 100 veces más por día.' },
  { cat: 'radiación', title: 'Llamaradas en una enana roja', text: 'Próxima b recibe unas 0,65 veces la luz que la Tierra, pero su estrella lanza llamaradas que pueden multiplicar la radiación ultravioleta y de rayos X durante minutos u horas.' },
  { cat: 'radiación', title: 'El escudo de la Tierra', text: 'El campo magnético y la atmósfera de la Tierra filtran buena parte de la radiación cósmica. Sin ozono, la luz ultravioleta en la superficie sería mucho más intensa.' },
  { cat: 'habitabilidad', title: 'Venus, un horno', text: 'La superficie de Venus alcanza unos 465 °C, más que Mercurio, aunque Mercurio está más cerca del Sol. Su atmósfera es unas 92 veces más densa que la de la Tierra.' },
  { cat: 'habitabilidad', title: '¿Cuánto durarías en otro mundo?', text: 'Sin traje, un humano pierde la consciencia en unos 10 a 15 segundos por falta de oxígeno. Con traje, el límite pasa a ser la radiación y la temperatura. No hay una cifra exacta para un planeta concreto: depende de la atmósfera y de la estrella.' },
  { cat: 'habitabilidad', title: 'Gravedad en Marte', text: 'En Marte pesarías unas 0,38 veces lo que pesas en la Tierra. Un planeta más grande que la Tierra tendría más gravedad y una atmósfera más difícil de retener.' },
  { cat: 'habitabilidad', title: 'Kepler-186 f', text: 'Kepler-186 f fue en 2014 el primer planeta del tamaño aproximado de la Tierra descubierto en la zona habitable de otra estrella. Orbita una enana roja.' },
  { cat: 'curiosidad', title: 'Los siete de TRAPPIST-1', text: 'Los siete planetas de TRAPPIST-1 caben dentro de una órbita más pequeña que la de Mercurio alrededor del Sol.' },
  { cat: 'curiosidad', title: 'La luz del Sol tarda', text: 'La luz del Sol tarda unos 8 minutos en llegar a la Tierra. Lo que ves del Sol ahora es como era hace 8 minutos.' },
  { cat: 'curiosidad', title: 'Lagos de metano en Titán', text: 'Titán, luna de Saturno, tiene lagos y ríos de metano y etano líquidos. Su superficie está a unos -179 °C.' },
  { cat: 'curiosidad', title: 'Un planeta de agua', text: 'K2-18 b tiene unas 2,6 veces el radio de la Tierra. En 2023 se propuso que tiene un océano bajo una atmósfera rica en hidrógeno, aunque esa interpretación sigue en debate.' },
];

// Mundos donde se sospecha que puede haber vida. Ninguno tiene una confirmación.
const LIFE_WORLDS = [
  { name: 'Europa', body: 'Luna de Júpiter', why: 'Bajo su capa de hielo hay un océano de agua líquida. La energía química de ese océano podría sostener microbios.', status: 'Por explorar. Europa Clipper, lanzada en 2024, llegará en 2030.' },
  { name: 'Encélado', body: 'Luna de Saturno', why: 'Lanza chorros de vapor de agua con sales y moléculas orgánicas. En 2017 la sonda Cassini detectó hidrógeno molecular, que podría alimentar microorganismos.', status: 'Sospecha fuerte por química favorable. Sin confirmación de vida.' },
  { name: 'Marte', body: 'Planeta', why: 'Tuvo agua líquida en el pasado. El rover Perseverance busca señales de vida antigua en rocas del cráter Jezero.', status: 'En 2024 se reportaron posibles biofirmas en una roca, sin confirmar.' },
  { name: 'K2-18 b', body: 'Exoplaneta', why: 'Se propuso que tiene océanos y que hay un gas (DMS) asociado a la vida en la Tierra.', status: 'Controvertido. Varios estudios no encontraron ese gas.' },
  { name: 'Titán', body: 'Luna de Saturno', why: 'Tiene química orgánica compleja y lagos de metano. Una vida así sería muy distinta a la nuestra.', status: 'Hipótesis. No hay evidencia de vida.' },
];
