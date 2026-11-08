/**
 * Panneau Présentations — import PDF ou images multiples.
 * La position active (activePresentationId + activePage) survit aux
 * changements d'onglet car elle est stockée dans Index.tsx.
 *
 * Architecture :
 *  • Images  → FileReader natif, aucune dépendance externe
 *  • PDF     → dynamic import('@/lib/pdfRenderer') — chargé seulement au clic
 *              Si pdfjs échoue, l'erreur reste en UI, ne crashe pas le composant
 *  • Storage → IndexedDB (pas de limite 5 MB comme localStorage)
 *  • Méta    → localStorage (léger, synchrone)
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, FileText, Image as ImageIcon, Trash2, ChevronLeft,
  ChevronRight, Monitor, ArrowLeft, Loader2, Presentation,
  X, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, genId } from '@/lib/utils';
import type { PresentationMeta } from '@/types/bible';

// ══════════════════════════════════════════════════════════════════════════════
// IndexedDB helpers
// ══════════════════════════════════════════════════════════════════════════════
const IDB_NAME    = 'biblecast-pres-db';
const IDB_STORE   = 'pages';
const IDB_VERSION = 1;

function openIDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

async function idbSave(id: string, pages: string[]): Promise<void> {
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(pages, id);
    tx.oncomplete = () => { db.close(); res(); };
    tx.onerror    = () => { db.close(); rej(tx.error); };
  });
}

async function idbLoad(id: string): Promise<string[]> {
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(id);
    req.onsuccess = () => { db.close(); res(req.result ?? []); };
    req.onerror   = () => { db.close(); rej(req.error); };
  });
}

async function idbDelete(id: string): Promise<void> {
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = () => { db.close(); res(); };
    tx.onerror    = () => { db.close(); rej(tx.error); };
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Métadonnées localStorage (pas d'images, juste id/name/pageCount)
// ══════════════════════════════════════════════════════════════════════════════
export const PRES_META_KEY = 'biblecast:presentations';

export function loadAllPresentationMeta(): PresentationMeta[] {
  try { return JSON.parse(localStorage.getItem(PRES_META_KEY) || '[]'); }
  catch { return []; }
}

function saveMeta(list: PresentationMeta[]) {
  try { localStorage.setItem(PRES_META_KEY, JSON.stringify(list)); } catch { /* mémoire pleine */ }
}

// ══════════════════════════════════════════════════════════════════════════════
// Import images multiples (aucune dépendance externe)
// ══════════════════════════════════════════════════════════════════════════════
async function imagesToDataUrls(
  files: File[],
  onProgress?: (cur: number, total: number) => void,
): Promise<string[]> {
  const list = files.filter(f => f.type.startsWith('image/'));
  if (list.length === 0) throw new Error('Aucun fichier image valide sélectionné.');
  list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const results: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const url = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload  = e => res(e.target!.result as string);
      r.onerror = () => rej(new Error(`Impossible de lire "${list[i].name}"`));
      r.readAsDataURL(list[i]);
    });
    results.push(url);
    onProgress?.(i + 1, list.length);
    await new Promise<void>(r => setTimeout(r, 0));
  }
  return results;
}

// ══════════════════════════════════════════════════════════════════════════════
// Messages d'erreur lisibles
// ══════════════════════════════════════════════════════════════════════════════
function friendlyError(err: unknown): string {
  const msg = String(err instanceof Error ? err.message : err);
  if (msg.includes('password') || msg.includes('Password'))
    return 'Ce PDF est protégé par un mot de passe.';
  if (msg.includes('Invalid PDF') || msg.includes('Missing PDF'))
    return 'Fichier PDF invalide ou corrompu.';
  if (msg.includes('quota') || msg.includes('QuotaExceeded'))
    return "Stockage insuffisant. Supprimez d'anciennes présentations.";
  return 'Erreur : ' + msg.slice(0, 150);
}

// ══════════════════════════════════════════════════════════════════════════════
// Types du composant
// ══════════════════════════════════════════════════════════════════════════════
interface PresentationPanelProps {
  presentations: PresentationMeta[];
  onPresentationsChange: (meta: PresentationMeta[]) => void;
  activePresentationId: string | null;
  activePage: number;
  projectedPresentationId: string | null;
  projectedPage: number;
  onProjectPage: (presentationId: string, page: number, imageUrl: string) => void;
  onNavigate: (presentationId: string, page: number, project: boolean) => void;
}

type ImportStage = 'idle' | 'reading' | 'rendering' | 'saving';

