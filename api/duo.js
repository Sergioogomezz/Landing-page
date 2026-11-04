// Activo Dúo: compañeros de entreno para los socios de cada gimnasio (marca blanca).
//
// Socio (página duo.html, tras escanear el QR del gimnasio):
//   POST { accion: "gym", g }                         → datos públicos del gimnasio
//   POST { accion: "unirme", g, c, perfil }           → alta con el código del QR → { token }
//   POST { accion: "yo" | "perfil" | "pausa" | "borrar", token, … }
//   POST { accion: "compatibles", token }             → socios compatibles, ordenados
//   POST { accion: "fotos", token, ids }              → fotos de perfil (se guardan aparte)
//   POST { accion: "proponer", token, a, slot, nota } → propuesta de entreno
//   POST { accion: "responder", token, id, acepto }   → aceptar o rechazar
//   POST { accion: "cancelar" | "entreno", token, id }
//   POST { accion: "buzon", token }                   → recibidas, enviadas y dúos (con WhatsApp)
//   POST { accion: "bloquear" | "reportar", token, a, motivo? }
//   POST { accion: "vapid" } · { accion: "push", token, sub } → avisos al móvil
// Gerente (desde su Sala de Control con Growth Partner 360):
//   POST { accion: "admin.gym" | "admin.guardar" | "admin.stats" | "admin.socio" | "admin.codigo", token, … }

import { cors, leerBody, leerToken, limpiarEmail } from "./_acceso.js";
import { nubeActiva, redis, pipeline } from "./_nube.js";
import {
  OBJETIVOS, NIVELES, TAGS, GENEROS, SLOTS, K, tokenSocio, leerTokenSocio, nuevoId, nuevoCodigo,
  compatibilidad, generoCompatible, vapidPublica, suscripcionValida, enviarAvisos, huella
} from "./_duo.js";

const MAX_FOTO = 90000;
const MAX_LOGO = 220000;
const MAX_PENDIENTES = 15;

class Fallo extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fallo = (status, msg) => { throw new Fallo(status, msg); };
const json = (v, def) => { try { return v ? JSON.parse(v) : def; } catch (e) { return def; } };
const texto = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
const hoyISO = () => new Date().toISOString().slice(0, 10);
const aObjeto = (r) => { const o = {}; if (Array.isArray(r)) for (let i = 0; i < r.length; i += 2) { const v = json(r[i + 1], null); if (v) o[r[i]] = v; } return o; };

async function hashes(...claves) {
  const res = await pipeline(claves.map((k) => ["HGETALL", k]));
  return res.map(aObjeto);
}

// ── Gimnasio ─────────────────────────────────────────────────────────
function gymPublico(g) {
  return { slug: g.slug, nombre: g.nombre, ciudad: g.ciudad || "", logo: g.logo || "", primario: g.primario, acento: g.acento, objetivos: g.objetivos, contacto: g.contacto || "" };
}
async function leerGym(slug) {
  if (!/^[a-z0-9-]{2,40}$/.test(String(slug || ""))) return null;
  return json(await redis(["GET", K.gym(slug)]), null);
}
function slugDe(nombre) {
  return String(nombre).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "gimnasio";
}
function limpiarGym(e, prev) {
  const nombre = texto(e.nombre, 50);
  if (nombre.length < 2) fallo(400, "Escribe el nombre del gimnasio.");
  const color = (v, def) => (/^#[0-9a-f]{6}$/i.test(String(v || "")) ? String(v).toLowerCase() : def);
  let logo = prev ? prev.logo || "" : "";
  if (e.logo === "") logo = "";
  else if (typeof e.logo === "string" && e.logo) {
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(e.logo) || e.logo.length > MAX_LOGO) fallo(400, "El logo debe ser una imagen PNG, JPG o WEBP de menos de 150 KB.");
    logo = e.logo;
  }
  const entrada = Array.isArray(e.objetivos) ? e.objetivos : [];
  const objetivos = OBJETIVOS.map((o) => {
    const x = entrada.find((y) => y && y.k === o.k) || (prev && prev.objetivos.find((y) => y.k === o.k)) || o;
    return { k: o.k, nombre: texto(x.nombre, 30) || o.nombre, color: color(x.color, o.color) };
  });
  return { nombre, ciudad: texto(e.ciudad, 40), contacto: texto(e.contacto, 80), logo, primario: color(e.primario, prev ? prev.primario : "#003b46"), acento: color(e.acento, prev ? prev.acento : "#e05e00"), objetivos };
}

