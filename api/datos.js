// Datos de cada cliente de la Sala de Control, guardados en la nube y asociados a su cuenta.
//
// POST { token, accion: "leer", rev? }               → { ok, rev, datos, actualizado } ({ sinCambios } si rev coincide)
// POST { token, accion: "guardar", datos, baseRev }  → { ok, rev }  ·  409 { conflicto, rev, datos } si otro dispositivo guardó antes
// GET  ?admin=CLAVE_ADMIN&resumen=1                  → (solo tú) cifras de todos los clientes, sin nombres de sus ex-socios
//
// Si la base de datos no está conectada responde 503 { sinNube: true } y la sala sigue funcionando en el dispositivo.

import { cors, leerBody, leerToken, esAdmin } from "./_acceso.js";
import { nubeActiva, redis, pipeline, claveDatos, claveRev, PATRON_DATOS, guardarSiVersion, resumen } from "./_nube.js";

const MAX_BYTES = 900000; // por debajo del límite de 1 MB por petición del plan gratuito de Upstash
const MAX_LISTA = 5000;

function datosValidos(d) {
  return d && typeof d === "object" && !Array.isArray(d) &&
    Array.isArray(d.contactos) && d.contactos.length <= MAX_LISTA &&
    (d.socios === undefined || (Array.isArray(d.socios) && d.socios.length <= MAX_LISTA));
}

async function leer(email, revCliente) {
  if (revCliente != null) {
    const rev = Number(await redis(["GET", claveRev(email)])) || 0;
    if (rev === Number(revCliente)) return { ok: true, sinCambios: true, rev };
  }
  const [valor, revTxt] = await redis(["MGET", claveDatos(email), claveRev(email)]);
  const rev = Number(revTxt) || 0;
  if (!valor) return { ok: true, rev, datos: null };
  const guardado = JSON.parse(valor);
  return { ok: true, rev, datos: guardado.datos || null, actualizado: guardado.actualizado || null };
}

async function resumenTodos() {
  const claves = [];
  let cursor = "0";
  for (let i = 0; i < 50; i++) {
    const [siguiente, lote] = await redis(["SCAN", cursor, "MATCH", PATRON_DATOS, "COUNT", "200"]);
    claves.push(...(lote || []));
    cursor = String(siguiente);
    if (cursor === "0" || claves.length >= 1000) break;
  }
  const valores = await pipeline(claves.map((k) => ["GET", k]));
  return claves.map((k, i) => {
    let g = {};
    try { g = JSON.parse(valores[i] || "{}"); } catch (e) {}
    return Object.assign({ email: k.slice(PATRON_DATOS.length - 1), actualizado: g.actualizado || null }, resumen(g.datos));
  }).sort((a, b) => String(b.actualizado).localeCompare(String(a.actualizado)));
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!nubeActiva()) {
    return res.status(503).json({ ok: false, sinNube: true, error: "La base de datos en la nube no está conectada." });
  }

  try {
    if (req.method === "GET") {
      const q = req.query || {};
      if (!q.admin) return res.status(200).json({ estado: "Nube de la Sala de Control operativa" });
      if (!esAdmin(q.admin)) return res.status(403).json({ ok: false, error: "Clave de administrador incorrecta." });
      const clientes = await resumenTodos();
      return res.status(200).json({ ok: true, clientes: clientes.length, detalle: clientes });
    }

    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
    const body = leerBody(req);
    const sesion = leerToken(body.token);
    if (!sesion) return res.status(401).json({ ok: false, error: "Tu sesión ha caducado. Vuelve a entrar con tu email y tu clave personal." });
    const email = sesion.email;

    if (body.accion === "leer") {
      return res.status(200).json(await leer(email, body.rev));
    }

    if (body.accion === "guardar") {
      if (!datosValidos(body.datos)) return res.status(400).json({ ok: false, error: "Datos no válidos." });
      const valor = JSON.stringify({ actualizado: new Date().toISOString(), datos: body.datos });
      if (Buffer.byteLength(valor, "utf8") > MAX_BYTES) {
        return res.status(413).json({ ok: false, error: "Tus datos ocupan demasiado para guardarlos en la nube." });
      }
      const baseRev = Number(body.baseRev) || 0;
      const r = await guardarSiVersion(email, baseRev, valor);
      if (r.guardado) return res.status(200).json({ ok: true, rev: r.rev });
      // Otro dispositivo guardó antes: devolvemos su versión para combinar los cambios en el navegador.
      const actual = await leer(email, null);
      return res.status(409).json({ ok: false, conflicto: true, rev: actual.rev, datos: actual.datos });
    }

    return res.status(400).json({ ok: false, error: "Acción no válida." });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "No hemos podido acceder a la nube ahora mismo." });
  }
}
