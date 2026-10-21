// Función de Vercel: reenvía consultas TAP al Archivo de Exoplanetas de la NASA y agrega CORS.
// Solo acepta el host y la ruta oficiales; no es un proxy abierto.

const EXO_HOST = 'exoplanetarchive.ipac.caltech.edu';
const EXO_PATH = '/TAP/sync';

module.exports = async function handler(req, res){
  let target;
  try{
    target = new URL(String(req.query.url || ''));
  }catch{
    return res.status(400).send('URL inválida');
  }
  if (target.protocol !== 'https:' || target.hostname !== EXO_HOST || target.pathname !== EXO_PATH){
    return res.status(403).send('Destino no permitido');
  }

  const upstream = await fetch(target.toString());
  res.setHeader('Cache-Control', 'public, s-maxage=3600');
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
  res.status(upstream.status).send(await upstream.text());
};
