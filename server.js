import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  chunkOf,
  classify,
  followUpDepth,
  keywordsOf,
  normalize,
  questionForModel,
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

const SYSTEM_PROMPT =
  'Eres Anna IA, un asistente educativo para estudiantes de comunidades rurales. ' +
  'Responde en español, con frases sencillas y en texto plano, sin viñetas, negritas ni títulos. ' +
  'Usa únicamente los datos que aparecen en el contexto: no agregues cifras, fechas, nombres ni ' +
  'datos que no estén escritos ahí, aunque los conozcas. ' +
  'Si la pregunta es general (por ejemplo, "¿qué más me puedes decir?"), resume los datos más importantes del contexto. ' +
  'Si ya diste esa información antes en la conversación, no la repitas: da datos nuevos del contexto. ' +
  'Si un título de obra aparece en inglés, tradúcelo al español. ' +
  'Solo si el contexto no tiene nada relacionado con la pregunta, dilo con estas palabras: "No encuentro esa información en la biblioteca."';

const SYSTEM_PROMPT_NO_LIBRARY =
  'Eres Anna IA, un asistente educativo para estudiantes de comunidades rurales. ' +
  'Responde en español, con frases sencillas y en texto plano, y de forma breve.';

const BRIEF = 'Contesta directamente en 2 o 3 frases cortas, hasta 50 palabras. Termina la última frase.';
const DETAILED = 'Amplía la explicación con información nueva en un párrafo de hasta 90 palabras. Termina la última frase.';

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

async function searchKiwix(question, keywords) {
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
    .filter((hit) => !NON_ARTICLE.test(hit.title))
    .sort((a, b) => b.hits - a.hits || a.rank - b.rank);
}

const DETAIL_REQUEST = /\b(detall\w*|profund\w*|ampli\w*|mas (?:informacion|sobre|acerca)|(?:cuent\w*|contar\w*|explica\w*|habl\w*|dime|decir\w*|saber) (?:un poco )?mas)\b/;

async function directHits(question) {
  const found = [];
  for (const title of titleCandidates(question)) {
    if (found.length >= TOP_K) break;
    if (found.some((f) => f.title.includes(title))) continue;
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
async function fetchArticle(path, part = 0) {
  const res = await fetch(`${KIWIX_URL}${path}`);
  if (!res.ok) return '';
  return chunkOf(htmlToText(await res.text()), part, MAX_CHARS_PER_DOC);
}

async function buildContext(question, previousSources, kind, part = 0) {
  const hits = await findSources(question, previousSources, kind);
  const docs = await Promise.all(
    hits.map(async (h) => ({ title: h.title, text: await fetchArticle(h.path, part) })),
  );
  return docs.filter((d) => d.text);
}

function buildMessages(question, docs, history, mode, detail) {
  const lengthRule = detail ? DETAILED : BRIEF;
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

  const kind = classify(question, previousSources);
  // Respuesta breve por defecto; más larga si piden detalle o es un "dime más".
  const detail = kind === 'seguimiento' || DETAIL_REQUEST.test(normalize(question));

  if (kind === 'saludo' || (kind === 'charla' && history.length === 0)) {
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
  let mode = kind === 'charla' ? 'chat' : 'library';
  try {
    let docs = [];
    if (mode === 'library') {
      try {
        const part = kind === 'seguimiento' ? followUpDepth(history, previousSources) + 1 : 0;
        docs = await buildContext(question, previousSources, kind, part);
      } catch (err) {
        console.error('Biblioteca no disponible:', err.message);
        mode = 'model';
      }
    }
    if (mode === 'library' && docs.length === 0 && kind !== 'nueva') mode = 'chat';
    sources = docs.map((d) => d.title);
    console.log(`[ask] tipo=${kind} modo=${mode} fuentes=${JSON.stringify(sources)}`);
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: buildMessages(questionForModel(question, kind, sources), docs, history, mode, detail),
        stream: true,
        think: false,
        options: { temperature: 0, num_ctx: NUM_CTX, num_predict: detail ? 224 : 128 },
      }),
    });
    if (!ollamaRes.ok) throw new Error(`Ollama error: ${ollamaRes.status}`);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Sources', encodeURIComponent(JSON.stringify(sources)));
    if (mode === 'model') {
      answer += NO_LIBRARY_NOTE;
      res.write(NO_LIBRARY_NOTE);
    }
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of ollamaRes.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const part = JSON.parse(line);
        if (part.message?.content) {
          answer += part.message.content;
          res.write(part.message.content);
        }
      }
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
