import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  chunkOf,
  classify,
  comparisonPair,
  followUpDepth,
  intentOf,
  keywordsOf,
  listSize,
  normalize,
  questionForModel,
  tableText,
  titleCandidates,
  trimHistory,
} from './contexto.js';

const FRONTEND_DIR = fileURLToPath(new URL('./frontend/dist/frontend/browser', import.meta.url));

const MAX_QUESTION_CHARS = 1000;

const KIWIX_URL = process.env.KIWIX_URL ?? 'http://127.0.0.1:8080';
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const MODEL = process.env.MODEL ?? 'qwen3.5:9b';
const BOOK = process.env.KIWIX_BOOK ?? 'wikipedia_es_all_nopic_2026-08';
const PORT = Number(process.env.PORT ?? 3000);
const DB_PATH = process.env.DB_PATH ?? 'anna.db';
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT ?? 4);
const MAX_WAITING = Number(process.env.MAX_WAITING ?? 40);
// Memoria del modelo en tokens. Debe alcanzar para instrucciones + artículos + historial + respuesta;
// si se pasa, Ollama borra el comienzo (las instrucciones) y Anna "olvida" quién es.
const NUM_CTX = Number(process.env.NUM_CTX ?? 4096);
const HISTORY_CHARS = Number(process.env.HISTORY_CHARS ?? 2400);
// Menos texto = respuesta más rápida en CPU: el modelo tarda ~28 ms por cada pieza de texto que lee.
const TOP_K = Number(process.env.TOP_K ?? 2);
const CANDIDATES = 10;
const MAX_CHARS_PER_DOC = Number(process.env.MAX_CHARS_PER_DOC ?? 900);
// Las tablas (medalleros, rankings) ocupan más texto que un párrafo.
const MAX_CHARS_PER_TABLE = Number(process.env.MAX_CHARS_PER_TABLE ?? 1600);

const SYSTEM_PROMPT =
  'Eres Anna IA, un asistente educativo para estudiantes de comunidades rurales. ' +
  'Responde en español, con frases sencillas y en texto plano, sin negritas ni títulos. ' +
  'Basa los hechos en los artículos. Puedes relacionar hechos de distintos artículos y explicar qué se deduce de ellos, aunque ninguno conteste la pregunta literalmente. ' +
  'Si la evidencia es parcial, explica lo que sí se sabe e identifica qué falta. No inventes cifras, fechas ni ventajas. ' +
  'Si la pregunta es general (por ejemplo, "¿qué más me puedes decir?"), resume los datos más importantes del contexto. ' +
  'Al ampliar una respuesta, incorpora solo detalles que sirvan para resolver la duda actual. ' +
  'Si preguntan por una expresión de tu respuesta anterior, aclara a qué te referías con un ejemplo concreto respaldado por las fuentes. ' +
  'Usa el historial para interpretar la pregunta y los artículos para comprobar la respuesta. ' +
  'Si un título de obra aparece en inglés, tradúcelo al español. ' +
  'Solo si el contexto no tiene nada relacionado con la pregunta, dilo con estas palabras: "No encuentro esa información en la biblioteca."';

const SYSTEM_PROMPT_NO_LIBRARY =
  'Eres Anna IA, un asistente educativo para estudiantes de comunidades rurales. ' +
  'Responde en español, con frases sencillas y en texto plano, sin negritas ni títulos. ' +
  'Usa la conversación anterior para entender a qué se refiere el estudiante y no cambies de tema. ' +
  'No inventes cifras, fechas ni nombres.';

const BRIEF = 'Contesta directamente en 2 o 3 frases cortas, hasta 50 palabras, sin viñetas. Termina la última frase.';
const DETAILED = 'Amplía la explicación con información nueva en un párrafo de hasta 90 palabras, sin viñetas. Termina la última frase.';
// Formatos para lo que piden los estudiantes además de definiciones (ver intentOf en contexto.js).
const LIST = (n) => `Responde con una lista numerada de ${n} elementos, uno por línea ("1. ..."), en el orden del contexto (por ejemplo, de mayor a menor). ` +
  'Toma los nombres y las cifras solo del contexto; en las tablas las columnas van separadas por "|". ' +
  `Si el contexto trae menos de ${n}, da los que haya y dilo. Di en una frase qué criterio ordena la lista. Termina la última frase.`;
