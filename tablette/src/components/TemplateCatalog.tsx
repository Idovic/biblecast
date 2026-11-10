/* Catalogue des modèles : vraies miniatures (le rendu exact de la TV), rangées par moment du culte. */
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, LayoutTemplate, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DisplayTheme } from '@/types/bible';
import type { ChurchSettings } from '@/components/SettingsPanel';
import { SceneView } from '@/components/scene/Scene';
import { MOMENTS, SLIDE_TEMPLATES, templatePreview, type SlideTemplate, type TemplateMoment } from '@/lib/slideTemplates';

export default function TemplateCatalog({ theme, settings, onPick, onClose }: {
  theme: DisplayTheme; settings: ChurchSettings;
  onPick: (t: SlideTemplate) => void; onClose: () => void;
}) {
  const [moment, setMoment] = useState<TemplateMoment | 'tous'>('tous');
  const list = useMemo(() => SLIDE_TEMPLATES.filter(t => moment === 'tous' || t.moment === moment), [moment]);
  const groups = moment === 'tous'
    ? MOMENTS.map(m => ({ m, items: list.filter(t => t.moment === m.id) })).filter(g => g.items.length)
    : [{ m: MOMENTS.find(x => x.id === moment)!, items: list }];

  // Portail : le catalogue couvre toute la tablette, pas seulement la colonne des slides
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-background animate-fade-in" role="dialog" aria-label="Modèles de slides">
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-border/50">
        <LayoutTemplate className="h-5 w-5 text-primary" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">Modèles de slides</p>
          <p className="text-[11px] text-muted-foreground">Touchez un modèle : il s'ajoute et s'ouvre pour être modifié (textes, fond, couleurs).</p>
        </div>
        <button onClick={onClose} className="h-11 w-11 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary" aria-label="Fermer">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="shrink-0 flex gap-1.5 px-4 py-2 overflow-x-auto border-b border-border/30">
        {[{ id: 'tous' as const, label: 'Tous' }, ...MOMENTS].map(m => (
          <button key={m.id} onClick={() => setMoment(m.id)}
            className={cn('h-10 px-4 rounded-full text-sm font-medium whitespace-nowrap border transition-colors',
              moment === m.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary/40 text-muted-foreground border-border/40 hover:text-foreground')}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-5">
        {groups.map(({ m, items }) => (
          <section key={m.id}>
            {moment === 'tous' && <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{m.label}</p>}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {items.map(t => (
                <button key={t.id} onClick={() => onPick(t)}
                  className="group text-left rounded-xl border border-border/40 bg-secondary/20 hover:border-primary/50 hover:bg-secondary/50 overflow-hidden transition-colors">
                  <div className="relative">
                    {t.slides[0].slideType === 'image-full' ? (
                      <div className="aspect-video w-full flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-secondary to-background text-muted-foreground">
                        <Layers className="h-6 w-6" /><span className="text-xs">Votre affiche</span>
                      </div>
                    ) : (
                      <SceneView content={{ id: 0, kind: 'slide', slide: templatePreview(t) }} theme={theme} settings={settings} still />
                    )}
                    {t.slides.length > 1 && (
                      <span className="absolute top-1.5 right-1.5 rounded-full bg-black/70 text-white text-[10px] font-semibold px-2 py-0.5">{t.slides.length} écrans</span>
                    )}
                  </div>
                  <div className="px-2.5 py-2">
                    <p className="text-sm font-semibold leading-tight">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{t.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>,
    document.body,
  );
}
