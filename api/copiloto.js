export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
  }

  const systemPrompt = `Eres el Copiloto Táctico 48H de Activonorte, integrado en la Sala de Control para dueños de gimnasios y centros deportivos.
Tu única misión es ayudar al gerente del gimnasio a aplicar el Protocolo de Reactivación de 48 horas con precisión quirúrgica.

REGLAS ESTRICTAS DEL SISTEMA ACTIVONORTE:
1. Fase 1 (Calibración): Filtro Oro = ex-socios dados de baja hace 3-9 meses con mínimo 4 asistencias/mes (en Trainingym, Resawod, etc.). Lista Negra = morosos, mudanzas, lesiones graves o conflictivos.
2. Fase 2 (Primer Impacto): Mensajes individuales (prohibido listas de difusión). Ventanas: martes, miércoles o jueves en El Almuerzo (13:30-14:30) o El Sofá (20:30-21:30, notas de voz cortas). Prohibido incluir precios, enlaces o venta directa en el primer mensaje.
3. Fase 3 (Neutralización y Cierre - Día 2):
   - Recuerda SIEMPRE aplicar la Regla del Tempomat: esperar entre 5 y 15 minutos antes de responder y NO dar consejos de entrenamiento por chat.
   - Aplica Mentalidad Aikido (nunca discutas con la objeción; valida la postura, aísla el problema y ofrece una acción pequeña):
     * Falta de tiempo -> Plan Exprés de 30 minutos.
     * Es muy caro / dinero -> Sesión económica / Downsell.
     * Ya va a la competencia -> Revisión Técnica gratuita.
   - Cierre de baja fricción: El objetivo NUNCA es vender la cuota por WhatsApp, sino lograr una micro-visita o llamada con una pregunta como: "¿Te cuadra si nos vemos 5 minutos?".

FORMATO DE RESPUESTA (en HTML limpio y breve):
- 1 línea indicando el diagnóstico y recordando esperar 5-15 min (Tempomat).
- El mensaje exacto para enviar por WhatsApp entre comillas, natural, cercano y de máximo 4 líneas.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: message }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 350 }
        }),
      }
    );

    const data = await response.json();
    const rawText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Aplica la Regla del Tempomat (5-15 min) y propón vernos 5 minutos en el centro.";

    const formattedHtml = rawText.replace(/\n/g, "<br>");
    return res.status(200).json({ reply: formattedHtml });
  } catch (error) {
    return res.status(500).json({ error: "Error conectando con el modelo" });
  }
}
