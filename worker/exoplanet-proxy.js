// Worker de Cloudflare para Cosmos en vivo. Hace dos cosas:
//  1. /nasa/<ruta>: reenvía a api.nasa.gov agregando la clave guardada como secreto NASA_API_KEY.
//     La clave nunca llega al navegador.
//  2. /?url=<TAP>: reenvía solo consultas TAP al Archivo de Exoplanetas (no envía CORS).
//
// Variables (no van en el código):
//  - NASA_API_KEY: secreto, se guarda con `wrangler secret put NASA_API_KEY`.
//  - ALLOWED_ORIGIN: origen de la página, por ejemplo https://invertilo.github.io
//
// Para desarrollo local, pon las mismas variables en worker/.dev.vars (ignorado por git).

const EXO_HOST = 'exoplanetarchive.ipac.caltech.edu';
const EXO_PATH = '/TAP/sync';

// Solo estas rutas de la NASA se reenvían; cualquier otra se rechaza
const NASA_ROUTES = new Set(['planetary/apod', 'neo/rest/v1/feed']);

function corsHeaders(env){
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || 'null',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function reply(body, status, env, extra = {}){
  return new Response(body, { status, headers: { ...corsHeaders(env), ...extra } });
}

async function proxyNasa(url, env){
  const route = url.pathname.replace(/^\/nasa\//, '').replace(/\/$/, '');
  if (!NASA_ROUTES.has(route)) return reply('Ruta no permitida', 403, env);
  if (!env.NASA_API_KEY) return reply('Falta el secreto NASA_API_KEY en el Worker', 500, env);

  const params = new URLSearchParams(url.searchParams);
  params.delete('api_key');              // nunca aceptamos la clave desde el navegador
  params.set('api_key', env.NASA_API_KEY);

  const upstream = await fetch(`https://api.nasa.gov/${route}?${params}`, {
    cf: { cacheTtl: 900, cacheEverything: true },
  });
  return reply(upstream.body, upstream.status, env, {
    'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
    'Cache-Control': 'public, max-age=900',
  });
}

async function proxyExoplanet(param, env){
  let target;
  try{
    target = new URL(param);
  }catch{
    return reply('URL inválida', 400, env);
  }
  // Solo consultas TAP al host oficial; nada de proxy abierto
  if (target.protocol !== 'https:' || target.hostname !== EXO_HOST || target.pathname !== EXO_PATH){
    return reply('Destino no permitido', 403, env);
  }
  const upstream = await fetch(target.toString(), {
    cf: { cacheTtl: 3600, cacheEverything: true },
  });
  return reply(upstream.body, upstream.status, env, {
    'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
    'Cache-Control': 'public, max-age=3600',
  });
}

export default {
  async fetch(request, env){
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });
    if (request.method !== 'GET') return reply('Método no permitido', 405, env);

    const url = new URL(request.url);
    if (url.pathname.startsWith('/nasa/')) return proxyNasa(url, env);

    const param = url.searchParams.get('url');
    if (param) return proxyExoplanet(param, env);

    return reply('Use /nasa/<ruta> o /?url=<consulta TAP>', 400, env);
  },
};
