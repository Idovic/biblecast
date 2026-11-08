/* Choix d'un fond animé : fonds légers / effets riches, styles préréglés et trois couleurs */
import { Check, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ANIMATED_BACKGROUNDS, getAnimatedBackground, previewOf } from '@/components/scene/animated';

export default function AnimatedPicker({ value, colors, onChange, cols = 4 }: {
  value?: string; colors?: string[];
  /** id du fond (undefined = aucun) et couleurs (undefined = celles du fond) */
  onChange: (id: string | undefined, colors?: string[]) => void;
  cols?: 2 | 3 | 4;
}) {
  const def = getAnimatedBackground(value);
  const current = (colors && colors.length >= 3 ? colors : def?.colors) ?? [];
  const tile = (b: typeof ANIMATED_BACKGROUNDS[number]) => {
    const active = value === b.id;
    return (
      <button key={b.id} onClick={() => onChange(active ? undefined : b.id)} aria-pressed={active}
        className={cn('relative h-14 rounded-lg border-2 text-[11px] font-semibold text-white flex items-end p-1.5 text-left leading-tight',
          active ? 'border-primary' : 'border-transparent')}
        style={{ background: active ? previewOf(b, current) : b.preview, textShadow: '0 1px 3px rgba(0,0,0,.9)' }}>
        {b.label}
        {active && <Check className="absolute top-1 right-1 h-4 w-4 text-primary" />}
      </button>
    );
  };
  const grid = cols === 2 ? 'grid-cols-2' : cols === 3 ? 'grid-cols-3' : 'grid-cols-4';
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="text-[11px] text-muted-foreground">Fonds légers (toutes les TV)</p>
        <div className={cn('grid gap-2', grid)}>{ANIMATED_BACKGROUNDS.filter(b => b.kind === 'css').map(tile)}</div>
      </div>
      <div className="space-y-1.5">
        <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Sparkles className="h-3 w-3" />Effets riches (fond léger à la place si la TV saccade)</p>
        <div className={cn('grid gap-2', grid)}>{ANIMATED_BACKGROUNDS.filter(b => b.kind === 'shader').map(tile)}</div>
      </div>
      {def && (
        <div className="rounded-lg bg-secondary/40 border border-border/40 p-2.5 space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground">Style de « {def.label} »</p>
          <div className="flex gap-1.5 flex-wrap">
            {def.styles.map(st => {
              const on = current.join() === st.colors.join();
              return (
                <button key={st.name} onClick={() => onChange(def.id, st.colors)}
                  className={cn('h-10 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5',
                    on ? 'border-primary/60 bg-primary/15 text-primary' : 'border-border/40 bg-secondary/40 text-muted-foreground')}>
                  <span className="flex -space-x-1">{st.colors.map(c => <span key={c} className="h-3.5 w-3.5 rounded-full border border-black/30" style={{ background: c }} />)}</span>
                  {st.name}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Couleurs</span>
            {[0, 1, 2].map(i => (
              <input key={i} type="color" aria-label={`Couleur ${i + 1}`} value={current[i] ?? '#ffffff'}
                onChange={e => { const next = [...current]; next[i] = e.target.value; onChange(def.id, next); }}
                className="h-10 w-12 rounded-lg border border-border/40 bg-transparent cursor-pointer" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
