// Activo Dúo: utilidades compartidas (tokens de socio, compatibilidad, avisos al móvil).
// Los archivos de /api que empiezan por "_" no se publican como endpoint en Vercel.

import crypto from "node:crypto";

// ── Catálogo ─────────────────────────────────────────────────────────
export const OBJETIVOS = [
  { k: "fuerza", nombre: "Fuerza y músculo", color: "#2563eb" },
  { k: "cardio", nombre: "Cardio y resistencia", color: "#dc2626" },
  { k: "funcional", nombre: "Funcional y clases", color: "#ea580c" },
  { k: "bienestar", nombre: "Tonificar y bienestar", color: "#9333ea" },
  { k: "empezando", nombre: "Estoy empezando", color: "#16a34a" }
];
export const NIVELES = ["empezando", "intermedio", "avanzado"];
export const TAGS = ["sala", "cardio", "clases", "funcional", "running", "movilidad"];
export const GENEROS = ["mujer", "hombre", "otro", "nd"];
export const DIAS = 7;      // 0 = lunes … 6 = domingo
export const FRANJAS = 5;   // 0 = 6–9 · 1 = 9–13 · 2 = 13–16 · 3 = 16–20 · 4 = 20–23
export const SLOTS = new Set();
for (let d = 0; d < DIAS; d++) for (let f = 0; f < FRANJAS; f++) SLOTS.add(`${d}-${f}`);

// ── Claves de la base de datos ───────────────────────────────────────
export const K = {
  gym: (g) => `duo:v1:gym:${g}`,
  owner: (email) => `duo:v1:owner:${email}`,
  socios: (g) => `duo:v1:m:${g}`,
  solicitudes: (g) => `duo:v1:r:${g}`,
  bloqueos: (g) => `duo:v1:b:${g}`,
  reportes: (g) => `duo:v1:rep:${g}`,
  push: (g) => `duo:v1:push:${g}`,
  fotos: (g) => `duo:v1:f:${g}`
};
// Las fotos se guardan aparte y se descargan una sola vez: así las listas pesan poco.
export const huella = (foto) => (foto ? crypto.createHash("sha256").update(foto).digest("base64url").slice(0, 10) : "");

// ── Tokens firmados ──────────────────────────────────────────────────
function clave(etiqueta) {
  const base = process.env.CLAVE_FIRMA || process.env.STRIPE_SECRET_KEY || "";
  if (!base) throw new Error("Falta STRIPE_SECRET_KEY");
  return crypto.createHash("sha256").update(`activo-duo|${etiqueta}|${base}`).digest();
}
const iguales = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export function tokenSocio(g, id) {
  const payload = Buffer.from(JSON.stringify({ g, m: id, x: Date.now() + 400 * 864e5 })).toString("base64url");
  return payload + "." + crypto.createHmac("sha256", clave("token")).update(payload).digest("base64url");
}
export function leerTokenSocio(token) {
  try {
    const [payload, firma] = String(token || "").split(".");
    if (!payload || !firma) return null;
    if (!iguales(firma, crypto.createHmac("sha256", clave("token")).update(payload).digest("base64url"))) return null;
    const d = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!d.g || !d.m || !(d.x > Date.now())) return null;
    return { g: d.g, id: d.m };
  } catch (e) {
    return null;
  }
}
export const nuevoId = () => crypto.randomBytes(9).toString("base64url");
export const nuevoCodigo = () => { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const b = crypto.randomBytes(6); return [...b].map((x) => A[x % 32]).join(""); };

// ── Compatibilidad (misma fórmula que el modo demostración de duo.html) ──
const LV = { empezando: 0, intermedio: 1, avanzado: 2 };
export function compatibilidad(a, b) {
  const comunes = (a.horario || []).filter((s) => (b.horario || []).includes(s));
  let score = Math.min(comunes.length, 3) / 3 * 50;
  if (a.objetivo === b.objetivo) score += 25;
  const dl = Math.abs((LV[a.nivel] ?? 1) - (LV[b.nivel] ?? 1));
  score += dl === 0 ? 15 : dl === 1 ? 7 : 0;
  const ta = new Set(a.tags || []), union = new Set([...(a.tags || []), ...(b.tags || [])]).size;
  score += union ? 10 * (b.tags || []).filter((t) => ta.has(t)).length / union : 0;
  return { score: Math.round(score), comunes };
}
export function generoCompatible(a, b) {
  if (a.pref === "mismo" && (!a.genero || a.genero === "nd" || a.genero !== b.genero)) return false;
  if (b.pref === "mismo" && (!b.genero || b.genero === "nd" || b.genero !== a.genero)) return false;
  return true;
}

// ── Avisos al móvil (Web Push sin contenido, firmado con VAPID) ─────────
// La clave VAPID se deriva del secreto del servidor: no hace falta configurar nada más.
let vapidCache = null;
function vapid() {
  if (vapidCache) return vapidCache;
  let d = clave("vapid");
  const n = Buffer.from("FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551", "hex");
  while (Buffer.compare(d, n) >= 0 || d.every((x) => x === 0)) d = crypto.createHash("sha256").update(d).digest();
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.setPrivateKey(d);
  const pub = ecdh.getPublicKey();
  const key = crypto.createPrivateKey({ key: { kty: "EC", crv: "P-256", d: d.toString("base64url"), x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33, 65).toString("base64url") }, format: "jwk" });
  vapidCache = { publicKey: pub.toString("base64url"), key };
  return vapidCache;
}
export const vapidPublica = () => vapid().publicKey;
export function cabeceraVapid(endpoint) {
  const { publicKey, key } = vapid();
  const aud = new URL(endpoint).origin;
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const datos = enc({ typ: "JWT", alg: "ES256" }) + "." + enc({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:activonorte.media@gmail.com" });
  const firma = crypto.sign("sha256", Buffer.from(datos), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `vapid t=${datos}.${firma}, k=${publicKey}`;
}
export function suscripcionValida(s) {
  try {
    const u = new URL(s && s.endpoint);
    return u.protocol === "https:" && String(s.endpoint).length < 1000;
  } catch (e) {
    return false;
  }
}
// Envía un aviso vacío a cada suscripción. Devuelve las que ya no existen (para borrarlas).
export async function enviarAvisos(subs) {
  const caducadas = [];
  await Promise.all((subs || []).map(async (s) => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(s.endpoint, { method: "POST", headers: { Authorization: cabeceraVapid(s.endpoint), TTL: "86400", Urgency: "high", "Content-Length": "0" }, signal: ctrl.signal });
      clearTimeout(t);
      if (r.status === 404 || r.status === 410) caducadas.push(s.endpoint);
    } catch (e) { /* un aviso que falla no debe romper la acción */ }
  }));
  return caducadas;
}
