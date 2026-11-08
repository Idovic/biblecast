/* Utilitaires pour charger et rechercher dans la Bible */
import type { BibleData, VerseReference, SearchResult } from '@/types/bible';

let bibleCache: BibleData | null = null;
let bdsCache: BibleData | null = null;

const BDS_STORAGE_KEY = 'biblecast:bds-data';

export async function loadBible(): Promise<BibleData> {
  if (bibleCache) return bibleCache;
  const response = await fetch(import.meta.env.BASE_URL + 'bible-fr.json');
  bibleCache = await response.json();
  return bibleCache!;
}

/* 2e Bible : J.N. Darby (domaine public, éd. BPC 2024), fournie avec l'app.
   Sa numérotation suit la Bible hébraïque ; map-lsg-darby.json donne la
   correspondance LSG → Darby pour les versets qui diffèrent. */
let darbyMap: Record<string, string[]> = {};

export async function loadBDS(): Promise<BibleData> {
  if (bdsCache !== null) return bdsCache;
  try {
    const stored = localStorage.getItem(BDS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as BibleData;
      if (Object.keys(parsed).length > 0) {
        bdsCache = parsed;
        darbyMap = {};
        return bdsCache;
      }
    }
  } catch { }
  try {
    const [bibleRes, mapRes] = await Promise.all([
      fetch(import.meta.env.BASE_URL + 'bible-darby.json'),
      fetch(import.meta.env.BASE_URL + 'map-lsg-darby.json').catch(() => null),
    ]);
    const data = await bibleRes.json() as BibleData;
    try { darbyMap = mapRes ? await mapRes.json() : {}; } catch { darbyMap = {}; }
    bdsCache = data;
    return bdsCache;
  } catch {
    bdsCache = {};
    return {};
  }
}

/** Verset équivalent dans la 2e Bible (gère les numérotations différentes).
    Les correspondances sont enregistrées par lib/versions (loadVersion). */
export const parallelMaps = new WeakMap<BibleData, { id: string; map: Record<string, string[]> }>();
export function getParallelVerse(bible2: BibleData, ref: VerseReference): VerseReference | null {
  const info = parallelMaps.get(bible2);
  const map = info?.map ?? darbyMap;
  const key = `${ref.book}|${ref.chapter}|${ref.verse}`;
  const targets = map[key] ?? [key];
  const parts = targets
    .map(t => t.split('|'))
    .map(([b, c, v]) => ({ b, c: Number(c), v: Number(v), text: getVerseText(bible2, b, Number(c), Number(v)) }))
    .filter(x => x.text);
  if (parts.length === 0) return null;
  return { book: parts[0].b, chapter: parts[0].c, verse: parts[0].v, text: parts.map(p => p.text).join(' '), version: info?.id };
}

export function importBDS(data: BibleData): void {
  try {
    localStorage.setItem(BDS_STORAGE_KEY, JSON.stringify(data));
    bdsCache = data;
  } catch { }
}

export function clearBDSCache(): void {
  bdsCache = null;
}

export const BIBLE_BOOKS = [
  'Genèse', 'Exode', 'Lévitique', 'Nombres', 'Deutéronome',
  'Josué', 'Juges', 'Ruth', '1 Samuel', '2 Samuel',
  '1 Rois', '2 Rois', '1 Chroniques', '2 Chroniques',
  'Esdras', 'Néhémie', 'Esther', 'Job', 'Psaumes', 'Proverbes',
  'Ecclésiaste', 'Cantique des Cantiques', 'Ésaïe', 'Jérémie',
  'Lamentations', 'Ézéchiel', 'Daniel', 'Osée', 'Joël', 'Amos',
  'Abdias', 'Jonas', 'Michée', 'Nahum', 'Habacuc', 'Sophonie',
  'Aggée', 'Zacharie', 'Malachie',
  'Matthieu', 'Marc', 'Luc', 'Jean', 'Actes',
  'Romains', '1 Corinthiens', '2 Corinthiens', 'Galates', 'Éphésiens',
  'Philippiens', 'Colossiens', '1 Thessaloniciens', '2 Thessaloniciens',
  '1 Timothée', '2 Timothée', 'Tite', 'Philémon', 'Hébreux',
  'Jacques', '1 Pierre', '2 Pierre', '1 Jean', '2 Jean', '3 Jean',
  'Jude', 'Apocalypse',
];

