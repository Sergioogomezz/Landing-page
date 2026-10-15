export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
  }

  let message = "";
  if (req.method === "GET") {
    message = req.query?.message || "El ex-socio dice: me da pereza volver porque entreno solo y me queda lejos";
  } else if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    message = body?.message || "";
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const fullPrompt = `Eres el Copiloto Táctico 48H de Activonorte para dueños de gimnasios.
Analiza con psicología comercial profunda el siguiente mensaje o excusa de un ex-socio y redacta una respuesta 100% personalizada aplicando el Protocolo de Reactivación de 48 horas.

REGLAS ESTRICTAS DE ACTIVONORTE:
- Regla del Tempomat: Esperar 5-15 min antes de contestar y NO dar consejos de entrenamiento ni nutrición por chat.
- Mentalidad Aikido: Nunca discutas ni suenes como un vendedor insistente. Valida su postura con empatía real mencionando los detalles exactos que ha dicho el ex-socio (ej. pereza, turnos de trabajo, entrenar solo, distancia, dinero, dolores) y aísla el problema ofreciéndole un micro-paso adaptado:
  * Falta de tiempo / horarios -> Plan Exprés de 30 minutos.
  * Precio / presupuesto ajustado -> Opción reducida / Sesión económica adaptada (Downsell).
  * Competencia / otro gimnasio -> Revisión Técnica gratuita de 15 min sin compromiso para optimizar su rutina actual.
  * Pereza / entrenar solo / desmotivación -> Acompañamiento inicial guiado o grupo reducido para que se sienta arropado desde el minuto uno.
- Cierre de baja fricción: Cierra SIEMPRE proponiendo únicamente vernos 5 minutos en el centro o una llamada rápida sin compromiso (ej. "¿Te cuadra si nos vemos 5 minutos esta semana por el centro y lo vemos sin compromiso?").

FORMATO OBLIGATORIO DE RESPUESTA:
Escribe ÚNICAMENTE dos bloques separados por tres barras verticales (|||), sin comillas ni código markdown:
Diagnóstico táctico en 1-2 frases explicando al gerente cómo aplicamos Aikido a esta excusa concreta ||| Mensaje exacto de WhatsApp cercano, natural, persuasivo y de máximo 4 líneas para copiar y enviar al ex-socio

MENSAJE DEL EX-SOCIO A RESPONDER:
"${message}"`;

  // Priorizamos los modelos Pro (mayor razonamiento psicológico) y dejamos Flash como respaldo rápido
  const models = [
    "gemini-2.5-pro",
    "gemini-1.5-pro",
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
  const estrategia = (parts[0] || "Validamos su objeción concreta y proponemos un micro-paso.").replace(/\*\*/g, "").trim();
  const whatsappMsg = (parts[1] || rawText).replace(/^["«]|["»]$/g, "").trim();
  const waClean = whatsappMsg
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, " ");

  const htmlReply = `<strong>⏱️ Regla del Tempomat:</strong> Espera entre 5 y 15 minutos antes de contestar.<br><strong>🥋 Aikido IA:</strong> ${estrategia}<div class="an-copy-box">${whatsappMsg}<br><button class="an-copy-btn" onclick="copyWhatsApp(this, '${waClean}')">Copiar para WhatsApp</button></div>`;

  if (req.method === "GET" && !req.query?.message) {
    return res.status(200).json({
      iaFuncionando: true,
      modeloActivo: modelUsed,
      respuestaGenerada: whatsappMsg
    });
  }

  return res.status(200).json({ reply: htmlReply, model: modelUsed });
}