// ── Socio ────────────────────────────────────────────────────────────
function telefono(v) {
  let d = String(v || "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1); else if (d.startsWith("00")) d = d.slice(2); else if (/^[6789]\d{8}$/.test(d)) d = "34" + d;
  d = d.replace(/\D/g, "");
  return d.length >= 8 && d.length <= 15 ? d : "";
}
function limpiarPerfil(p, gym, nuevo) {
  p = p || {};
  const nombre = texto(p.nombre, 30);
  if (nombre.length < 2) fallo(400, "Escribe tu nombre o un apodo.");
  const foto = typeof p.foto === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p.foto) && p.foto.length <= MAX_FOTO ? p.foto : "";
  const objetivo = gym.objetivos.some((o) => o.k === p.objetivo) ? p.objetivo : fallo(400, "Elige tu objetivo (el color de tu pulsera).");
  const nivel = NIVELES.includes(p.nivel) ? p.nivel : "intermedio";
  const tags = [...new Set((Array.isArray(p.tags) ? p.tags : []).filter((t) => TAGS.includes(t)))];
  const horario = [...new Set((Array.isArray(p.horario) ? p.horario : []).filter((s) => SLOTS.has(s)))];
  if (!horario.length) fallo(400, "Marca al menos una franja en la que sueles venir.");
  const genero = GENEROS.includes(p.genero) ? p.genero : "nd";
  const pref = p.pref === "mismo" && genero !== "nd" ? "mismo" : "todos";
  const tel = telefono(p.tel);
  if (!tel) fallo(400, "Escribe tu móvil con WhatsApp. Solo lo verá quien acepte entrenar contigo.");
  if (nuevo && !(p.mayor18 === true && p.acepto === true)) fallo(400, "Para unirte tienes que ser mayor de edad y aceptar la política de privacidad.");
  return { nombre, foto, frase: texto(p.frase, 120), objetivo, nivel, tags, horario, genero, pref, tel };
}
const publico = (m) => ({ id: m.id, nombre: m.nombre, fv: m.fv || "", frase: m.frase || "", objetivo: m.objetivo, nivel: m.nivel, tags: m.tags || [], horario: m.horario || [] });
const visible = (m) => m && m.activo !== false && !m.pausado && !m.revision;
const entre = (s, a, b) => (s.de === a && s.a === b) || (s.de === b && s.a === a);

async function avisar(g, id) {
  try {
    const subs = json(await redis(["HGET", K.push(g), id]), []);
    if (!subs.length) return;
    const caducadas = await enviarAvisos(subs);
    if (caducadas.length) await redis(["HSET", K.push(g), id, JSON.stringify(subs.filter((s) => !caducadas.includes(s.endpoint)))]);
  } catch (e) { /* los avisos nunca bloquean la acción */ }
}

