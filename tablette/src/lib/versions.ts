/* Versions de la Bible fournies avec l'app : LSG 1910 (principale) et Darby 1885, libres de droits, hors ligne.
   La LSG 1910 est la Bible principale ; chaque autre version a un fichier de correspondance
   LSG → version (titres des Psaumes, Malachie 4, Joël 3…) pour retrouver le même verset. */
import type { BibleData, VerseReference } from '@/types/bible';
import { getVerseText, searchBible, parallelMaps } from '@/lib/bible';

export interface BibleVersion { id: string; label: string; file: string; map: string; lang: 'fr' }

export const BIBLE_VERSIONS: BibleVersion[] = [
  { id: 'Darby', label: 'Darby (1885)', file: 'bible-darby.json', map: 'map-lsg-darby.json', lang: 'fr' },
];

const cache = new Map<string, Promise<BibleData | null>>();
const maps = new WeakMap<BibleData, { id: string; map: Record<string, string[]>; reverse: Record<string, string> }>();

/** Charge une version (une seule fois). null si le fichier n'est pas dans l'app. */
export function loadVersion(id: string): Promise<BibleData | null> {
  const v = BIBLE_VERSIONS.find(x => x.id === id);
  if (!v) return Promise.resolve(null);
  let p = cache.get(id);
  if (!p) {
    p = (async () => {
      try {
        const [b, m] = await Promise.all([
          fetch(import.meta.env.BASE_URL + v.file),
          fetch(import.meta.env.BASE_URL + v.map).catch(() => null),
        ]);
        if (!b.ok) return null;
        const data = await b.json() as BibleData;
        let map: Record<string, string[]> = {};
        try { if (m && m.ok) map = await m.json(); } catch { map = {}; }
        const reverse: Record<string, string> = {};
        for (const [lsg, targets] of Object.entries(map)) for (const t of targets) if (!reverse[t]) reverse[t] = lsg;
        maps.set(data, { id, map, reverse });
        parallelMaps.set(data, { id, map });
        return data;
      } catch { return null; }
    })();
    cache.set(id, p);
  }
  return p;
}

export function versionOf(bible: BibleData | null | undefined): string | undefined {
  return bible ? maps.get(bible)?.id : undefined;
}

/** Verset équivalent dans une autre version (numérotation différente gérée) */
export function parallelVerse(bible2: BibleData, ref: VerseReference): VerseReference | null {
  const info = maps.get(bible2);
  const key = `${ref.book}|${ref.chapter}|${ref.verse}`;
  const targets = info?.map[key] ?? [key];
  const parts = targets
    .map(t => t.split('|'))
    .map(([b, c, v]) => ({ b, c: Number(c), v: Number(v), text: getVerseText(bible2, b, Number(c), Number(v)) }))
    .filter(x => x.text);
  if (parts.length === 0) return null;
  return { book: parts[0].b, chapter: parts[0].c, verse: parts[0].v, text: parts.map(p => p.text).join(' '), version: info?.id };
}

/** Référence LSG correspondant à un verset d'une autre version */
export function lsgOf(bible2: BibleData, ref: VerseReference): { book: string; chapter: number; verse: number } {
  const info = maps.get(bible2);
  const k = info?.reverse[`${ref.book}|${ref.chapter}|${ref.verse}`];
  if (!k) return { book: ref.book, chapter: ref.chapter, verse: ref.verse };
  const [b, c, v] = k.split('|');
  return { book: b, chapter: Number(c), verse: Number(v) };
}

/** Recherche d'un mot dans plusieurs versions (résultats marqués de leur version) */
export function searchVersions(bibles: { id: string; data: BibleData }[], query: string, perVersion = 40) {
  return bibles.flatMap(({ id, data }) => searchBible(data, query, perVersion).map(r => ({ ...r, version: id })));
}
