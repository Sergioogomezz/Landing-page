export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const message = body?.message || "";

  const systemPrompt = `Eres el Copiloto Táctico 48H de Activonorte, integrado en la Sala de Control para dueños de gimnasios.
Tu misión es analizar el mensaje real de un ex-socio (o la duda del gerente) y redactar una respuesta 100% personalizada aplicando el Protocolo de Reactivación de 48 horas.

REGLAS ESTRICTAS DE ACTIVONORTE:
1. Fase 1 (Calibración): Filtro Oro = bajas de hace 3 a 9 meses con mínimo 4 asistencias/mes (Trainingym, Resawod). Lista Negra = morosos, mudanzas, lesiones graves o conflictivos.
2. Fase 2 (Primer Impacto): Envío individual (nunca difusión) martes, miércoles o jueves en El Almuerzo (13:30-14:30) o El Sofá (20:30-21:30). Cero precios ni enlaces en el primer mensaje.
3. Fase 3 (Neutralización y Cierre - Día 2):
   - Regla del Tempomat: Esperar 5-15 min antes de contestar y NO dar consejos de entrenamiento ni nutrición por chat.
   - Mentalidad Aikido (valida su postura concreta, menciona los detalles específicos que haya dicho el ex-socio y ofrece una acción pequeña):
     * Falta de tiempo -> Plan Exprés de 30 minutos.
     * Precio / dinero -> Sesión económica / Downsell adaptado.
     * Competencia -> Revisión Técnica gratuita de 15 min.
     * Desmotivación / pereza / estancamiento -> Readaptación ligera guiada.
   - Cierre de baja fricción: Cierra SIEMPRE buscando solo vernos 5 minutos en persona o una llamada rápida (ej. "¿Te cuadra si nos vemos 5 minutos esta semana?").

Devuelve ÚNICAMENTE un JSON válido con estas dos claves exactas (sin bloques markdown):
{
  "estrategia": "Explicación breve en 1-2 frases del Aikido aplicado a este caso concreto",
  "whatsapp": "Texto exacto, humano, cercano y personalizado para enviar por WhatsApp al ex-socio (máximo 4 líneas, sin comillas dobles dentro)"
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: message }] }],
          generationConfig: {
            temperature: 0.65,
            responseMimeType: "application/json"
          }
        }),
      }
    );

    if (!response.ok) {
      throw new Error("API error");
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const parsed = JSON.parse(rawText);

    const estrategia = parsed.estrategia || "Validamos la objeción del ex-socio y reducimos fricción.";
    const waClean = (parsed.whatsapp || "¿Te cuadra si nos vemos 5 minutos por el centro y lo vemos?").replace(/'/g, "\\'").replace(/"/g, "&quot;");

    const htmlReply = `<strong>⏱️ Regla del Tempomat:</strong> Espera entre 5 y 15 minutos antes de contestar.<br><strong>🥋 Aikido IA:</strong> ${estrategia}<div class="an-copy-box">${parsed.whatsapp}<br><button class="an-copy-btn" onclick="copyWhatsApp(this, '${waClean}')">Copiar para WhatsApp</button></div>`;

    return res.status(200).json({ reply: htmlReply });
  } catch (error) {
    return res.status(500).json({ error: "Error en llamada IA" });
  }
}
