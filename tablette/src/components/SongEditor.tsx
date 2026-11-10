/* Saisie d'un chant : titre, auteur, paroles collées telles quelles ; l'ordre et le découpage en écrans
   se font tout seuls (modifiables). Aperçu exact de la TV à droite. */
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Trash2, Music2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { DisplayTheme } from '@/types/bible';
import type { ChurchSettings } from '@/components/SettingsPanel';
import { SceneView } from '@/components/scene/Scene';
import AnimatedPicker from '@/components/AnimatedPicker';
import { parseLyrics, autoOrder, songScreens, songSlides, DEFAULT_SONG_BG, type Song } from '@/lib/songs';

const EXAMPLE = `Exemple :

1. Première ligne du couplet
Deuxième ligne du couplet

Refrain
Première ligne du refrain
Deuxième ligne du refrain

2. Deuxième couplet…`;

export default function SongEditor({ song, theme, settings, onSave, onDelete, onClose }: {
  song: Song; theme: DisplayTheme; settings: ChurchSettings;
  onSave: (s: Song) => void; onDelete?: (s: Song) => void; onClose: () => void;
}) {
  const [s, setS] = useState<Song>(song);
  const [confirmDel, setConfirmDel] = useState(false);
  const [view, setView] = useState(0);
  const set = (patch: Partial<Song>) => setS(x => ({ ...x, ...patch }));
  const sections = useMemo(() => parseLyrics(s.lyrics), [s.lyrics]);
  const screens = useMemo(() => songScreens(s), [s]);
  const slides = useMemo(() => songSlides({ ...s, title: s.title || 'Titre du chant' }), [s]);
  const auto = autoOrder(sections).join(' ');
  const cur = Math.min(view, Math.max(0, slides.length - 1));
  const canSave = !!s.title.trim() && sections.length > 0;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-background animate-fade-in" role="dialog" aria-label="Chant">
      <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-border/50">
        <Music2 className="h-5 w-5 text-primary" />
        <p className="flex-1 font-semibold text-sm">{song.title ? 'Modifier le chant' : 'Nouveau chant'}</p>
        {onDelete && (confirmDel
          ? <Button variant="destructive" className="h-11 gap-1.5" onClick={() => onDelete(s)}><Trash2 className="h-4 w-4" /> Confirmer la suppression</Button>
          : <Button variant="ghost" className="h-11 w-11 p-0 text-muted-foreground" onClick={() => setConfirmDel(true)} aria-label="Supprimer le chant"><Trash2 className="h-4 w-4" /></Button>)}
        <Button variant="secondary" className="h-11" onClick={onClose}>Annuler</Button>
        <Button className="h-11 gap-1.5 btn-gold" disabled={!canSave} onClick={() => onSave({ ...s, title: s.title.trim(), author: s.author?.trim() || undefined })}><Check className="h-4 w-4" /> Enregistrer</Button>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[1fr_1fr] overflow-hidden">
        {/* Saisie */}
        <div className="min-h-0 overflow-y-auto p-4 space-y-3">
          <div className="grid grid-cols-[1.6fr_1fr] gap-2">
            <label className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Titre</span>
              <Input value={s.title} onChange={e => set({ title: e.target.value })} placeholder="Titre du chant" className="h-11 bg-secondary text-base" />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Auteur</span>
              <Input value={s.author ?? ''} onChange={e => set({ author: e.target.value })} placeholder="Auteur ou groupe" className="h-11 bg-secondary" />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Paroles</span>
            <textarea value={s.lyrics} onChange={e => set({ lyrics: e.target.value })} placeholder={EXAMPLE} spellCheck={false}
              className="w-full min-h-[46vh] rounded-lg border border-border/50 bg-secondary text-base px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
              style={{ lineHeight: 1.6 }} />
            <span className="block text-[11px] text-muted-foreground leading-snug">
              Une ligne vide entre chaque strophe. Écrivez « Refrain » (ou « R : ») au-dessus du refrain, « Pont » au-dessus du pont. Vous pouvez numéroter les couplets « 1. », « 2. ».
            </span>
          </label>
        </div>

        {/* Ordre, écrans, aperçu */}
        <div className="min-h-0 overflow-y-auto p-4 space-y-4 border-l border-border/40 bg-secondary/10">
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Aperçu sur la TV · écran {slides.length ? cur + 1 : 0} sur {slides.length}</span>
            <div className="rounded-lg overflow-hidden border border-border/50">
              {slides.length
                ? <SceneView content={{ id: cur, kind: 'slide', slide: slides[cur] }} theme={theme} settings={settings} still />
                : <div className="aspect-video flex items-center justify-center text-sm text-muted-foreground bg-black/40">Les écrans apparaissent ici</div>}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" className="h-10 w-12 p-0" disabled={cur <= 0} onClick={() => setView(cur - 1)} aria-label="Écran précédent"><ChevronLeft className="h-5 w-5" /></Button>
              <div className="flex-1 flex flex-wrap gap-1">
                {screens.map((sc, i) => (
                  <button key={i} onClick={() => setView(i)} className={cn('h-7 min-w-8 px-1.5 rounded text-[11px] font-bold', i === cur ? 'bg-primary text-primary-foreground' : sc.key.startsWith('R') ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground')}>{sc.short}</button>
                ))}
              </div>
              <Button variant="secondary" className="h-10 w-12 p-0" disabled={cur >= slides.length - 1} onClick={() => setView(cur + 1)} aria-label="Écran suivant"><ChevronRight className="h-5 w-5" /></Button>
            </div>
          </div>

          <label className="block space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ordre de passage</span>
            <Input value={s.order ?? ''} onChange={e => set({ order: e.target.value })} placeholder={auto ? `Automatique : ${auto}` : 'Automatique'} className="h-11 bg-secondary font-mono" />
            <span className="block text-[11px] text-muted-foreground">
              Laissez vide : le refrain revient après chaque couplet. Sinon, tapez par exemple « C1 R C2 R R ».
              {sections.length > 0 && <> Parties : {sections.map(x => `${x.key} = ${x.label}`).join(', ')}.</>}
            </span>
          </label>

          <div className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Lignes par écran</span>
            <div className="flex gap-1.5">
              {[2, 3, 4].map(n => (
                <button key={n} onClick={() => set({ linesPerScreen: n })}
                  className={cn('flex-1 h-11 rounded-lg border text-sm font-semibold', (s.linesPerScreen ?? 4) === n ? 'border-primary/60 bg-primary/15 text-primary' : 'border-border/40 bg-secondary/40 text-muted-foreground')}>
                  {n} lignes
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Fond</span>
            <AnimatedPicker value={s.background || DEFAULT_SONG_BG} onChange={id => set({ background: id || DEFAULT_SONG_BG })} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
