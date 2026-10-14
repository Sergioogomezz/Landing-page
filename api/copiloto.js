export default async function handler(req, res) {
  // Permisos CORS para que activonorte.com pueda conectarse sin bloqueos
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const apiKey = process.env.GEMINI_API_KEY;

  // Comprobación rápida desde el navegador
  if (req.method === "GET") {
    return res.status(200).json({
      estado: "Copiloto Activonorte conectado correctamente",
      claveDetectada: Boolean(apiKey)
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!apiKey) {
    return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const message = body?.message || "";

  const systemPrompt = `Eres el Copiloto Táctico 48H de Activonorte para dueños de gimnasios.
Analiza el mensaje o la excusa concreta que ha puesto el ex-socio y redacta una respuesta 100% personalizada aplicando el Protocolo de Reactivación de 48 horas.

REGLAS DE ACTIVONORTE:
- Regla del Tempomat: Esperar 5-15 min antes de contestar y NO dar consejos de entrenamiento por chat.
- Mentalidad Aikido: Valida su postura mencionando los detalles exactos que ha dicho el ex-socio (ej. pereza, entrenar solo, distancia, dinero, horarios) y ofrécele un micro-paso adaptado:
  * Falta de tiempo -> Plan Exprés de 30 minutos.
  * Precio / no tiene dinero -> Opción reducida / Sesión económica adaptada.
  * Competencia -> Revisión Técnica gratuita de 15 min.
  * Pereza / entrenar solo / desmotivación -> Acompañamiento inicial o grupo reducido para no entrenar solo.
- Cierre de baja fricción: Cierra SIEMPRE proponiendo únicamente vernos 5 minutos en el centro o una llamada rápida sin compromiso.

FORMATO OBLIGATORIO DE RESPUESTA:
Escribe ÚNICAMENTE dos bloques separados por tres barras verticales (|||), sin comillas ni código markdown:
Explicación breve en 1 frase de cómo aplicamos Aikido a su excusa concreta ||| Mensaje exacto de WhatsApp cercano, natural y de máximo 4 líneas para copiar y enviar al ex-socio`;

  const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
  let rawText = "";

  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: message }] }],
            generationConfig: { temperature: 0.65 }
          }),
        }
      );
      const data = await response.json();
      if (response.ok && data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        rawText = data.candidates[0].content.parts[0].text;
        break;
      }
    } catch (e) {
      // Intenta con el siguiente modelo si falla
    }
  }

  if (!rawText) {
    return res.status(500).json({ error: "No response from Gemini" });
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

  return res.status(200).json({ reply: htmlReply });
}
