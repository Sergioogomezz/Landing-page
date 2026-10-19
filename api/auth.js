export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method === "GET") {
    return res.status(200).json({
      estado: "Sistema de Autenticacion Activonorte OS operativo"
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  const email = (body?.email || "").trim().toLowerCase();
  const password = (body?.password || "").trim().toUpperCase();

  if (!email || !email.includes("@")) {
    return res.status(400).json({
      ok: false,
      error: "Introduce un correo electrónico válido."
    });
  }

  // Claves por nivel de servicio (puedes cambiarlas aquí o en Variables de Entorno de Vercel)
  const PASS_48H = (process.env.PORTAL_PASS_48H || "ACTIVO48H").toUpperCase();
  const PASS_DOMINIO = (process.env.PORTAL_PASS_DOMINIO || "DOMINIOLOCAL").toUpperCase();
  const PASS_GROWTH = (process.env.PORTAL_PASS_GROWTH || "GROWTH360").toUpperCase();

  // Lista opcional de correos VIP con asignación directa
  const vipUsers = {
    "sergio@activonorte.com": { role: "growth", label: "Administrador · Activonorte" }
  };

  if (vipUsers[email] && (password === PASS_GROWTH || password === PASS_48H)) {
    return res.status(200).json({
      ok: true,
      user: {
        email,
        role: vipUsers[email].role,
        planLabel: vipUsers[email].label
      }
    });
  }

  if (password === PASS_48H) {
    return res.status(200).json({
      ok: true,
      user: {
        email,
        role: "protocolo",
        planLabel: "Licencia · Protocolo 48H"
      }
    });
  }

  if (password === PASS_DOMINIO) {
    return res.status(200).json({
      ok: true,
      user: {
        email,
        role: "dominio",
        planLabel: "Cliente · Pack Dominio Local"
      }
    });
  }

  if (password === PASS_GROWTH) {
    return res.status(200).json({
      ok: true,
      user: {
        email,
        role: "growth",
        planLabel: "Partner · Growth 360"
      }
    });
  }

  return res.status(401).json({
    ok: false,
    error: "Clave de acceso incorrecta. Revisa el correo de confirmación de tu compra."
  });
}
