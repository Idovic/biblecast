/* Dictionnaire biblique hors ligne : lexique BibleCast (public/dictionnaire.json)
   + articles ajoutés ou corrigés par l'église (gardés sur la tablette).
   Prévu pour accueillir d'autres sources libres (ex. Bost 1849) avec le même format. */
import type { CustomSlide } from '@/types/bible';
import { genId } from '@/lib/utils';

export interface DicoEntry {
  /** Mot (ex. « Joseph (fils de Jacob) ») */
  m: string;
  /** Catégorie : p personnage, l lieu, u peuple, f mot de la foi, o objet/coutume, t fête/temps/mesure, b livre */
  c: string;
  /** Définition : un paragraphe par ligne */
  d: string;
  /** Références LSG (« Jean 3:16 », « Genèse 12:1-3 ») */
  r: string[];
  /** Autres noms */
  a?: string[];
  /** Article ajouté ou corrigé sur cette tablette */
  perso?: boolean;
}
export interface DicoData { categories: Record<string, string>; entries: DicoEntry[]; sources: { id: string; label: string; note?: string }[] }

export const CATEGORY_SHORT: Record<string, string> = {
  p: 'Personnages', l: 'Lieux', u: 'Peuples', f: 'Mots de la foi', o: 'Objets & coutumes', t: 'Fêtes & mesures', b: 'Livres',
};
export const CATEGORY_ONE: Record<string, string> = {
  p: 'Personnage', l: 'Lieu', u: 'Peuple', f: 'Mot de la foi', o: 'Objet, coutume', t: 'Fête, temps, mesure', b: 'Livre de la Bible',
};

const PERSO_KEY = 'biblecast:dico-perso';

export function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[’']/g, "'");
}
/** « 1 Rois » se range à R, pas avant A */
function sortKey(m: string): string { return norm(m).replace(/^(\d)\s+(.*)$/, '$2 $1'); }
/** Mot sans la précision entre parenthèses : « Joseph (fils de Jacob) » → « Joseph » */
export function baseWord(m: string): string { return m.replace(/\s*\(.*\)\s*$/, '').trim(); }
export function qualifier(m: string): string { return (m.match(/\(([^)]*)\)\s*$/)?.[1] ?? '').trim(); }

/* ── Articles de l'église ───────────────────────────────────────────── */
export function loadPerso(): DicoEntry[] {
  try { const raw = localStorage.getItem(PERSO_KEY); return raw ? (JSON.parse(raw) as DicoEntry[]).map(e => ({ ...e, perso: true })) : []; }
  catch { return []; }
}
function savePerso(list: DicoEntry[]): boolean {
  try { localStorage.setItem(PERSO_KEY, JSON.stringify(list.map(({ perso: _p, ...e }) => e))); return true; } catch { return false; }
}
/** Ajoute ou remplace (même mot) un article de l'église */
export function upsertPerso(e: DicoEntry, previousWord?: string): boolean {
  const keyOld = norm(previousWord ?? e.m), keyNew = norm(e.m);
  const list = loadPerso().filter(x => norm(x.m) !== keyOld && norm(x.m) !== keyNew);
  return savePerso([...list, { ...e, perso: true }]);
}
export function deletePerso(word: string): boolean {
  return savePerso(loadPerso().filter(x => norm(x.m) !== norm(word)));
}

/* ── Chargement ─────────────────────────────────────────────────────── */
let base: Promise<DicoData | null> | null = null;
function loadBase(): Promise<DicoData | null> {
  if (!base) base = fetch(import.meta.env.BASE_URL + 'dictionnaire.json')
    .then(r => (r.ok ? r.json() as Promise<DicoData> : null)).catch(() => null);
  return base;
}
/** Lexique + articles de l'église (un article de l'église remplace celui du lexique de même nom) */
export async function loadDictionary(): Promise<DicoData | null> {
  const d = await loadBase();
  if (!d) return null;
  const perso = loadPerso();
  const keys = new Set(perso.map(e => norm(e.m)));
  const entries = [...d.entries.filter(e => !keys.has(norm(e.m))), ...perso]
    .sort((a, b) => sortKey(a.m).localeCompare(sortKey(b.m)));
  return { ...d, entries };
}