export function getChapters(bible: BibleData, book: string): number[] {
  const bookData = bible[book];
  if (!bookData) return [];
  return Object.keys(bookData).map(Number).sort((a, b) => a - b);
}

export function getVerses(bible: BibleData, book: string, chapter: number): number[] {
  const chapterData = bible[book]?.[String(chapter)];
  if (!chapterData) return [];
  return Object.keys(chapterData).map(Number).sort((a, b) => a - b);
}

export function getVerseText(bible: BibleData, book: string, chapter: number, verse: number): string {
  return bible[book]?.[String(chapter)]?.[String(verse)] || '';
}

export function getVerse(bible: BibleData, book: string, chapter: number, verse: number): VerseReference | null {
  const text = getVerseText(bible, book, chapter, verse);
  if (!text) return null;
  return { book, chapter, verse, text };
}

export function formatReference(ref: VerseReference): string {
  return `${ref.book} ${ref.chapter}:${ref.verse}${ref.verseEnd && ref.verseEnd > ref.verse ? `-${ref.verseEnd}` : ''}`;
}

/** Verset suivant (ou précédent) dans la Bible, en passant au chapitre voisin si besoin */
export function stepVerse(bible: BibleData, v: VerseReference, dir: 1 | -1): VerseReference | null {
  const from = dir === 1 ? (v.verseEnd ?? v.verse) : v.verse;
  const same = getVerse(bible, v.book, v.chapter, from + dir);
  if (same) return same;
  if (dir === 1) return getVerse(bible, v.book, v.chapter + 1, 1);
  const prevCh = getVerses(bible, v.book, v.chapter - 1);
  return prevCh.length ? getVerse(bible, v.book, v.chapter - 1, prevCh[prevCh.length - 1]) : null;
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (n: number) => String(n).split('').map(d => SUP[+d]).join('');

/** Passage découpé en écrans lisibles (≈ 330 caractères au plus par écran) */
export function passagePages(verses: VerseReference[], maxChars = 330): VerseReference[] {
  const pages: VerseReference[] = [];
  let cur: VerseReference[] = [];
  const flush = () => {
    if (!cur.length) return;
    const first = cur[0], last = cur[cur.length - 1];
    pages.push({ book: first.book, chapter: first.chapter, verse: first.verse, verseEnd: last.verse > first.verse ? last.verse : undefined,
      text: cur.length === 1 ? first.text : cur.map(x => `${sup(x.verse)}\u00a0${x.text}`).join(' ') });
    cur = [];
  };
  for (const v of verses) {
    const len = cur.reduce((n, x) => n + x.text.length + 4, 0);
    if (cur.length && (len + v.text.length > maxChars || v.chapter !== cur[0].chapter)) flush();
    cur.push(v);
  }
  flush();
  return pages;
}

/* ── Recherche : références rapides et mots sans accents ─────────────── */

/** Minuscules, sans accents, apostrophes unifiées */
export function normalizeText(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'").replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/\s+/g, ' ').trim();
}

const compact = (s: string) => normalizeText(s).replace(/[\s.]/g, '');

/** Abréviations courantes (françaises) → livre */
const BOOK_ABBREV: Record<string, string> = {
  gn: 'Genèse', ge: 'Genèse', gen: 'Genèse', ex: 'Exode', exo: 'Exode', lv: 'Lévitique', lev: 'Lévitique', le: 'Lévitique',
  nb: 'Nombres', no: 'Nombres', nom: 'Nombres', dt: 'Deutéronome', de: 'Deutéronome', deut: 'Deutéronome',
  jos: 'Josué', jg: 'Juges', jug: 'Juges', rt: 'Ruth', ru: 'Ruth',
  '1s': '1 Samuel', '1sa': '1 Samuel', '1sam': '1 Samuel', '2s': '2 Samuel', '2sa': '2 Samuel', '2sam': '2 Samuel',
  '1r': '1 Rois', '1ro': '1 Rois', '2r': '2 Rois', '2ro': '2 Rois',
  '1ch': '1 Chroniques', '1chr': '1 Chroniques', '2ch': '2 Chroniques', '2chr': '2 Chroniques',
  esd: 'Esdras', ne: 'Néhémie', neh: 'Néhémie', est: 'Esther', jb: 'Job',
  ps: 'Psaumes', psa: 'Psaumes', psaume: 'Psaumes', pr: 'Proverbes', pro: 'Proverbes', prov: 'Proverbes',
  ec: 'Ecclésiaste', ecc: 'Ecclésiaste', ecl: 'Ecclésiaste', qo: 'Ecclésiaste', ct: 'Cantique des Cantiques', ca: 'Cantique des Cantiques', cant: 'Cantique des Cantiques',
  es: 'Ésaïe', esa: 'Ésaïe', is: 'Ésaïe', isa: 'Ésaïe', jr: 'Jérémie', je: 'Jérémie', jer: 'Jérémie', lm: 'Lamentations', la: 'Lamentations', lam: 'Lamentations',
  ez: 'Ézéchiel', eze: 'Ézéchiel', ezk: 'Ézéchiel', dn: 'Daniel', da: 'Daniel', dan: 'Daniel', os: 'Osée', jl: 'Joël', jo: 'Joël', am: 'Amos',
  ab: 'Abdias', abd: 'Abdias', jon: 'Jonas', mi: 'Michée', mic: 'Michée', na: 'Nahum', nah: 'Nahum', ha: 'Habacuc', hab: 'Habacuc',
  so: 'Sophonie', soph: 'Sophonie', ag: 'Aggée', za: 'Zacharie', zac: 'Zacharie', zach: 'Zacharie', ml: 'Malachie', mal: 'Malachie',
  mt: 'Matthieu', mat: 'Matthieu', matt: 'Matthieu', mc: 'Marc', mr: 'Marc', mar: 'Marc', lc: 'Luc', lu: 'Luc',
  jn: 'Jean', jean: 'Jean', ac: 'Actes', act: 'Actes', rm: 'Romains', ro: 'Romains', rom: 'Romains',
  '1co': '1 Corinthiens', '1cor': '1 Corinthiens', '2co': '2 Corinthiens', '2cor': '2 Corinthiens',
  ga: 'Galates', gal: 'Galates', ep: 'Éphésiens', eph: 'Éphésiens', ph: 'Philippiens', phi: 'Philippiens', phil: 'Philippiens',
  col: 'Colossiens', '1th': '1 Thessaloniciens', '1thes': '1 Thessaloniciens', '2th': '2 Thessaloniciens', '2thes': '2 Thessaloniciens',
  '1tm': '1 Timothée', '1ti': '1 Timothée', '1tim': '1 Timothée', '2tm': '2 Timothée', '2ti': '2 Timothée', '2tim': '2 Timothée',
  tt: 'Tite', tit: 'Tite', phm: 'Philémon', phlm: 'Philémon', he: 'Hébreux', hb: 'Hébreux', heb: 'Hébreux',
  jc: 'Jacques', ja: 'Jacques', jac: 'Jacques', '1p': '1 Pierre', '1pi': '1 Pierre', '1pe': '1 Pierre', '2p': '2 Pierre', '2pi': '2 Pierre', '2pe': '2 Pierre',
  '1jn': '1 Jean', '1j': '1 Jean', '1jean': '1 Jean', '2jn': '2 Jean', '2j': '2 Jean', '2jean': '2 Jean', '3jn': '3 Jean', '3j': '3 Jean', '3jean': '3 Jean',
  jd: 'Jude', jud: 'Jude', ap: 'Apocalypse', apo: 'Apocalypse', apoc: 'Apocalypse', rev: 'Apocalypse',
};

/** Retrouve un livre à partir d'un nom complet, partiel ou abrégé, avec ou sans accents */
export function findBook(query: string): string | null {
  const q = compact(query).replace(/^(i{1,3})(?=[a-z])/, m => String(m.length)) // « II Rois » → « 2rois »
    .replace(/^(premier|premiere|1er|1re)/, '1').replace(/^(deuxieme|second|seconde|2e)/, '2').replace(/^(troisieme|3e)/, '3');
  if (!q) return null;
  if (BOOK_ABBREV[q]) return BOOK_ABBREV[q];
  const exact = BIBLE_BOOKS.find(b => compact(b) === q);
  if (exact) return exact;
  const prefix = BIBLE_BOOKS.find(b => compact(b).startsWith(q));
  return q.length >= 2 ? prefix ?? null : null;
}

export interface ParsedReference { book: string; chapter: number; verseStart?: number; verseEnd?: number }

/** « jn 3 16 », « Jean 3:16-18 », « 1co13 », « ps 23 », « psaume 23 v 1 à 6 » */
export function parseReference(query: string): ParsedReference | null {
  const q = normalizeText(query).replace(/\bversets?\b|\bv\b/g, ' ').replace(/\s+/g, ' ').trim();
  const m = q.match(/^((?:[1-3]|i{1,3})?\s*[a-z][a-z .]*?)\s*(\d{1,3})(?:\s*[:.,\s]\s*(\d{1,3})(?:\s*(?:-|–|a|au|jusqu'a)\s*(\d{1,3}))?)?\s*$/);
  if (!m) return null;
  const book = findBook(m[1]);
  if (!book) return null;
  const chapter = Number(m[2]);
  const verseStart = m[3] ? Number(m[3]) : undefined;
  let verseEnd = m[4] ? Number(m[4]) : undefined;
  if (verseStart && verseEnd && verseEnd < verseStart) verseEnd = undefined;
  return { book, chapter, verseStart, verseEnd };
}

/** Index de texte normalisé, construit une fois par Bible */
const normIndex = new WeakMap<BibleData, Array<[string, number, number, string, string]>>();
function getNormIndex(bible: BibleData) {
  let idx = normIndex.get(bible);
  if (!idx) {
    idx = [];
    for (const book of BIBLE_BOOKS) {
      const b = bible[book]; if (!b) continue;
      for (const ch of Object.keys(b).sort((x, y) => +x - +y)) {
        for (const v of Object.keys(b[ch]).sort((x, y) => +x - +y)) {
          const t = b[ch][v];
          idx.push([book, +ch, +v, t, normalizeText(t)]);
        }
      }
    }
    normIndex.set(bible, idx);
  }
  return idx;
}

export function searchBible(bible: BibleData, query: string, limit = 50): SearchResult[] {
  if (!query || query.trim().length < 2) return [];

  // 1. Référence (une plage, un verset ou un chapitre entier)
  const ref = parseReference(query);
  if (ref) {
    const chapterData = bible[ref.book]?.[String(ref.chapter)];
    if (chapterData) {
      const nums = Object.keys(chapterData).map(Number).sort((a, b) => a - b);
      const from = ref.verseStart ?? nums[0];
      const to = ref.verseEnd ?? (ref.verseStart ? ref.verseStart : nums[nums.length - 1]);
      const out = nums.filter(n => n >= from && n <= to).slice(0, 200)
        .map(n => ({ book: ref.book, chapter: ref.chapter, verse: n, text: chapterData[String(n)], highlight: chapterData[String(n)] }));
      if (out.length) return out;
    }
  }

  // 2. Mots, sans tenir compte des accents ni des majuscules
  const nq = normalizeText(query);
  const words = nq.split(' ').filter(w => w.length > 1);
  if (words.length === 0) return [];
  const results: SearchResult[] = [];
  for (const [book, chapter, verse, text, norm] of getNormIndex(bible)) {
    if (norm.includes(nq) || words.every(w => norm.includes(w))) {
      results.push({ book, chapter, verse, text, highlight: text });
      if (results.length >= limit) break;
    }
  }
  return results;
}
