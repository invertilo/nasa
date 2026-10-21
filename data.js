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
const PLANETS = [
  { id: 'mercury', name: 'Mercurio', radiusKm: 2440, massEarth: 0.055, moons: 0, tempC: 167, distanceAU: 0.39, dayHours: 4223, search: 'Mercury planet' },
  { id: 'venus', name: 'Venus', radiusKm: 6052, massEarth: 0.815, moons: 0, tempC: 464, distanceAU: 0.72, dayHours: 2802, search: 'Venus planet' },
  { id: 'earth', name: 'Tierra', radiusKm: 6371, massEarth: 1, moons: 1, tempC: 15, distanceAU: 1, dayHours: 24, search: 'Earth from space' },
  { id: 'mars', name: 'Marte', radiusKm: 3390, massEarth: 0.107, moons: 2, tempC: -63, distanceAU: 1.52, dayHours: 24.6, search: 'Mars planet' },
  { id: 'jupiter', name: 'Júpiter', radiusKm: 69911, massEarth: 317.8, moons: 95, tempC: -110, distanceAU: 5.2, dayHours: 9.9, search: 'Jupiter planet' },
  { id: 'saturn', name: 'Saturno', radiusKm: 58232, massEarth: 95.2, moons: 274, tempC: -140, distanceAU: 9.54, dayHours: 10.7, search: 'Saturn planet' },
  { id: 'uranus', name: 'Urano', radiusKm: 25362, massEarth: 14.5, moons: 28, tempC: -195, distanceAU: 19.2, dayHours: 17.2, search: 'Uranus planet' },
  { id: 'neptune', name: 'Neptuno', radiusKm: 24622, massEarth: 17.1, moons: 16, tempC: -200, distanceAU: 30.1, dayHours: 16.1, search: 'Neptune planet' },
];