async function accionesSocio(accion, body, g, gym, yo) {
  const guardarYo = (m) => redis(["HSET", K.socios(g), m.id, JSON.stringify(m)]);
  const conFoto = async (m) => Object.assign({}, m, { foto: m.fv ? (await redis(["HGET", K.fotos(g), m.id])) || "" : "" });

  if (accion === "yo") return { yo: await conFoto(yo), gym: gymPublico(gym) };

  if (accion === "perfil") {
    const entrada = body.perfil || {};
    const { foto, ...p } = limpiarPerfil(Object.assign({}, yo, entrada), gym, false);
    const m = Object.assign({}, yo, p, { upd: new Date().toISOString() });
    if ("foto" in entrada) {
      m.fv = huella(foto);
      if (m.fv !== (yo.fv || "")) await redis(foto ? ["HSET", K.fotos(g), yo.id, foto] : ["HDEL", K.fotos(g), yo.id]);
    }
    await guardarYo(m);
    return { yo: await conFoto(m) };
  }

  if (accion === "pausa") {
    const m = Object.assign({}, yo, { pausado: !!body.pausado, upd: new Date().toISOString() });
    await guardarYo(m);
    return { yo: await conFoto(m) };
  }

  if (accion === "fotos") {
    const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String).filter((x) => /^[A-Za-z0-9_-]{6,20}$/.test(x) && x !== yo.id))].slice(0, 60);
    if (!ids.length) return { fotos: {} };
    const [ms, bs, fs] = await pipeline([["HMGET", K.socios(g), ...ids], ["HMGET", K.bloqueos(g), yo.id, ...ids], ["HMGET", K.fotos(g), ...ids]]);
    const mios = json(bs && bs[0], []), fotos = {};
    ids.forEach((id, i) => {
      const m = json(ms && ms[i], null);
      if (!m || m.activo === false || !fs || !fs[i] || mios.includes(id) || json(bs[i + 1], []).includes(yo.id)) return;
      fotos[id] = fs[i];
    });
    return { fotos };
  }

  if (accion === "borrar") {
    const [sols] = await hashes(K.solicitudes(g));
    const mias = Object.values(sols).filter((s) => s.de === yo.id || s.a === yo.id).map((s) => s.id);
    await pipeline([["HDEL", K.socios(g), yo.id], ["HDEL", K.bloqueos(g), yo.id], ["HDEL", K.push(g), yo.id], ["HDEL", K.fotos(g), yo.id]].concat(mias.length ? [["HDEL", K.solicitudes(g), ...mias]] : []));
    return { borrado: true };
  }

  if (accion === "push") {
    if (!suscripcionValida(body.sub)) fallo(400, "Suscripción no válida.");
    const subs = json(await redis(["HGET", K.push(g), yo.id]), []).filter((s) => s.endpoint !== body.sub.endpoint);
    subs.push({ endpoint: String(body.sub.endpoint), creado: new Date().toISOString() });
    await redis(["HSET", K.push(g), yo.id, JSON.stringify(subs.slice(-5))]);
    return { avisos: true };
  }

  const [socios, sols, bloq] = await hashes(K.socios(g), K.solicitudes(g), K.bloqueos(g));
  const bloqueado = (a, b) => (bloq[a] || []).includes(b) || (bloq[b] || []).includes(a);
  const relacion = (otro) => {
    const s = Object.values(sols).find((x) => entre(x, yo.id, otro) && (x.estado === "pendiente" || x.estado === "aceptada"));
    if (!s) return null;
    return s.estado === "aceptada" ? "duo" : s.de === yo.id ? "enviada" : "recibida";
  };

  if (accion === "compatibles") {
    const lista = Object.values(socios)
      .filter((o) => o.id !== yo.id && visible(o) && !bloqueado(yo.id, o.id) && generoCompatible(yo, o))
      .map((o) => { const c = compatibilidad(yo, o); return Object.assign(publico(o), { score: c.score, comunes: c.comunes, relacion: relacion(o.id) }); })
      .sort((a, b) => b.score - a.score)
      .slice(0, 80);
    return { compatibles: lista };
  }

  if (accion === "buzon") {
    const conPerfil = (id) => socios[id] && socios[id].activo !== false ? publico(socios[id]) : null;
    const recibidas = [], enviadas = [], duos = [];
    // Las propuestas rechazadas o canceladas hace más de 30 días ya no sirven para nada: fuera.
    const viejas = Object.values(sols).filter((s) => (s.estado === "rechazada" || s.estado === "cancelada") && Date.parse(s.resp || s.fin || s.creado) < Date.now() - 30 * 864e5).map((s) => s.id).slice(0, 100);
    if (viejas.length) await redis(["HDEL", K.solicitudes(g), ...viejas]);
    for (const s of Object.values(sols)) {
      if (s.estado === "pendiente" && s.a === yo.id && conPerfil(s.de)) recibidas.push(Object.assign({}, s, { otro: conPerfil(s.de) }));
      else if (s.estado === "pendiente" && s.de === yo.id && conPerfil(s.a)) enviadas.push(Object.assign({}, s, { otro: conPerfil(s.a) }));
      else if (s.estado === "aceptada" && (s.de === yo.id || s.a === yo.id)) {
        const otroId = s.de === yo.id ? s.a : s.de;
        if (conPerfil(otroId)) duos.push(Object.assign({}, s, { otro: conPerfil(otroId), tel: socios[otroId].tel }));
      }
    }
    const orden = (a, b) => String(b.resp || b.creado).localeCompare(String(a.resp || a.creado));
    return { recibidas: recibidas.sort(orden), enviadas: enviadas.sort(orden), duos: duos.sort(orden) };
  }

  if (accion === "proponer") {
    const otro = socios[body.a];
    if (!otro || otro.id === yo.id || !visible(otro) || bloqueado(yo.id, otro.id) || !generoCompatible(yo, otro)) fallo(404, "Este socio ya no está disponible.");
    if (relacion(otro.id)) fallo(409, "Ya tenéis una propuesta en marcha.");
    const hace14 = Date.now() - 14 * 864e5;
    if (Object.values(sols).some((s) => s.de === yo.id && s.a === otro.id && s.estado === "rechazada" && Date.parse(s.resp || s.creado) > hace14)) fallo(409, "Ya le propusiste un entreno hace poco. Dale unos días.");
    if (Object.values(sols).filter((s) => s.de === yo.id && s.estado === "pendiente").length >= MAX_PENDIENTES) fallo(429, "Tienes muchas propuestas sin responder. Espera a que te contesten.");
    const slot = body.slot === "flex" || SLOTS.has(body.slot) ? body.slot : "flex";
    const s = { id: nuevoId(), de: yo.id, a: otro.id, slot, nota: texto(body.nota, 140), estado: "pendiente", creado: new Date().toISOString() };
    await redis(["HSET", K.solicitudes(g), s.id, JSON.stringify(s)]);
    await avisar(g, otro.id);
    return { solicitud: s };
  }

  const sol = sols[body.id];
  if (accion === "responder") {
    if (!sol || sol.a !== yo.id || sol.estado !== "pendiente") fallo(404, "Esta propuesta ya no está pendiente.");
    sol.estado = body.acepto ? "aceptada" : "rechazada";
    sol.resp = new Date().toISOString();
    await redis(["HSET", K.solicitudes(g), sol.id, JSON.stringify(sol)]);
    if (body.acepto) await avisar(g, sol.de);
    return { solicitud: sol, tel: body.acepto && socios[sol.de] ? socios[sol.de].tel : undefined };
  }

  if (accion === "cancelar") {
    if (!sol || !(sol.de === yo.id || sol.a === yo.id)) fallo(404, "No encontramos esta propuesta.");
    if (sol.estado === "pendiente" && sol.de === yo.id) sol.estado = "cancelada";
    else if (sol.estado === "aceptada") sol.estado = "terminada";
    else fallo(409, "Esta propuesta ya no se puede cancelar.");
    sol.fin = new Date().toISOString();
    await redis(["HSET", K.solicitudes(g), sol.id, JSON.stringify(sol)]);
    return { solicitud: sol };
  }

  if (accion === "entreno") {
    if (!sol || sol.estado !== "aceptada" || !(sol.de === yo.id || sol.a === yo.id)) fallo(404, "No encontramos este dúo.");
    if (sol.ultimo === hoyISO()) fallo(409, "Ya habéis apuntado el entreno de hoy. ¡Buen trabajo!");
    sol.entrenos = (sol.entrenos || 0) + 1;
    sol.ultimo = hoyISO();
    const cmds = [["HSET", K.solicitudes(g), sol.id, JSON.stringify(sol)]];
    for (const id of [sol.de, sol.a]) if (socios[id]) cmds.push(["HSET", K.socios(g), id, JSON.stringify(Object.assign({}, socios[id], { entrenos: (socios[id].entrenos || 0) + 1 }))]);
    await pipeline(cmds);
    return { solicitud: sol };
  }

  if (accion === "bloquear" || accion === "reportar") {
    const otro = socios[body.a];
    if (!otro || otro.id === yo.id) fallo(404, "Este socio ya no está disponible.");
    const cmds = [["HSET", K.bloqueos(g), yo.id, JSON.stringify([...new Set([...(bloq[yo.id] || []), otro.id])])]];
    for (const s of Object.values(sols)) {
      if (entre(s, yo.id, otro.id) && (s.estado === "pendiente" || s.estado === "aceptada")) {
        s.estado = s.estado === "aceptada" ? "terminada" : "cancelada"; s.fin = new Date().toISOString();
        cmds.push(["HSET", K.solicitudes(g), s.id, JSON.stringify(s)]);
      }
    }
    if (accion === "reportar") {
      const rep = { id: nuevoId(), de: yo.id, a: otro.id, motivo: texto(body.motivo, 300) || "Sin detalle", creado: new Date().toISOString() };
      cmds.push(["HSET", K.reportes(g), rep.id, JSON.stringify(rep)]);
      const [reps] = await hashes(K.reportes(g));
      const quienes = new Set(Object.values(reps).filter((r) => r.a === otro.id).map((r) => r.de).concat(yo.id));
      if (quienes.size >= 3) cmds.push(["HSET", K.socios(g), otro.id, JSON.stringify(Object.assign({}, otro, { revision: true }))]);
    }
    await pipeline(cmds);
    return { hecho: true };
  }

  fallo(400, "Acción no válida.");
}

