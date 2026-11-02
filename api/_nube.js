// Base de datos en la nube de la Sala de Control (Upstash Redis por su API REST, sin dependencias).
// Los archivos de /api que empiezan por "_" no se publican como endpoint en Vercel.
//
// Se activa al conectar una base de datos en Vercel → Storage → Upstash for Redis.
// Vercel crea solo las variables KV_REST_API_URL y KV_REST_API_TOKEN
// (también valen UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN).

const baseUrl = () => String(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/+$/, "");
const token = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

export const nubeActiva = () => Boolean(baseUrl() && token());

export const claveDatos = (email) => "sala:v1:datos:" + email;
export const claveRev = (email) => "sala:v1:rev:" + email;
export const PATRON_DATOS = "sala:v1:datos:*";

async function enviar(ruta, cuerpo) {
  const r = await fetch(baseUrl() + ruta, {
    method: "POST",
    headers: { Authorization: "Bearer " + token(), "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo)
  });
  let data = null;
  try { data = await r.json(); } catch (e) {}
  if (!r.ok || !data || (!Array.isArray(data) && data.error)) {
    throw new Error((data && data.error) || "Error de la base de datos " + r.status);
  }
  return data;
}

// Un comando: ["GET", "clave"] → resultado
export async function redis(comando) {
  return (await enviar("", comando)).result;
}

// Varios comandos en una sola petición → lista de resultados
export async function pipeline(comandos) {
  if (!comandos.length) return [];
  return (await enviar("/pipeline", comandos)).map((x) => (x && x.error ? null : x && x.result));
}

// Guarda solo si nadie lo ha cambiado desde la versión que tiene el cliente (evita pisar datos).
const SCRIPT_GUARDAR =
  "local r = tonumber(redis.call('GET', KEYS[2]) or '0') " +
  "if r ~= tonumber(ARGV[1]) then return {0, r} end " +
  "redis.call('SET', KEYS[1], ARGV[2]) " +
  "redis.call('SET', KEYS[2], r + 1) " +
  "return {1, r + 1}";

export async function guardarSiVersion(email, baseRev, valor) {
  const res = await redis(["EVAL", SCRIPT_GUARDAR, "2", claveDatos(email), claveRev(email), String(baseRev), valor]);
  return { guardado: Number(res && res[0]) === 1, rev: Number(res && res[1]) || 0 };
}

// Cifras de un cliente (sin nombres ni teléfonos de sus ex-socios), para el panel de administración.
export function resumen(datos) {
  const d = datos && typeof datos === "object" ? datos : {};
  const cs = Array.isArray(d.contactos) ? d.contactos : [];
  const n = (estado) => cs.filter((c) => c && c.estado === estado).length;
  const recuperados = cs.filter((c) => c && c.estado === "matriculado");
  return {
    centro: (d.perfil && d.perfil.centro) || "",
    exSocios: cs.length,
    contactados: cs.length - n("pendiente"),
    enConversacion: n("conversacion"),
    citas: n("cita") + recuperados.length,
    recuperados: recuperados.length,
    eurosAlMes: Math.round(recuperados.reduce((s, c) => s + (Number(c.valor) || 0), 0) * 100) / 100,
    sociosEnPlan30Dias: Array.isArray(d.socios) ? d.socios.length : 0
  };
}
