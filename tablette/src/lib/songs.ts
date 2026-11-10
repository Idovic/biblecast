/* Bibliothèque de chants : gardée dans la base de la tablette (IndexedDB, des centaines de Mo),
   pas dans la petite mémoire des réglages. Un chant = du texte : 1 000 chants ≈ 1,3 Mo.
   Saisie : une ligne vide entre les strophes ; « Refrain » (ou « R : ») au-dessus du refrain. */
import { genId } from '@/lib/utils';
import type { CustomSlide } from '@/types/bible';

export interface Song {
  id: string;
  title: string;
  author?: string;
  /** Paroles telles que saisies (strophes séparées par une ligne vide) */
  lyrics: string;
  /** Ordre de passage, ex. « C1 R C2 R R » ; vide = automatique (refrain après chaque couplet) */
  order?: string;
  /** Lignes par écran sur la TV (2 à 4) */
  linesPerScreen?: number;
  /** Fond animé des écrans du chant */
  background?: string;
  updatedAt: number;
}

export interface SongSection { key: string; label: string; short: string; lines: string[] }
export interface SongScreen { key: string; short: string; label: string; lines: string[] }

export const DEFAULT_SONG_BG = 'pourpre';

/* ── Lecture des paroles ─────────────────────────────────────────────── */
const HEAD: { re: RegExp; kind: 'C' | 'R' | 'P' | 'I' | 'F' }[] = [
  { re: /^(?:refrain|chorus|ref|r)\b\.?\s*(\d+)?\s*[:.)-]?\s*/i, kind: 'R' },
  { re: /^(?:couplet|strophe|verse|v)\s*(\d+)?\s*[:.)-]?\s*/i, kind: 'C' },
  { re: /^(?:pont|bridge)\s*(\d+)?\s*[:.)-]?\s*/i, kind: 'P' },
  { re: /^(?:intro|introduction)\s*(\d+)?\s*[:.)-]?\s*/i, kind: 'I' },
  { re: /^(?:fin|final|finale|outro|coda)\s*(\d+)?\s*[:.)-]?\s*/i, kind: 'F' },
];
const LABEL: Record<string, string> = { C: 'Couplet', R: 'Refrain', P: 'Pont', I: 'Introduction', F: 'Fin' };

/** Découpe les paroles en sections (couplets, refrain, pont…) */
export function parseLyrics(lyrics: string): SongSection[] {
  const blocks = lyrics.replace(/\r/g, '').split(/\n\s*\n/).map(b => b.split('\n').map(l => l.trim()).filter(Boolean)).filter(b => b.length);
  const out: SongSection[] = [];
  const count: Record<string, number> = { C: 0, R: 0, P: 0, I: 0, F: 0 };
  for (const b of blocks) {
    let kind: 'C' | 'R' | 'P' | 'I' | 'F' = 'C';
    let num: number | undefined;
    let lines = [...b];
    // « 1. Texte » en début de couplet
    const numbered = lines[0].match(/^(\d{1,2})[.)]\s+(.*)$/);
    let matched = false;
    for (const h of HEAD) {
      const m = lines[0].match(h.re);
      // « Refrain » seul sur sa ligne, ou « R : texte » ; on évite les mots ordinaires (« Revenez… »)
      if (m && (m[0].length === lines[0].length || /[:.)-]\s*$/.test(m[0]) || /^r\s*[:.)-]/i.test(lines[0]))) {
        kind = h.kind; num = m[1] ? Number(m[1]) : undefined; matched = true;
        const rest = lines[0].slice(m[0].length).trim();
        lines = rest ? [rest, ...lines.slice(1)] : lines.slice(1);
        break;
      }
    }
    if (!matched && numbered) { num = Number(numbered[1]); lines = [numbered[2], ...lines.slice(1)]; }
    if (!lines.length) continue;
    count[kind]++;
    const n = num ?? count[kind];
    const key = kind === 'C' ? `C${n}` : (n > 1 ? `${kind}${n}` : kind);
    out.push({ key, label: kind === 'C' ? `${LABEL.C} ${n}` : LABEL[kind] + (n > 1 ? ` ${n}` : ''), short: key, lines });
  }
  return out;
}

/** Ordre automatique : le refrain revient après chaque couplet qui n'en est pas suivi */
export function autoOrder(sections: SongSection[]): string[] {
  const hasR = sections.some(s => s.key === 'R');
  const order: string[] = [];
  sections.forEach((s, i) => {
    order.push(s.key);
    const next = sections[i + 1];
    if (hasR && s.key.startsWith('C') && (!next || !next.key.startsWith('R'))) order.push('R');
  });
  return order;
}

export function songOrder(song: Song, sections = parseLyrics(song.lyrics)): string[] {
  const keys = new Set(sections.map(s => s.key));
  const custom = (song.order ?? '').toUpperCase().split(/[\s,;]+/).filter(k => keys.has(k));
  return custom.length ? custom : autoOrder(sections);
}

