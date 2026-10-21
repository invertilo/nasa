# Cosmos en vivo — plan y estado

## Objetivo
Página única, estática y sin backend, con datos reales del espacio en vivo y escenas 3D
interactivas (galaxias, Sol y estrellas, agujero negro, planetas), con diseño tipo Apple /
Liquid Glass. Sin bundler ni módulos: scripts planos con funciones globales y Three.js r160
desde cdnjs.

## Archivos
- `index.html`: estructura, tokens de diseño y estilos (Liquid Glass).
- `data.js`: datos curados (agujeros negros, planetas, estrellas tipo Sol, galaxias, exotierras).
- `viewer.js`: utilidades 3D compartidas (detección de WebGL y aviso en español, renderer con
  densidad limitada, control orbital propio con inercia y resortes, bucle que se pausa fuera de
  pantalla, ruido GLSL compartido, color de cuerpo negro).
- `galaxy.js`: fondo 3D con cuatro galaxias procedurales y vuelo de cámara entre ellas.
- `blackhole.js`: agujero negro de Schwarzschild con trazado de rayos en GLSL.
- `planets3d.js`: planetas del Sistema Solar y exotierras con superficie procedural en GLSL.
- `stars3d.js`: el Sol y estrellas comparadas a escala.
- `app.js`: datos en vivo, interfaz y conexión de las escenas.

## Qué se hizo (v2)
1. **Bug de la foto de planetas:** la foto y su bloque (título, "Ver en NASA", "Otra foto") ya
   no se montan en fila: `.photo` es una columna (imagen arriba con `aspect-ratio`, meta abajo con
   `overflow-wrap:anywhere`). Comprobado a 360 px: la meta queda justo debajo con el mismo ancho.
2. **Diseño Liquid Glass:** tokens en `:root`, modo oscuro explícito, vidrio con ~75 % de
   transparencia (alpha 0,25) + `backdrop-filter: blur(28px) saturate(190%)`, canto con luz
   (borde degradado con máscara), reflejo que sigue al puntero, sombras en capas, sombra de texto
   para legibilidad, velo detrás del texto del hero. Nav sticky de vidrio con sección activa.
   Controles segmentados con "pulgar" de vidrio que se desliza con resorte, respuesta al presionar
   en `pointerdown`, tarjetas con inclinación 3D (solo punteros finos), toast que se materializa.
   Respeta `prefers-reduced-motion`, `prefers-reduced-transparency` y `prefers-contrast`.
3. **Galaxias:** Vía Láctea (espiral barrada), Andrómeda (espiral cerrada con anillo y satélites),
   M87 (elíptica de Hernquist con cúmulos globulares y chorro) y Sombrero (bulbo + anillo de polvo).
   Shader de partículas propio (núcleo + halo, centelleo, neblina difusa, polvo que oscurece).
   Arrastrar el hero gira la Vía Láctea; "Entrar" hace un vuelo de cámara con resortes
   (interrumpible) hasta la galaxia; panel de vidrio con datos, selector, zoom y "Salir" (o Esc).
4. **Sol y estrellas:** fotosfera con granulación animada, oscurecimiento del limbo, manchas
   (Sol y estrellas activas), cromosfera/corona como halo, color por temperatura con una paleta
   de presentación (M rojiza, K naranja, G amarillo-blanco, A azulada). Comparación a escala
   real Sol vs estrella elegida.
5. **Agujero negro:** trazado de rayos con la ecuación exacta del fotón en Schwarzschild
   (Verlet, paso adaptativo), disco volumétrico con grosor y turbulencia kepleriana, perfil de
   temperatura de disco delgado, Doppler relativista + corrimiento gravitacional (intensidad ∝ g⁴),
   anillo de fotones e imágenes secundarias que salen de la integración, campo de estrellas en
   tres capas con color por temperatura y banda galáctica tenue (sin el tono morado uniforme).
   El color del disco depende de la masa. Resolución dinámica si los cuadros tardan.
   Regla logarítmica de tamaños (Tierra → heliosfera) y fila "Cabe en".
6. **Planetas 3D:** relieve por mapa de alturas (cráteres, continentes), nubes, casquetes,
   bandas con flujo diferencial, Gran Mancha Roja, luces nocturnas, atmósfera con borde de luz,
   anillos de Saturno (C, B, Cassini, A, Encke) y de Urano con sombras mutuas, eje de rotación
   punteado. Modo "Comparar tamaños" a escala real con etiquetas.
7. **Exotierras:** 8 exoplanetas de ~1 R⊕ en zona habitable (TRAPPIST-1 e/f, Próxima b,
   TOI-700 d, Kepler-1649 c, Kepler-186 f, Teegarden b, Kepler-442 b) con superficie imaginada
   (explicitado en la interfaz) y luz teñida por su estrella; comparación junto a la Tierra.
8. **ISS:** globo ortográfico en canvas 2D con la estela de la órbita (no gasta un contexto WebGL).

## Rendimiento
- Un contexto WebGL por escena (fondo, agujero negro, planetas, estrellas); las tres escenas de
  sección solo dibujan cuando están a la vista (IntersectionObserver) y con la pestaña visible.
- Densidad de píxeles limitada (1,5 en el agujero negro, 1,75 en el resto); el fondo baja a
  ~30 fps cuando se está leyendo más abajo; menos partículas en pantallas chicas.
- Recursos liberados en `pagehide`; aviso si se pierde el contexto WebGL.
- Sin WebGL: aviso en español en cada escena y en el hero; los datos en vivo siguen funcionando.

## Verificación hecha
- `node --check` en todos los `.js`: sin errores.
- Script de Python: todos los ids usados con `$()` existen en `index.html` (salvo `pl-next`, que
  se crea dinámicamente) y no hay ids duplicados.
- Todos los shaders (12, vértice y fragmento) extraídos con Node y validados con
  `glslangValidator -S frag/vert`: válidos.
- Render real en Chrome for Testing headless (GPU Metal, Apple M1) por CDP, a 1280×860 y 360×780:
  sin excepciones de JavaScript, sin scroll horizontal a 360 px, capturas revisadas de hero,
  agujero negro, planetas, comparación, exotierras, estrellas y vuelo a las cuatro galaxias.

## Limitaciones conocidas
- **Exoplanet Archive (TAP) no envía cabeceras CORS** (verificado con curl): el navegador bloquea
  la consulta directa. "Planetas recién descubiertos" y las "anfitrionas en vivo" quedan
  desactivados con un mensaje informativo hasta configurar `CONFIG.exoplanetProxy` (proxy propio).
- `DEMO_KEY` de la NASA tiene un límite bajo por IP (en las pruebas devolvió 429): APOD cae a la
  biblioteca de imágenes; asteroides muestra el error. Conviene poner una clave propia.
- No se probó en Safari/iOS ni en Firefox, ni en un teléfono real; tampoco se midió el rendimiento
  en GPUs integradas lentas (hay resolución dinámica en el agujero negro).
- Las posiciones entre galaxias y las superficies de las exotierras son ilustrativas.
