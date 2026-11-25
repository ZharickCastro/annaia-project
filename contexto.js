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
  crees creo piensas opinas domina dominan uso usar usa usan usamos pasaria pasa pasan paso pasaron
  tuvo tuvieron tuviera tuvieran han ha he hemos ganado ganaron gano aplica aplican pueden debo debe deben
  tengo tienes sirve sirven pongo poner organizo organizar explico explicar resuelvo resolver
  manana hoy ayer escribir contar tan cada todo todos toda todas mucho muchos mucha muchas poco pocos
  hacia desde hasta segun mientras porque pues asi ahora siempre nunca lado
  tener ellos ellas hizo hace hicieron recientemente significa palabra profesor profesora profe maestro maestra ayudas ayudar
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
  top ranking lista listado enumera enumerame clasificacion
  mayor mayores menor menores primeros primeras mejores peores
  primero primera segundo segunda tercero tercera cuarto cuarta quinto quinta ultimo ultima numero puesto
  recomienda recomiendame recomendacion recomendaciones consejo consejos sugerencia sugerencias tips
  paso pasos instrucciones actividad actividades tarea tareas trabajo hago realizo elaboro preparo
  linea cronologia exponer exposicion materiales material diferencia diferencias grande grandes pequeno pequenos
  alto alta altos altas largos largas poblado poblados extenso extensos profundo profundos famoso famosos famosa famosas conocidos conocidas
  cuento cuentos poema poemas carta cartas maqueta cartelera experimento manualidad
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

// Palabras que pueden ir dentro de un título ("Ciclo del agua", "Derechos de los niños").
const CONNECTORS = new Set(['de', 'del', 'la', 'las', 'los', 'el']);
// Un artículo con mayúscula a mitad de frase es parte de un nombre propio ("La Guajira").
const isCapitalArticle = (w, i) => i > 0 && /^(La|Las|Los|El)$/.test(w);

/**
 * Títulos posibles de artículo, de los más largos (hasta 3 palabras con contenido) a los más cortos,
 * con mayúscula inicial. Acepta "de", "del", "la"... entre palabras con contenido.
 */
