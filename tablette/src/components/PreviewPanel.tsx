/* Aperçu et régie — rendu par le même moteur que la TV (components/scene).
   Mode Préparer : un grand aperçu de la sélection.
   Mode Direct : EN DIRECT (ce que montrent les TV) + SUIVANT, et la barre de direct. */
import { useState } from 'react';
import { Send, Plus, ChevronLeft, ChevronRight, Image as ImageIcon, Megaphone, MegaphoneOff, AudioLines } from 'lucide-react';
import { WAVE_STYLES, WAVE_POSITIONS, WAVE_COLORS } from '@/components/scene/wave';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DisplayTheme, VerseReference } from '@/types/bible';
import type { ChurchSettings } from '@/components/SettingsPanel';
import { SceneView, type SceneContentData, type StageOverlay, type StandbyExtras } from '@/components/scene/Scene';
import { useStandbyExtras } from '@/components/scene/standby';

interface PreviewPanelProps {
  mode: 'preparer' | 'direct';
  selected: SceneContentData | null;
  live: SceneContentData;
  next: SceneContentData | null;
  nextLabel?: string;
  hasSelection: boolean;
  onSendToDisplay: () => void;
  onAddToQueue: () => void;
  onClearDisplay: () => void;
  onPrev: () => void;
  onNext: () => void;
  overlay: StageOverlay;
  onOverlay: (o: StageOverlay) => void;
  theme: DisplayTheme;
  onThemeChange: (theme: DisplayTheme) => void;
  settings: ChurchSettings;
  churchLogo?: string;
  /** Annonce défilante en bas des TV ('' = arrêtée) */
  tickerText: string;
  onTicker: (text: string) => void;
  /** Onde décorative (louange, chorale) */
  waveOn: boolean;
  onWave: (on: boolean) => void;
  onWaveSettings: (patch: Partial<ChurchSettings>) => void;
  /** Verset en direct : ses mots peuvent être mis en valeur */
  liveVerse: VerseReference | null;
  onToggleWord: (index: number) => void;
  /** TV connectées, TV visée par le prochain envoi (null = toutes) */
  tvs: { id: string; name: string }[];
  targetTv: string | null;
  onTargetTv: (id: string | null) => void;
  /** Une vignette par TV quand elles n'affichent pas la même chose */
  perTv: { id: string; name: string; content: SceneContentData; overlay: StageOverlay }[] | null;
}

