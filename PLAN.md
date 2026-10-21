# Cosmos en vivo — plan de implementación

## Objetivo
Página única, sin backend, que muestra datos reales y actualizados del espacio, con avisos de novedades, agujeros negros, planetas y una galaxia 3D de fondo.

## Problemas detectados en la v1
1. **Índice Kp roto:** NOAA cambió el formato de `noaa-planetary-k-index.json` (ahora son objetos con `Kp`). Por eso aparecía "Kp sin datos". Se pasa a `planetary_k_index_1m.json` (campo `estimated_kp`).
2. **Galaxia mal encuadrada:** la cámara estaba demasiado cerca; el disco se salía de la pantalla y se veía como una franja detrás de las tarjetas.
3. **Rayos X:** no se mostraban por el mismo error que bloqueaba el resto de la función.
4. **Sin manejo de tiempo de espera:** una petición lenta podía dejar la tarjeta en "Conectando…" indefinidamente.
5. **Página de una sola columna sin navegación:** difícil de recorrer cuando crece.

## Fases

### Fase 1: corrección de datos (bloqueante)
- Kp desde `planetary_k_index_1m.json`.
- Rayos X: filtrar `energy === "0.1-0.8nm"`, última medición, clase tipo A/B/C/M/X.
- Alertas NOAA desde `products/alerts.json`, con tipo (WATCH, WARNING, ALERT, SUMMARY) detectado en el texto.
- `fetchJSON` con `AbortController` (10 s) y estado por tarjeta: cargando, ok, error.

### Fase 2: galaxia 3D
- Cámara a distancia suficiente para encuadrar el disco completo.
- Galaxia centrada detrás del contenido, con opacidad baja al desplazarse.
- Respeto a `prefers-reduced-motion`.

### Fase 3: nuevos secciones
- **Alertas en vivo:** avisos NOAA (tormentas geomagnéticas, radiación, radio).
- **Nuevos descubrimientos:** planetas confirmados más recientes (NASA Exoplanet Archive, TAP `pscomppars`), con su estrella anfitriona, año, telescopio, radio y periodo orbital.
- **Agujeros negros:** selector de cuatro objetos conocidos (Sagitario A*, M87*, Cygnus X-1, Gaia BH1) más un control de masa en escala logarítmica. Calcula radio de Schwarzschild, diámetro del horizonte, temperatura de Hawking y comparación con el Sol y la órbita de la Tierra.
- **Planetas:** datos físicos del Sistema Solar (radio, masa, lunas, temperatura, distancia al Sol) y una imagen real de cada uno desde NASA Image and Video Library.
- **APOD y asteroides:** se mantienen; APOD cae a una imagen de la biblioteca si la API falla.

### Fase 4: avisos de novedades
- Badge "Nuevo" en la sección de descubrimientos cuando aparece un planeta que no se había visto antes (guardado en `localStorage`, solo por navegador).
- Notificaciones del navegador opcionales para alertas NOAA nuevas, solo si el usuario lo activa.
- Limitación: supernovas y novas se publican en el Transient Name Server, que no está integrado aquí.

### Fase 5: pulido y accesibilidad
- Navegación con anclas, encabezados semánticos, `aria-live` en alertas.
- Diseño responsive probado a 360 px de ancho.
- Estados vacíos y de error explicados en español.

## Archivos
- `index.html`: estructura y estilos.
- `data.js`: datos curados (agujeros negros, planetas).
- `app.js`: carga de datos, cálculos y galaxia 3D.
- `PLAN.md`: este documento.

## Verificación
- Sintaxis de `app.js` y `data.js` con Node.
- Cada endpoint probado con `curl` (código HTTP y forma del JSON).
- Revisión visual en navegador pendiente de hacer por el usuario.