export function titleCandidates(question) {
  const list = question.replace(/[¿?¡!.,;:()"]/g, ' ').split(/\s+/).filter(Boolean);
  const content = (w) => !isNoise(normalize(w));
  const runs = [];
  for (let i = 0; i < list.length; i++) {
    if (!content(list[i]) && !(isCapitalArticle(list[i], i) && list[i + 1] && content(list[i + 1]))) continue;
    let words = 0;
    for (let j = i; j < list.length && j - i < 6; j++) {
      const w = list[j];
      if (content(w)) words++;
      else if (!(CONNECTORS.has(normalize(w)) || isCapitalArticle(w, j))) break;
      if (words > 3) break;
      if (content(w)) runs.push({ text: list.slice(i, j + 1).join(' '), words, start: i });
    }
  }
  runs.sort((a, b) => b.words - a.words || a.start - b.start);
  return [...new Set(runs.map((r) => r.text.replace(/^./u, (c) => c.toUpperCase())))];
}

const DEFINITION = /^(?:que|quien|quienes) (?:es|son|fue|fueron|era|significa)\b|^(?:hablame|cuentame|explicame) (?:de|del|sobre|acerca)\b/;

function isShortFollowUp(question, q) {
  const tokens = question.replace(/[¿?¡!.,;:()"]/g, ' ').split(/\s+/).filter(Boolean);
  const properNoun = tokens.slice(1).some((w) => /^\p{Lu}/u.test(w));
  return tokens.length <= 9 && keywordsOf(question).length <= 2 && !properNoun && !DEFINITION.test(q);
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
  // "¿Cómo se puede prevenir?" después de hablar de la diabetes: pregunta corta, sin nombre propio
  // y que no pide una definición nueva ("¿qué es la fotosíntesis?" sí cambia de tema).
  if (hasPrevious && isShortFollowUp(question, q)) return 'relacionada';
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

// Qué tipo de respuesta pide el estudiante, además del tema:
// - 'lista'         : un top, ranking o enumeración ("top 5 de medallas olímpicas", "las 7 maravillas").
// - 'cronologia'    : una línea de tiempo con fechas en orden.
// - 'actividad'     : cómo hacer una tarea paso a paso ("¿cómo hago una maqueta del sistema solar?").
// - 'recomendacion' : consejos o sugerencias ("recomiéndame cómo estudiar para un examen").
// - 'ejercicio'     : resolver una operación paso a paso ("¿cómo resuelvo 3/4 + 2/5?").
// - 'escritura'     : escribir un texto creativo ("escríbeme un cuento sobre un niño wayuu").
const LIST_REQUEST = /\b(?:top|ranking|listado|lista de|enumer\w*|medallero|clasificacion)\b|\b(?:\d{1,2}|tres|cuatro|cinco|seis|siete|ocho|nueve|diez) (?:\w+ ){0,2}(?:mas|mejores|mayores|menores|principales|primer[oa]s)\b|\b(?:los|las) (?:\d{1,2}|tres|cuatro|cinco|seis|siete|ocho|nueve|diez) \w+|\bcuales son (?:los|las) \w+ (?:mas|mayores|principales)\b/;
const ACTIVITY_REQUEST = /\b(?:como (?:hago|hacer|se hace|puedo hacer|elaboro|elaborar|preparo|preparar|construyo|construir|armo|armar|realizo|realizar|resuelvo|resolver|presento|presentar|organizo|organizar)|pasos? (?:para|de|a seguir)|paso a paso|instrucciones|ayudame (?:a|con)|tarea|actividad|maqueta|cartelera|experimento|manualidad|exponer|exposicion)\b/;
const RECOMMEND_REQUEST = /\b(?:recomien\w*|recomendaci\w*|consejos?|sugier\w*|sugerencias?|tips?|aconseja\w*)\b/;
const WRITING_REQUEST = /\b(?:escrib\w*|redact\w*|inventa\w*|crea|creame|componer|compon\w*) (?:\w+ ){0,2}(?:cuentos?|poemas?|historias?|cartas?|cancion|canciones|fabulas?|relatos?|dialogos?|adivinanzas?|coplas?|versos?)\b/;
// Una operación escrita ("3/4 + 2/5", "12 x 7") o un pedido de cálculo.
// El guion entre dos años ("1810-1819") no es una resta: solo cuenta con espacios o números cortos.
const EXERCISE_REQUEST = /\d{1,3}\s*[+*x×÷/=^]\s*\d|\d{1,3}\s+-\s+\d|\b(?:calcula\w*|cuanto (?:es|da)|ecuacion\w*|despeja\w*|resuelve\w*)\b/;
const TIMELINE_REQUEST = /\b(?:linea de tiempo|cronologia|orden cronologico)\b/;

export function intentOf(question) {
  const q = normalize(question).replace(/[¿?¡!.,;:]/g, ' ').replace(/\s+/g, ' ');
  if (WRITING_REQUEST.test(q)) return 'escritura';
  if (EXERCISE_REQUEST.test(q)) return 'ejercicio';
  if (TIMELINE_REQUEST.test(q)) return 'cronologia';
  if (/\b(?:top|ranking|medallero)\b/.test(q)) return 'lista';
  if (RECOMMEND_REQUEST.test(q)) return 'recomendacion';
  if (ACTIVITY_REQUEST.test(q)) return 'actividad';
  if (LIST_REQUEST.test(q)) return 'lista';
  return null;
}

const NUMBER_WORDS = { tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };

/** Cuántos elementos pide la lista ("top 5", "los diez más..."). Por defecto 5, como máximo 10. */
export function listSize(question) {
  const q = normalize(question);
  const n = Number(q.match(/\b(\d{1,2})\b/)?.[1]) || NUMBER_WORDS[q.match(/\b(tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/)?.[1]] || 5;
  return Math.min(Math.max(n, 1), 10);
}

const stripTags = (html) => html.replace(/<(script|style|sup)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ').trim();

/**
 * Texto de la primera tabla útil de un artículo, una fila por línea ("Puesto | País | Oro | ...").
 * Los rankings de Wikipedia (medalleros, ríos más largos...) están en tablas, no en párrafos.
 */
export function tableText(html, maxChars) {
  for (const [table] of html.matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    const rows = [...table.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)]
      .map(([row]) => [...row.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => stripTags(c[1])).filter(Boolean))
      .filter((cells) => cells.length >= 2)
      .map((cells) => cells.join(' | '));
    if (rows.length < 3) continue;
    let text = '';
    for (const row of rows) {
      if (text.length + row.length + 1 > maxChars) break;
      text += row + '\n';
    }
    return text.trim();
  }
  return '';
}

const ARTICLE = /^(?:el|la|los|las|un|una)\s+/iu;
const capitalize = (s) => s.replace(ARTICLE, '').trim().replace(/^./u, (c) => c.toUpperCase());

/**
 * Las dos opciones que nombra una comparación ("diferencia entre la fotosíntesis y la respiración celular",
 * "compara el sol con la luna", "energía solar vs eólica"). Lista vacía si no se pueden leer.
 */
export function comparisonPair(question) {
  const m = question.match(/(?:entre|compar\p{L}*)\s+(.+?)\s+(?:y|con|vs\.?|versus)\s+(.+?)(?=\s+y\s+(?:c[oó]mo|qu[eé]|por\s+qu[eé]|d[oó]nde|cu[aá]l)|[?¿!,.;]|$)/iu)
    ?? question.match(/(?:^|[¿\s])([^¿?\s][^?]*?)\s+(?:vs\.?|versus)\s+([^?,.;]+)/iu)
    // "¿Qué es mejor para la escuela, un panel solar o una planta eléctrica?"
    ?? question.match(/,\s*((?:un|una|el|la|los|las)\s+[^?,.;]+?)\s+o\s+((?:un|una|el|la|los|las)\s+[^?,.;]+)/iu);
  if (!m) return [];
  const pair = [capitalize(m[1]), capitalize(m[2])];
  return pair.every((p) => p && p.split(/\s+/).length <= 5) ? pair : [];
}

const LIST_PREFIX = /^(?:Anexo:|Lista de)\s*/i;

/**
 * El mejor anexo o lista para un top: el que comparte más raíces con la pregunta y menos nombres
 * propios o años que la pregunta no menciona ("Medallero histórico de los Juegos Olímpicos" antes que
 * "Medallistas olímpicos de Venezuela" o "Medallero de Río de Janeiro 2016").
 */
export function bestListTitle(titles, keywords, question) {
  const stems = keywords.map((k) => k.slice(0, 5));
  const needed = Math.min(2, stems.length);
  const q = normalize(question);
  const questionWords = new Set(q.split(/[^a-z0-9ñ]+/));
  // Solo cuentan palabras con contenido: un 'de' no hace conocido al nombre que lo sigue.
  const known = (w) => !!w && !isNoise(normalize(w)) && (stems.some((s) => normalize(w).startsWith(s)) || questionWords.has(normalize(w)));
  const scored = titles
    .map((title, rank) => ({ title, rank }))
    .filter(({ title }) => LIST_PREFIX.test(title))
    .map((item) => {
      const words = item.title.replace(LIST_PREFIX, '').split(/\s+/);
      const matches = stems.filter((s) => normalize(item.title).includes(s)).length;
      let penalty = words.filter((w) => /^\d{4}$/.test(w) && !q.includes(w)).length;
      words.forEach((w, i) => {
        if (i > 0 && /^\p{Lu}/u.test(w) && !known(w) && !known(words[i - 1]) && !known(words[i + 1])) penalty++;
      });
      return { ...item, matches, penalty };
    })
    .filter((item) => item.matches >= needed)
    .sort((a, b) => b.matches - a.matches || a.penalty - b.penalty || a.rank - b.rank);
  return scored[0]?.title ?? null;
}
