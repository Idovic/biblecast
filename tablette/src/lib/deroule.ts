/* Déroulé du culte : un culte = une liste rangée par moments (sections).
   Chaque déroulé s'enregistre tout seul sous son nom (biblecast:programmes). */
import { genId } from '@/lib/utils';
import { getVerse, parseReference } from '@/lib/bible';
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
  | { slide: Omit<CustomSlide, 'id'> }
  | { ref: string };

const base = { content: '', textColor: '#ffffff', fontSize: 'large' as const, textAlign: 'center' as const, textShadow: true, showLogo: false };
const titleSlide = (title: string, anim: string, extra: Partial<CustomSlide> = {}): Spec =>
  ({ slide: { ...base, title, slideType: 'title-only', fontSize: 'xlarge', backgroundAnimated: anim, ...extra } });
const listSlide = (title: string, bullets: string[], anim: string): Spec =>
  ({ slide: { ...base, title, slideType: 'bullet-list', bullets, textAlign: 'left', revealBullets: true, backgroundAnimated: anim } });

export const DEROULE_TEMPLATES: { name: string; description: string; specs: Spec[] }[] = [
  { name: 'Culte du dimanche', description: '8 moments, slides et bénédiction prêtes', specs: [
    { section: 'Accueil', color: '#2a9d8f' }, titleSlide('Bienvenue !', 'aurore', { showLogo: true }),
    { section: 'Louange et adoration', color: '#f4a261', wave: true }, titleSlide('Louange & Adoration', 'pourpre'),
    { section: 'Prière', color: '#457b9d' }, titleSlide('Prière', 'nuit'),
    { section: 'Lecture biblique', color: '#8338ec' },
    { section: 'Prédication', color: '#e63946' }, { slide: { ...base, title: 'Prédication', content: 'Thème : \nTexte : ', slideType: 'text-title', backgroundAnimated: 'nuit', showLogo: true } },
    { section: 'Offrandes', color: '#fb8500' }, titleSlide('Dîmes & Offrandes', 'lumiere', { textColor: '#ffd700' }), { ref: 'Malachie 3:10' },
    { section: 'Annonces', color: '#2a9d8f' }, listSlide('Annonces de la semaine', ['Première annonce', 'Deuxième annonce'], 'ocean'),
    { section: 'Bénédiction', color: '#f4a261' }, { ref: 'Nombres 6:24-26' },
  ] },
  { name: 'Réunion de prière', description: '5 moments, sujets de prière point par point', specs: [
    { section: 'Accueil', color: '#2a9d8f' }, titleSlide('Bienvenue !', 'aurore', { showLogo: true }),
    { section: 'Louange', color: '#f4a261', wave: true }, titleSlide('Louange', 'pourpre'),
    { section: 'Méditation', color: '#8338ec' },
    { section: 'Sujets de prière', color: '#457b9d' }, listSlide('Sujets de prière', ['Premier sujet', 'Deuxième sujet', 'Troisième sujet'], 'nuit'),
    { section: 'Bénédiction', color: '#f4a261' }, { ref: 'Nombres 6:24-26' },
  ] },
  { name: 'Étude biblique', description: '4 moments, questions point par point', specs: [
    { section: 'Prière d\'ouverture', color: '#457b9d' }, titleSlide('Prière', 'nuit'),
    { section: 'Texte étudié', color: '#8338ec' },
    { section: 'Questions', color: '#2a9d8f' }, listSlide('Questions', ['Première question', 'Deuxième question'], 'ocean'),
    { section: 'Prière finale', color: '#457b9d' }, titleSlide('Prière', 'nuit'),
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
    else if ('slide' in s) out.push({ id: genId(), type: 'slide', slide: { id: genId(), ...s.slide } });
    else for (const v of versesOf(bible, s.ref)) out.push({ id: genId(), type: 'verse', verse: v });
  }
  return out;
}