const ACTIVITY = 'Guía al estudiante para hacer la actividad. Empieza con una frase sobre para qué sirve. ' +
  'Si la actividad necesita objetos, escribe "Materiales:" en una línea, con cosas sencillas y baratas que se consigan en la comunidad; si es un ejercicio (por ejemplo, de matemáticas), resuélvelo mostrando cada operación. ' +
  'Después da los pasos numerados, máximo 6, uno por línea y con verbos claros. ' +
  'Los pasos prácticos pueden venir de tu conocimiento general; los datos del tema (nombres, cifras, fechas) tómalos del contexto. ' +
  'Termina con un consejo para presentarla o una pregunta para comprobar lo aprendido. ' +
  'No digas que no encuentras la información: si el contexto no trae los pasos, propónlos tú.';
const RECOMMEND = 'Da 3 recomendaciones concretas y prácticas, numeradas y una por línea, cada una con una frase de por qué ayuda. ' +
  'Piensa en un estudiante de una escuela rural, con pocos materiales y sin internet. ' +
  'Si una recomendación usa datos del tema, tómalos del contexto. No digas que no encuentras la información.';
const TIMELINE = 'Haz una línea de tiempo: entre 4 y 7 fechas en orden, una por línea, con el formato "año: hecho" en pocas palabras. ' +
  'Usa solo fechas que aparezcan en el contexto o en la conversación. Si no hay fechas suficientes, da las que haya y dilo.';
const WRITING = 'Escribe el texto que pide el estudiante, en un lenguaje sencillo y apropiado para niños, de hasta 180 palabras, con un título corto en la primera línea. ' +
  'Si trata de un pueblo o una cultura, usa con respeto los datos del contexto y no inventes costumbres. ' +
  'No digas que no encuentras la información.';
const COMPARE = 'Nombra las dos opciones. Comprueba primero si son alternativas o si una produce, contiene o utiliza la otra. Explica esa relación sin confundir la dirección de la transformación. ' +
  'Compara una propiedad por vez y conserva los matices de los artículos. No deduzcas rapidez, superioridad ni que algo ocurre siempre a partir de una definición. ' +
  'Explica directamente la relación con un ejemplo cotidiano en lugar de recitar definiciones. Solo si pide elegir, usa su objetivo como criterio. Si falta, da una orientación condicional o pregunta para qué lo necesita. Omite estadísticas, pronósticos y comentarios sobre los artículos salvo que los pidan. Usa hasta tres frases.';

const COMPARISON_REQUEST = /\b(?:compar(?:a|ar|e|en)(?:me|los?|las?)?|comparacion entre|diferencias? (?:hay )?entre|diferencian|versus|vs|(?:es|son|sera|funciona|resulta) (?:mejor|peor)|(?:cual|que) (?:conviene|prefieres))\b/;

const NO_LIBRARY_NOTE =
  'La biblioteca no está disponible. Esta respuesta viene del modelo y no está verificada.\n\n';

const GREETING =
  'Hola, soy Anna IA. Pregúntame sobre un tema, por ejemplo: ¿Qué es un volcán?';

// Respuestas inmediatas a mensajes sociales: no gastan tiempo del modelo ni de la biblioteca.
function socialReply(question, hasConversation) {
  const q = normalize(question);
  if (/^(gracias|muchas gracias)/.test(q)) return '¡Con gusto! Si quieres, pregúntame más sobre el tema o sobre otro.';
  if (/^(chao|adios|hasta luego)/.test(q)) return '¡Hasta luego! Aquí estaré cuando quieras aprender algo nuevo.';
  if (/^(ok|okey|vale|listo|perfecto|genial|chevere|bacano|entendido)/.test(q)) {
    return hasConversation ? '¡Listo! ¿Quieres que te cuente algo más sobre el tema?' : GREETING;
  }
  return GREETING;
}

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS queries (
    id INTEGER PRIMARY KEY,
    question TEXT NOT NULL,
    answer TEXT,
    sources TEXT,
    duration_ms INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);
