/* Dictionnaire biblique (onglet Bible → Dictionnaire)
   Toucher un mot = aperçu · double-toucher = projeter · on choisit les paragraphes à montrer. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, ChevronLeft, Send, Plus, Pencil, Trash2, BookOpen, Check, FilePlus2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { CustomSlide, VerseReference } from '@/types/bible';
import {
  loadDictionary, searchDictionary, entriesInText, definitionSlides, upsertPerso, deletePerso,
  CATEGORY_SHORT, CATEGORY_ONE, baseWord, qualifier, norm, type DicoData, type DicoEntry,
} from '@/lib/dictionary';
import { formatReference } from '@/lib/bible';

interface Props {
  /** Verset sélectionné : ses mots présents dans le dictionnaire sont proposés */
  verse: VerseReference | null;
  onPreview: (slide: CustomSlide) => void;
  onProject: (slide: CustomSlide) => void;
  onAdd: (slides: CustomSlide[]) => void;
  /** Ouvre une référence dans la Bible */
  onOpenRef: (ref: string) => void;
}

const CATS = Object.keys(CATEGORY_SHORT);

export default function DictionaryPanel({ verse, onPreview, onProject, onAdd, onOpenRef }: Props) {
  const [data, setData] = useState<DicoData | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [open, setOpen] = useState<DicoEntry | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [withRefs, setWithRefs] = useState(true);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<DicoEntry | 'new' | null>(null);
  const [flash, setFlash] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const reload = () => loadDictionary().then(d => { if (d) setData(d); else setFailed(true); });
  useEffect(() => { reload(); }, []);

  const results = useMemo(() => (data ? searchDictionary(data, query, cat, query ? 80 : 1000) : []), [data, query, cat]);
  const inVerse = useMemo(() => (data && verse && !query ? entriesInText(data, verse.text) : []), [data, verse, query]);

  const paragraphs = open ? open.d.split('\n').filter(Boolean) : [];
  const chosen = paragraphs.filter((_, i) => !excluded.has(i));
  const slides = useMemo(() => (open ? definitionSlides(open, chosen.length ? chosen : paragraphs, withRefs) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, excluded, withRefs]);

  const openEntry = (e: DicoEntry, project = false) => {
    setOpen(e); setExcluded(new Set()); setPage(0);
    const first = definitionSlides(e, e.d.split('\n').filter(Boolean), withRefs)[0];
    if (project) onProject(first); else onPreview(first);
  };
  // L'aperçu suit les paragraphes choisis
  useEffect(() => { if (open && slides[page]) onPreview(slides[page]); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [excluded, withRefs]);

  const say = (t: string) => { setFlash(t); setTimeout(() => setFlash(''), 2200); };

  if (failed) return <p className="p-4 text-sm text-muted-foreground">Le dictionnaire n'a pas pu être chargé.</p>;
  if (!data) return <p className="p-4 text-sm text-muted-foreground">Chargement du dictionnaire…</p>;

  if (editing) {
    return <Editor entry={editing === 'new' ? null : editing} initialWord={editing === 'new' ? query : ''}
      onCancel={() => setEditing(null)}
      onSave={async (e, prev) => {
        if (!upsertPerso(e, prev)) { say('Mémoire pleine : article non enregistré'); return; }
        await reload(); setEditing(null); setOpen(e); setExcluded(new Set()); setPage(0); say('Article enregistré');
      }} />;
  }

  /* ── Article ouvert ── */
  if (open) {
    const q = qualifier(open.m);
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="px-2 pt-2 pb-1 flex items-center gap-1 shrink-0">
          <button onClick={() => setOpen(null)} className="h-10 px-2 rounded-lg flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Résultats
          </button>
          <div className="flex-1" />
          <button onClick={() => setEditing(open)} className="h-10 w-10 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Modifier l'article" title="Modifier l'article"><Pencil className="h-4 w-4" /></button>
          {open.perso && (
            <button onClick={async () => { deletePerso(open.m); await reload(); setOpen(null); say('Article de l\'église retiré'); }}
              className="h-10 w-10 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive" aria-label="Retirer l'article de l'église" title="Retirer l'article de l'église"><Trash2 className="h-4 w-4" /></button>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">{CATEGORY_ONE[open.c] ?? 'Article'}{q ? ` · ${q}` : ''}{open.perso ? ' · article de l\'église' : ''}</p>
          <h2 className="text-xl font-bold leading-tight mb-2">{baseWord(open.m)}</h2>
          {open.a?.length ? <p className="text-[11px] text-muted-foreground -mt-1 mb-2">Aussi : {open.a.join(', ')}</p> : null}
          <p className="text-[10px] text-muted-foreground mb-1.5">Touchez un paragraphe pour le montrer ou non sur les TV.</p>
          <div className="space-y-1.5">
            {paragraphs.map((para, i) => {
              const on = !excluded.has(i);
              return (
                <button key={i} onClick={() => setExcluded(s => { const n = new Set(s); if (n.has(i)) n.delete(i); else if (paragraphs.length - n.size > 1) n.add(i); return n; })}
                  className={cn('w-full text-left rounded-lg border p-2 text-[13px] leading-snug flex gap-2 transition-colors',
                    on ? 'border-primary/30 bg-primary/5 text-foreground' : 'border-border/30 bg-transparent text-muted-foreground/60')}>
                  <span className={cn('mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center', on ? 'bg-primary border-primary text-primary-foreground' : 'border-border')}>
                    {on && <Check className="h-3 w-3" />}
                  </span>
                  <span>{para}</span>
                </button>
              );
            })}
          </div>
          {open.r.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Références · toucher = ouvrir</p>
                <button onClick={() => setWithRefs(v => !v)} className={cn('text-[10px] px-2 h-7 rounded-md border', withRefs ? 'border-primary/50 text-primary' : 'border-border/50 text-muted-foreground')}>
                  {withRefs ? 'Sur l\'écran : oui' : 'Sur l\'écran : non'}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {open.r.map(r => (
                  <button key={r} onClick={() => onOpenRef(r)} className="h-9 px-2.5 rounded-md bg-secondary/70 border border-border/40 text-xs font-medium text-primary flex items-center gap-1">
                    <BookOpen className="h-3 w-3" />{r}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* Projection */}
        <div className="shrink-0 border-t border-border/50 p-2 space-y-1.5 bg-background/40">
          {slides.length > 1 && (
            <div className="flex gap-1 flex-wrap">
              {slides.map((sl, i) => (
                <button key={i} onClick={() => { setPage(i); onPreview(sl); }} onDoubleClick={() => onProject(sl)}
                  className={cn('h-9 px-3 rounded-lg border text-xs font-semibold', page === i ? 'bg-primary/20 border-primary/50 text-primary' : 'bg-secondary/50 border-border/40 text-muted-foreground')}>
                  Écran {i + 1}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <Button onClick={() => onProject(slides[page] ?? slides[0])} className="flex-1 h-11 btn-gold gap-1.5"><Send className="h-4 w-4" />Projeter{slides.length > 1 ? ` ${page + 1}/${slides.length}` : ''}</Button>
            <Button variant="secondary" onClick={() => { onAdd(slides); say(slides.length > 1 ? `${slides.length} écrans ajoutés au déroulé` : 'Ajouté au déroulé'); }} className="h-11 gap-1" aria-label="Ajouter au déroulé"><Plus className="h-4 w-4" />Déroulé</Button>
          </div>
          {flash && <p className="text-[11px] text-center text-primary">{flash}</p>}
        </div>
      </div>
    );
  }

  /* ── Recherche ── */
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-2 space-y-1.5 shrink-0">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={e => { setQuery(e.target.value); listRef.current?.scrollTo({ top: 0 }); }}
            placeholder="Chercher un mot : grâce, Béthel, Élie…" className="h-11 pl-9 pr-9 bg-secondary" aria-label="Chercher dans le dictionnaire" />
          {query && <button onClick={() => setQuery('')} className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center text-muted-foreground" aria-label="Effacer"><X className="h-4 w-4" /></button>}
        </div>
        <div className="flex gap-1 overflow-x-auto pb-0.5 -mx-0.5 px-0.5" style={{ scrollbarWidth: 'none' }}>
          {[null, ...CATS].map(c => (
            <button key={c ?? 'tous'} onClick={() => setCat(c)}
              className={cn('h-8 px-2.5 rounded-full border text-[11px] font-medium whitespace-nowrap shrink-0', cat === c ? 'bg-primary/20 border-primary/50 text-primary' : 'bg-secondary/50 border-border/40 text-muted-foreground')}>
              {c ? CATEGORY_SHORT[c] : 'Tous'}
            </button>
          ))}
        </div>
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
        {inVerse.length > 0 && verse && (
          <div className="mb-2 rounded-xl border border-sky-400/30 bg-sky-500/5 p-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-300 mb-1.5">Dans {formatReference(verse)}</p>
            <div className="flex flex-wrap gap-1">
              {inVerse.map(e => (
                <button key={e.m} onClick={() => openEntry(e)} onDoubleClick={() => openEntry(e, true)}
                  className="h-8 px-2.5 rounded-md bg-secondary/70 border border-border/40 text-xs font-medium">{baseWord(e.m)}</button>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between px-1 pb-1">
          <p className="text-[10px] text-muted-foreground">{results.length} article{results.length > 1 ? 's' : ''}{query ? '' : cat ? '' : ' · lexique BibleCast'}</p>
          <button onClick={() => setEditing('new')} className="text-[11px] text-primary flex items-center gap-1 h-8 px-1"><FilePlus2 className="h-3.5 w-3.5" />Nouvel article</button>
        </div>
        {results.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-6 space-y-2">
            <p>Aucun article pour « {query} ».</p>
            <Button variant="secondary" size="sm" onClick={() => setEditing('new')} className="gap-1"><FilePlus2 className="h-4 w-4" />Écrire cet article</Button>
          </div>
        )}
        <div className="space-y-1">
          {results.map(e => (
            <button key={e.m} onClick={() => openEntry(e)} onDoubleClick={() => openEntry(e, true)}
              className="w-full text-left rounded-lg px-2.5 py-2 bg-secondary/40 hover:bg-secondary/70 border border-transparent hover:border-primary/20"
              style={{ contentVisibility: 'auto', containIntrinsicSize: '0 56px' }}>
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-sm truncate">{baseWord(e.m)}</span>
                {qualifier(e.m) && <span className="text-[11px] text-muted-foreground truncate">{qualifier(e.m)}</span>}
                <span className="ml-auto text-[10px] text-primary/70 shrink-0">{CATEGORY_ONE[e.c]?.split(',')[0]}{e.perso ? ' · église' : ''}</span>
              </div>
              <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">{e.d.split('\n')[0]}</p>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground/70 px-1 pt-3 leading-snug">
          Lexique BibleCast : articles rédigés pour l'app, libres de droits, citations d'après la Louis Segond 1910. Faites relire par vos responsables ; vous pouvez corriger ou ajouter des articles.
        </p>
      </div>
    </div>
  );
}

/* ── Écrire / corriger un article (gardé sur cette tablette) ── */
function Editor({ entry, initialWord, onCancel, onSave }: {
  entry: DicoEntry | null; initialWord: string;
  onCancel: () => void; onSave: (e: DicoEntry, previousWord?: string) => void;
}) {
  const [m, setM] = useState(entry?.m ?? initialWord);
  const [c, setC] = useState(entry?.c ?? 'f');
  const [d, setD] = useState(entry?.d ?? '');
  const [r, setR] = useState(entry?.r.join('; ') ?? '');
  const ok = m.trim().length > 1 && d.trim().length > 5;
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 pt-3 pb-2 shrink-0 flex items-center gap-2">
        <p className="font-semibold text-sm flex-1">{entry ? 'Corriger l\'article' : 'Nouvel article'}</p>
        <button onClick={onCancel} className="h-9 w-9 flex items-center justify-center text-muted-foreground" aria-label="Annuler"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-2.5">
        <label className="block text-[11px] text-muted-foreground">Mot
          <Input value={m} onChange={e => setM(e.target.value)} className="h-10 mt-1 bg-secondary" placeholder="ex. Sanctification" />
        </label>
        <div>
          <p className="text-[11px] text-muted-foreground mb-1">Catégorie</p>
          <div className="flex flex-wrap gap-1">
            {Object.keys(CATEGORY_ONE).map(k => (
              <button key={k} onClick={() => setC(k)} className={cn('h-8 px-2.5 rounded-full border text-[11px]', c === k ? 'bg-primary/20 border-primary/50 text-primary' : 'bg-secondary/50 border-border/40 text-muted-foreground')}>{CATEGORY_SHORT[k]}</button>
            ))}
          </div>
        </div>
        <label className="block text-[11px] text-muted-foreground">Définition (une ligne = un paragraphe)
          <textarea value={d} onChange={e => setD(e.target.value)} rows={9}
            className="mt-1 w-full rounded-md bg-secondary border border-input p-2 text-sm leading-snug text-foreground" />
        </label>
        <label className="block text-[11px] text-muted-foreground">Références, séparées par « ; »
          <Input value={r} onChange={e => setR(e.target.value)} className="h-10 mt-1 bg-secondary" placeholder="Jean 3:16; Romains 5:8" />
        </label>
        <p className="text-[10px] text-muted-foreground">L'article est gardé sur cette tablette. Un article qui porte le même mot qu'un article du lexique le remplace.</p>
      </div>
      <div className="shrink-0 border-t border-border/50 p-2 flex gap-2">
        <Button variant="secondary" onClick={onCancel} className="h-11 flex-1">Annuler</Button>
        <Button disabled={!ok} className="h-11 flex-[2] btn-gold"
          onClick={() => onSave({ m: m.trim(), c, d: d.split('\n').map(x => x.trim()).filter(Boolean).join('\n'), r: r.split(/[;\n]/).map(x => x.trim()).filter(Boolean), a: entry?.a }, entry && norm(entry.m) !== norm(m.trim()) && entry.perso ? entry.m : undefined)}>
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
