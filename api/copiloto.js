import { leerToken, esAdmin } from "./_acceso.js";

// Hasta 60 s: algunos modelos de Google tardan en responder.
export const config = { maxDuration: 60 };

// Cascada de modelos de Google Gemini:
//   1) Pro: el de más razonamiento (tarda algo más). GEMINI_MODEL_PRO en Vercel va primero si existe.
//   2) Rápido (Flash): si el Pro falla, tarda demasiado o se le acaban los usos. GEMINI_MODEL va primero.
//   3) Si fallan todos, la Sala muestra su mensaje predeterminado.
// Los «-latest» siguen siempre al modelo vigente, así que no se rompen cuando Google retira uno.
const PRO = ["gemini-pro-latest", "gemini-3.1-pro-preview"];
const RAPIDO = ["gemini-flash-latest", "gemini-3.8-flash", "gemini-3.6-flash", "gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-3-flash-preview", "gemini-2.5-flash"];
const lista = (extra, base) => [...new Set([extra, ...base].map((m) => String(m || "").trim()).filter(Boolean))];
const cascada = () => [
  { nivel: "pro", modelos: lista(process.env.GEMINI_MODEL_PRO, PRO) },
  { nivel: "rapido", modelos: lista(process.env.GEMINI_MODEL, RAPIDO).filter((m) => !lista(process.env.GEMINI_MODEL_PRO, PRO).includes(m)) }
];
const TIEMPO_TOTAL = 55000;      // la función puede durar 60 s
const RESERVA_RAPIDO = 18000;    // tiempo que siempre se guarda para el modelo rápido

// Traduce el error de Google a un motivo que el gerente entienda.
function motivoDe(status, error) {
  const t = JSON.stringify(error || "").toLowerCase();
  if (/api[_ ]key|api key not valid|permission_denied|unauthenticated/.test(t) || status === 401 || status === 403) return "clave";
  if (status === 429 || /resource_exhausted|quota/.test(t)) return "cuota";
  if (status === 404 || /not_found|not found|is not supported|deprecated|retired/.test(t)) return "modelo";
  if (/abort|timeout/.test(t)) return "tiempo";
  return "google";
}
const MOTIVOS = {
  clave: "La clave de Google AI (GEMINI_API_KEY) no es válida o está desactivada.",
  cuota: "Se ha agotado el límite gratuito de Google AI por ahora.",
  modelo: "Google ha retirado los modelos de IA configurados.",
  tiempo: "Google AI ha tardado demasiado en responder.",
  google: "Google AI ha rechazado la petición."
};

async function llamarGemini(model, apiKey, prompt, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6 } }),
      signal: ctrl.signal
    });
    const data = await r.json().catch(() => ({}));
    const partes = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const texto = partes.filter((x) => x && typeof x.text === "string" && !x.thought).map((x) => x.text).join("").trim();
    if (r.ok && texto) return { ok: true, texto };
    return { ok: false, motivo: motivoDe(r.status, data && data.error), detalle: { status: r.status, mensaje: data && data.error && data.error.message } };
  } catch (e) {
    return { ok: false, motivo: motivoDe(0, e.name === "AbortError" ? "timeout" : e.message), detalle: { mensaje: e.name === "AbortError" ? "timeout" : String(e.message) } };
  } finally {
    clearTimeout(t);
  }
}

// Copiloto Táctico 48H: redacta la respuesta de WhatsApp para un ex-socio.
// POST { token, message, history?, contexto? }
//   contexto.exsocio → ficha del Tracker (nombre, estado, motivo de baja, objeción…)
//   contexto.centro  → nombre del centro y del gerente, para firmar como él
// Responde { estrategia, mensaje } en texto plano (y reply/plainReply por compatibilidad).

const MAX_MENSAJE = 1500;
const MAX_HISTORIAL = 16;

