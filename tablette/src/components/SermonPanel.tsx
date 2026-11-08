/* Versets entendus pendant la prédication — rien ne part sur les TV sans validation.
   Toucher = aperçu · double-toucher ou « Projeter » = sur les TV · « + » = dans le déroulé. */
import { useState } from 'react';
import { Mic, MicOff, Send, Plus, X, Loader2, Usb, Bluetooth, Tablet, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatReference } from '@/lib/bible';
import type { VerseReference } from '@/types/bible';
import type { useSermon } from '@/hooks/useSermon';

type Sermon = ReturnType<typeof useSermon>;

const DEVICE: Record<string, { label: string; Icon: typeof Mic }> = {
  usb: { label: 'Micro USB', Icon: Usb },
  bluetooth: { label: 'Micro Bluetooth', Icon: Bluetooth },
  interne: { label: 'Micro de la tablette', Icon: Tablet },
};

export default function SermonPanel({ sermon, onPreview, onProject, onAdd }: {
  sermon: Sermon;
  onPreview: (v: VerseReference) => void;
  onProject: (v: VerseReference) => void;
  onAdd: (v: VerseReference) => void;
}) {
  const [draft, setDraft] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const dev = sermon.device ? DEVICE[sermon.device] : undefined;

  return (
    <div className="border-b border-border bg-secondary/20 flex flex-col min-h-0 max-h-full">
      <div className="px-3 py-2 flex items-center gap-2 shrink-0">
        <span className={cn('h-8 w-8 rounded-full flex items-center justify-center shrink-0',
          sermon.state === 'listening' || sermon.state === 'essai' ? 'bg-red-600 text-white' : 'bg-secondary text-muted-foreground')}>
          {sermon.state === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">Versets entendus</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {sermon.state === 'loading' && 'Préparation de l\'écoute…'}
            {sermon.state === 'listening' && (dev ? <span className="inline-flex items-center gap-1"><dev.Icon className="h-3 w-3" />{dev.label}</span> : 'À l\'écoute')}
            {sermon.state === 'essai' && 'Essai sans micro (aperçu navigateur) : tapez ce que dit le prédicateur'}
            {sermon.state === 'error' && <span className="text-destructive">{sermon.error}</span>}
          </p>
        </div>
        {sermon.state === 'listening' && (
          <div className="w-20 h-2.5 rounded-full bg-secondary overflow-hidden" title="Niveau du micro" aria-label="Niveau du micro">
            <div className="h-full bg-green-500 transition-[width] duration-150" style={{ width: `${Math.round(sermon.level * 100)}%` }} />
          </div>
        )}
        {sermon.detections.length > 0 && (
          <button onClick={sermon.clear} className="h-10 w-10 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Vider la liste"><Trash2 className="h-4 w-4" /></button>
        )}
        <Button variant="secondary" onClick={sermon.stop} className="h-10 gap-1.5"><MicOff className="h-4 w-4" />Arrêter</Button>
      </div>

      {/* Ce que la tablette entend en ce moment (preuve que le son arrive) */}
      {(sermon.state === 'listening' && sermon.partial) && (
        <p className="px-3 pb-1.5 text-xs text-muted-foreground italic truncate" dir="rtl" style={{ textAlign: 'left' }}>
          <bdi>« {sermon.partial} »</bdi>
        </p>
      )}
      {sermon.state === 'essai' && (
        <form className="px-3 pb-2 flex gap-2" onSubmit={e => { e.preventDefault(); if (draft.trim()) { sermon.feed(draft.trim(), false); setDraft(''); } }}>
          <Input value={draft} onChange={e => setDraft(e.target.value)} placeholder="ex. : ouvrons nos Bibles en Jean chapitre trois verset seize" className="h-10 bg-secondary flex-1" />
          <Button type="submit" className="h-10">Entendre</Button>
        </form>
      )}

      <div className="px-3 pb-2 overflow-y-auto min-h-0 space-y-1.5">
        {sermon.detections.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">Les références citées apparaîtront ici. Rien n'est projeté sans votre validation.</p>
        )}
        {sermon.detections.map((d, i) => {
          const pct = Math.round(d.confidence * 100);
          return (
            <div key={d.key + d.at} className={cn('rounded-xl border p-2 flex items-start gap-2 cursor-pointer select-none',
              selected === d.key ? 'border-primary/60 bg-primary/10' : i === 0 ? 'border-green-500/40 bg-green-500/5' : 'border-border/40 bg-secondary/40')}
              onClick={() => { setSelected(d.key); onPreview(d.ref); }}
              onDoubleClick={() => onProject(d.ref)}
              role="button" aria-label={`Aperçu de ${formatReference(d.ref)}`}>
              <span className={cn('mt-1 h-8 w-1 rounded-full shrink-0', pct >= 85 ? 'bg-green-500' : pct >= 65 ? 'bg-amber-400' : 'bg-orange-500')} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-bold text-sm text-primary">{formatReference(d.ref)}</span>
                  <span className="text-[11px] text-muted-foreground">{pct} %{d.kind === 'chapitre' ? ' · chapitre' : d.kind === 'contexte' ? ' · même chapitre' : d.kind === 'suite' ? ' · suite' : ''}</span>
                </div>
                <p className="text-xs text-foreground/85 line-clamp-2">{d.ref.text}</p>
                <p className="text-[10px] text-muted-foreground italic truncate">entendu : « {d.heard} »</p>
              </div>
              <div className="flex flex-col gap-1 shrink-0" onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
                <Button size="sm" className="h-10 px-3 btn-gold gap-1" onClick={() => onProject(d.ref)}><Send className="h-4 w-4" />Projeter</Button>
                <div className="flex gap-1">
                  <button className="h-9 flex-1 rounded-md bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center" onClick={() => onAdd(d.ref)} aria-label="Ajouter au déroulé"><Plus className="h-4 w-4" /></button>
                  <button className="h-9 flex-1 rounded-md bg-secondary text-muted-foreground hover:text-destructive flex items-center justify-center" onClick={() => sermon.dismiss(d.key)} aria-label="Retirer"><X className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