// ── Gerente ──────────────────────────────────────────────────────────
async function accionesGerente(accion, body, email) {
  const slugActual = await redis(["GET", K.owner(email)]);
  const gym = slugActual ? await leerGym(slugActual) : null;

  if (accion === "admin.gym") return { gym };

  if (accion === "admin.guardar") {
    const datos = limpiarGym(body.gym || {}, gym);
    if (gym) {
      const nuevo = Object.assign({}, gym, datos, { upd: new Date().toISOString() });
      await redis(["SET", K.gym(gym.slug), JSON.stringify(nuevo)]);
      return { gym: nuevo };
    }
    let slug = slugDe(datos.nombre), n = 1;
    while (await redis(["EXISTS", K.gym(slug)])) { n++; slug = slugDe(datos.nombre).slice(0, 28) + "-" + n; if (n > 50) fallo(409, "No hemos podido crear el enlace del gimnasio."); }
    const nuevo = Object.assign({ slug, codigo: nuevoCodigo(), owner: email, creado: new Date().toISOString() }, datos);
    await pipeline([["SET", K.gym(slug), JSON.stringify(nuevo)], ["SET", K.owner(email), slug]]);
    return { gym: nuevo };
  }

  if (!gym) fallo(404, "Primero configura tu gimnasio.");
  const g = gym.slug;

  if (accion === "admin.codigo") {
    const nuevo = Object.assign({}, gym, { codigo: nuevoCodigo(), upd: new Date().toISOString() });
    await redis(["SET", K.gym(g), JSON.stringify(nuevo)]);
    return { gym: nuevo };
  }

  if (accion === "admin.socio") {
    const m = json(await redis(["HGET", K.socios(g), String(body.id || "")]), null);
    if (!m) fallo(404, "No encontramos a este socio.");
    const nuevo = Object.assign({}, m, { activo: !!body.activo, revision: body.activo ? false : m.revision });
    await redis(["HSET", K.socios(g), m.id, JSON.stringify(nuevo)]);
    return { socio: { id: m.id, activo: nuevo.activo } };
  }

  if (accion === "admin.stats") {
    const [socios, sols, reps] = await hashes(K.socios(g), K.solicitudes(g), K.reportes(g));
    const lista = Object.values(socios);
    const duosDe = (id) => Object.values(sols).filter((s) => (s.estado === "aceptada" || s.estado === "terminada") && (s.de === id || s.a === id)).length;
    const porObjetivo = Object.fromEntries(gym.objetivos.map((o) => [o.k, lista.filter((m) => m.objetivo === o.k).length]));
    const duos = Object.values(sols).filter((s) => s.estado === "aceptada");
    return {
      totales: {
        socios: lista.length,
        buscando: lista.filter(visible).length,
        pausados: lista.filter((m) => m.pausado).length,
        revision: lista.filter((m) => m.revision || m.activo === false).length,
        duos: duos.length,
        duosHistoricos: Object.values(sols).filter((s) => s.estado === "aceptada" || s.estado === "terminada").length,
        pendientes: Object.values(sols).filter((s) => s.estado === "pendiente").length,
        entrenos: Object.values(sols).reduce((n, s) => n + (s.entrenos || 0), 0),
        conDuo: lista.filter((m) => duosDe(m.id) > 0).length
      },
      porObjetivo,
      socios: lista.map((m) => ({ id: m.id, nombre: m.nombre, objetivo: m.objetivo, nivel: m.nivel, creado: m.creado, activo: m.activo !== false, pausado: !!m.pausado, revision: !!m.revision, duos: duosDe(m.id), entrenos: m.entrenos || 0 }))
        .sort((a, b) => String(b.creado).localeCompare(String(a.creado))),
      reportes: Object.values(reps).map((r) => ({ id: r.id, creado: r.creado, motivo: r.motivo, de: socios[r.de] ? socios[r.de].nombre : "(socio dado de baja)", a: r.a, aNombre: socios[r.a] ? socios[r.a].nombre : "(socio dado de baja)", aActivo: socios[r.a] ? socios[r.a].activo !== false : false }))
        .sort((a, b) => String(b.creado).localeCompare(String(a.creado))).slice(0, 50)
    };
  }

  fallo(400, "Acción no válida.");
}

