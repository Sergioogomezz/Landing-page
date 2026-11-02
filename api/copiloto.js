import { leerToken } from "./_acceso.js";

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
  if (req.method === "GET") return res.status(200).json({ estado: "Copiloto Táctico 48H operativo" });
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

  const models = [
    "gemini-2.5-pro",
    "gemini-3-flash-preview",
    "gemini-2.5-flash"
  ];

  let rawText = "";
  let modelUsed = "";
  let lastError = null;

  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }],
            generationConfig: { temperature: 0.6 }
          }),
        }
      );
      const data = await response.json();
      if (response.ok && data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        rawText = data.candidates[0].content.parts[0].text;
        modelUsed = model;
        break;
      } else {
        lastError = data?.error || data;
      }
    } catch (e) {
      lastError = e.message;
    }
  }

  if (!rawText) {
    return res.status(500).json({
      iaFuncionando: false,
      error: "Google Gemini rechazó la petición",
      detalleError: lastError
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
    model: modelUsed
  });
}
