/**
 * speechParser.ts
 * Analyse une transcription orale française et en extrait une référence biblique.
 * Exemple : "Jean 3 verset 16" → { book: "Jean", chapter: 3, verse: 16 }
 */

import { BIBLE_BOOKS } from '@/lib/bible';

export interface BibleRef {
  book: string;
  chapter: number;
  verse: number;
}

// ── Normalisation ─────────────────────────────────────────────────────────────
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // supprime les diacritiques
    .replace(/[''`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Mots-nombres français ─────────────────────────────────────────────────────
const WORD_NUMS: Record<string, number> = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5,
  six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
  treize: 13, quatorze: 14, quinze: 15, seize: 16,
  'dix-sept': 17, 'dix-huit': 18, 'dix-neuf': 19,
  vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60,
  'soixante-dix': 70, 'quatre-vingt': 80, 'quatre-vingt-dix': 90,
  cent: 100, mille: 1000,
  // ordinaux pour les livres
  premier: 1, premiere: 1, second: 2, seconde: 2, troisieme: 3,
  quatrieme: 4, cinquieme: 5, sixieme: 6, septieme: 7, huitieme: 8,
  neuvieme: 9, dixieme: 10,
};

function parseNum(token: string): number | null {
  const n = parseInt(token, 10);
  if (!isNaN(n) && token.match(/^\d+$/)) return n;
  return WORD_NUMS[norm(token)] ?? null;
}

// ── Correspondances livres (normalisé → nom canonique partiel) ────────────────
// Clé = alias normalisé, valeur = nom de base (sans préfixe numérique)
const BOOK_MAP: Record<string, string> = {
  // Pentateuque
  genese: 'Genèse', gene: 'Genèse', gen: 'Genèse', gn: 'Genèse',
  exode: 'Exode', ex: 'Exode',
  levitique: 'Lévitique', lev: 'Lévitique', lv: 'Lévitique',
  nombres: 'Nombres', nb: 'Nombres', nm: 'Nombres',
  deuteronome: 'Deutéronome', deut: 'Deutéronome', dt: 'Deutéronome',
  // Historiques
  josue: 'Josué', jos: 'Josué',
  juges: 'Juges', jg: 'Juges', jug: 'Juges',
  ruth: 'Ruth', rt: 'Ruth',
  samuel: 'Samuel', sam: 'Samuel',
  rois: 'Rois',
  chroniques: 'Chroniques', chron: 'Chroniques', chr: 'Chroniques',
  esdras: 'Esdras', esd: 'Esdras', ezra: 'Esdras',
  nehemie: 'Néhémie', neh: 'Néhémie',
  esther: 'Esther', est: 'Esther',
  // Poétiques
  job: 'Job',
  psaumes: 'Psaumes', psaume: 'Psaumes', ps: 'Psaumes', psa: 'Psaumes',
  proverbes: 'Proverbes', prov: 'Proverbes', pr: 'Proverbes',
  ecclesiaste: 'Ecclésiaste', eccl: 'Ecclésiaste', qo: 'Ecclésiaste',
  cantique: 'Cantique des Cantiques', ct: 'Cantique des Cantiques', sos: 'Cantique des Cantiques',
  // Prophètes
  esaie: 'Ésaïe', esa: 'Ésaïe', es: 'Ésaïe', is: 'Ésaïe',
  jeremie: 'Jérémie', jer: 'Jérémie',
  lamentations: 'Lamentations', lam: 'Lamentations', la: 'Lamentations',
  ezechiel: 'Ézéchiel', eze: 'Ézéchiel', ez: 'Ézéchiel',
  daniel: 'Daniel', dan: 'Daniel', dn: 'Daniel',
  osee: 'Osée', os: 'Osée', ho: 'Osée',
  joel: 'Joël', jl: 'Joël',
  amos: 'Amos', am: 'Amos',
  abdias: 'Abdias', abd: 'Abdias', ob: 'Abdias',
  jonas: 'Jonas', jon: 'Jonas',
  michee: 'Michée', mic: 'Michée', mi: 'Michée',
  nahum: 'Nahum', na: 'Nahum',
  habacuc: 'Habacuc', hab: 'Habacuc',
  sophonie: 'Sophonie', soph: 'Sophonie', zp: 'Sophonie',
  aggee: 'Aggée', ag: 'Aggée', hag: 'Aggée',
  zacharie: 'Zacharie', zach: 'Zacharie', za: 'Zacharie',
  malachie: 'Malachie', mal: 'Malachie',
  // Evangiles & NT
  matthieu: 'Matthieu', matt: 'Matthieu', mt: 'Matthieu',
  marc: 'Marc', mc: 'Marc', mk: 'Marc',
  luc: 'Luc', lc: 'Luc',
  jean: 'Jean', jn: 'Jean', jea: 'Jean',
  actes: 'Actes', act: 'Actes', ac: 'Actes',
  romains: 'Romains', rom: 'Romains', rm: 'Romains',
  corinthiens: 'Corinthiens', cor: 'Corinthiens',
  galates: 'Galates', gal: 'Galates', ga: 'Galates',
  ephesiens: 'Éphésiens', eph: 'Éphésiens', ep: 'Éphésiens',
  philippiens: 'Philippiens', phil: 'Philippiens',
  colossiens: 'Colossiens', col: 'Colossiens',
  thessaloniciens: 'Thessaloniciens', thess: 'Thessaloniciens', th: 'Thessaloniciens',
  timothee: 'Timothée', tim: 'Timothée', tm: 'Timothée',
  tite: 'Tite', tt: 'Tite',
  philemon: 'Philémon', phm: 'Philémon',
  hebreux: 'Hébreux', heb: 'Hébreux',
  jacques: 'Jacques', jac: 'Jacques', jm: 'Jacques',
  pierre: 'Pierre',
  jude: 'Jude', jd: 'Jude',
  apocalypse: 'Apocalypse', apoc: 'Apocalypse', apo: 'Apocalypse', ap: 'Apocalypse', rev: 'Apocalypse',
};

// ── Mots à ignorer dans la séquence numérique ─────────────────────────────────
const FILLERS = new Set([
  'chapitre', 'ch', 'verset', 'versets', 'v', 'et', 'au', 'jusqu', 'a', 'dans', 'de',
]);

// ── Résolution du livre ───────────────────────────────────────────────────────
function resolveBook(candidate: string, prefix: number | null): string | null {
  const n = norm(candidate);
  const base = BOOK_MAP[n];

  if (prefix !== null) {
    // Livre numéroté : cherche "{prefix} {base}" dans BIBLE_BOOKS
    if (base) {
      const target = `${prefix} ${base}`;
      const found = BIBLE_BOOKS.find(b => norm(b) === norm(target));
      if (found) return found;
    }
    // Fallback : préfixe + candidat capitalisé
    const capName = candidate.charAt(0).toUpperCase() + candidate.slice(1);
    const target2 = `${prefix} ${capName}`;
    const found2 = BIBLE_BOOKS.find(b => norm(b) === norm(target2));
    if (found2) return found2;
    return null;
  }

  if (base) {
    // Cherche la correspondance exacte (sans préfixe numérique dans BIBLE_BOOKS)
    const found = BIBLE_BOOKS.find(b => b === base || norm(b) === norm(base));
    if (found && !/^\d /.test(found)) return found;
    // Si le livre canonique a un préfixe (ex: "1 Samuel" pour "samuel"),
    // renvoie null — on ne sait pas lequel choisir sans précision
    if (!found) return null;
    // Renvoie le premier match non numéroté
    const unnumbered = BIBLE_BOOKS.find(b => norm(b) === norm(base));
    return unnumbered ?? null;
  }

  // Matching par préfixe (ex: "Apoc" → "Apocalypse")
  if (n.length >= 3) {
    const prefixMatch = BIBLE_BOOKS.find(b => {
      const normB = norm(b);
      return normB.startsWith(n) && !/^\d /.test(b);
    });
    if (prefixMatch) return prefixMatch;
  }

  return null;
}

// ── Extracteur de nombres depuis une liste de tokens ─────────────────────────
function extractNumbers(tokens: string[]): number[] {
  return tokens
    .filter(t => !FILLERS.has(norm(t)))
    .map(parseNum)
    .filter((n): n is number => n !== null);
}

// ── Préfixes d'ordre (premier, 2e, etc.) ─────────────────────────────────────
const PREFIX_PATTERNS: [RegExp, number][] = [
  [/^(premiere?|1ere?|1re?)(\s|$)/, 1],
  [/^(second[e]?|deuxieme?|2eme?|2e?)(\s|$)/, 2],
  [/^(troisieme?|3eme?|3e?)(\s|$)/, 3],
  [/^1(\s|$)/, 1],
  [/^2(\s|$)/, 2],
  [/^3(\s|$)/, 3],
];

// ── Fonction principale ───────────────────────────────────────────────────────
export function parseFrenchBibleRef(raw: string): BibleRef | null {
  let text = norm(raw);

  // 1. Extraire le préfixe ordinal optionnel
  let bookPrefix: number | null = null;
  for (const [pattern, num] of PREFIX_PATTERNS) {
    if (pattern.test(text)) {
      text = text.replace(pattern, '').trim();
      bookPrefix = num;
      break;
    }
  }

  // 2. Essayer de matcher le nom du livre (1 à 3 mots)
  const words = text.split(/\s+/);

  for (let wc = Math.min(3, words.length - 1); wc >= 1; wc--) {
    const candidate = words.slice(0, wc).join(' ');
    const book = resolveBook(candidate, bookPrefix);
    if (!book) continue;

    const rest = words.slice(wc);
    const nums = extractNumbers(rest);

    if (nums.length >= 2) {
      return { book, chapter: nums[0], verse: nums[1] };
    } else if (nums.length === 1) {
      // Seul un chapitre précisé → verset 1
      return { book, chapter: nums[0], verse: 1 };
    }
  }

  return null;
}
