// Contexto de la conversación: decide si una pregunta necesita buscar en Kiwix,
// si sigue el tema anterior y cuánto historial cabe en la memoria del modelo.
// Son funciones puras (sin red ni base de datos) para poder probarlas con `node --test`.

export const normalize = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const words = (list) => list.trim().split(/\s+/);

// Palabras que no dicen de qué trata la pregunta.
export const STOPWORDS = new Set(words(`
  que quien quienes cual cuales como cuando donde cuanto cuantos cuantas
  es son fue fueron ser hay era eran esta estan estaba tiene tienen tenia
  el la los las un una unos unas de del en y o a al por para con sin sobre entre
  se su sus le les lo mi mis tu tus me te nos yo
  hola buenas buenos dias tardes noches mas puedes puede podrias decir dime saber quiero quisiera
  algo otro otra otros otras tambien gracias muy bien
  ano anos tiempo vida murio nacio lugar persona cosa cosas parte dia
  tipo tipos comun comunes forma formas clase ejemplo ejemplos
  hablame hableme cuentame explicame dame muestrame digame habla cuenta explica
  hazme haz hacer has escribe escribeme redacta redactame ayudame necesito
`));

// Palabras que piden algo sobre el tema que ya se está hablando, no un tema nuevo.
// Sin esto, "hazme un informe" buscaba en Wikipedia un artículo llamado "Informe".
export const META_WORDS = new Set(words(`
  eso esto ello aquello ese esa esos esas este estos estas
  tema anterior mismo misma igual
  informe resumen resume resumir resumelo sintesis ensayo parrafo parrafos texto
  detalle detalles profundiza profundizar amplia ampliar amplialo continua continuar sigue seguir
  explicacion importante importantes principal principales caracteristicas datos dato
  mejor facil sencillo sencilla corto corta largo larga breve
  pregunta respuesta favor porfa porfavor
  explicalo explicamelo explicala cuentamelo dimelo resumelo resumemelo amplialo repitelo repite
  aclarame aclaralo describelo describemelo
`));

// Señales de que la pregunta se refiere a lo anterior ("¿y dónde queda eso?").
// No incluye "el", "su" ni "esta": son tan comunes que casi toda pregunta nueva parecería un seguimiento.
const ANAPHORA = /\b(eso|esto|ello|aquello|ese|esa|esos|esas|ellos|ellas|alli|ahi|alla|lo anterior|del tema|de lo mismo)\b/;
const FOLLOW_UP_START = /^(y|tambien|ademas|entonces|pero|o sea)\b/;
const SOCIAL = /^(hola|buenas|buenos dias|buenas tardes|buenas noches|gracias|muchas gracias|ok|okey|vale|listo|perfecto|genial|chevere|bacano|entendido|chao|adios|hasta luego)\b[\s!.¡,]*$/;

const isNoise = (w) => w.length <= 2 || STOPWORDS.has(w) || META_WORDS.has(w);

export function keywordsOf(question) {
  return normalize(question)
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !isNoise(w));
}

/** Títulos posibles de artículo (de 3 a 1 palabras seguidas), con mayúscula inicial. */
export function titleCandidates(question) {
  const list = question.replace(/[¿?¡!.,;:()"]/g, ' ').split(/\s+/).filter(Boolean);
  const titles = [];
  for (let len = 3; len >= 1; len--) {
    for (let i = 0; i + len <= list.length; i++) {
      const run = list.slice(i, i + len);
      if (run.some((w) => isNoise(normalize(w)))) continue;
      titles.push(run.map((w) => w[0].toUpperCase() + w.slice(1)).join(' '));
    }
  }
  return [...new Set(titles)];
}

export function hasTopic(question) {
  return keywordsOf(question).length > 0;
}

/**
 * Qué hacer con la pregunta antes de llamar al modelo:
 * - 'saludo'      : saludo o agradecimiento corto, se responde sin buscar.
 * - 'charla'      : no hay tema ni conversación previa con fuentes, el modelo responde sin biblioteca.
 * - 'seguimiento' : no trae tema propio y hay fuentes anteriores: se reutilizan.
 * - 'relacionada' : trae tema y además se refiere a lo anterior: se busca uniendo ambos temas.
 * - 'nueva'       : tema nuevo, se busca en Kiwix.
 */
export function classify(question, previousSources = []) {
  const q = normalize(question).replace(/[¿?¡!]/g, '').trim();
  const hasPrevious = previousSources.length > 0;
  if (SOCIAL.test(q)) return 'saludo';
  if (!hasTopic(question)) return hasPrevious ? 'seguimiento' : 'charla';
  if (hasPrevious && (ANAPHORA.test(q) || FOLLOW_UP_START.test(q))) return 'relacionada';
  return 'nueva';
}

/**
 * Deja el historial más reciente que quepa en `maxChars`, sin cortar un mensaje por la mitad
 * salvo el más reciente. El modelo tiene una ventana limitada (num_ctx): si se pasa, Ollama
 * descarta el comienzo de la conversación, que es donde están las instrucciones de Anna.
 */
export function trimHistory(raw, { maxMessages = 8, maxChars = 2400, maxCharsPerMessage = 1200 } = {}) {
  if (!Array.isArray(raw)) return [];
  const clean = raw
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-maxMessages)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, maxCharsPerMessage) }));

  const kept = [];
  let total = 0;
  for (let i = clean.length - 1; i >= 0; i--) {
    const size = clean[i].content.length;
    if (total + size > maxChars) {
      if (kept.length === 0) kept.unshift({ ...clean[i], content: clean[i].content.slice(-maxChars) });
      break;
    }
    kept.unshift(clean[i]);
    total += size;
  }
  // El historial debe empezar con una pregunta del usuario, no con una respuesta suelta.
  while (kept.length && kept[0].role !== 'user') kept.shift();
  return kept;
}

/**
 * Cuántos "dime más" seguidos lleva el estudiante sobre el mismo tema (sin contar el actual).
 * Sirve para darle al modelo el siguiente trozo del artículo en vez de repetir el mismo.
 */
export function followUpDepth(history, previousSources = []) {
  let depth = 0;
  const userTurns = history.filter((m) => m.role === 'user');
  for (let i = userTurns.length - 1; i >= 0; i--) {
    if (classify(userTurns[i].content, previousSources) !== 'seguimiento') break;
    depth++;
  }
  return depth;
}

/**
 * Trozo número `part` (0, 1, 2...) de un texto, cortado en límites de frase.
 * Si el artículo ya no tiene más texto, devuelve el último trozo disponible.
 */
export function chunkOf(text, part, size) {
  const chunks = [];
  let rest = text.trim();
  while (rest.length > 0) {
    let cut = rest.length <= size ? rest.length : rest.lastIndexOf('. ', size) + 1;
    if (cut <= size / 2) cut = Math.min(size, rest.length);
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (chunks.length === 0) return '';
  return chunks[Math.min(part, chunks.length - 1)];
}

/** Pregunta que recibe el modelo: si no nombra el tema, se le recuerda de qué se está hablando. */
export function questionForModel(question, kind, previousSources = []) {
  if ((kind === 'seguimiento' || kind === 'relacionada') && previousSources[0]) {
    return `${question} (el tema de la conversación es: ${previousSources.join(', ')})`;
  }
  return question;
}
