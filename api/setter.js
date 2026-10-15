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

  if (req.method === "GET") {
    return res.status(200).json({
      estado: "Agente Setter B2B Activonorte operativo",
      claveDetectada: Boolean(apiKey)
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  const history = body?.history || [];
  const userMessage = body?.message || "";

  const conversationText = history
    .map((m) => `${m.role === "user" ? "Dueño de Gimnasio" : "Activonorte"}: ${m.text}`)
    .join("\n");

  const fullPrompt = `Eres el Consultor de Admisión e Inteligencia Comercial B2B de Activonorte (agencia de marketing deportivo especializada 100% en gimnasios, boxes de CrossFit y centros deportivos, fundada por Sergio Gómez en Santander, Cantabria).

TU OBJETIVO ÚNICO:
Atender al dueño o gerente de un gimnasio que visita la web, resolver sus dudas con autoridad financiera (hablamos de rentabilidad, LTV y retención, nunca de "likes"), cualificar su centro y lograr que agende una "Auditoría Gratuita de 15 minutos por videollamada" o que compre el "Protocolo de Reactivación 48H" (17€).

ESCALERA DE SERVICIOS DE ACTIVONORTE:
1. Protocolo de Reactivación 48H (17€ - Producto de entrada): Sistema paso a paso (Sala de Control + Plantillas + Copiloto IA + Tracker) para reactivar de 5 a 10 ex-socios en una semana sin gastar en publicidad.
2. Pack Dominio Local (Mid-Ticket - Precio a consultar en auditoría): Optimización y gestión semanal del perfil de Google Business y SEO local para meter al gimnasio en el Top 3 de su barrio/ciudad y captar tráfico orgánico.
3. Growth Partner 360 y Sistema Phygital Pulso (High-Ticket - Precio personalizado tras auditoría): Departamento de marketing externo completo y sistema de fidelización comunitaria para tapar fugas de socios (churn rate).

REGLAS DE ORO DE CONVERSACIÓN:
- Sé directo, cercano, profesional y breve (máximo 3-4 líneas por respuesta).
- NUNCA inventes ni des precios cerrados de "Pack Dominio Local" ni de "Growth Partner 360". Explica que cada centro tiene un volumen distinto y que por eso hacemos primero una Auditoría Gratuita de 15 minutos en vivo viendo su ficha de Google y su zona.
- Haz siempre UNA pregunta final de cualificación o cierre al terminar tu mensaje (ej: "¿Qué tipo de centro diriges y en qué ciudad estáis?", "¿Cuál sientes que es hoy vuestro mayor freno: bajas de socios o captar gente nueva en vuestra zona?", "¿Te cuadra que veamos los 3 puntos de mejora de tu ficha de Google en una videollamada rápida de 15 min esta semana?").

FORMATO OBLIGATORIO DE SALIDA:
Escribe ÚNICAMENTE dos bloques separados por tres barras verticales (|||), sin bloques markdown ni comillas alrededor:
Respuesta comercial breve y persuasiva para el dueño del gimnasio (máximo 4 líneas) ||| Mensaje pre-rellenado en primera persona para que el dueño lo envíe al WhatsApp de Sergio agendando la auditoría (incluyendo los datos del gimnasio o duda que haya mencionado en la conversación)

HISTORIAL DE LA CONVERSACIÓN HASTA AHORA:
${conversationText}
Dueño de Gimnasio: "${userMessage}"`;

  const models = [
    "gemini-3-flash-preview",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-flash-latest"
  ];

  let rawText = "";
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
        break;
      }
    } catch (e) {}
  }

  if (!rawText) {
    return res.status(500).json({ error: "No response from AI" });
  }

  const parts = rawText.split("|||");
  const replyText = (parts[0] || rawText).replace(/\*\*/g, "").trim();
  const waSummary = (parts[1] || `Hola Sergio, tengo un centro deportivo y me gustaría agendar la Auditoría Gratuita de 15 min. Mi consulta es: ${userMessage}`).trim();
  const waUrl = `https://wa.me/34610387276?text=${encodeURIComponent(waSummary)}`;

  return res.status(200).json({
    reply: replyText,
    waUrl: waUrl
  });
}