const insertQuery = db.prepare(
  'INSERT INTO queries (question, answer, sources, duration_ms) VALUES (?, ?, ?, ?)',
);

let running = 0;
const waiting = [];

function acquireSlot() {
  if (running < MAX_CONCURRENT) {
    running++;
    return Promise.resolve(true);
  }
  if (waiting.length >= MAX_WAITING) return Promise.resolve(false);
  return new Promise((resolve) => waiting.push(() => resolve(true)));
}

function releaseSlot() {
  const next = waiting.shift();
  if (next) next();
  else running--;
}

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function htmlToText(html) {
  const body = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ');
  return decodeEntities(body.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

const NON_ARTICLE = /^(Anexo:|Lista de|Categoría:|Plantilla:|Wikipedia:|Portal:|Ayuda:)|\(desambiguación\)/i;

async function articleByTitle(title) {
  const path = `/content/${BOOK}/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  const res = await fetch(`${KIWIX_URL}${path}`);
  await res.body?.cancel();
  return res.ok ? { title, path } : null;
}

const NOT_CONTENT = /^(Categoría:|Plantilla:|Wikipedia:|Portal:|Ayuda:)|\(desambiguación\)/i;
const LIST_PAGE = /^(Anexo:|Lista de)/i;

// Con `allowLists` también acepta anexos y listas: ahí están los rankings y medalleros.
async function searchKiwix(question, keywords, allowLists = false) {
  const query = keywords.join(' ') || question;
  const url = `${KIWIX_URL}/search?books.name=${encodeURIComponent(BOOK)}&pattern=${encodeURIComponent(query)}&format=xml&pageLength=${CANDIDATES}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Kiwix search failed: ${res.status}`);
  const xml = await res.text();
  const items = [...xml.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<\/item>/g)];
  return items
    .map((m, rank) => {
      const title = decodeEntities(m[1]);
      const titleNorm = normalize(title);
      const hits = keywords.filter((k) => titleNorm.includes(k)).length;
      return { title, path: decodeEntities(m[2]), hits, rank };
    })
    .filter((hit) => !(allowLists ? NOT_CONTENT : NON_ARTICLE).test(hit.title))
    .sort((a, b) => b.hits - a.hits || a.rank - b.rank);
}

const DETAIL_REQUEST = /\b(detall\w*|profund\w*|ampli\w*|mas (?:informacion|sobre|acerca)|(?:cuent\w*|contar\w*|explica\w*|habl\w*|dime|decir\w*|saber) (?:un poco )?mas)\b/;

async function directHits(question) {
  const found = [];
  for (const title of titleCandidates(question)) {
    if (found.length >= TOP_K) break;
    if (found.some((f) => (' ' + normalize(f.title) + ' ').includes(' ' + normalize(title) + ' '))) continue;
    const hit = await articleByTitle(title);
    if (hit && !found.some((f) => f.path === hit.path)) found.push(hit);
  }
  return found;
}

async function reuseSources(previousSources, limit = TOP_K) {
  const reused = [];
  for (const title of previousSources) {
    if (reused.length >= limit) break;
    const hit = await articleByTitle(title);
    if (hit) reused.push(hit);
  }
  return reused;
}

async function searchTopic(question, extraKeywords = []) {
  const found = await directHits(question);
  if (found.length > 0) return found;

  const keywords = [...new Set([...keywordsOf(question), ...extraKeywords])];
  const hits = keywords.length ? await searchKiwix(question, keywords) : [];
  const related = hits.filter((h) => h.hits > 0);
  return (related.length > 0 ? related : hits).slice(0, TOP_K);
}

// Busca en Kiwix solo lo necesario según el tipo de pregunta (ver classify en contexto.js).
async function findSources(question, previousSources, kind) {
  if (kind === 'seguimiento') return reuseSources(previousSources);

  if (kind === 'relacionada') {
    // Se conserva el artículo principal del tema anterior y se suma lo nuevo que pide la pregunta.
    const [previous] = await reuseSources(previousSources, 1);
    const extra = previousSources[0] ? keywordsOf(previousSources[0]) : [];
    const fresh = await searchTopic(question, extra);
    const merged = previous ? [previous, ...fresh.filter((h) => h.path !== previous.path)] : fresh;
    return merged.slice(0, TOP_K);
  }

  const found = await searchTopic(question);
  if (found.length > 0) return found;
  return reuseSources(previousSources);
}

// `part` 0 es el comienzo del artículo; en cada "dime más" se avanza al trozo siguiente.
function refersToAnswer(question, history) {
  const answer = history.findLast(m => m.role === 'assistant');
  if (!answer) return false;
  const words = keywordsOf(question);
  if (!words.length) return false;
  const prior = new Set(keywordsOf(answer.content));
  return words.every(word => prior.has(word));
}

async function relatedTitles(question, history, comparison = false) {
  const instruction = comparison
    ? 'Identifica los dos conceptos que el estudiante quiere comparar. Devuelve en titulos sus nombres completos como títulos de Wikipedia en español, uno por concepto. Resuelve pronombres y palabras omitidas usando las preguntas recientes del estudiante. La última pregunta explícita tiene prioridad. Si falta una opción y no se puede identificar en el diálogo, devuelve una lista vacía. No devuelvas nombres de métodos de comparación.'
    : 'Selecciona uno o dos títulos breves de artículos de Wikipedia en español para contestar la última pregunta. Resuelve las referencias al turno anterior. Si pide ejemplos, elige conceptos concretos que ilustren lo dicho y se puedan verificar.';
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(comparison ? 60000 : 20000),
    body: JSON.stringify({
      model: MODEL, stream: false, think: false,
      format: { type: 'object', properties: { titulos: { type: 'array', items: { type: 'string' } } }, required: ['titulos'] },
      messages: [
        { role: 'system', content: instruction },
        ...history, { role: 'user', content: question },
      ],
      options: { temperature: 0, num_predict: 80 },
    }),
  });
  if (!response.ok) throw new Error('No se pudo interpretar la consulta');
  const data = await response.json();
  const titles = JSON.parse(data.message.content).titulos;
  return Array.isArray(titles) ? titles.filter(t => typeof t === 'string' && t.trim() && t.length <= 90).slice(0, 2) : [];
}

async function fetchArticle(path, question, relatedWords = [], part = 0, intent = null) {
  const res = await fetch(`${KIWIX_URL}${path}`);
  if (!res.ok) return '';
  const raw = await res.text();
  const html = raw.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, '');
  if (intent === 'lista') {
    // Para un top 5 sirve la tabla del artículo, con una frase de introducción.
    const table = tableText(raw, MAX_CHARS_PER_TABLE);
    if (table) {
      const intro = htmlToText(html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '').slice(0, 300);
      return `${intro}\nTabla:\n${table}`;
    }
  }
  const blocks = [...html.matchAll(/<(p|h[2-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)];
  const words = normalize(question);
  const classification = /\b(?:tipos?|clases?|clasifica\w*)\b/;
  const section = classification.test(words)
    ? blocks.findIndex(([, tag, content]) => tag !== 'p' && classification.test(normalize(htmlToText(content))))
    : 0;
  if (part > 0 && section <= 0) return chunkOf(blocks.map(block => htmlToText(block[2])).join(' ') || htmlToText(html), part, MAX_CHARS_PER_DOC);
  let passage = '';
  for (let i = Math.max(0, section); i < blocks.length && passage.length < MAX_CHARS_PER_DOC; i++) {
    passage += htmlToText(blocks[i][2]) + ' ';
  }
  const lead = (passage.trim() || htmlToText(html)).slice(0, MAX_CHARS_PER_DOC);
  // Una definición puede estar al inicio y la relación con la otra opción mucho más abajo.
  const prefix = Math.floor(MAX_CHARS_PER_DOC * 0.6);
  if (relatedWords.length) {
    for (const [, tag, content] of blocks) {
      if (tag !== 'p') continue;
      const paragraph = htmlToText(content);
      for (const sentence of paragraph.split(/(?<=[.!?])\s+/u)) {
        if (lead.slice(0, prefix).includes(sentence)) continue;
        const terms = keywordsOf(sentence);
        if (relatedWords.some(stem => terms.some(term => term.startsWith(stem)))) {
          return lead.slice(0, prefix) + '\n' + sentence.slice(0, MAX_CHARS_PER_DOC - prefix - 1);
        }
      }
    }
  }
  return lead;
}

async function comparisonSource(title) {
  const exact = await articleByTitle(title);
  if (exact) return exact;
  const words = keywordsOf(title);
  const results = await searchKiwix(title, words);
  return results.find(hit => normalize(hit.title) === normalize(title))
    ?? results.find(hit => words.length > 0 && hit.hits === words.length);
}

// Para un top o ranking busca primero un anexo o lista ("Anexo:Medallero histórico de los Juegos Olímpicos").
// Si la pregunta no nombra el tema ("dame el top 5"), lo toma de la conversación.
// En un seguimiento ("dame el top 3 de los más altos" después de hablar de volcanes) suma el tema anterior.
async function listSources(question, previousSources, kind) {
  const own = keywordsOf(question);
  const previous = kind === 'nueva' && own.length ? [] : previousSources.flatMap(keywordsOf);
  const keywords = [...new Set([...own, ...previous])];
  if (!keywords.length) return [];
  const hits = await searchKiwix(question, keywords, true);
  // Por raíz: "medallas olímpicas" debe encontrar "Medallero histórico de los Juegos Olímpicos".
  // Con varias palabras se exigen dos coincidencias, para no tomar "Ríos de Colombia" al pedir animales de Colombia.
  const stems = keywords.map((k) => k.slice(0, 5));
  const needed = Math.min(2, stems.length);
  return hits.filter((h) => LIST_PAGE.test(h.title) && stems.filter((s) => normalize(h.title).includes(s)).length >= needed).slice(0, 1);
}

async function buildContext(question, previousSources, kind, part, history, referenced, subjects, intent = null) {
  let hits = [];
  const listHits = intent === 'lista' && !subjects?.length ? await listSources(question, previousSources, kind) : [];
  // Un consejo o una actividad sobre un tema nuevo no deben arrastrar los artículos del tema anterior.
  const reusable = ['actividad', 'recomendacion', 'escritura'].includes(intent) && kind === 'nueva' ? [] : previousSources;
  if (subjects?.length) {
    hits = (await Promise.all(subjects.map(comparisonSource))).filter(Boolean);
  } else if (referenced && previousSources.length) {
    hits = (await Promise.all(previousSources.map(articleByTitle))).filter(Boolean);
  }
  if (referenced) {
    // Los títulos propuestos solo sirven para buscar: el modelo leerá artículos reales.
    const titles = await relatedTitles(question, history).catch(() => []);
    const extra = await Promise.all(titles.map(articleByTitle));
    hits = [...extra.filter(Boolean), ...hits];
  }
  if (!hits.length && !subjects?.length) {
    const focus = question.match(/\b(?:sobre|acerca de)\s+(.+)/iu)?.[1];
    hits = await findSources(focus || question, reusable, kind);
  }
  hits = [...new Map([...listHits, ...hits].map(hit => [hit.path, hit])).values()].slice(0, TOP_K);
  const docs = await Promise.all(
    hits.map(async (h) => {
      const own = keywordsOf(h.title);
      const related = (subjects ?? []).flatMap(keywordsOf)
        .filter(word => word.length >= 4 && !own.includes(word)).map(word => word.slice(0, 6));
      // En un anexo o lista la información está en la tabla, también en preguntas como "¿y el segundo?".
      const format = LIST_PAGE.test(h.title) ? 'lista' : intent;
      return { title: h.title, text: await fetchArticle(h.path, question, related, part, format) };
    }),
  );
  return docs.filter((d) => d.text);
}

function buildMessages(question, docs, history, mode, lengthRule) {
  if (mode !== 'library') {
    return [
      { role: 'system', content: SYSTEM_PROMPT_NO_LIBRARY + ' ' + lengthRule },
      ...history,
      { role: 'user', content: question },
    ];
  }
  const context = docs.map((d, i) => `[${i + 1}] ${d.title}\n${d.text}`).join('\n\n');
  return [
    { role: 'system', content: SYSTEM_PROMPT + ' ' + lengthRule },
    ...history,
    { role: 'user', content: `Contexto:\n${context}\n\nPregunta: ${question}` },
  ];
}

async function comparisonEvidence(docs, question) {
  const candidates = docs.map(doc => doc.text.match(/[^.!?]+[.!?](?=\s|$)/gu) ?? []);
  if (candidates.length < 2 || candidates.some(sentences => !sentences.length)) return docs;
  const options = candidates.map((sentences, i) =>
    docs[i].title + '\n' + sentences.map((s, n) => `${n + 1}. ${s.trim()}`).join('\n'),
  );
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      model: MODEL, think: false, stream: false,
      format: { type: 'object', properties: { frases: { type: 'array', items: { type: 'integer' } } }, required: ['frases'] },
      messages: [
        { role: 'system', content: 'Para cada artículo elige el número de la oración que mejor explica la relación o diferencia solicitada. Prefiere mecanismos o definiciones a estadísticas y predicciones. Devuelve un número por artículo, en el mismo orden.' },
        { role: 'user', content: question + '\n\n' + options.join('\n\n') },
      ],
      options: { temperature: 0, num_ctx: NUM_CTX, num_predict: 48 },
    }),
  });
  if (!response.ok) return docs;
  const picks = JSON.parse((await response.json()).message.content).frases;
  return docs.map((doc, i) => {
    const sentences = candidates[i];
    const n = picks?.[i];
    if (!Number.isInteger(n) || !sentences[n - 1]) return doc;
    return { ...doc, text: [...new Set([sentences[0], sentences[n - 1]])].join(' ') };
  });
}

async function* generateAnswer(messages, numPredict) {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, stream: true, think: false,
      options: { temperature: 0, num_ctx: NUM_CTX, num_predict: numPredict } }),
  });
  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }
  const decoder = new TextDecoder();
  let buffer = '';
  let emitted = false;
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const part = JSON.parse(line);
      if (part.error) throw new Error(part.error);
      if (part.message?.content) { emitted = true; yield part.message.content; }
    }
  }
  const tail = (buffer + decoder.decode()).trim();
  if (tail) {
    const part = JSON.parse(tail);
    if (part.error) throw new Error(part.error);
    if (part.message?.content) { emitted = true; yield part.message.content; }
  }
  if (!emitted) throw new Error('Ollama terminó sin producir una respuesta');
}

const isUp = (url) => fetch(url).then((r) => r.ok, () => false);

const app = express();
app.use(express.json({ limit: '64kb' }));

app.get('/health', async (_req, res) => {
  const [kiwix, ollama] = await Promise.all([
    isUp(KIWIX_URL),
    isUp(`${OLLAMA_URL}/api/version`),
  ]);
  res.status(kiwix && ollama ? 200 : 503).json({ kiwix, ollama, running, waiting: waiting.length });
});

app.use(express.static(FRONTEND_DIR));
app.get(/^(?!\/api\/|\/health).*/, (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.post('/api/ask', async (req, res) => {
  const question = typeof req.body?.question === 'string' ? req.body.question.trim().slice(0, MAX_QUESTION_CHARS) : '';
  if (!question) return res.status(400).json({ error: 'Falta "question"' });
  const history = trimHistory(req.body?.history, { maxChars: HISTORY_CHARS });

  const previousSources = Array.isArray(req.body?.previousSources)
    ? req.body.previousSources.filter((s) => typeof s === 'string').slice(0, TOP_K)
    : [];

  const comparison = COMPARISON_REQUEST.test(normalize(question));
  const referenced = /^[¿¡\s]*(?:y\s+)?(?:cuales?|cual|que|por que|como)\b/.test(normalize(question))
    && refersToAnswer(question, history);
  const kind = classify(question, previousSources);
  // Top 5, actividad paso a paso o recomendaciones: cambian el formato, no el tema.
  const intent = comparison ? null : intentOf(question);
  // Respuesta breve por defecto; más larga si piden detalle o es un "dime más".
  // Una pregunta de dos partes ("explícame X y dime qué consecuencias tuvo") no cabe en 50 palabras.
  const twoParts = question.length > 60 && /\by (?:dime|que|como|por que|cual(?:es)?|cuando|donde|cuant[oa]s?|explica\w*)\b/.test(normalize(question));
  const detail = kind === 'seguimiento' || twoParts || DETAIL_REQUEST.test(normalize(question));

  if (kind === 'saludo' || (kind === 'charla' && !comparison && !intent && history.length === 0)) {
    const reply = kind === 'saludo' ? socialReply(question, history.length > 0) : GREETING;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Sources', encodeURIComponent(JSON.stringify(previousSources)));
    return res.end(reply);
  }

  if (!(await acquireSlot())) {
    return res.status(503).json({ error: 'Hay muchas consultas en espera, intenta de nuevo en un momento' });
  }

  const started = Date.now();
  let answer = '';
  let sources = [];
  let mode = !comparison && kind === 'charla' ? 'chat' : 'library';
  try {
    let docs = [];
    // Si el planificador no responde, pedir los conceptos evita buscar «compararlos»
    // como si fuera un tema académico. Reutilizar fuentes solo para referencias explícitas.
    let subjects = comparison ? await relatedTitles(question, history, true).catch(() =>
      /\b(?:compararlos|compararlas|comparalos|comparalas|ambos|ambas)\b/.test(normalize(question))
        ? previousSources.slice(0, 2) : [],
    ) : null;
    // Si el planificador no encontró las dos opciones pero la pregunta las nombra ("entre X y Y"), se usan esas.
    if (subjects && subjects.length < 2 && comparisonPair(question).length === 2) subjects = comparisonPair(question);
    if (subjects && subjects.length < 2) {
      answer = subjects.length ? `¿Con qué te gustaría comparar ${subjects[0]}?` : '¿Qué dos opciones quieres comparar y para qué las usarías?';
      return res.type('text/plain').send(answer);
    }
    if (mode === 'library') {
      try {
        const part = kind === 'seguimiento' && !intent ? followUpDepth(history, previousSources) + 1 : 0;
        docs = await buildContext(question, previousSources, kind, comparison ? 0 : part, history, referenced && !comparison, subjects, intent);
      } catch (err) {
        console.error('Biblioteca no disponible:', err.message);
        mode = 'model';
      }
    }
    // Una actividad o un consejo se pueden orientar sin artículo; un dato o un ranking no.
    const guidance = intent === 'actividad' || intent === 'recomendacion' || intent === 'escritura';
    if (mode === 'library' && docs.length === 0 && (kind !== 'nueva' || guidance)) mode = 'chat';
    sources = docs.map((d) => d.title);
    console.log(`[ask] tipo=${kind} intencion=${intent ?? '-'} modo=${mode} fuentes=${JSON.stringify(sources)}`);
    let contextualQuestion = questionForModel(question, kind, sources);
    if (subjects?.length) contextualQuestion += '\nConceptos de la comparación: ' + subjects.join(' y ');
    if (comparison && docs.length > 1) docs = await comparisonEvidence(docs, contextualQuestion).catch(() => docs);
    const style = comparison ? COMPARE
      : intent === 'lista' ? LIST(listSize(question))
      : intent === 'actividad' ? ACTIVITY
      : intent === 'recomendacion' ? RECOMMEND
      : intent === 'cronologia' ? TIMELINE
      : intent === 'escritura' ? WRITING
      : detail ? DETAILED : BRIEF;
    const numPredict = intent === 'actividad' || intent === 'escritura' ? 320 : intent ? 260 : detail || comparison ? 224 : 128;
    const messages = buildMessages(contextualQuestion, docs, history, mode, style);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Sources', encodeURIComponent(JSON.stringify(sources)));
    for await (const text of generateAnswer(messages, numPredict)) {
      if (!answer && mode === 'model') { answer = NO_LIBRARY_NOTE; res.write(NO_LIBRARY_NOTE); }
      answer += text;
      res.write(text);
    }
    res.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(502).json({ error: 'No se pudo generar la respuesta' });
    else res.end();
  } finally {
    releaseSlot();
    insertQuery.run(question, answer, JSON.stringify(sources), Date.now() - started);
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Anna IA backend en http://127.0.0.1:${PORT}`);
});
