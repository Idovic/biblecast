/* Menu du déroulé : nom du culte, nouveau, modèles, ouvrir un culte enregistré, dupliquer, vider.
   L'enregistrement est automatique (voir Index : upsertProgramme). */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Trash2, X, FilePlus2, Eraser, Copy, FolderOpen, Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { genId } from '@/lib/utils';
import type { BibleData, QueueItem } from '@/types/bible';
import {
  DEROULE_TEMPLATES, buildTemplate, defaultName, deleteProgramme, loadProgrammes,
  type ProgrammeMeta, type SavedProgramme,
} from '@/lib/deroule';

interface Props {
  meta: ProgrammeMeta;
  queue: QueueItem[];
  bible: BibleData | null;
  saved: boolean;
  onRename: (name: string) => void;
  /** Remplace le déroulé affiché (nouvel identifiant = nouveau culte enregistré à part) */
  onLoad: (meta: ProgrammeMeta, queue: QueueItem[]) => void;
}

export default function ProgrammeMenu({ meta, queue, bible, saved, onRename, onLoad }: Props) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<SavedProgramme[]>([]);
  const [name, setName] = useState(meta.name);
  const [confirmClear, setConfirmClear] = useState(false);

  const show = () => { setList(loadProgrammes().filter(p => p.id !== meta.id)); setName(meta.name); setConfirmClear(false); setOpen(true); };
  const close = () => { if (name.trim() && name.trim() !== meta.name) onRename(name.trim()); setOpen(false); };
  const fresh = (n: string) => ({ id: genId(), name: n });
  const count = queue.filter(q => q.type !== 'section').length;

  return (
    <>
      <button onClick={show} className="w-full min-w-0 h-11 px-3 rounded-xl bg-secondary/60 border border-border/50 flex items-center gap-2 text-left hover:bg-secondary"
        title="Nom du culte, modèles, cultes enregistrés">
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold truncate">{meta.name}</span>
          <span className="block text-[10px] text-muted-foreground leading-tight">
            {count} élément{count > 1 ? 's' : ''} · {saved ? 'enregistré' : 'enregistrement…'}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm overflow-y-auto" onClick={e => { if (e.target === e.currentTarget) close(); }}>
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="w-full max-w-md glass-panel rounded-2xl border border-border/50 shadow-2xl">
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <h3 className="font-bold text-base">Déroulé du culte</h3>
                <button onClick={close} className="h-10 w-10 flex items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Fermer"><X className="h-5 w-5" /></button>
              </div>
              <div className="px-5 pb-5 space-y-5">
                <section className="space-y-2">
                  <label htmlFor="deroule-name" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nom du culte</label>
                  <div className="flex gap-2">
                    <Input id="deroule-name" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && close()} className="h-11 bg-secondary" />
                    <Button onClick={close} className="h-11 px-4 btn-gold gap-1"><Check className="h-4 w-4" />OK</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Le déroulé s'enregistre tout seul à chaque changement.</p>
                </section>

                <section className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nouveau culte</p>
                  <div className="grid gap-1.5">
                    {DEROULE_TEMPLATES.map(t => (
                      <button key={t.name} onClick={() => { onLoad(fresh(`${t.name} ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`), buildTemplate(t, bible)); setOpen(false); }}
                        className="flex items-center gap-3 rounded-lg border border-border/40 bg-secondary/30 hover:bg-secondary px-3 min-h-[52px] text-left">
                        <FilePlus2 className="h-5 w-5 text-primary shrink-0" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium">{t.name}</span>
                          <span className="block text-xs text-muted-foreground">{t.description}</span>
                        </span>
                      </button>
                    ))}
                    <button onClick={() => { onLoad(fresh(defaultName()), []); setOpen(false); }}
                      className="flex items-center gap-3 rounded-lg border border-dashed border-border/50 hover:bg-secondary px-3 min-h-[48px] text-sm text-left">
                      <Plus className="h-5 w-5 text-muted-foreground" /> Culte vide
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">Le culte actuel reste enregistré : vous le retrouverez ci-dessous.</p>
                </section>

                <section className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><FolderOpen className="h-3.5 w-3.5" />Ouvrir un culte enregistré ({list.length})</p>
                  {list.length === 0 && <p className="text-sm text-muted-foreground">Aucun autre culte pour l'instant.</p>}
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {list.map(p => (
                      <div key={p.id} className="flex items-center gap-2 rounded-lg bg-secondary/50 border border-border/40 pl-3 pr-1 py-1">
                        <button className="flex-1 min-w-0 text-left min-h-[44px]" onClick={() => { onLoad({ id: p.id, name: p.name }, p.queue); setOpen(false); }}>
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.queue.filter(q => q.type !== 'section').length} éléments · {new Date(p.savedAt).toLocaleDateString('fr-FR')}</p>
                        </button>
                        <button onClick={() => { deleteProgramme(p.id); setList(l => l.filter(x => x.id !== p.id)); }}
                          className="h-11 w-11 flex items-center justify-center text-muted-foreground hover:text-destructive" aria-label={`Supprimer ${p.name}`}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                </section>

                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" className="h-11 gap-2"
                    onClick={() => { onLoad(fresh(`${meta.name} (copie)`), queue.map(q => ({ ...q, id: genId() }))); setOpen(false); }}>
                    <Copy className="h-4 w-4" /> Dupliquer
                  </Button>
                  {confirmClear ? (
                    <Button variant="destructive" className="h-11 gap-2" onClick={() => { onLoad(meta, []); setOpen(false); }}>
                      <Eraser className="h-4 w-4" /> Confirmer
                    </Button>
                  ) : (
                    <Button variant="ghost" className="h-11 gap-2 text-muted-foreground hover:text-destructive" onClick={() => setConfirmClear(true)}>
                      <Eraser className="h-4 w-4" /> Vider
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
