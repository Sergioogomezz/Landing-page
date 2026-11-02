// Utilidades compartidas del acceso a la Sala de Control.
// Los archivos de /api que empiezan por "_" no se publican como endpoint en Vercel.
//
// Variables de entorno (Vercel → Settings → Environment Variables):
//   STRIPE_SECRET_KEY  (obligatoria) Clave restringida de Stripe con permiso de LECTURA en
//                      Checkout Sessions, Customers, Subscriptions y Products.
//   CLAVE_ADMIN        (recomendada) Contraseña tuya para consultar la clave personal de un cliente.
//   CLAVE_FIRMA        (opcional) Secreto para firmar claves y sesiones. Si no existe se deriva de
//                      STRIPE_SECRET_KEY (si cambias esa clave, cambian las claves de los clientes).
//   ACCESOS_MANUALES   (opcional) Accesos sin pago en Stripe, separados por comas: "email:rol".
//                      Roles: protocolo, dominio, growth.

import crypto from "node:crypto";

export const NIVEL = { protocolo: 1, dominio: 2, growth: 3 };
export const PLAN_LABEL = {
  protocolo: "Licencia · Protocolo 48H",
  dominio: "Cliente · Pack Dominio Local",
  growth: "Partner · Growth 360"
};
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O ni 1/I para evitar confusiones
const DIAS_SESION = 30;

function secreto() {
  const base = process.env.CLAVE_FIRMA || process.env.STRIPE_SECRET_KEY || "";
  if (!base) throw new Error("Falta STRIPE_SECRET_KEY");
  return crypto.createHash("sha256").update("activonorte-acceso|" + base).digest();
}

function iguales(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function limpiarEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// Clave personal: depende del email y del producto, así que no sirve para nadie más.
export function codigoPersonal(email, rol) {
  const h = crypto.createHmac("sha256", secreto()).update(`codigo|${limpiarEmail(email)}|${rol}`).digest();
  let out = "";
  for (let i = 0; i < 10; i++) out += ALFABETO[h[i] % 32];
  return out.slice(0, 5) + "-" + out.slice(5);
}

export function normalizarCodigo(valor) {
  const s = String(valor || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length === 10 ? s.slice(0, 5) + "-" + s.slice(5) : s;
}

// Busca qué producto desbloquea una clave (del más completo al más básico).
export function rolDeCodigo(email, codigo) {
  const c = normalizarCodigo(codigo);
  for (const rol of ["growth", "dominio", "protocolo"]) {
    if (iguales(c, codigoPersonal(email, rol))) return rol;
  }
  return null;
}

export function crearToken(email, rol) {
  const payload = Buffer.from(JSON.stringify({ e: limpiarEmail(email), r: rol, x: Date.now() + DIAS_SESION * 864e5 })).toString("base64url");
  const firma = crypto.createHmac("sha256", secreto()).update("token|" + payload).digest("base64url");
  return payload + "." + firma;
}

export function leerToken(token) {
  try {
    const [payload, firma] = String(token || "").split(".");
    if (!payload || !firma) return null;
    const esperada = crypto.createHmac("sha256", secreto()).update("token|" + payload).digest("base64url");
    if (!iguales(firma, esperada)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.e || !NIVEL[data.r] || !(data.x > Date.now())) return null;
    return { email: data.e, rol: data.r };
  } catch (e) {
    return null;
  }
}

export function accesosManuales() {
  const mapa = {};
  String(process.env.ACCESOS_MANUALES || "").split(",").forEach((par) => {
    const [email, rol] = par.split(":").map((s) => (s || "").trim().toLowerCase());
    if (email && NIVEL[rol]) mapa[email] = rol;
  });
  return mapa;
}

// ── Stripe (API REST, sin dependencias) ─────────────────────────────
export async function stripe(ruta, params) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Falta STRIPE_SECRET_KEY");
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  const r = await fetch("https://api.stripe.com/v1" + ruta + qs, {
    headers: { Authorization: "Bearer " + key }
  });
  const data = await r.json();
  if (!r.ok) {
    const err = new Error((data && data.error && data.error.message) || "Error de Stripe " + r.status);
    err.status = r.status;
    throw err;
  }
  return data;
}

function rolMayor(a, b) {
  if (!NIVEL[a]) return NIVEL[b] ? b : null;
  if (!NIVEL[b]) return a;
  return NIVEL[b] > NIVEL[a] ? b : a;
}

// Comprueba una compra recién hecha a partir del ?session_id= que añade Stripe al volver del pago.
export async function verificarPago(sessionId) {
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(String(sessionId || ""))) return null;
  const s = await stripe("/checkout/sessions/" + sessionId, [["expand[]", "line_items.data.price.product"]]);
  const pagado = s.status === "complete" && (s.payment_status === "paid" || s.payment_status === "no_payment_required");
  if (!pagado) return null;
  const email = limpiarEmail((s.customer_details && s.customer_details.email) || s.customer_email);
  let rol = (s.metadata && s.metadata.rol) || null;
  ((s.line_items && s.line_items.data) || []).forEach((li) => {
    const precio = li.price || {};
    const producto = typeof precio.product === "object" ? precio.product : {};
    rol = rolMayor(rol, (producto.metadata && producto.metadata.rol) || (precio.metadata && precio.metadata.rol));
  });
  if (!email || !NIVEL[rol]) return null;
  return { email, rol };
}

// Growth Partner 360 es mensual: solo da acceso mientras la suscripción siga activa.
export async function growthActivo(email) {
  if (accesosManuales()[limpiarEmail(email)] === "growth") return true;
  const clientes = await stripe("/customers", { email: limpiarEmail(email), limit: "10" });
  for (const c of clientes.data || []) {
    const subs = await stripe("/subscriptions", { customer: c.id, status: "all", limit: "20" });
    const ok = (subs.data || []).some((sub) =>
      ["active", "trialing", "past_due"].includes(sub.status) &&
      ((sub.items && sub.items.data) || []).some((it) => it.price && it.price.metadata && it.price.metadata.rol === "growth")
    );
    if (ok) return true;
  }
  return false;
}

// Enlaces de descarga: se guardan como metadatos (recurso_xxx) del producto "protocolo" en Stripe,
// así no aparecen en el código público de la web. Se editan en Stripe → Productos → Metadatos.
export async function recursos() {
  const prods = await stripe("/products", { active: "true", limit: "100" });
  const p = (prods.data || []).find((x) => x.metadata && x.metadata.rol === "protocolo");
  const out = {};
  Object.entries((p && p.metadata) || {}).forEach(([k, v]) => {
    if (k.indexOf("recurso_") === 0 && /^https:\/\//.test(v)) out[k.slice(8)] = v;
  });
  return out;
}

// Compras de un email (para el panel de administración).
export async function comprasDe(email) {
  const lista = await stripe("/checkout/sessions", { "customer_details[email]": limpiarEmail(email), limit: "20" });
  return (lista.data || []).map((s) => ({
    fecha: new Date(s.created * 1000).toISOString().slice(0, 10),
    estado: s.status + " / " + s.payment_status,
    producto: (s.metadata && s.metadata.rol) || "?",
    importe: s.amount_total != null ? (s.amount_total / 100).toFixed(2) + " " + String(s.currency || "").toUpperCase() : "?"
  }));
}

export function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export function leerBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  return body || {};
}
