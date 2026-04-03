const DIAS_SEMANA = ['Lunes', 'Miércoles', 'Viernes', 'Martes', 'Jueves'];

function determinarTipo(tipo_contenido, indiceGlobal) {
  if (tipo_contenido === 'Solo Reels') return 'Reel';
  if (tipo_contenido === 'Solo Carruseles') return 'Carrusel';
  return indiceGlobal % 2 === 0 ? 'Reel' : 'Carrusel';
}

function objetivoPorSemana(numeroSemana, totalSemanas) {
  if (numeroSemana === 1) return 'despertar consciencia del problema o deseo';
  if (numeroSemana === totalSemanas) return 'crear urgencia y convertir a compradores';
  return 'generar autoridad, mostrar resultados y rebatir objeciones';
}

function asignarDia(indicePost) {
  return DIAS_SEMANA[indicePost % DIAS_SEMANA.length];
}

function buildPromptReel({ producto, descripcion, tono, red_social, objetivoSemana, diaPost, semanaNum, postNum, totalSemanas }) {
  return `Eres experto en marketing digital para ${red_social} en Latinoamérica. Tono: ${tono}.

Producto: ${producto}
Nicho: ${descripcion}
Semana ${semanaNum} de ${totalSemanas}. Objetivo de la semana: ${objetivoSemana}.
Día del post: ${diaPost}.

Genera el contenido para un Reel específico para este nicho y momento del lanzamiento.

Responde ÚNICAMENTE con este JSON válido, sin texto adicional ni markdown:
{"hook":"gancho irresistible de 1 línea adaptado al nicho","problema":"2 líneas describiendo el dolor específico del cliente de este nicho","solucion":"2 líneas mostrando cómo el producto resuelve ese dolor puntual","cta":"1 línea de llamada a la acción concreta","caption":"3 líneas persuasivas con emojis relevantes al nicho y 8 hashtags específicos del nicho"}`;
}

function buildPromptCarrusel({ producto, descripcion, tono, red_social, objetivoSemana, diaPost, semanaNum, postNum, totalSemanas }) {
  return `Eres experto en marketing digital para ${red_social} en Latinoamérica. Tono: ${tono}.

Producto: ${producto}
Nicho: ${descripcion}
Semana ${semanaNum} de ${totalSemanas}. Objetivo de la semana: ${objetivoSemana}.
Día del post: ${diaPost}.

Genera el contenido para un Carrusel específico para este nicho y momento del lanzamiento.

Responde ÚNICAMENTE con este JSON válido, sin texto adicional ni markdown:
{"portada":"título gancho de portada en 1 línea que invite a deslizar","slides":["slide 2 máximo 2 líneas con dato o idea concreta del nicho","slide 3 máximo 2 líneas","slide 4 máximo 2 líneas","slide 5 máximo 2 líneas con cierre y CTA"],"caption":"3 líneas persuasivas con emojis relevantes al nicho y 8 hashtags específicos del nicho"}`;
}

function extraerJSON(text) {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('No se encontró JSON válido en la respuesta de Claude');
  }
}

async function llamarClaude(apiKey, prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Claude API ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const rawText = data?.content?.[0]?.text;
  if (!rawText) throw new Error('Claude no devolvió texto');
  return extraerJSON(rawText);
}

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
  } = req.body || {};

  if (!producto || !descripcion || !fecha_lanzamiento || !semanas_preventa || !red_social || !frecuencia || !tipo_contenido || !tono) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada' });
  }

  const numSemanas = parseInt(semanas_preventa, 10);
  const numPosts = parseInt(frecuencia, 10);

  const semanas = [];
  let indiceGlobal = 0;

  for (let s = 1; s <= numSemanas; s++) {
    const objetivoSemana = objetivoPorSemana(s, numSemanas);
    const posts = [];

    for (let p = 0; p < numPosts; p++) {
      const tipo = determinarTipo(tipo_contenido, indiceGlobal);
      const diaPost = asignarDia(p);
      const contexto = {
        producto, descripcion, tono, red_social,
        objetivoSemana, diaPost,
        semanaNum: s, postNum: p + 1, totalSemanas: numSemanas,
      };

      const prompt = tipo === 'Reel' ? buildPromptReel(contexto) : buildPromptCarrusel(contexto);

      let postData;
      try {
        postData = await llamarClaude(apiKey, prompt);
      } catch (err) {
        console.error(`Error semana ${s} post ${p + 1}:`, err.message);
        return res.status(502).json({ error: `Error generando semana ${s}, post ${p + 1}: ${err.message}` });
      }

      if (tipo === 'Reel') {
        posts.push({
          dia: diaPost,
          tipo: 'Reel',
          hook: postData.hook || '',
          problema: postData.problema || '',
          solucion: postData.solucion || '',
          cta: postData.cta || '',
          caption: postData.caption || '',
        });
      } else {
        posts.push({
          dia: diaPost,
          tipo: 'Carrusel',
          portada: postData.portada || '',
          slides: Array.isArray(postData.slides) ? postData.slides : [],
          caption: postData.caption || '',
        });
      }

      indiceGlobal++;
    }

    semanas.push({ numero: s, objetivo: objetivoSemana, posts });
  }

  return res.status(200).json({ semanas });
}
