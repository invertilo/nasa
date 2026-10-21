# Cosmos en vivo

Una página para explorar el espacio con datos reales y escenas 3D interactivas: la Estación Espacial Internacional en vivo, el clima del Sol, planetas recién descubiertos, agujeros negros, planetas y estrellas, y galaxias que puedes visitar.

**Demo:** https://nasa-liard-phi.vercel.app
**Desarrollado por:** [Vinicius](https://github.com/invertilo)

## Qué incluye

### Datos en vivo
| Sección | Qué muestra | Fuente |
| --- | --- | --- |
| Estación Espacial Internacional | Altitud, latitud, longitud, velocidad e iluminación, con un globo 2D y su estela. Se actualiza cada 5 s. | Where The ISS At |
| Clima espacial | Índice Kp (agitación geomagnética) y clase de llamarada según los rayos X del Sol. Cada 5 min. | NOAA SWPC |
| Alertas espaciales | Avisos oficiales de tormentas geomagnéticas, radiación y radio. Avisa cuando hay uno nuevo si activas las notificaciones. | NOAA SWPC |
| Asteroides hoy | Cantidad de objetos cercanos, cuántos son potencialmente peligrosos, el más cercano en km y en distancias lunares. Cada hora. | NASA NeoWs |
| Nuevos planetas | Los exoplanetas confirmados más recientes, con telescopio, radio, periodo orbital y distancia. Marca "Nuevo" los que no habías visto. | NASA Exoplanet Archive |
| Imagen astronómica del día | Foto y explicación del día. Si la API falla, muestra una imagen de respaldo de la biblioteca de la NASA. | NASA APOD y NASA Images |

### Datos curiosos diarios
Cinco datos que cambian cada día:
- **Dos en vivo** del Archivo de Exoplanetas: planetas del tamaño de la Tierra que reciben luz parecida, con su radiación, temperatura estimada y distancia.
- **Tres curados** sobre radiación, habitabilidad y vida.

### Mundos donde se sospecha vida
Europa, Encélado, Marte, K2-18 b y Titán. Cada uno explica por qué se sospecha y en qué estado está la evidencia. Ninguno tiene una confirmación.

### Escenas 3D interactivas (Three.js)
- **Galaxia de fondo:** espiral 3D que responde al puntero, con cuatro galaxias para visitar (Vía Láctea, Andrómeda, M87 y Sombrero) y un vuelo de cámara entre ellas.
- **Agujero negro:** trazado de rayos con la física de Schwarzschild. Muestra el disco de acreción con efecto Doppler y el anillo de fotones. Puedes elegir entre cuatro objetos conocidos o explorar cualquier masa.
- **Sol y estrellas:** el Sol y estrellas parecidas, comparadas a escala real, con granulación, manchas y corona. Color por temperatura.
- **Planetas del Sistema Solar y exotierras:** relieve, nubes, anillos, eje de rotación y modo para comparar tamaños. Incluye ocho exoplanetas tipo Tierra con una superficie imaginada (la página lo indica).

### Otras secciones
- Glosario "Cómo leer estos datos", que explica cada número de la página.
- Diseño tipo Liquid Glass, con soporte para movimiento y transparencia reducidos y para pantallas pequeñas.

## Estructura del proyecto

```
index.html        Estructura, estilos y secciones
app.js            Datos en vivo, interfaz y conexión de las escenas
galaxy.js         Galaxia de fondo y vuelo entre galaxias
blackhole.js      Agujero negro con trazado de rayos (GLSL)
stars3d.js        Sol y estrellas a escala
planets3d.js      Planetas y exotierras con superficie procedural (GLSL)
viewer.js         Utilidades 3D compartidas (renderer, controles, bucle, ruido)
data.js           Datos curados: agujeros negros, planetas, estrellas, galaxias,
                  datos curiosos y mundos con posible vida
api/nasa.js       Función de Vercel: reenvía APOD y asteroides agregando la clave
api/exo.js        Función de Vercel: consultas TAP al Archivo de Exoplanetas, con CORS
worker/           Alternativa en Cloudflare Workers con la misma lógica
PLAN.md           Plan de implementación y estado de verificación
```

## Ejecutar en local

No hay paso de compilación. Basta con servir la carpeta con cualquier servidor estático:

```bash
python3 -m http.server 8000
```

Luego abre http://localhost:8000. Sin proxy, la página usa `DEMO_KEY` de la NASA, que tiene límites bajos. Las consultas al Archivo de Exoplanetas necesitan el proxy de `api/exo.js`; sin él, esas secciones muestran datos curados.

## Despliegue en Vercel

1. Importa el repositorio en Vercel. No hace falta configurar el build.
2. En **Settings → Environment Variables**, agrega `NASA_API_KEY` con tu clave de https://api.nasa.gov.
3. Despliega de nuevo para que la variable se aplique.

Las funciones de `api/` se publican solas. La clave nunca llega al navegador.

## Configuración

Los ajustes están al principio de `app.js`:

- `nasaProxy`: ruta de la función que agrega la clave de la NASA (por defecto `/api`).
- `exoplanetProxy`: prefijo de la función que consulta el Archivo de Exoplanetas (por defecto `/api/exo?url=`).
- `intervals`: cada cuánto se actualiza cada bloque de datos.

## Seguridad

- La clave de la NASA vive solo en las variables de entorno de Vercel (o en los secretos del Worker). No está en el código ni en el repositorio.
- `.gitignore` excluye `.env`, `.env.*`, `.dev.vars` y `node_modules/`.
- Las funciones de `api/` solo reenvían las rutas y hosts permitidos. No son proxies abiertos.
- Las respuestas de error no se guardan en caché.

## Fuentes de datos

- [NASA Open APIs](https://api.nasa.gov): APOD, NeoWs.
- [NASA Images](https://images.nasa.gov): imágenes de planetas y respaldo.
- [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu): descubrimientos y radiación de exoplanetas.
- [NOAA SWPC](https://www.swpc.noaa.gov/products-and-data): índice Kp, rayos X y alertas.
- [Where The ISS At](https://wheretheiss.at): posición de la ISS.
- [SIMBAD](https://simbad.cds.unistra.fr): enlaces a fichas de objetos.

Los datos curados (agujeros negros, planetas, estrellas, galaxias y datos curiosos) son aproximados y provienen de publicaciones públicas. Revísalos antes de usarlos en un trabajo formal.

## Limitaciones conocidas

- La imagen del día de la NASA a veces falla en su servidor; la página muestra un respaldo.
- Las superficies de las exotierras y las posiciones entre galaxias son ilustrativas, no mapas reales.
- Las supernovas y novas no están integradas: se publican en el Transient Name Server, que no tiene una consulta sencilla desde el navegador.
- Probado en Chrome y con renderizado por software. Safari, iOS, Firefox y teléfonos reales no se han probado a fondo.

## Licencia

No se ha definido una licencia todavía.
