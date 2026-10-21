// Función de Vercel: reenvía a api.nasa.gov agregando la clave guardada en la variable
// de entorno NASA_API_KEY (Project Settings → Environment Variables). La clave nunca llega al navegador.
// Se llama como /api/nasa?path=planetary/apod&... (path indica la ruta de la NASA).

const ALLOWED = new Set(['planetary/apod', 'neo/rest/v1/feed']);

module.exports = async function handler(req, res){
  const route = String(req.query.path || '');
  if (!ALLOWED.has(route)) return res.status(403).send('Ruta no permitida');

  const key = process.env.NASA_API_KEY;
  if (!key) return res.status(500).send('Falta la variable NASA_API_KEY en Vercel');

  const params = new URLSearchParams(req.query);
  params.delete('path');
  params.delete('api_key');              // nunca aceptamos la clave desde el navegador
  params.set('api_key', key);

  const upstream = await fetch(`https://api.nasa.gov/${route}?${params}`);
  // Solo se guardan en caché las respuestas correctas: un error no debe quedar fijo
  res.setHeader('Cache-Control', upstream.ok ? 'public, s-maxage=900' : 'no-store');
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
  res.status(upstream.status).send(await upstream.text());
};