/* ── Recherche ──────────────────────────────────────────────────────── */
function lev(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Articles qui correspondent à la recherche, les meilleurs d'abord (accents et petites fautes tolérés) */
export function searchDictionary(data: DicoData, query: string, cat: string | null = null, limit = 80): DicoEntry[] {
  const q = norm(query.trim());
  const pool = cat ? data.entries.filter(e => e.c === cat) : data.entries;
  if (!q) return pool;
  const scored: [number, DicoEntry][] = [];
  for (const e of pool) {
    const names = [baseWord(e.m), ...(e.a ?? [])].map(norm);
    const full = norm(e.m);
    let s = 0;
    for (const n of names) {
      if (n === q) s = Math.max(s, 100);
      else if (n.startsWith(q)) s = Math.max(s, 80);
      else if (n.split(/[\s-]+/).some(w => w.startsWith(q))) s = Math.max(s, 70);
      else if (q.length >= 4 && lev(n, q, q.length >= 7 ? 2 : 1) <= (q.length >= 7 ? 2 : 1)) s = Math.max(s, 60);
    }
    if (!s && full.includes(q)) s = 55;
    if (!s && q.length >= 4 && new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(norm(e.d))) s = 20;
    if (s) scored.push([s, e]);
  }
  return scored.sort((a, b) => b[0] - a[0] || norm(a[1].m).localeCompare(norm(b[1].m))).slice(0, limit).map(x => x[1]);
}

/** Mots d'un verset qui ont un article (ex. Jean 3:16 → Dieu, monde, Fils…) */
export function entriesInText(data: DicoData, text: string, max = 12): DicoEntry[] {
  const t = ' ' + norm(text).replace(/[^a-z0-9' -]+/g, ' ') + ' ';
  const out: DicoEntry[] = [];
  const seen = new Set<string>();
  for (const e of data.entries) {
    if (e.c === 'b') continue;
    const names = [baseWord(e.m), ...(e.a ?? [])].map(norm).filter(n => n.length >= 3);
    const hit = names.some(n => t.includes(` ${n} `) || t.includes(` ${n}s `) || t.includes(`'${n} `) || t.includes(`'${n}s `));
    if (hit && !seen.has(e.m)) { seen.add(e.m); out.push(e); if (out.length >= max) break; }
  }
  return out;
}

/* ── Projection ─────────────────────────────────────────────────────── */
/** Découpe le texte choisi en écrans lisibles sur une TV (~520 caractères chacun) */
export function definitionPages(paragraphs: string[], budget = 520): string[] {
  const pages: string[] = [];
  let cur = '';
  const push = () => { if (cur.trim()) pages.push(cur.trim()); cur = ''; };
  for (const p of paragraphs) {
    if ((cur + '\n' + p).length <= budget) { cur = cur ? cur + '\n' + p : p; continue; }
    if (cur) push();
    if (p.length <= budget) { cur = p; continue; }
    // Paragraphe trop long : coupe entre les phrases
    for (const s of p.match(/[^.!?»]+[.!?»]+["»]?\s*|.+$/g) ?? [p]) {
      if ((cur + ' ' + s).length > budget && cur) push();
      cur = cur ? cur + ' ' + s.trim() : s.trim();
    }
  }
  push();
  return pages.length ? pages : [''];
}

/** Slides « définition » prêtes à projeter (une par écran) */
export function definitionSlides(e: DicoEntry, paragraphs: string[], withRefs = true): CustomSlide[] {
  const pages = definitionPages(paragraphs);
  const q = qualifier(e.m);
  const label = ['Dictionnaire biblique', q || CATEGORY_ONE[e.c]].filter(Boolean).join(' · ');
  return pages.map((text, i) => ({
    id: genId(),
    title: baseWord(e.m),
    content: text,
    slideType: 'definition' as const,
    label: pages.length > 1 ? `${label} · ${i + 1}/${pages.length}` : label,
    footer: withRefs && i === pages.length - 1 && e.r.length ? e.r.slice(0, 4).join('  ·  ') : undefined,
    textAlign: 'left' as const,
    textShadow: true,
  }));
}