const txt = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function fichaTexto(contexto) {
  const c = contexto && typeof contexto === "object" ? contexto : {};
  const lineas = [];
  const centro = c.centro || {};
  if (txt(centro.nombre, 80)) lineas.push(`- Centro deportivo: ${txt(centro.nombre, 80)}`);
  if (txt(centro.gerente, 60)) lineas.push(`- Quien escribe (firma si hace falta): ${txt(centro.gerente, 60)}`);
  const e = c.exsocio || {};
  if (txt(e.nombre, 80)) {
    lineas.push(`- Ex-socio: ${txt(e.nombre, 80)} (usa solo su nombre de pila)`);
    if (txt(e.estado, 40)) lineas.push(`- Estado en el tracker: ${txt(e.estado, 40)}`);
    if (e.mesesFuera != null && e.mesesFuera !== "") lineas.push(`- Meses sin venir: ${txt(e.mesesFuera, 4)}`);
    if (txt(e.motivoBaja, 60)) lineas.push(`- Motivo de la baja: ${txt(e.motivoBaja, 60)}`);
    if (txt(e.objecion, 60)) lineas.push(`- Última objeción: ${txt(e.objecion, 60)}`);
    if (txt(e.gancho, 60)) lineas.push(`- Gancho ya ofrecido: ${txt(e.gancho, 60)}`);
    if (txt(e.notas, 400)) lineas.push(`- Notas del gerente: ${txt(e.notas, 400)}`);
  }
  return lineas.length ? "\nFICHA DEL CASO (úsala para personalizar, sin inventar datos que no estén aquí):\n" + lineas.join("\n") + "\n" : "";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  // Solo estado: el copiloto no responde a peticiones anónimas (gasta créditos de IA).
  // Con ?admin=CLAVE_ADMIN prueba cada modelo y dice cuáles funcionan (sin mostrar ninguna clave).
  if (req.method === "GET") {
    const admin = String((req.query && req.query.admin) || "");
    if (!admin) return res.status(200).json({ estado: "Copiloto Táctico 48H operativo" });
    if (!esAdmin(admin)) return res.status(403).json({ ok: false, error: "Clave de administrador incorrecta." });
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(200).json({ claveGemini: "falta", motivo: "Falta GEMINI_API_KEY en Vercel." });
    const resultado = { claveGemini: "configurada" };
    for (const { nivel, modelos } of cascada()) {
      const pruebas = {};
      for (const m of modelos) {
        const r = await llamarGemini(m, key, "Responde solo: OK", 20000);
        pruebas[m] = r.ok ? "funciona" : MOTIVOS[r.motivo] + (r.detalle && r.detalle.mensaje ? " (" + String(r.detalle.mensaje).slice(0, 160) + ")" : "");
        if (r.ok || r.motivo === "clave") break;
      }
      resultado[nivel === "pro" ? "modelosPro" : "modelosRapidos"] = pruebas;
    }
    return res.status(200).json(resultado);
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  // Solo clientes con sesión válida en la Sala de Control
  if (!leerToken(body.token)) {
    return res.status(401).json({ error: "Acceso no válido. Entra en la Sala de Control con tu clave personal." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing GEMINI_API_KEY" });

  const message = String(body.message || "").trim().slice(0, MAX_MENSAJE);
  if (!message) return res.status(400).json({ error: "Escribe lo que te ha respondido el ex-socio." });
  const history = (Array.isArray(body.history) ? body.history : []).slice(-MAX_HISTORIAL)
    .map((m) => ({ role: m && m.role === "user" ? "user" : "assistant", text: String((m && m.text) || "").slice(0, MAX_MENSAJE) }))
    .filter((m) => m.text);

  const conversationContext = history.length > 0
    ? "\nHISTORIAL PREVIO DE ESTE CASO (MANTÉN EL HILO Y CONTEXTO DE ESTE EX-SOCIO):\n" +
      history.map((m) => `${m.role === "user" ? "Gerente del Gimnasio" : "Copiloto Activonorte"}: ${m.text}`).join("\n") + "\n"
    : "";

  const fullPrompt = `Eres el Copiloto Táctico 48H de Activonorte para dueños de gimnasios.
Tu misión es ayudar al gerente del gimnasio a reactivar a un ex-socio por WhatsApp aplicando psicología comercial avanzada y el Protocolo de Reactivación de 48 horas.
Puedes mantener una conversación continua sobre el mismo ex-socio: si el gerente te pide modificar el mensaje anterior (ej. hacerlo más corto, cambiar el tono, añadir un detalle, convertirlo en guion para una nota de voz de 20 segundos) o te pega la siguiente respuesta que le ha dado el mismo ex-socio, adapta la estrategia manteniendo todo el contexto previo.

REGLAS ESTRICTAS DE ACTIVONORTE:
- Regla del Tempomat: Esperar 5-15 min antes de contestar y NO dar consejos de entrenamiento ni nutrición por chat.
- Mentalidad Aikido: Nunca discutas ni suenes como un vendedor insistente. 1) Valida su postura con empatía real ("Te entiendo perfectamente", nunca "pero..."), 2) aísla el problema real y 3) resuelve ofreciéndole un micro-paso adaptado:
  * Falta de tiempo / horarios -> Plan Exprés de 30 minutos.
  * Precio / presupuesto ajustado -> Opción reducida / Plan Exprés más económico (Downsell). Nunca te justifiques con "tenemos máquinas nuevas".
  * Competencia / otro gimnasio / low-cost -> Nunca hables mal de la competencia; siembra la duda sobre el seguimiento personal y ofrece una Revisión Técnica gratuita sin compromiso.
  * "Me lo pienso" / "se lo pregunto a mi pareja" -> Escasez amable: la oferta de reactivación termina este viernes y le guardas la plaza si avisa antes.
  * Pereza / entrenar solo / desmotivación -> Acompañamiento inicial guiado o grupo reducido para que se sienta arropado desde el minuto uno.
  * "No me interesa" -> Cierre elegante sin insistir ("Gracias, aquí estaremos"): un no hoy puede ser un sí dentro de 3 meses.
- Cierre de baja fricción: Cierra SIEMPRE (salvo en el cierre elegante) proponiendo únicamente vernos 5 minutos en el centro o una llamada rápida de 2 minutos, con preguntas suaves tipo "¿Te cuadra...?" o "¿Te parece bien...?". Vende la cita, no la cuota: ni precios ni horarios por chat.
- Personaliza: usa el nombre de pila del ex-socio si lo conoces. Nunca incluyas enlaces.
${fichaTexto(body.contexto)}
FORMATO OBLIGATORIO DE RESPUESTA:
Escribe ÚNICAMENTE dos bloques separados por tres barras verticales (|||), sin comillas ni código markdown:
Diagnóstico táctico en 1-2 frases explicando al gerente cómo aplicamos Aikido o qué hemos ajustado en este paso ||| Mensaje exacto de WhatsApp cercano, natural, persuasivo y de máximo 4 líneas listo para copiar y enviar al ex-socio
${conversationContext}
NUEVO MENSAJE O INSTRUCCIÓN DEL GERENTE:
"${message}"`;

  let rawText = "";
  let modelUsed = "";
  let nivelUsado = "";
  let fallo = null;
  const inicio = Date.now();
  const quedan = () => TIEMPO_TOTAL - (Date.now() - inicio);

  cascadaLoop:
  for (const { nivel, modelos } of cascada()) {
    for (const model of modelos) {
      // El Pro nunca se come el tiempo que necesita el rápido.
      const limite = nivel === "pro" ? Math.min(35000, quedan() - RESERVA_RAPIDO) : Math.min(25000, quedan());
      if (limite < 4000) { if (nivel !== "pro") fallo = fallo || { motivo: "tiempo" }; break; }
      const r = await llamarGemini(model, apiKey, fullPrompt, limite);
      if (r.ok) { rawText = r.texto; modelUsed = model; nivelUsado = nivel; break cascadaLoop; }
      // Una clave mala falla igual con todos los modelos: no seguimos probando.
      if (r.motivo === "clave") { fallo = r; break cascadaLoop; }
      // Se informa del fallo del nivel rápido (el Pro puede fallar sin más si la cuenta no lo incluye).
      if (!fallo || fallo.nivel === "pro" || fallo.motivo === "modelo") fallo = Object.assign({ nivel }, r);
    }
  }

  if (!rawText) {
    const motivo = (fallo && fallo.motivo) || "google";
    console.error("Copiloto: Google Gemini falló", motivo, JSON.stringify(fallo && fallo.detalle));
    return res.status(502).json({
      iaFuncionando: false,
      motivo,
      error: MOTIVOS[motivo]
    });
  }

  const parts = rawText.split("|||");
  const estrategia = (parts.length > 1 ? parts[0] : "Ajustamos la respuesta aplicando Mentalidad Aikido.").replace(/\*\*/g, "").trim();
  const mensaje = (parts.length > 1 ? parts.slice(1).join(" ") : rawText).replace(/\*\*/g, "").trim().replace(/^["«“]+|["»”]+$/g, "").trim();

  // reply (HTML) se mantiene para versiones antiguas de la Sala de Control; el texto de la IA va escapado.
  const htmlReply = `<strong>⏱️ Regla del Tempomat:</strong> Espera entre 5 y 15 minutos antes de contestar.<br><strong>🥋 Aikido IA:</strong> ${escHtml(estrategia)}<div class="an-copy-box">${escHtml(mensaje)}</div>`;

  return res.status(200).json({
    estrategia,
    mensaje,
    reply: htmlReply,
    plainReply: `${estrategia} | Mensaje WhatsApp propuesto: ${mensaje}`,
    model: modelUsed,
    nivel: nivelUsado
  });
}
