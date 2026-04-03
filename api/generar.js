const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

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

function promptReel({ producto, descripcion, tono, red_social, objetivoSemana, diaPost, semanaNum, postNum, totalPosts }) {
  return `Eres experto en marketing digital para ${red_social} en Latinoamérica.
Producto: ${producto}
Nicho: ${descripcion}
Tono: ${tono}
Semana ${semanaNum}, post ${postNum} de ${totalPosts}. Objetivo de esta semana: ${objetivoSemana}.
Día sugerido: ${diaPost}.

Devuelve SOLO este JSON, sin texto extra:
{"hook":"una línea gancho irresistible","problema":"máximo 2 líneas describiendo el dolor del cliente","solucion":"máximo 2 líneas mostrando cómo el producto resuelve ese dolor","cta":"una línea llamada a la acción clara","caption":"3 líneas con emojis y 8 hashtags del nicho"}`;
}

function promptCarrusel({ producto, descripcion, tono, red_social, objetivoSemana, diaPost, semanaNum, postNum, totalPosts }) {
  return `Eres experto en marketing digital para ${red_social} en Latinoamérica.
Producto: ${producto}
Nicho: ${descripcion}
Tono: ${tono}
Semana ${semanaNum}, post ${postNum} de ${totalPosts}. Objetivo de esta semana: ${objetivoSemana}.
Día sugerido: ${diaPost}.

Devuelve SOLO este JSON, sin texto extra:
{"portada":"título portada gancho en máximo 1 línea","slides":["slide 2 máximo 2 líneas","slide 3 máximo 2 líneas","slide 4 máximo 2 líneas","slide 5 cierre con cta máximo 2 líneas"],"caption":"3 líneas con emojis y 8 hashtags del nicho"}`;
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
    throw new Error('No se encontró JSON válido en la respuesta');
  }
}

async function llamarGemini(apiKey, prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 512,
        },
      }),
    }
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Gemini no devolvió texto');
  return extraerJSON(rawText);
}

function asignarDias(numPosts) {
  // Distribuye los posts en días de la semana de forma equilibrada
  const diasBase = [DIAS_SEMANA[0], DIAS_SEMANA[2], DIAS_SEMANA[4], DIAS_SEMANA[1], DIAS_SEMANA[3]];
  return Array.from({ length: numPosts }, (_, i) => diasBase[i % diasBase.length]);
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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY no configurada' });
  }

  const numSemanas = parseInt(semanas_preventa, 10);
  const numPosts = parseInt(frecuencia, 10);
  const totalPosts = numSemanas * numPosts;

  const semanas = [];
  let indiceGlobal = 0;

  for (let s = 1; s <= numSemanas; s++) {
    const objetivoSemana = objetivoPorSemana(s, numSemanas);
    const dias = asignarDias(numPosts);
    const posts = [];

    for (let p = 0; p < numPosts; p++) {
      const tipo = determinarTipo(tipo_contenido, indiceGlobal);
      const diaPost = dias[p];
      const contexto = { producto, descripcion, tono, red_social, objetivoSemana, diaPost, semanaNum: s, postNum: p + 1, totalPosts };

      const prompt = tipo === 'Reel' ? promptReel(contexto) : promptCarrusel(contexto);

      let postData;
      try {
        postData = await llamarGemini(apiKey, prompt);
      } catch (err) {
        console.error(`Error en semana ${s} post ${p + 1}:`, err.message);
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
