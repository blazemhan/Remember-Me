// Flexible ("fuzzy") matching for secret-question answers.
// Returns: 1 = correct, 2 = close match (poster should check), 0 = wrong.

const FILLER = new Set(['the', 'a', 'an', 'mr', 'mrs', 'ms', 'miss', 'dr', 'sir', 'madam', 'aunty', 'auntie', 'uncle',
  'it', 'was', 'is', 'were', 'we', 'i', 'think', 'called', 'him', 'her', 'them', 'my', 'our', 'his', 'its', 'of', 'and', 'or']);
const NUMBERS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6 };

function tokens(s) {
  const words = String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')      // remove accents: é -> e
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/(\d+)(st|nd|rd|th)\b/g, '$1')                 // 1st -> 1
    .replace(/[^a-z0-9\s]/g, ' ')                            // drop punctuation
    .split(/\s+/).filter(Boolean)
    .map((w) => (w in NUMBERS ? String(NUMBERS[w]) : w));   // "three" -> "3"
  const meaningful = words.filter((w) => !FILLER.has(w));
  return meaningful.length ? meaningful : words;             // if everything is filler, keep it
}

// light singular/plural tolerance
const stem = (w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

function levenshtein(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
const similarity = (a, b) => (!a.length && !b.length ? 1 : 1 - levenshtein(a, b) / Math.max(a.length, b.length));

// how similar a single word must be to count (short words must be (nearly) exact)
const wordOk = (a, b) => {
  if (stem(a) === stem(b)) return true;
  if (/^\d+$/.test(a) || /^\d+$/.test(b)) return false;      // numbers must match exactly
  const len = Math.max(a.length, b.length);
  if (len <= 3) return false;
  return levenshtein(a, b) <= (len <= 6 ? 1 : 2);
};

function matchOne(expected, given) {
  const E = tokens(expected), G = tokens(given);
  if (!E.length || !G.length) return 0;
  const e = E.join(' '), g = G.join(' ');

  // 1. Same after cleanup, ignoring word order or spaces ("chalkmaster" = "chalk master")
  if (e === g || [...E].sort().join(' ') === [...G].sort().join(' ') || e.replace(/ /g, '') === g.replace(/ /g, '')) return 1;

  // 2. Small typos across the whole answer
  const sim = Math.max(similarity(e, g), similarity(e.replace(/ /g, ''), g.replace(/ /g, '')));
  if (sim >= 0.85) return 1;

  // 3. Every expected word appears (with typo tolerance) in what they wrote
  const used = new Set();
  const found = E.filter((w) => {
    const i = G.findIndex((x, k) => !used.has(k) && wordOk(w, x));
    if (i >= 0) used.add(i);
    return i >= 0;
  }).length;
  const extra = G.length - found;
  if (found === E.length) return extra <= 3 ? 1 : 2;     // e.g. "I think it was Chalk Master!" -> correct

  // 4. Partly right -> let the poster decide
  if (found / E.length >= 0.5 || sim >= 0.65) return 2;
  return 0;
}

// `accepted` = array of acceptable answers. Best result wins.
function checkAnswer(accepted, given) {
  let best = 0;
  for (const a of accepted) {
    const r = matchOne(a, given);
    if (r === 1) return 1;
    if (r === 2) best = 2;
  }
  return best;
}

module.exports = { checkAnswer, tokens };