function PerTvRow({ perTv, theme, settings, extras }: { perTv: NonNullable<PreviewPanelProps['perTv']>; theme: DisplayTheme; settings: ChurchSettings; extras: StandbyExtras }) {
  return (
    <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(perTv.length, 3)}, minmax(0, 1fr))` }}>
      {perTv.map(t => (
        <div key={t.id} className="min-w-0">
          <p className="text-[11px] font-semibold text-muted-foreground truncate mb-1">{t.name}</p>
          <div className="rounded-md overflow-hidden border border-red-500/40">
            <SceneView content={t.content} theme={theme} settings={settings} extras={extras} still overlay={t.overlay} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Screen({ label, tone, content, theme, settings, overlay, empty, extras, wave }: {
  label: string; tone: 'live' | 'next' | 'preview'; content: SceneContentData | null; theme: DisplayTheme; settings: ChurchSettings; overlay?: StageOverlay; empty?: string; extras?: StandbyExtras; wave?: boolean;
}) {
  return (
    <div className="min-w-0 flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
        <span className={cn('h-2 w-2 rounded-full', tone === 'live' ? 'bg-red-500 animate-pulse' : tone === 'next' ? 'bg-sky-400' : 'bg-primary')} />
        <span className={tone === 'live' ? 'text-red-400' : 'text-muted-foreground'}>{label}</span>
        {tone === 'live' && overlay && overlay !== 'none' && (
          <span className="ml-auto rounded px-1.5 py-0.5 bg-amber-500/20 text-amber-300 normal-case tracking-normal">
            {overlay === 'black' ? 'Écran noir' : overlay === 'logo' ? 'Logo' : 'Fond seul'}
          </span>
        )}
      </div>
      <div className={cn('relative rounded-lg overflow-hidden border', tone === 'live' ? 'border-red-500/50' : 'border-border/50')}>
        {content ? (
          <SceneView content={content} theme={theme} settings={settings} extras={extras} still overlay={tone === 'live' ? overlay : 'none'} wave={tone === 'live' && wave} />
        ) : (
          <div className="flex items-center justify-center text-sm text-muted-foreground bg-secondary/30" style={{ aspectRatio: '16 / 9' }}>
            {empty ?? 'Rien à afficher'}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PreviewPanel(p: PreviewPanelProps) {
  const { mode, theme, settings, overlay } = p;
  const extras = useStandbyExtras(settings);
  const [showTicker, setShowTicker] = useState(false);
  const [tickerDraft, setTickerDraft] = useState(() => { try { return localStorage.getItem('biblecast:ticker-draft') || ''; } catch { return ''; } });
  const saveDraft = (t: string) => { setTickerDraft(t); try { localStorage.setItem('biblecast:ticker-draft', t); } catch { /* ignore */ } };
  const tickerOn = !!p.tickerText;
  const [showWords, setShowWords] = useState(false);
  const words = p.liveVerse ? p.liveVerse.text.split(/\s+/).filter(Boolean) : [];
  const lit = new Set(p.liveVerse?.highlights ?? []);
  const [showWave, setShowWave] = useState(false);
  const chip = (on: boolean) => cn('h-9 px-3 rounded-lg border text-xs font-semibold', on ? 'bg-sky-400 text-black border-sky-300' : 'bg-secondary/60 border-border/50 text-muted-foreground');

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {mode === 'direct' ? (
          <div className="max-w-3xl mx-auto flex flex-col gap-3">
            <Screen label={p.perTv ? 'En direct · toutes les TV' : 'En direct'} tone="live" content={p.live} theme={theme} settings={settings} overlay={overlay} extras={extras} wave={p.waveOn} />
            {p.perTv && <PerTvRow perTv={p.perTv} theme={theme} settings={settings} extras={extras} />}
            <div className="w-1/2 min-w-[220px] self-center">
              <Screen label={p.nextLabel ? `Suivant · ${p.nextLabel}` : 'Suivant'} tone="next" content={p.next} theme={theme} settings={settings}
                empty="Fin du déroulé" />
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            <Screen label={p.hasSelection ? 'Aperçu de la sélection' : 'En direct sur les TV'} tone={p.hasSelection ? 'preview' : 'live'}
              content={p.selected ?? p.live} theme={theme} settings={settings} overlay={p.hasSelection ? undefined : overlay} extras={extras} wave={p.waveOn} />
            {!p.hasSelection && p.perTv && <PerTvRow perTv={p.perTv} theme={theme} settings={settings} extras={extras} />}
            {!p.hasSelection && <p className="mt-3 text-center text-sm text-muted-foreground">Touchez un verset ou une slide pour l'aperçu, double-touchez pour projeter.</p>}
          </div>
        )}
      </div>

      {/* Réglages rapides des versets */}
      <div className="px-4 py-2 border-t border-border/40 bg-secondary/20 shrink-0 flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Taille sur TV</span>
        {(['small', 'medium', 'large', 'xlarge'] as const).map(sz => (
          <button key={sz} onClick={() => p.onThemeChange({ ...theme, fontSize: sz })}
            className={cn('h-9 min-w-9 px-2 text-xs font-semibold rounded-lg', theme.fontSize === sz ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground')}>
            {sz === 'small' ? 'S' : sz === 'medium' ? 'M' : sz === 'large' ? 'L' : 'XL'}
          </button>
        ))}
        {(['serif', 'sans-serif'] as const).map(ff => (
          <button key={ff} onClick={() => p.onThemeChange({ ...theme, fontFamily: ff })}
            className={cn('h-9 px-3 text-xs rounded-lg', theme.fontFamily === ff ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground')}>
            {ff === 'serif' ? 'Serif' : 'Sans'}
          </button>
        ))}
        {p.churchLogo && (
          <button onClick={() => p.onThemeChange({ ...theme, showChurchLogo: !theme.showChurchLogo })}
            className={cn('ml-auto h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1',
              theme.showChurchLogo ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border/40 bg-secondary/40 text-muted-foreground')}>
            <ImageIcon className="h-3.5 w-3.5" /> Logo sur les versets
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="p-3 border-t border-border space-y-2 shrink-0">
        {mode === 'preparer' && (
          <div className="flex gap-2">
            <Button onClick={p.onSendToDisplay} disabled={!p.hasSelection} className="flex-[2] h-12 text-base font-bold btn-gold rounded-xl gap-2 disabled:opacity-40">
              <Send className="h-5 w-5" /> PROJETER
            </Button>
            <Button onClick={p.onAddToQueue} disabled={!p.hasSelection} variant="secondary" className="flex-1 h-12 gap-2 rounded-xl">
              <Plus className="h-4 w-4" /> Déroulé
            </Button>
          </div>
        )}
        {/* Mot mis en valeur sur la TV */}
        {p.liveVerse && (
          <div className="rounded-xl bg-secondary/30 border border-border/40">
            <button onClick={() => setShowWords(v => !v)} className="w-full h-10 px-3 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: '#E9C46A' }} />
              Mettre un mot en valeur · {p.liveVerse.book} {p.liveVerse.chapter}:{p.liveVerse.verse}
              <span className="ml-auto">{showWords ? 'Masquer' : 'Afficher'}</span>
            </button>
            {showWords && (
              <div className="px-3 pb-3 flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                {words.map((w, i) => (
                  <button key={i} onClick={() => p.onToggleWord(i)}
                    className={cn('h-9 px-2.5 rounded-md border text-sm', lit.has(i) ? 'bg-amber-400 text-black border-amber-300 font-semibold' : 'bg-secondary/60 border-border/40 text-foreground')}>
                    {w}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Onde décorative (louange, chorale) */}
        {showWave && (
          <div className="rounded-xl bg-sky-500/10 border border-sky-400/30 p-2 space-y-2">
            <div className="flex items-center gap-2">
              <Button onClick={() => p.onWave(!p.waveOn)} className={cn('h-11 gap-1.5 flex-1', p.waveOn ? 'bg-secondary text-foreground hover:bg-secondary/80' : 'bg-sky-400 hover:bg-sky-300 text-black')}>
                <AudioLines className="h-4 w-4" /> {p.waveOn ? "Arrêter l'onde" : "Afficher l'onde sur les TV"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              {WAVE_STYLES.map(w => <button key={w.id} className={chip((settings.waveStyle ?? 'barres') === w.id)} onClick={() => p.onWaveSettings({ waveStyle: w.id })}>{w.label}</button>)}
              <span className="w-px h-6 bg-border mx-1" />
              {WAVE_POSITIONS.map(w => <button key={w.id} className={chip((settings.wavePosition ?? 'bas') === w.id)} onClick={() => p.onWaveSettings({ wavePosition: w.id })}>{w.label}</button>)}
              <span className="w-px h-6 bg-border mx-1" />
              {WAVE_COLORS.map(c => (
                <button key={c.id || 'or'} onClick={() => p.onWaveSettings({ waveColor: c.id })} aria-label={`Couleur ${c.label}`} title={c.label}
                  className={cn('h-8 w-8 rounded-full border-2', (settings.waveColor ?? '') === c.id ? 'border-sky-300 ring-2 ring-sky-400/40' : 'border-border/50')}
                  style={{ background: c.swatch }} />
              ))}
            </div>
          </div>
        )}
        {/* Annonce défilante (action en direct) */}
        {showTicker && (
          <div className="flex gap-2 items-center rounded-xl bg-amber-500/10 border border-amber-500/30 p-2">
            <Input value={tickerDraft} onChange={e => saveDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && tickerDraft.trim() && p.onTicker(tickerDraft.trim())}
              placeholder="Texte qui défile en bas des TV…" className="h-11 bg-secondary flex-1" />
            <Button onClick={() => p.onTicker(tickerDraft.trim())} disabled={!tickerDraft.trim()} className="h-11 gap-1.5 bg-amber-500 hover:bg-amber-400 text-black">
              <Megaphone className="h-4 w-4" /> {tickerOn ? 'Mettre à jour' : 'Diffuser'}
            </Button>
            {tickerOn && (
              <Button variant="secondary" onClick={() => p.onTicker('')} className="h-11 gap-1.5"><MegaphoneOff className="h-4 w-4" /> Arrêter</Button>
            )}
          </div>
        )}
        {/* Envoyer à : toutes les TV (par défaut) ou une seule, pour le prochain envoi */}
        {p.tvs.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">Envoyer à</span>
            {[{ id: null as string | null, name: 'Toutes les TV' }, ...p.tvs].map(t => (
              <button key={t.id ?? 'all'} onClick={() => p.onTargetTv(t.id)}
                className={cn('h-10 px-3 rounded-lg border text-sm font-medium',
                  p.targetTv === t.id ? (t.id ? 'bg-amber-500 text-black border-amber-400' : 'bg-primary/20 text-primary border-primary/50') : 'bg-secondary/50 border-border/50 text-muted-foreground')}>
                {t.name}
              </button>
            ))}
          </div>
        )}
        {p.targetTv && (
          <div className="rounded-lg bg-amber-500/15 border border-amber-500/50 px-3 py-2 text-sm text-amber-200">
            Le prochain envoi part seulement sur <b>{p.tvs.find(t => t.id === p.targetTv)?.name ?? 'cette TV'}</b>, puis retour sur toutes les TV.
          </div>
        )}
        {/* Barre de direct : toujours visible */}
        <div className="flex gap-2">
          <button onClick={p.onPrev} className="h-12 w-20 rounded-xl bg-secondary/70 border border-border/50 flex items-center justify-center" aria-label="Précédent"><ChevronLeft className="h-6 w-6" /></button>
          <button onClick={() => { setShowTicker(v => !v); setShowWave(false); }} aria-label="Annonce défilante" title="Annonce défilante en bas des TV"
            className={cn('flex-1 h-12 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5', tickerOn ? 'bg-amber-500 text-black border-amber-400' : showTicker ? 'bg-secondary border-amber-500/50 text-amber-300' : 'bg-secondary/70 border-border/50 text-foreground')}>
            <Megaphone className="h-4 w-4" />Bandeau
          </button>
          <button onClick={() => { setShowWave(v => !v); setShowTicker(false); }} aria-label="Onde sonore" title="Onde animée sur les TV (louange, chorale)"
            className={cn('flex-1 h-12 rounded-xl border text-sm font-semibold flex items-center justify-center gap-1.5', p.waveOn ? 'bg-sky-400 text-black border-sky-300' : showWave ? 'bg-secondary border-sky-400/50 text-sky-300' : 'bg-secondary/70 border-border/50 text-foreground')}>
            <AudioLines className="h-4 w-4" />Onde
          </button>
          <button onClick={p.onNext} className="h-12 w-24 rounded-xl btn-gold flex items-center justify-center font-bold" aria-label="Suivant"><ChevronRight className="h-7 w-7" /></button>
        </div>
        {mode === 'direct' && p.hasSelection && (
          <Button onClick={p.onSendToDisplay} className="w-full h-11 btn-gold rounded-xl gap-2"><Send className="h-4 w-4" /> Projeter la sélection</Button>
        )}
      </div>
    </div>
  );
}