// ══════════════════════════════════════════════════════════════════════════════
// Composant principal
// ══════════════════════════════════════════════════════════════════════════════
export default function PresentationPanel({
  presentations,
  onPresentationsChange,
  activePresentationId,
  activePage,
  projectedPresentationId,
  projectedPage,
  onProjectPage,
  onNavigate,
}: PresentationPanelProps) {
  const [pages,       setPages]       = useState<string[]>([]);
  const [stage,       setStage]       = useState<ImportStage>('idle');
  const [progress,    setProgress]    = useState({ current: 0, total: 0 });
  const [error,       setError]       = useState('');
  const [autoProj,    setAutoProj]    = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameInput,   setNameInput]   = useState('');

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);

  // Charge les pages IndexedDB quand la présentation active change
  useEffect(() => {
    if (!activePresentationId) { setPages([]); return; }
    setPages([]);
    idbLoad(activePresentationId)
      .then(setPages)
      .catch(err => { console.error('[Pres] idbLoad:', err); setPages([]); });
  }, [activePresentationId]);

  // ── Finalisation commune ───────────────────────────────────────────────────
  const finishImport = useCallback(async (name: string, imgs: string[]) => {
    if (imgs.length === 0) { setError('Aucune page trouvée dans le fichier.'); return; }
    setStage('saving');
    const id   = genId();
    const meta: PresentationMeta = { id, name, pageCount: imgs.length, createdAt: Date.now() };
    await idbSave(id, imgs);
    const updated = [...presentations, meta];
    onPresentationsChange(updated);
    saveMeta(updated);
    onNavigate(id, 0, false);
  }, [presentations, onPresentationsChange, onNavigate]);

  // ── Import PDF (dynamic import isole pdfjs — crash n'affecte pas les images) ─
  const handlePdfInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(''); setStage('reading'); setProgress({ current: 0, total: 0 });
    try {
      const { renderPdfToImages } = await import('@/lib/pdfRenderer');
      setStage('rendering');
      const imgs = await renderPdfToImages(file, 0.82, 1920, (cur, tot) => {
        setProgress({ current: cur, total: tot });
      });
      await finishImport(file.name.replace(/\.pdf$/i, ''), imgs);
    } catch (err) {
      console.error('[Pres] PDF import:', err);
      setError(friendlyError(err));
    } finally {
      setStage('idle');
    }
  }, [finishImport]);

  // ── Import images multiples ────────────────────────────────────────────────
  const handleImgInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = e.target.files;
    if (!rawFiles || rawFiles.length === 0) { e.target.value = ''; return; }
    // Copie les File objects AVANT de vider l'input (certains WebView libèrent le FileList)
    const filesCopy  = Array.from(rawFiles);
    const firstName  = filesCopy[0]?.name ?? '';
    e.target.value   = '';
    setError(''); setStage('reading'); setProgress({ current: 0, total: filesCopy.length });
    try {
      const imgs = await imagesToDataUrls(filesCopy, (cur, tot) => {
        setProgress({ current: cur, total: tot });
      });
      const rawName = firstName.replace(/\.[^.]+$/, '').replace(/[-_]\d+$/, '') || 'Présentation';
      await finishImport(rawName, imgs);
    } catch (err) {
      console.error('[Pres] Images import:', err);
      setError(friendlyError(err));
    } finally {
      setStage('idle');
    }
  }, [finishImport]);

  // ── Suppression ────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!window.confirm(`Supprimer "${name}" ?`)) return;
    await idbDelete(id).catch(() => {});
    const updated = presentations.filter(p => p.id !== id);
    onPresentationsChange(updated);
    saveMeta(updated);
    if (activePresentationId === id) onNavigate('', 0, false);
  }, [presentations, activePresentationId, onPresentationsChange, onNavigate]);

  // ── Renommage ──────────────────────────────────────────────────────────────
  const commitRename = (id: string) => {
    const t = nameInput.trim();
    if (t) {
      const updated = presentations.map(p => p.id === id ? { ...p, name: t } : p);
      onPresentationsChange(updated);
      saveMeta(updated);
    }
    setEditingName(null);
  };

  // ── Navigation ─────────────────────────────────────────────────────────────
  const activeMeta  = presentations.find(p => p.id === activePresentationId) ?? null;
  const totalPages  = activeMeta?.pageCount ?? 0;
  const isProjected = (page: number) =>
    projectedPresentationId === activePresentationId && projectedPage === page;

  const goTo = useCallback((page: number, forceProject = false) => {
    if (!activePresentationId) return;
    const n = Math.max(0, Math.min(page, totalPages - 1));
    onNavigate(activePresentationId, n, forceProject || autoProj);
    if (forceProject || autoProj) onProjectPage(activePresentationId, n, pages[n] ?? '');
  }, [activePresentationId, totalPages, autoProj, pages, onNavigate, onProjectPage]);

  // ── Métriques progression ──────────────────────────────────────────────────
  const isImporting = stage !== 'idle';
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const stageLabel =
    stage === 'reading'   ? 'Lecture du fichier…' :
    stage === 'rendering' ? `Rendu ${progress.current} / ${progress.total}` :
    stage === 'saving'    ? 'Enregistrement…' : '';

  // ══════════════════════════════════════════════════════════════════════════
  // VUE LISTE
  // ══════════════════════════════════════════════════════════════════════════
  if (!activePresentationId || !activeMeta) {
    return (
      <div className="flex flex-col h-full overflow-hidden">

        <div className="shrink-0 px-3 pt-3 pb-2 space-y-2">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={isImporting}
              className="flex-1 gap-1.5 text-xs border-border/50 hover:border-primary/40"
              onClick={() => pdfInputRef.current?.click()}>
              {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              PDF
            </Button>
            <Button size="sm" variant="outline" disabled={isImporting}
              className="flex-1 gap-1.5 text-xs border-border/50 hover:border-primary/40"
              onClick={() => imgInputRef.current?.click()}>
              <ImageIcon className="h-3.5 w-3.5" />
              Images
            </Button>
          </div>

          {isImporting && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{stageLabel}</span>
                {progress.total > 0 && <span>{pct}%</span>}
              </div>
              <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                {progress.total > 0
                  ? <div className="h-full bg-primary rounded-full transition-all duration-150" style={{ width: `${pct}%` }} />
                  : <div className="h-full bg-primary rounded-full pres-indeterminate" />}
              </div>
            </div>
          )}

          {error && !isImporting && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-[11px] text-destructive">
              <span className="flex-1 leading-relaxed">{error}</span>
              <button onClick={() => setError('')} className="shrink-0 hover:opacity-70">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
          {presentations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 py-8 text-center">
              <div className="h-12 w-12 rounded-xl bg-secondary/50 flex items-center justify-center">
                <Presentation className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Aucune présentation</p>
                <p className="text-[10px] text-muted-foreground/60 max-w-[170px] leading-relaxed">
                  Importez un <strong>PDF</strong> ou des <strong>images</strong> numérotées (slide1.jpg, slide2.jpg…)
                </p>
              </div>
            </div>
          ) : (
            presentations.map(p => {
              const isActiveProj = projectedPresentationId === p.id;
              return (
                <div key={p.id}
                  className={cn(
                    'rounded-xl border overflow-hidden transition-smooth cursor-pointer group',
                    isActiveProj
                      ? 'border-green-500/50 bg-green-500/5'
                      : 'border-border/40 bg-secondary/30 hover:border-primary/40',
                  )}
                  onClick={() => onNavigate(p.id, 0, false)}>
                  <div className="flex items-center gap-2 p-2">
                    <ThumbnailSlot id={p.id} />
                    <div className="flex-1 min-w-0">
                      {editingName === p.id ? (
                        <input autoFocus value={nameInput}
                          onChange={e => setNameInput(e.target.value)}
                          onBlur={() => commitRename(p.id)}
                          onKeyDown={e => { if (e.key === 'Enter') commitRename(p.id); if (e.key === 'Escape') setEditingName(null); }}
                          onClick={e => e.stopPropagation()}
                          className="w-full bg-background border border-primary/50 rounded px-1.5 py-0.5 text-sm outline-none" />
                      ) : (
                        <p className="text-sm font-medium truncate cursor-text hover:text-primary"
                          title="Cliquer pour renommer"
                          onClick={e => { e.stopPropagation(); setEditingName(p.id); setNameInput(p.name); }}>
                          {p.name}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground">{p.pageCount} page{p.pageCount > 1 ? 's' : ''}</p>
                      {isActiveProj && <p className="text-[10px] text-green-400 font-medium">Diffusion en cours</p>}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(p.id, p.name); }}
                      className="h-7 w-7 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-smooth shrink-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <input ref={pdfInputRef} type="file" accept="application/pdf" className="hidden" onChange={handlePdfInput} />
        <input ref={imgInputRef} type="file" accept="image/*" multiple  className="hidden" onChange={handleImgInput} />
        <style>{`.pres-indeterminate{animation:pres-ind 1.2s ease infinite;width:30%}@keyframes pres-ind{0%{margin-left:0;width:30%}50%{margin-left:45%;width:30%}100%{margin-left:100%;width:0}}`}</style>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VUE NAVIGATION
  // ══════════════════════════════════════════════════════════════════════════
  const currentImg = pages[activePage];

  return (
    <div className="flex flex-col h-full overflow-hidden">

      <div className="shrink-0 px-2 pt-2 pb-1.5 flex items-center gap-2 border-b border-border/30">
        <button onClick={() => onNavigate('', 0, false)}
          className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-smooth">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{activeMeta.name}</p>
          <p className="text-[10px] text-muted-foreground">{totalPages} pages</p>
        </div>
        <button disabled={isImporting} onClick={() => pdfInputRef.current?.click()}
          title="Importer une autre présentation"
          className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-smooth disabled:opacity-40">
          <Upload className="h-3.5 w-3.5" />
        </button>
      </div>

      {isImporting && (
        <div className="shrink-0 px-3 py-2 bg-secondary/40 border-b border-border/30 space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{stageLabel}</span>
            {progress.total > 0 && <span>{pct}%</span>}
          </div>
          <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-150" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="shrink-0 px-3 pt-3 pb-2 space-y-2.5">
        <div className={cn(
          'w-full rounded-xl overflow-hidden bg-black/60 border aspect-video relative flex items-center justify-center',
          isProjected(activePage) ? 'border-green-500/60 ring-1 ring-green-500/30' : 'border-border/30',
        )}>
          {currentImg
            ? <img src={currentImg} alt={`Page ${activePage + 1}`} className="w-full h-full object-contain" />
            : <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />}
          {isProjected(activePage) && (
            <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 text-[10px] font-medium">
              <Monitor className="h-2.5 w-2.5" /> TV
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => goTo(activePage - 1)} disabled={activePage === 0}
            className="h-9 w-9 rounded-lg border border-border/40 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 disabled:opacity-30 disabled:cursor-not-allowed transition-smooth shrink-0">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 text-center">
            <span className="text-base font-bold">{activePage + 1}</span>
            <span className="text-muted-foreground text-sm"> / {totalPages}</span>
          </div>
          <button onClick={() => goTo(activePage + 1)} disabled={activePage >= totalPages - 1}
            className="h-9 w-9 rounded-lg border border-border/40 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 disabled:opacity-30 disabled:cursor-not-allowed transition-smooth shrink-0">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <Button className="w-full gap-2 h-9 text-sm"
          variant={isProjected(activePage) ? 'secondary' : 'default'}
          onClick={() => { onProjectPage(activePresentationId, activePage, pages[activePage] ?? ''); onNavigate(activePresentationId, activePage, true); }}>
          <Monitor className="h-4 w-4" />
          {isProjected(activePage) ? 'Actuellement projeté' : 'Projeter cette page'}
        </Button>

        <button onClick={() => setAutoProj(v => !v)}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/40 hover:bg-secondary/60 transition-smooth text-xs text-muted-foreground">
          {autoProj ? <ToggleRight className="h-4 w-4 text-primary shrink-0" /> : <ToggleLeft className="h-4 w-4 shrink-0" />}
          <span>Projeter auto à la navigation</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {pages.length === 0 ? (
          <div className="flex items-center justify-center h-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {pages.map((img, idx) => (
              <button key={idx} onClick={() => goTo(idx)}
                className={cn(
                  'relative aspect-video rounded-lg overflow-hidden border transition-smooth',
                  idx === activePage ? 'border-primary ring-1 ring-primary/50' :
                  isProjected(idx)   ? 'border-green-500/60' : 'border-border/30 hover:border-border/60',
                )}>
                <img src={img} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                <span className={cn(
                  'absolute bottom-0.5 right-0.5 text-[9px] font-bold px-1 rounded',
                  idx === activePage ? 'bg-primary text-primary-foreground' : 'bg-black/70 text-white/70',
                )}>{idx + 1}</span>
                {isProjected(idx) && <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-green-400 ring-1 ring-black/40" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <input ref={pdfInputRef} type="file" accept="application/pdf" className="hidden" onChange={handlePdfInput} />
      <input ref={imgInputRef} type="file" accept="image/*" multiple  className="hidden" onChange={handleImgInput} />
    </div>
  );
}

// Miniature async depuis IndexedDB
function ThumbnailSlot({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    idbLoad(id).then(p => { if (p[0]) setSrc(p[0]); }).catch(() => {});
  }, [id]);
  return (
    <div className="h-14 w-20 shrink-0 rounded-lg overflow-hidden bg-black/40 flex items-center justify-center">
      {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : <Presentation className="h-5 w-5 text-muted-foreground/40" />}
    </div>
  );
}
