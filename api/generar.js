export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const {
    producto,
    descripcion,
    fecha_lanzamiento,
    semanas_preventa,
    red_social,
    frecuencia,
    tipo_contenido,
    tono,
  } = req.body;

  if (!producto || !descripcion || !fecha_lanzamiento || !semanas_preventa || !red_social || !frecuencia || !tipo_contenido || !tono) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY no configurada' });
  }

  const numSemanas = parseInt(semanas_preventa, 10);
  const numPosts = parseInt(frecuencia, 10);

  // Determinar formato de posts según tipo_contenido
  let formatoInstruccion = '';
  if (tipo_contenido === 'Solo Reels') {
    formatoInstruccion = 'Todos los posts deben ser Reels. Para cada Reel proporciona un guión detallado con gancho, desarrollo y cierre con llamada a la acción.';
  } else if (tipo_contenido === 'Solo Carruseles') {
    formatoInstruccion = 'Todos los posts deben ser Carruseles. Para cada Carrusel proporciona entre 5 y 8 slides, cada slide con su texto conciso y visual.';
  } else {
    formatoInstruccion = 'Alterna entre Reels y Carruseles. Para Reels: guión con gancho, desarrollo y cierre. Para Carruseles: 5 a 8 slides con texto por slide.';
  }

  const prompt = `Eres un experto en marketing digital y lanzamientos de productos para redes sociales latinoamericanas.

Vas a crear un plan de contenido completo de preventa para el siguiente producto:

PRODUCTO: ${producto}
DESCRIPCIÓN Y NICHO: ${descripcion}
FECHA DE LANZAMIENTO: ${fecha_lanzamiento}
SEMANAS DE PREVENTA: ${numSemanas}
RED SOCIAL: ${red_social}
POSTS POR SEMANA: ${numPosts}
TIPO DE CONTENIDO: ${tipo_contenido}
TONO: ${tono}

INSTRUCCIONES DE FORMATO:
${formatoInstruccion}
El tono de TODA la comunicación debe ser: ${tono}.
Adapta el lenguaje, los ganchos y los llamados a la acción al tono seleccionado.
Escribe en español neutro latinoamericano.
Sé específico al nicho: usa ejemplos, dolores, deseos y lenguaje propio del público que describe la usuaria.

ESTRUCTURA DEL PLAN:
- La semana 1 debe construir consciencia del problema o deseo.
- Las semanas intermedias deben generar autoridad, mostrar resultados y objeciones.
- La última semana antes del lanzamiento debe crear urgencia y convertir.
- Cada post debe tener un objetivo claro dentro de la narrativa de lanzamiento.

Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura exacta, sin texto adicional, sin markdown, sin bloques de código:

{
  "semanas": [
    {
      "numero": 1,
      "objetivo": "Descripción del objetivo de la semana",
      "posts": [
        {
          "dia": "Lunes",
          "tipo": "Reel",
          "objetivo": "Objetivo específico del post",
          "guion": "Guión completo del reel aquí. Mínimo 150 palabras con gancho poderoso, desarrollo y cierre con CTA.",
          "caption": "Caption completo con emojis, texto persuasivo y hashtags relevantes al nicho (mínimo 10 hashtags)."
        },
        {
          "dia": "Jueves",
          "tipo": "Carrusel",
          "objetivo": "Objetivo específico del post",
          "slides": [
            "Texto de slide 1 (portada gancho)",
            "Texto de slide 2",
            "Texto de slide 3",
            "Texto de slide 4",
            "Texto de slide 5",
            "Texto de slide 6 (cierre con CTA)"
          ],
          "caption": "Caption completo con emojis, texto persuasivo y hashtags relevantes al nicho."
        }
      ]
    }
  ]
}

Genera exactamente ${numSemanas} semana(s) con exactamente ${numPosts} post(s) por semana.
Para posts tipo Reel el campo "slides" no debe existir. Para posts tipo Carrusel el campo "guion" no debe existir.
NO incluyas nada fuera del JSON.`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.85,
            maxOutputTokens: 8192,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error('Gemini error:', errBody);
      return res.status(502).json({ error: 'Error al llamar a Gemini', detail: errBody });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return res.status(502).json({ error: 'Gemini no devolvió contenido' });
    }

    // Limpiar posible markdown
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr, '\nRaw:', cleaned.slice(0, 500));
      return res.status(502).json({ error: 'La respuesta de Gemini no es JSON válido', raw: cleaned.slice(0, 300) });
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Error interno del servidor', detail: err.message });
  }
}
