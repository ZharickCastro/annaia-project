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
  'Responde en español, con frases sencillas y en texto plano, y de forma breve.';

const BRIEF = 'Contesta directamente en 2 o 3 frases cortas, hasta 50 palabras. Termina la última frase.';
const DETAILED = 'Amplía la explicación con información nueva en un párrafo de hasta 90 palabras. Termina la última frase.';
const COMPARE = 'Nombra las dos opciones. Comprueba primero si son alternativas o si una produce, contiene o utiliza la otra. Explica esa relación sin confundir la dirección de la transformación. ' +
  'Compara una propiedad por vez y conserva los matices de los artículos. No deduzcas rapidez, superioridad ni que algo ocurre siempre a partir de una definición. ' +
  'Explica directamente la relación con un ejemplo cotidiano en lugar de recitar definiciones. Solo si pide elegir, usa su objetivo como criterio. Si falta, da una orientación condicional o pregunta para qué lo necesita. Omite estadísticas, pronósticos y comentarios sobre los artículos salvo que los pidan. Usa hasta tres frases.';

const COMPARISON_REQUEST = /\b(?:compar(?:a|ar|e|en)(?:me|los?|las?)?|comparacion entre|diferencias? entre|diferencian|versus|vs|(?:es|son|sera|funciona|resulta) (?:mejor|peor)|(?:cual|que) (?:conviene|prefieres))\b/;

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
      const phrase = run.join(' ');
      titles.push(phrase[0].toUpperCase() + phrase.slice(1));
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

const DETAIL_REQUEST = /\b(detall\w*|profund\w*|ampli\w*|mas (?:informacion|sobre|acerca)|(?:cuent\w*|contar\w*|explica\w*|habl\w*|dime|decir\w*|saber) (?:un poco )?mas)\b/;
const FOLLOWUP_WORDS = new Set(
  ('detalle detalles informacion tema esto eso ello este ese mismo anterior respecto favor acerca ' +
   'hablar hablarme hable contar contarme decirme amplia amplialo profundiza profundizar cuenteme ' +
   'podrias podria dar darme des sabes poco ellos ellas clases clasifica clasifican ' +
   'clasificacion tienen tiene forman funciona funcionan sirve sirven origina originan produce producen ' +
   'caracteristicas principales existen diferencia diferencias').split(' '),
);

function needsTopic(question) {
  const words = keywordsOf(question);
  return words.every((word) => FOLLOWUP_WORDS.has(word));
}

async function directHits(question) {
  const found = [];
  for (const title of titleCandidates(question)) {
    if (found.length >= TOP_K) break;
    if (found.some(f => (' ' + normalize(f.title) + ' ').includes(' ' + normalize(title) + ' '))) continue;
    const hit = await articleByTitle(title);
    if (hit && !found.some((f) => f.path === hit.path)) found.push(hit);
  }
  return found;
}

async function findSources(question) {
  const found = await directHits(question);
  if (found.length > 0) return found;

  const keywords = keywordsOf(question);
  const hits = keywords.length ? await searchKiwix(question, keywords) : [];
  const related = hits.filter((h) => h.hits > 0);
  if (related.length > 0) return related.slice(0, TOP_K);

  return hits.slice(0, TOP_K);
}

