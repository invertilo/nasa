// Proxy mínimo para el Archivo de Exoplanetas de la NASA (TAP), desplegable en Cloudflare Workers.
// El Archivo no envía Access-Control-Allow-Origin, así que el navegador no puede llamarlo directo.
// Este Worker reenvía solo consultas TAP a ese host y devuelve la respuesta con CORS.
//
// Uso desde la página: CONFIG.exoplanetProxy = 'https://TU-WORKER.workers.dev/?url='
// (la página agrega la URL del TAP codificada después de ?url=).
//
// Variable de entorno ALLOWED_ORIGIN: el origen de la página, por ejemplo
// https://invertilo.github.io (o * solo para pruebas locales).

const TARGET_HOST = 'exoplanetarchive.ipac.caltech.edu';
const TARGET_PATH = '/TAP/sync';

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return new Response('Método no permitido', { status: 405, headers: cors });

    const param = new URL(request.url).searchParams.get('url');
    if (!param) return new Response('Falta el parámetro url', { status: 400, headers: cors });

    let target;
    try {
      target = new URL(param);
    } catch {
      return new Response('URL inválida', { status: 400, headers: cors });
    }

    // Solo se reenvían consultas TAP al host oficial; nada de proxy abierto
    if (target.protocol !== 'https:' || target.hostname !== TARGET_HOST || target.pathname !== TARGET_PATH) {
      return new Response('Destino no permitido', { status: 403, headers: cors });
    }

    const upstream = await fetch(target.toString(), {
      cf: { cacheTtl: 3600, cacheEverything: true },
    });

    const headers = new Headers(cors);
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
    headers.set('Cache-Control', 'public, max-age=3600');
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
