import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const FRONTEND_DIR = fileURLToPath(new URL('./frontend/dist/frontend/browser', import.meta.url));

const KIWIX_URL = process.env.KIWIX_URL ?? 'http://127.0.0.1:8080';
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const MODEL = process.env.MODEL ?? 'qwen3.5:9b';
const BOOK = process.env.KIWIX_BOOK ?? 'wikipedia_es_all_nopic_2026-08';
const PORT = Number(process.env.PORT ?? 3000);
const DB_PATH = process.env.DB_PATH ?? 'anna.db';
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT ?? 4);
const MAX_WAITING = Number(process.env.MAX_WAITING ?? 40);
const TOP_K = 3;
const MAX_HISTORY = 6;
const MAX_HISTORY_CHARS = 1000;
const CANDIDATES = 10;
const MAX_CHARS_PER_DOC = 1500;

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

const NO_LIBRARY_NOTE =
  'La biblioteca no está disponible. Esta respuesta viene del modelo y no está verificada.\n\n';

const GREETING =
  'Hola, soy Anna IA. Pregúntame sobre un tema, por ejemplo: ¿Qué es un volcán?';

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

const STOPWORDS = new Set([
  'que', 'quien', 'quienes', 'cual', 'cuales', 'como', 'cuando', 'donde', 'cuanto',
  'es', 'son', 'fue', 'fueron', 'ser', 'hay', 'el', 'la', 'los', 'las', 'un', 'una',
  'unos', 'unas', 'de', 'del', 'en', 'y', 'o', 'a', 'al', 'por', 'para', 'con', 'sobre',
  'se', 'su', 'sus', 'le', 'lo', 'mi', 'tu', 'me', 'te', 'hola', 'buenas', 'mas', 'puedes',
  'puede', 'decir', 'dime', 'saber', 'quiero', 'algo', 'otro', 'otra', 'tambien', 'gracias',
  'ano', 'anos', 'tiempo', 'vida', 'murio', 'nacio', 'lugar', 'persona', 'cosa', 'parte', 'dia',
  'tipo', 'tipos', 'comun', 'comunes', 'forma', 'formas', 'clase', 'ejemplo', 'ejemplos', 'muy', 'bien',
  'hablame', 'hableme', 'cuentame', 'explicame', 'dame', 'muestrame', 'digame', 'habla', 'cuenta', 'explica',
]);

const normalize = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function keywordsOf(question) {
  return normalize(question)
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

const NON_ARTICLE = /^(Anexo:|Lista de|Categoría:|Plantilla:|Wikipedia:|Portal:|Ayuda:)|\(desambiguación\)/i;

function titleCandidates(question) {
  const words = question.replace(/[¿?¡!.,;:()"]/g, ' ').split(/\s+/).filter(Boolean);
  const titles = [];
  for (let len = 3; len >= 1; len--) {
    for (let i = 0; i + len <= words.length; i++) {
      const run = words.slice(i, i + len);
      if (run.some((w) => w.length <= 2 || STOPWORDS.has(normalize(w)))) continue;
      titles.push(run.map((w) => w[0].toUpperCase() + w.slice(1)).join(' '));
    }
  }
  return [...new Set(titles)];
}

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

function hasTopic(question) {
  return keywordsOf(question).length > 0 || titleCandidates(question).length > 0;
}

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

async function findSources(question, previousSources) {
  const found = await directHits(question);
  if (found.length > 0) return found;

  const keywords = keywordsOf(question);
  const hits = keywords.length ? await searchKiwix(question, keywords) : [];
  const related = hits.filter((h) => h.hits > 0);
  if (related.length > 0) return related.slice(0, TOP_K);

  if (previousSources.length > 0) {
    const reused = [];
    for (const title of previousSources) {
      const hit = await articleByTitle(title);
      if (hit && reused.length < TOP_K) reused.push(hit);
    }
    return reused;
  }
  return hits.slice(0, TOP_K);
}

async function fetchArticle(path) {
  const res = await fetch(`${KIWIX_URL}${path}`);
  if (!res.ok) return '';
  return htmlToText(await res.text()).slice(0, MAX_CHARS_PER_DOC);
}

async function buildContext(question, previousSources) {
  const hits = await findSources(question, previousSources);
  const docs = await Promise.all(
    hits.map(async (h) => ({ title: h.title, text: await fetchArticle(h.path) })),
  );
  return docs.filter((d) => d.text);
}

function buildMessages(question, docs, history, mode) {
  if (mode !== 'library') {
    return [
      { role: 'system', content: SYSTEM_PROMPT_NO_LIBRARY },
      ...history,
      { role: 'user', content: question },
    ];
  }
  const context = docs.map((d, i) => `[${i + 1}] ${d.title}\n${d.text}`).join('\n\n');
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: `Contexto:\n${context}\n\nPregunta: ${question}` },
  ];
}

function parseHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_HISTORY_CHARS) }));
}

const isUp = (url) => fetch(url).then((r) => r.ok, () => false);

const app = express();
app.use(express.json({ limit: '8kb' }));

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
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  if (!question) return res.status(400).json({ error: 'Falta "question"' });

  const previousSources = Array.isArray(req.body?.previousSources)
    ? req.body.previousSources.filter((s) => typeof s === 'string').slice(0, TOP_K)
    : [];

  const history = parseHistory(req.body?.history);

  const isShortGreeting = !question.includes(' ') && question.length <= 4;
  if (isShortGreeting || (!hasTopic(question) && previousSources.length === 0 && history.length === 0)) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end(GREETING);
  }

  if (!(await acquireSlot())) {
    return res.status(503).json({ error: 'Hay muchas consultas en espera, intenta de nuevo en un momento' });
  }

  const started = Date.now();
  let answer = '';
  let sources = [];
  let mode = 'library';
  try {
    let docs = [];
    try {
      docs = await buildContext(question, previousSources);
    } catch (err) {
      console.error('Biblioteca no disponible:', err.message);
      mode = 'model';
    }
    if (mode === 'library' && docs.length === 0 && !hasTopic(question)) mode = 'chat';
    sources = docs.map((d) => d.title);
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: buildMessages(
          hasTopic(question) || !previousSources[0] ? question : `${question} (sobre ${previousSources[0]})`,
          docs,
          history,
          mode,
        ),
        stream: true,
        think: false,
        options: { temperature: 0 },
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
