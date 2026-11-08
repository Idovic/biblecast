/* Détection des références bibliques dans ce que dit le prédicateur (texte issu de la reconnaissance vocale).
   Gère les formes parlées et approximatives :
   « Jean chapitre trois verset seize », « Jean trois seize », « première aux Corinthiens treize »,
   « le psaume vingt-trois », « chapitre huit de Romains », « au verset dix-huit » (même chapitre),
   « lisons la suite » (verset suivant), noms de livres mal entendus (« Jeanne trois seize » → Jean 3:16).
   Rien n'est projeté automatiquement : chaque détection est une proposition à valider. */
import type { BibleData, VerseReference } from '@/types/bible';
import { getVerse, getVerses, getChapters } from '@/lib/bible';

export interface Detection {
  key: string;
  ref: VerseReference;
  /** Ce qui a été entendu (extrait) */
  heard: string;
  /** 0 à 1 */
  confidence: number;
  kind: 'verset' | 'passage' | 'chapitre' | 'contexte' | 'suite';
  at: number;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[’'`´-]/g, ' ').replace(/[.,;:!?«»"()]/g, ' ').replace(/\s+/g, ' ').trim();

/* ── Nombres dits en toutes lettres (jusqu'à 199) ───────────────────── */
const UNITS: Record<string, number> = { zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9 };
const TEENS: Record<string, number> = { dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16 };
const TENS: Record<string, number> = { vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60 };

/** Toutes les lectures possibles d'un nombre à partir de i : [valeur, nombre de mots] (la plus longue en premier) */
function readNumbers(tok: string[], i: number): [number, number][] {
  const out: [number, number][] = [];
  const t = tok[i];
  if (t === undefined) return out;
  if (/^\d{1,3}$/.test(t)) return [[Number(t), 1]];
  // 0-99
  const below100 = (j: number): [number, number][] => {
    const r: [number, number][] = [];
    const w = tok[j];
    if (w === undefined) return r;
    if (w in TEENS) {
      if (w === 'dix' && tok[j + 1] && ['sept', 'huit', 'neuf'].includes(tok[j + 1])) r.push([10 + UNITS[tok[j + 1]], 2]);
      r.push([TEENS[w], 1]);
      return r;
    }
    if (w in UNITS) { r.push([UNITS[w], 1]); return r; }
    if (w === 'quatre' ) return r;
    if (w in TENS) {
      const base = TENS[w];
      let k = j + 1;
      const hasEt = tok[k] === 'et';
      if (hasEt) k++;
      const nx = tok[k];
      if (base === 60 && nx && (nx in TEENS || nx === 'dix')) {
        const sub = below100(k); if (sub.length) r.push([60 + sub[0][0], k - j + sub[0][1]]);
      }
      if (nx && nx in UNITS && UNITS[nx] > 0 && nx !== 'une') r.push([base + UNITS[nx], k - j + 1]);
      if (!hasEt) r.push([base, 1]);
      return r;
    }
    return r;
  };
  // quatre-vingt(s) [x]
  if (t === 'quatre' && (tok[i + 1] === 'vingt' || tok[i + 1] === 'vingts')) {
    const sub = below100(i + 2).filter(([v]) => v < 20);
    for (const [v, n] of sub) out.push([80 + v, 2 + n]);
    out.push([80, 2]);
  } else if (t === 'cent') {
    const sub = readNumbers(tok, i + 1).filter(([v]) => v < 100);
    for (const [v, n] of sub) out.push([100 + v, 1 + n]);
    out.push([100, 1]);
  } else {
    out.push(...below100(i));
    if (t === 'quatre') out.push([4, 1]);
  }
  return out.sort((a, b) => b[1] - a[1]);
}

/* ── Livres ─────────────────────────────────────────────────────────── */
const SINGLE: Record<string, string> = {
  genese: 'Genèse', exode: 'Exode', levitique: 'Lévitique', nombres: 'Nombres', deuteronome: 'Deutéronome', josue: 'Josué',
  juges: 'Juges', ruth: 'Ruth', esdras: 'Esdras', nehemie: 'Néhémie', esther: 'Esther', job: 'Job', psaume: 'Psaumes', psaumes: 'Psaumes',
  proverbes: 'Proverbes', proverbe: 'Proverbes', ecclesiaste: 'Ecclésiaste', cantique: 'Cantique des Cantiques', esaie: 'Ésaïe', isaie: 'Ésaïe',
  jeremie: 'Jérémie', lamentations: 'Lamentations', ezechiel: 'Ézéchiel', daniel: 'Daniel', osee: 'Osée', joel: 'Joël', amos: 'Amos',
  abdias: 'Abdias', jonas: 'Jonas', michee: 'Michée', nahum: 'Nahum', habacuc: 'Habacuc', sophonie: 'Sophonie', aggee: 'Aggée',
  zacharie: 'Zacharie', malachie: 'Malachie', matthieu: 'Matthieu', marc: 'Marc', luc: 'Luc', jean: 'Jean', actes: 'Actes',
  romains: 'Romains', galates: 'Galates', ephesiens: 'Éphésiens', philippiens: 'Philippiens', colossiens: 'Colossiens', tite: 'Tite',
  philemon: 'Philémon', hebreux: 'Hébreux', jacques: 'Jacques', jude: 'Jude', apocalypse: 'Apocalypse',
};
const ORDINAL_BOOKS: Record<string, string> = {
  samuel: 'Samuel', rois: 'Rois', chroniques: 'Chroniques', corinthiens: 'Corinthiens', thessaloniciens: 'Thessaloniciens',
  timothee: 'Timothée', pierre: 'Pierre', jean: 'Jean',
};
const ORDINALS: Record<string, number> = {
  premier: 1, premiere: 1, '1': 1, '1er': 1, '1re': 1, '1ere': 1, un: 1, une: 1,
  deuxieme: 2, second: 2, seconde: 2, '2': 2, '2e': 2, deux: 2,
  troisieme: 3, '3': 3, '3e': 3, trois: 3,
};
/** Mots de liaison entre l'ordinal et le nom (« première épître aux Corinthiens ») */
const LINK = new Set(['epitre', 'epitres', 'lettre', 'livre', 'de', 'des', 'du', 'aux', 'aux', 'a', 'au', 'l', 'la', 'le', 'saint']);
/** Mots courants à ne jamais corriger en nom de livre */
const STOP = new Set(['mars', 'avec', 'elle', 'ceux', 'cela', 'celui', 'dire', 'dieu', 'fils', 'pere', 'dont', 'donc', 'mes', 'notre', 'votre', 'cette', 'dans', 'rien', 'tout', 'tous', 'jeune', 'jeunes', 'joie', 'jour', 'jours', 'mais', 'marche', 'mari', 'lui', 'leur', 'plus', 'puis', 'pour', 'sans', 'sont', 'bien', 'aime', 'amour', 'actes', 'actions']);

function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Nom de livre mal entendu ; plus tolérant quand un nombre suit (« Jeanne trois seize ») */
function fuzzySingle(w: string, numberFollows: boolean): string | null {
  if (w.length < 4 || STOP.has(w)) return null;
  let best: string | null = null, bestD = 9;
  for (const k of Object.keys(SINGLE)) {
    const d = lev(w, k);
    const allowed = k.length >= 7 ? 2 : numberFollows ? Math.floor(k.length / 2) : 1;
    if (d <= allowed && d < bestD) { best = SINGLE[k]; bestD = d; }
  }
  return best;
}

/** Livre qui commence au mot i : nom, nombre de mots, approximatif ? */
function matchBook(tok: string[], i: number): { book: string; len: number; fuzzy: boolean } | null {
  // « évangile selon », « livre de », « épître aux »… : on saute l'introduction
  let j = i;
  if (tok[j] === 'evangile' && tok[j + 1] === 'selon') j += 2;
  else if (tok[j] === 'selon') j += 1;
  else if ((tok[j] === 'livre' || tok[j] === 'epitre' || tok[j] === 'lettre') && LINK.has(tok[j + 1] ?? '')) j += 2;
  if (tok[j] === 'saint') j += 1;
  // Ordinal + nom (« première aux Corinthiens », « deuxième Timothée », « 1 Jean »)
  const ord = ORDINALS[tok[j] ?? ''];
  if (ord) {
    let k = j + 1;
    while (k < j + 4 && LINK.has(tok[k] ?? '')) k++;
    const name = ORDINAL_BOOKS[tok[k] ?? ''];
    if (name && !(name === 'Jean' && ord > 3) && !(['Samuel', 'Rois', 'Chroniques', 'Corinthiens', 'Thessaloniciens', 'Timothée', 'Pierre'].includes(name) && ord > 2)) {
      return { book: `${ord} ${name}`, len: k - i + 1, fuzzy: false };
    }
  }
  const w = tok[j];
  if (!w) return null;
  if (w === 'actes' && tok[j + 1] === 'des' && tok[j + 2] === 'apotres') return { book: 'Actes', len: j - i + 3, fuzzy: false };
  if (w === 'cantique' && tok[j + 1] === 'des' && tok[j + 2] === 'cantiques') return { book: 'Cantique des Cantiques', len: j - i + 3, fuzzy: false };
  if (SINGLE[w]) return { book: SINGLE[w], len: j - i + 1, fuzzy: false };
  const f = fuzzySingle(w, readNumbers(tok, j + 1).length > 0 || ['chapitre', 'verset'].includes(tok[j + 1] ?? ''));
  if (f) return { book: f, len: j - i + 1, fuzzy: true };
  return null;
}

/** Nombre qui tient dans la limite (chapitres ou versets existants) */
function pickNumber(tok: string[], i: number, max: number): [number, number] | null {
  for (const [v, n] of readNumbers(tok, i)) if (v >= 1 && v <= max) return [v, n];
  return null;
}

const SKIP_BEFORE_CHAPTER = new Set(['chapitre', 'chapitres', 'chap', 'au', 'le', 'du']);
const VERSE_WORDS = new Set(['verset', 'versets', 'v']);
const RANGE_WORDS = new Set(['a', 'au', 'jusqu', 'jusque', 'jusqua', 'et']);
const ONE_CHAPTER = new Set(['Abdias', 'Philémon', '2 Jean', '3 Jean', 'Jude']);

export class SermonDetector {
  private last: { book: string; chapter: number; verse: number; at: number } | null = null;
  private seen = new Map<string, number>();
  constructor(private bible: BibleData | null) {}
  setBible(b: BibleData | null) { this.bible = b; }

  /** Analyse un morceau de transcription. `partial` = texte encore en cours (on ignore ce qui peut être incomplet). */
  feed(text: string, partial = false, now = Date.now()): Detection[] {
    const bible = this.bible;
    if (!bible || !text.trim()) return [];
    const tok = norm(text).split(' ').filter(Boolean);
    const found: Detection[] = [];
    const snippet = (a: number, b: number) => tok.slice(Math.max(0, a), Math.min(tok.length, b)).join(' ');
    const emit = (book: string, chapter: number, verse: number, verseEnd: number | undefined, conf: number, kind: Detection['kind'], a: number, b: number) => {
      // En cours de phrase : un nombre en toute fin peut encore changer (« vingt » → « vingt-trois »)
      if (partial && b >= tok.length) return;
      const first = getVerse(bible, book, chapter, verse);
      if (!first) return;
      let ref: VerseReference = first;
      if (verseEnd && verseEnd > verse) {
        const parts: string[] = [];
        for (let v = verse; v <= verseEnd; v++) { const x = getVerse(bible, book, chapter, v); if (x) parts.push(x.text); }
        ref = { ...first, verseEnd, text: parts.join(' ') };
        kind = 'passage';
      }
      const key = `${book}|${chapter}|${verse}|${verseEnd ?? ''}`;
      this.last = { book, chapter, verse: verseEnd ?? verse, at: now };
      const prev = this.seen.get(key);
      this.seen.set(key, now);
      if (prev && now - prev < 90_000) return; // déjà proposé il y a peu
      found.push({ key, ref, heard: snippet(a - 2, b + 1), confidence: Math.max(0.3, Math.min(0.99, conf)), kind, at: now });
    };

    for (let i = 0; i < tok.length; i++) {
      // 1) « chapitre N [verset M] de|du|dans BOOK »
      if (tok[i] === 'chapitre') {
        const num = readNumbers(tok, i + 1)[0];
        if (num) {
          let j = i + 1 + num[1], verse: number | undefined;
          if (VERSE_WORDS.has(tok[j] ?? '')) { const vn = readNumbers(tok, j + 1)[0]; if (vn) { verse = vn[0]; j += 1 + vn[1]; } }
          if (['de', 'du', 'dans', 'd'].includes(tok[j] ?? '')) {
            let k = j + 1; if (['l', 'la', 'le'].includes(tok[k] ?? '')) k++;
            const m = matchBook(tok, k);
            if (m) {
              const chapters = getChapters(bible, m.book).length;
              if (num[0] <= chapters) {
                emit(m.book, num[0], verse ?? 1, undefined, (verse ? 0.9 : 0.6) - (m.fuzzy ? 0.15 : 0), verse ? 'verset' : 'chapitre', i, k + m.len);
                i = k + m.len - 1;
                continue;
              }
            }
          }
        }
      }
      // 2) « BOOK [chapitre] N [verset|,] M [à K] »
      const m = matchBook(tok, i);
      if (m) {
        let j = i + m.len;
        let explicit = 0;
        while (SKIP_BEFORE_CHAPTER.has(tok[j] ?? '')) { if (tok[j]!.startsWith('chap')) explicit++; j++; }
        const chapters = getChapters(bible, m.book).length;
        let chapter: number | null = null;
        if (ONE_CHAPTER.has(m.book) && VERSE_WORDS.has(tok[j] ?? '')) chapter = 1;
        else {
          const c = pickNumber(tok, j, chapters);
          if (c) { chapter = c[0]; j += c[1]; }
        }
        if (chapter === null) continue; // un nom de livre seul (« Jean dit… ») ne suffit pas
        const nVerses = getVerses(bible, m.book, chapter).length;
        // « au verset », « le verset », « verset »
        if (['au', 'le', 'et'].includes(tok[j] ?? '') && VERSE_WORDS.has(tok[j + 1] ?? '')) j++;
        if (VERSE_WORDS.has(tok[j] ?? '')) { explicit++; j++; }
        const v = pickNumber(tok, j, nVerses);
        if (v) {
          j += v[1];
          let end: number | undefined;
          let k = j;
          if (RANGE_WORDS.has(tok[k] ?? '')) {
            k++;
            while (['au', 'a', 'verset', 'versets', 'l'].includes(tok[k] ?? '')) k++;
            const e = pickNumber(tok, k, nVerses);
            if (e && e[0] > v[0] && e[0] - v[0] <= 30) { end = e[0]; j = k + e[1]; }
          }
          emit(m.book, chapter, v[0], end, (explicit >= 1 ? 0.95 : 0.85) - (m.fuzzy ? 0.15 : 0), 'verset', i, j);
        } else {
          // Chapitre seul (« ouvrez au psaume vingt-trois ») : proposé au verset 1
          emit(m.book, chapter, 1, undefined, (m.book === 'Psaumes' ? 0.75 : 0.6) - (m.fuzzy ? 0.15 : 0), 'chapitre', i, j);
        }
        i = j - 1;
        continue;
      }
      // 3) « au verset dix-huit » : même livre et même chapitre que la dernière référence (5 min)
      if (VERSE_WORDS.has(tok[i]) && tok[i] !== 'v' && this.last && now - this.last.at < 300_000) {
        const nVerses = getVerses(bible, this.last.book, this.last.chapter).length;
        const v = pickNumber(tok, i + 1, nVerses);
        if (v) {
          let j = i + 1 + v[1];
          let end: number | undefined;
          if (RANGE_WORDS.has(tok[j] ?? '')) {
            let k = j + 1; while (['au', 'a', 'verset'].includes(tok[k] ?? '')) k++;
            const e = pickNumber(tok, k, nVerses);
            if (e && e[0] > v[0] && e[0] - v[0] <= 30) { end = e[0]; j = k + e[1]; }
          }
          emit(this.last.book, this.last.chapter, v[0], end, 0.7, 'contexte', i, j);
          i = j - 1;
          continue;
        }
      }
      // 4) « la suite », « verset suivant », « continuons la lecture »
      if (this.last && now - this.last.at < 300_000 && !partial && (
        (tok[i] === 'la' && tok[i + 1] === 'suite') || (tok[i] === 'verset' && tok[i + 1] === 'suivant') || (tok[i] === 'continuons' && ['la', 'notre'].includes(tok[i + 1] ?? '')))) {
        const nx = this.last.verse + 1;
        if (getVerse(bible, this.last.book, this.last.chapter, nx)) emit(this.last.book, this.last.chapter, nx, undefined, 0.55, 'suite', i, i + 2);
        i += 1;
      }
    }
    return found;
  }
}
