// Acceso a la Sala de Control, verificado contra Stripe.
//
// POST { session_id }        → cliente que vuelve de pagar: comprueba el pago y le da su clave personal.
// POST { email, password }   → cliente que vuelve otro día: email + clave personal.
// POST { token }             → sesión guardada en el navegador.
// GET  ?admin=CLAVE_ADMIN&email=cliente@x.com → (solo tú) claves personales y compras de ese email.

import {
  PLAN_LABEL, cors, leerBody, limpiarEmail, codigoPersonal, rolDeCodigo,
  crearToken, leerToken, verificarPago, growthActivo, recursos, comprasDe, accesosManuales
} from "./_acceso.js";
import crypto from "node:crypto";

const SOPORTE = "Escríbenos por WhatsApp al +34 610 38 72 76 o a activonorte.media@gmail.com y lo resolvemos.";

function respuesta(email, rol, extra) {
  return Object.assign({
    ok: true,
    user: { email, role: rol, planLabel: PLAN_LABEL[rol] },
    token: crearToken(email, rol)
  }, extra || {});
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ ok: false, error: "El acceso está en mantenimiento. " + SOPORTE });
  }

  try {
    if (req.method === "GET") {
      const admin = String((req.query && req.query.admin) || "");
      const clave = process.env.CLAVE_ADMIN || "";
      if (!admin) return res.status(200).json({ estado: "Sistema de Autenticación Activonorte OS operativo" });
      const okAdmin = clave.length >= 12 && admin.length === clave.length &&
        crypto.timingSafeEqual(Buffer.from(admin), Buffer.from(clave));
      if (!okAdmin) return res.status(403).json({ ok: false, error: "Clave de administrador incorrecta." });
      const email = limpiarEmail(req.query.email);
      if (!email.includes("@")) return res.status(400).json({ ok: false, error: "Añade &email=correo@cliente.com" });
      return res.status(200).json({
        email,
        claves: {
          protocolo: codigoPersonal(email, "protocolo"),
          dominio: codigoPersonal(email, "dominio"),
          growth: codigoPersonal(email, "growth")
        },
        accesoManual: accesosManuales()[email] || null,
        comprasEnStripe: await comprasDe(email)
      });
    }

    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
    const body = leerBody(req);

    // 1) Vuelta del pago
    if (body.session_id) {
      const compra = await verificarPago(body.session_id);
      if (!compra) {
        return res.status(402).json({ ok: false, error: "No encontramos un pago completado con este enlace. " + SOPORTE });
      }
      return res.status(200).json(respuesta(compra.email, compra.rol, {
        codigo: codigoPersonal(compra.email, compra.rol),
        recursos: await recursos()
      }));
    }

    // 2) Sesión guardada en el navegador
    if (body.token) {
      const t = leerToken(body.token);
      if (!t) return res.status(401).json({ ok: false, error: "Tu sesión ha caducado. Vuelve a entrar con tu email y tu clave personal." });
      if (t.rol === "growth" && !(await growthActivo(t.email))) {
        return res.status(403).json({ ok: false, error: "Tu suscripción a Growth Partner 360 no está activa. " + SOPORTE });
      }
      return res.status(200).json(respuesta(t.email, t.rol, { recursos: await recursos() }));
    }

    // 3) Email + clave personal
    const email = limpiarEmail(body.email);
    if (!email || !email.includes("@")) {
      return res.status(400).json({ ok: false, error: "Introduce un correo electrónico válido." });
    }
    const rol = rolDeCodigo(email, body.password);
    if (!rol) {
      return res.status(401).json({ ok: false, error: "Email o clave personal incorrectos. Usa el mismo email con el que pagaste. ¿Has perdido tu clave? " + SOPORTE });
    }
    if (rol === "growth" && !(await growthActivo(email))) {
      return res.status(403).json({ ok: false, error: "Tu suscripción a Growth Partner 360 no está activa. " + SOPORTE });
    }
    return res.status(200).json(respuesta(email, rol, { recursos: await recursos() }));
  } catch (err) {
    return res.status(500).json({ ok: false, error: "No hemos podido verificar tu acceso ahora mismo. Inténtalo en unos minutos. " + SOPORTE });
  }
}