// ── Entrada ──────────────────────────────────────────────────────────
export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method === "GET") return res.status(200).json({ estado: "Activo Dúo operativo", nube: nubeActiva() });
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  if (!nubeActiva()) return res.status(503).json({ ok: false, sinNube: true, error: "Activo Dúo necesita la base de datos en la nube." });

  try {
    const body = leerBody(req);
    const accion = String(body.accion || "");

    if (accion === "vapid") return res.status(200).json({ ok: true, key: vapidPublica() });

    if (accion.startsWith("admin.")) {
      const s = leerToken(body.token);
      if (!s) fallo(401, "Tu sesión de la Sala de Control ha caducado. Vuelve a entrar.");
      if (s.rol !== "growth") fallo(403, "Activo Dúo está incluido en Growth Partner 360.");
      return res.status(200).json(Object.assign({ ok: true }, await accionesGerente(accion, body, limpiarEmail(s.email))));
    }

    if (accion === "gym") {
      const gym = await leerGym(body.g);
      if (!gym) fallo(404, "No encontramos este gimnasio. Escanea de nuevo el código QR.");
      return res.status(200).json({ ok: true, gym: gymPublico(gym) });
    }

    if (accion === "unirme") {
      const gym = await leerGym(body.g);
      if (!gym) fallo(404, "No encontramos este gimnasio. Escanea de nuevo el código QR.");
      if (String(body.c || "").toUpperCase() !== gym.codigo) fallo(403, "El código del QR no es válido o ha cambiado. Escanea el cartel de tu gimnasio.");
      const { foto, ...perfil } = limpiarPerfil(body.perfil, gym, true);
      const m = Object.assign({ id: nuevoId() }, perfil, { fv: huella(foto), activo: true, pausado: false, revision: false, entrenos: 0, creado: new Date().toISOString(), upd: new Date().toISOString() });
      await pipeline([["HSET", K.socios(gym.slug), m.id, JSON.stringify(m)]].concat(foto ? [["HSET", K.fotos(gym.slug), m.id, foto]] : []));
      return res.status(200).json({ ok: true, token: tokenSocio(gym.slug, m.id), yo: Object.assign({}, m, { foto }), gym: gymPublico(gym) });
    }

    const t = leerTokenSocio(body.token);
    if (!t) fallo(401, "Tu sesión ha caducado. Escanea de nuevo el código QR de tu gimnasio.");
    const gym = await leerGym(t.g);
    if (!gym) fallo(404, "Este gimnasio ya no usa Activo Dúo.");
    const yo = json(await redis(["HGET", K.socios(t.g), t.id]), null);
    if (!yo) fallo(401, "Tu perfil ya no existe. Escanea el código QR para volver a unirte.");
    if (yo.activo === false) fallo(403, "Tu perfil está desactivado. Habla con tu gimnasio.");
    return res.status(200).json(Object.assign({ ok: true }, await accionesSocio(accion, body, t.g, gym, yo)));
  } catch (err) {
    if (err instanceof Fallo) return res.status(err.status).json({ ok: false, error: err.message });
    return res.status(500).json({ ok: false, error: "No hemos podido completar la acción. Inténtalo en unos minutos." });
  }
}