// Una frase retomada del turno anterior puede necesitar fuentes sobre sus ejemplos,
// aunque sus palabras sueltas también existan como títulos en Wikipedia.
function refersToAnswer(question, history) {
  const answer = history.findLast(m => m.role === 'assistant');
  if (!answer) return false;
  const words = keywordsOf(question).filter(w => !FOLLOWUP_WORDS.has(w));
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

async function fetchArticle(path, question, relatedWords = []) {
  const res = await fetch(`${KIWIX_URL}${path}`);
  if (!res.ok) return '';
  const html = (await res.text()).replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, '');
  const blocks = [...html.matchAll(/<(p|h[2-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)];
  const words = normalize(question);
  const classification = /\b(?:tipos?|clases?|clasifica\w*)\b/;
  const section = classification.test(words)
    ? blocks.findIndex(([, tag, content]) => tag !== 'p' && classification.test(normalize(htmlToText(content))))
    : 0;
  let passage = '';
  for (let i = Math.max(0, section); i < blocks.length && passage.length < MAX_CHARS_PER_DOC; i++) {
    passage += htmlToText(blocks[i][2]) + ' ';
  }
  const lead = (passage.trim() || htmlToText(html)).slice(0, MAX_CHARS_PER_DOC);
  // Una definición puede estar al inicio y la relación con la otra opción mucho más abajo.
  if (relatedWords.length) {
    for (const [, tag, content] of blocks) {
      if (tag !== 'p') continue;
      const paragraph = htmlToText(content);
      for (const sentence of paragraph.split(/(?<=[.!?])\s+/u)) {
        if (lead.slice(0, 900).includes(sentence)) continue;
        const terms = keywordsOf(sentence);
        if (relatedWords.some(stem => terms.some(term => term.startsWith(stem)))) {
          return lead.slice(0, 900) + '\n' + sentence.slice(0, MAX_CHARS_PER_DOC - 901);
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

async function buildContext(question, topic, previousSources, history, referenced, subjects) {
  let hits = [];
  if (subjects?.length) {
    hits = (await Promise.all(subjects.map(comparisonSource))).filter(Boolean);
  } else if (previousSources.length) {
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
    hits = await findSources(topic || focus || question);
  }
  hits = [...new Map(hits.map(hit => [hit.path, hit])).values()].slice(0, TOP_K);
  const docs = await Promise.all(
    hits.map(async (h) => {
      const own = keywordsOf(h.title);
      const related = (subjects ?? []).flatMap(keywordsOf)
        .filter(word => word.length >= 4 && !own.includes(word)).map(word => word.slice(0, 6));
      return { title: h.title, text: await fetchArticle(h.path, question, related) };
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

function parseHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_HISTORY_CHARS) }));
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
      options: { temperature: 0, num_predict: 48 },
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

async function* generateAnswer(messages, comparison, detail) {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, stream: true, think: false,
      options: { temperature: 0, num_predict: detail || comparison ? 224 : 128 } }),
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
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  if (!question) return res.status(400).json({ error: 'Falta "question"' });

  const previousSources = Array.isArray(req.body?.previousSources)
    ? req.body.previousSources.filter((s) => typeof s === 'string').slice(0, TOP_K)
    : [];

  const history = parseHistory(req.body?.history);

  const comparison = COMPARISON_REQUEST.test(normalize(question));
  const referenced = /^[¿¡\s]*(?:y\s+)?(?:cuales?|cual|que|por que|como)\b/.test(normalize(question))
    && refersToAnswer(question, history);
  const followup = needsTopic(question) || referenced;
  const topic = followup
    ? previousSources[0] || history.findLast((m) => m.role === 'user' && !needsTopic(m.content))?.content
    : undefined;
  const detail = DETAIL_REQUEST.test(normalize(question));
  if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches)[!. ]*$/.test(normalize(question))) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end(GREETING);
  }
  if (!comparison && followup && !topic && !history.length) return res.type('text/plain').send('¿Sobre qué tema te gustaría saber más?');

  if (!(await acquireSlot())) {
    return res.status(503).json({ error: 'Hay muchas consultas en espera, intenta de nuevo en un momento' });
  }

  const started = Date.now();
  let answer = '';
  let sources = [];
  let mode = 'library';
  try {
    let docs = [];
    // Si el planificador no responde, pedir los conceptos evita buscar «compararlos»
    // como si fuera un tema académico. Reutilizar fuentes solo para referencias explícitas.
    const subjects = comparison ? await relatedTitles(question, history, true).catch(() =>
      /\b(?:compararlos|compararlas|comparalos|comparalas|ambos|ambas)\b/.test(normalize(question))
        ? previousSources.slice(0, 2) : [],
    ) : null;
    if (subjects && subjects.length < 2) {
      answer = subjects.length ? `¿Con qué te gustaría comparar ${subjects[0]}?` : '¿Qué dos opciones quieres comparar y para qué las usarías?';
      return res.type('text/plain').send(answer);
    }
    try {
      docs = await buildContext(question, topic, followup ? previousSources : [], history, referenced && !comparison, subjects);
    } catch (err) {
      console.error('Biblioteca no disponible:', err.message);
      mode = 'model';
    }
    if (mode === 'library' && docs.length === 0 && !hasTopic(question)) mode = 'chat';
    sources = docs.map((d) => d.title);
    let contextualQuestion = question;
    if (subjects?.length) contextualQuestion += '\nConceptos de la comparación: ' + subjects.join(' y ');
    else if (topic) contextualQuestion += '\nTema de referencia: ' + topic;
    if (comparison && docs.length > 1) docs = await comparisonEvidence(docs, contextualQuestion).catch(() => docs);
    const style = comparison ? COMPARE : detail ? DETAILED : BRIEF;
    const messages = buildMessages(contextualQuestion, docs, history, mode, style);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Sources', encodeURIComponent(JSON.stringify(sources)));
    for await (const text of generateAnswer(messages, comparison, detail)) {
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