/** Écrans de TV, dans l'ordre de passage (2 à 4 lignes, réparties de façon égale) */
export function songScreens(song: Song): SongScreen[] {
  const sections = parseLyrics(song.lyrics);
  const byKey = new Map(sections.map(s => [s.key, s]));
  const max = Math.max(1, Math.min(6, song.linesPerScreen ?? 4));
  const out: SongScreen[] = [];
  for (const k of songOrder(song, sections)) {
    const s = byKey.get(k); if (!s) continue;
    const chunks = Math.ceil(s.lines.length / max);
    const size = Math.ceil(s.lines.length / chunks);
    for (let i = 0; i < s.lines.length; i += size) out.push({ key: s.key, short: s.short, label: s.label, lines: s.lines.slice(i, i + size) });
  }
  return out;
}

/** Slides prêtes à projeter : le titre et l'auteur sur le premier écran, « Refrain » discret sur le refrain */
export function songSlides(song: Song): CustomSlide[] {
  return songScreens(song).map((sc, i) => ({
    id: `${song.id}-${i}`,
    slideType: 'song' as const,
    title: song.title,
    label: i === 0 ? song.title : sc.key.startsWith('R') ? sc.label : '',
    content: sc.lines.join('\n'),
    footer: i === 0 && song.author ? song.author : undefined,
    backgroundAnimated: song.background || DEFAULT_SONG_BG,
    textColor: '#ffffff', fontSize: 'large', textAlign: 'center', textShadow: true, showLogo: false,
  }));
}

export function firstLine(song: Song): string {
  return parseLyrics(song.lyrics)[0]?.lines[0] ?? '';
}

/* ── Recherche ───────────────────────────────────────────────────────── */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'");

export function searchSongs(songs: Song[], q: string): Song[] {
  const n = norm(q.trim());
  const sorted = [...songs].sort((a, b) => norm(a.title).localeCompare(norm(b.title)));
  if (!n) return sorted;
  const scored: [number, Song][] = [];
  for (const s of sorted) {
    const t = norm(s.title), a = norm(s.author ?? ''), f = norm(firstLine(s)), l = norm(s.lyrics);
    const sc = t === n ? 100 : t.startsWith(n) ? 90 : t.includes(n) ? 75 : f.includes(n) ? 60 : a.includes(n) ? 50 : l.includes(n) ? 30 : 0;
    if (sc) scored.push([sc, s]);
  }
  return scored.sort((x, y) => y[0] - x[0]).map(x => x[1]);
}

/* ── Stockage (IndexedDB) ────────────────────────────────────────────── */
const DB = 'biblecast-songs-db', STORE = 'songs';
function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' }); };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
function tx<T>(mode: IDBTransactionMode, run: (st: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(db => new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const st = t.objectStore(STORE);
    const r = run(st);
    t.oncomplete = () => { res(r ? (r as IDBRequest<T>).result : undefined); db.close(); };
    t.onerror = () => { rej(t.error); db.close(); };
  }));
}
export async function loadSongs(): Promise<Song[]> {
  try { return (await tx<Song[]>('readonly', st => st.getAll())) ?? []; } catch { return []; }
}
export async function saveSong(song: Song): Promise<boolean> {
  try { await tx('readwrite', st => { st.put({ ...song, updatedAt: Date.now() }); }); return true; } catch { return false; }
}
export async function deleteSong(id: string): Promise<boolean> {
  try { await tx('readwrite', st => { st.delete(id); }); return true; } catch { return false; }
}
export async function saveSongs(list: Song[]): Promise<number> {
  try { await tx('readwrite', st => { for (const s of list) st.put(s); }); return list.length; } catch { return 0; }
}

/* ── Partage : fichier .json (BibleCast) ou .txt ─────────────────────── */
export function exportSongsJson(songs: Song[]): string {
  return JSON.stringify({ _type: 'biblecast-songs', _version: 1, songs }, null, 1);
}

/** Lit un fichier de chants. .txt : 1re ligne = titre, « Auteur : … » facultatif, puis les paroles ;
 *  plusieurs chants séparés par une ligne « === ». Les chants déjà présents (même titre) sont remplacés. */
export function parseSongsFile(text: string, existing: Song[]): Song[] {
  const byTitle = new Map(existing.map(s => [norm(s.title), s]));
  const keep = (s: Partial<Song>): Song | null => {
    if (!s.title?.trim() || !s.lyrics?.trim()) return null;
    const old = byTitle.get(norm(s.title));
    return { id: old?.id ?? genId(), title: s.title.trim(), author: s.author?.trim() || undefined, lyrics: s.lyrics.trim(), order: s.order, linesPerScreen: s.linesPerScreen, background: s.background, updatedAt: Date.now() };
  };
  try {
    const raw = JSON.parse(text);
    const list: Partial<Song>[] = Array.isArray(raw) ? raw : Array.isArray(raw?.songs) ? raw.songs : [];
    return list.map(keep).filter((s): s is Song => !!s);
  } catch { /* texte */ }
  return text.replace(/\r/g, '').split(/\n\s*={3,}\s*\n/).map(chunk => {
    const lines = chunk.trim().split('\n');
    const title = (lines.shift() ?? '').replace(/^titre\s*:\s*/i, '');
    let author: string | undefined;
    if (lines[0] && /^(auteur|paroles|de)\s*:/i.test(lines[0])) author = lines.shift()!.replace(/^[^:]+:\s*/, '');
    return keep({ title, author, lyrics: lines.join('\n') });
  }).filter((s): s is Song => !!s);
}

export function newSong(): Song {
  return { id: genId(), title: '', lyrics: '', linesPerScreen: 4, background: DEFAULT_SONG_BG, updatedAt: Date.now() };
}
