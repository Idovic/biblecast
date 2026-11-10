/* Déroulé du culte : un culte = une liste rangée par moments (sections).
   Chaque déroulé s'enregistre tout seul sous son nom (biblecast:programmes). */
import { genId } from '@/lib/utils';
import { getVerse, parseReference } from '@/lib/bible';
import { templateById, slidesFromTemplate } from '@/lib/slideTemplates';
import type { BibleData, CustomSlide, QueueItem, VerseReference } from '@/types/bible';

export interface SavedProgramme { id: string; name: string; savedAt: number; queue: QueueItem[] }
export interface ProgrammeMeta { id: string; name: string }

const LIST_KEY = 'biblecast:programmes';
const CURRENT_KEY = 'biblecast:deroule-current';

export function loadProgrammes(): SavedProgramme[] {
  try { return JSON.parse(localStorage.getItem(LIST_KEY) || '[]'); } catch { return []; }
}
export function saveProgrammes(list: SavedProgramme[]): boolean {
  try { localStorage.setItem(LIST_KEY, JSON.stringify(list)); return true; } catch { return false; }
}
/** Enregistre (ou met à jour) un déroulé ; les plus récents en premier, 40 au maximum */
export function upsertProgramme(meta: ProgrammeMeta, queue: QueueItem[]): boolean {
  const list = loadProgrammes().filter(p => p.id !== meta.id);
  return saveProgrammes([{ id: meta.id, name: meta.name, savedAt: Date.now(), queue }, ...list].slice(0, 40));
}
export function deleteProgramme(id: string) {
  saveProgrammes(loadProgrammes().filter(p => p.id !== id));
}

export function defaultName(d = new Date()): string {
  const day = d.getDay() === 0 ? 'Culte du dimanche' : 'Culte';
  return `${day} ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
}
export function loadCurrentMeta(): ProgrammeMeta {
  try {
    const m = JSON.parse(localStorage.getItem(CURRENT_KEY) || 'null');
    if (m && m.id && m.name) return m;
  } catch { /* ignore */ }
  return { id: genId(), name: defaultName() };
}
export function saveCurrentMeta(m: ProgrammeMeta) {
  try { localStorage.setItem(CURRENT_KEY, JSON.stringify(m)); } catch { /* ignore */ }
}

/** Range des éléments à la fin du moment actif (avant la section suivante), sinon tout en bas */
export function insertIntoSection(queue: QueueItem[], sectionId: string | null, items: QueueItem[]): QueueItem[] {
  if (!sectionId) return [...queue, ...items];
  const start = queue.findIndex(q => q.id === sectionId);
  if (start < 0) return [...queue, ...items];
  let end = queue.findIndex((q, i) => i > start && q.type === 'section');
  if (end < 0) end = queue.length;
  return [...queue.slice(0, end), ...items, ...queue.slice(end)];
}

/** Déplace un élément juste après une cible (élément ou début d'une section) */
export function moveItem(queue: QueueItem[], id: string, afterId: string): QueueItem[] {
  if (id === afterId) return queue;
  const item = queue.find(q => q.id === id);
  if (!item) return queue;
  const rest = queue.filter(q => q.id !== id);
  const at = rest.findIndex(q => q.id === afterId);
  if (at < 0) return queue;
  return [...rest.slice(0, at + 1), item, ...rest.slice(at + 1)];
}

/** Section à laquelle appartient chaque élément (null = avant toute section) */
export function sectionOf(queue: QueueItem[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  let cur: string | null = null;
  for (const q of queue) {
    if (q.type === 'section') cur = q.id;
    else out[q.id] = cur;
  }
  return out;
}

/* ── Modèles déjà remplis ─────────────────────────────────────────────── */
type Spec =
  | { section: string; color: string; wave?: boolean }
  | { tpl: string; patch?: Partial<CustomSlide> }
  | { ref: string };

/** Slides prises dans le catalogue des modèles (même style partout) */
const tpl = (id: string, patch?: Partial<CustomSlide>): Spec => ({ tpl: id, patch });

export const DEROULE_TEMPLATES: { name: string; description: string; specs: Spec[] }[] = [
  { name: 'Culte du dimanche', description: '8 moments, slides et bénédiction prêtes', specs: [
    { section: 'Accueil', color: '#2a9d8f' }, tpl('bienvenue'),
    { section: 'Louange et adoration', color: '#f4a261', wave: true }, tpl('louange'),
    { section: 'Prière', color: '#457b9d' }, tpl('priere'),
    { section: 'Lecture biblique', color: '#8338ec' },
    { section: 'Prédication', color: '#e63946' }, tpl('predication'), tpl('points'),
    { section: 'Offrandes', color: '#fb8500' }, tpl('offrande'),
    { section: 'Annonces', color: '#2a9d8f' }, tpl('annonces'),
    { section: 'Bénédiction', color: '#f4a261' }, tpl('benediction'), tpl('au-revoir'),
  ] },
  { name: 'Réunion de prière', description: '5 moments, sujets de prière point par point', specs: [
    { section: 'Accueil', color: '#2a9d8f' }, tpl('bienvenue'),
    { section: 'Louange', color: '#f4a261', wave: true }, tpl('louange', { title: 'Louange' }),
    { section: 'Méditation', color: '#8338ec' },
    { section: 'Sujets de prière', color: '#457b9d' }, tpl('sujets'),
    { section: 'Bénédiction', color: '#f4a261' }, tpl('benediction'),
  ] },
  { name: 'Étude biblique', description: '4 moments, questions point par point', specs: [
    { section: 'Prière d\'ouverture', color: '#457b9d' }, tpl('priere', { title: 'Prière d\'ouverture' }),
    { section: 'Texte étudié', color: '#8338ec' },
    { section: 'Questions', color: '#2a9d8f' }, tpl('question'),
    { section: 'Prière finale', color: '#457b9d' }, tpl('priere', { title: 'Prière finale' }),
  ] },
];

function versesOf(bible: BibleData | null, ref: string): VerseReference[] {
  const r = parseReference(ref);
  if (!bible || !r) return [];
  const from = r.verseStart ?? 1, to = r.verseEnd ?? from;
  const out: VerseReference[] = [];
  for (let v = from; v <= to; v++) {
    const verse = getVerse(bible, r.book, r.chapter, v);
    if (verse) out.push(verse);
  }
  return out;
}

/** Construit le déroulé d'un modèle (les versets sont pris dans la Bible chargée) */
export function buildTemplate(t: typeof DEROULE_TEMPLATES[number], bible: BibleData | null): QueueItem[] {
  const out: QueueItem[] = [];
  for (const s of t.specs) {
    if ('section' in s) out.push({ id: genId(), type: 'section', sectionName: s.section, sectionColor: s.color, ...(s.wave ? { wave: true } : {}) });
    else if ('tpl' in s) {
      const t = templateById(s.tpl);
      if (t) for (const sl of slidesFromTemplate(t)) out.push({ id: genId(), type: 'slide', slide: { ...sl, ...(s.patch ?? {}) } });
    }
    else for (const v of versesOf(bible, s.ref)) out.push({ id: genId(), type: 'verse', verse: v });
  }
  return out;
}
