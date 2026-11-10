/* Vérification avant le culte : TV reliées, batterie, vidéos copiées, slides encore à remplir.
   Pendant le culte, des alertes discrètes préviennent si une TV se déconnecte ou si la batterie baisse. */
import { useEffect, useState } from 'react';
import { X, ClipboardCheck, CheckCircle2, AlertTriangle, XCircle, Info, GraduationCap, Compass, Tv, BatteryMedium, Film, LayoutList, MonitorSmartphone, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CustomSlide, QueueItem } from '@/types/bible';

export type CheckStatus = 'ok' | 'warn' | 'bad' | 'info';
export interface BatteryInfo { level: number; charging: boolean }

/** Batterie de la tablette (API du navigateur ; null si elle n'existe pas) */
export function useBattery(): BatteryInfo | null {
  const [info, setInfo] = useState<BatteryInfo | null>(null);
  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void }> };
    if (!nav.getBattery) return;
    let bat: Awaited<ReturnType<NonNullable<typeof nav.getBattery>>> | null = null;
    const update = () => bat && setInfo({ level: bat.level, charging: bat.charging });
    nav.getBattery().then(b => { bat = b; update(); b.addEventListener('levelchange', update); b.addEventListener('chargingchange', update); }).catch(() => { /* ignore */ });
    return () => { if (bat) { bat.removeEventListener('levelchange', update); bat.removeEventListener('chargingchange', update); } };
  }, []);
  return info;
}

/** Slide ajoutée depuis un modèle mais pas encore remplie */
export function slideNeedsFilling(s: CustomSlide): boolean {
  const t = (s.title ?? '').trim(), c = (s.content ?? '').trim();
  switch (s.slideType) {
    case 'image-full': return !s.backgroundImage;
    case 'title-only': return !t;
    case 'verse-title': return !c;
    case 'bullet-list': return !(s.bullets ?? []).some(b => b && b.trim());
    case 'info': return !t && !c && !(s.rows ?? []).some(r => r.value && r.value.trim());
    default: return !t && !c && !s.contentHtml;
  }
}

export interface PreflightInput {
  tvs: { id: string; name: string }[];
  isNative: boolean;
  serverRunning: boolean;
  queue: QueueItem[];
  tvCache: Record<string, { url?: string; percent: number; error?: string }>;
  battery: BatteryInfo | null;
  keepScreenOn: boolean;
}

interface Check { id: string; status: CheckStatus; title: string; detail: string; Icon: typeof Tv }

export function runChecks(p: PreflightInput): Check[] {
  const out: Check[] = [];
  if (p.isNative && !p.serverRunning) {
    out.push({ id: 'server', status: 'bad', Icon: Radio, title: 'La diffusion n\'est pas lancée', detail: 'Touchez l\'icône TV en haut pour la démarrer.' });
  }
  out.push(p.tvs.length
    ? { id: 'tv', status: 'ok', Icon: Tv, title: `${p.tvs.length} TV reliée${p.tvs.length > 1 ? 's' : ''}`, detail: p.tvs.map(t => t.name).join(' · ') }
    : { id: 'tv', status: 'bad', Icon: Tv, title: 'Aucune TV reliée', detail: 'Allumez les TV et vérifiez qu\'elles sont sur le même Wi-Fi que la tablette (celui du dongle).' });
  if (p.battery) {
    const pct = Math.round(p.battery.level * 100);
    out.push(p.battery.charging
      ? { id: 'battery', status: 'ok', Icon: BatteryMedium, title: `Batterie ${pct} %, en charge`, detail: 'La tablette est branchée.' }
      : pct < 20
        ? { id: 'battery', status: 'bad', Icon: BatteryMedium, title: `Batterie faible : ${pct} %`, detail: 'Branchez la tablette avant de commencer.' }
        : pct < 50
          ? { id: 'battery', status: 'warn', Icon: BatteryMedium, title: `Batterie ${pct} %`, detail: 'Ça peut ne pas suffire pour un long culte : pensez au chargeur.' }
          : { id: 'battery', status: 'ok', Icon: BatteryMedium, title: `Batterie ${pct} %`, detail: 'Suffisant pour le culte.' });
  }
  const caches = Object.entries(p.tvCache);
  if (caches.length) {
    const err = caches.filter(([, c]) => c.error);
    const pending = caches.filter(([, c]) => !c.error && c.percent < 100);
    out.push(err.length
      ? { id: 'video', status: 'bad', Icon: Film, title: 'Une vidéo n\'a pas pu être copiée', detail: 'Onglet Vidéo : relancez « Préparer avant le culte ».' }
      : pending.length
        ? { id: 'video', status: 'warn', Icon: Film, title: 'Vidéos en cours de copie', detail: `${Math.round(pending.reduce((a, [, c]) => a + c.percent, 0) / pending.length)} % — laissez les TV allumées.` }
        : { id: 'video', status: 'ok', Icon: Film, title: 'Vidéos copiées sur les TV', detail: 'Elles démarreront sans attente.' });
  }
  const items = p.queue.filter(q => q.type !== 'section');
  if (!items.length) {
    out.push({ id: 'deroule', status: 'info', Icon: LayoutList, title: 'Déroulé vide', detail: 'Touchez le nom du culte, à droite, pour partir d\'un modèle.' });
  } else {
    const empty = items.filter(q => q.type === 'slide' && q.slide && slideNeedsFilling(q.slide));
    out.push(empty.length
      ? { id: 'deroule', status: 'warn', Icon: LayoutList, title: `${empty.length} slide${empty.length > 1 ? 's' : ''} encore à remplir`, detail: empty.slice(0, 4).map(q => q.slide!.label || q.slide!.title || 'Slide').join(' · ') + (empty.length > 4 ? '…' : '') }
      : { id: 'deroule', status: 'ok', Icon: LayoutList, title: `Déroulé prêt : ${items.length} élément${items.length > 1 ? 's' : ''}`, detail: 'Toutes les slides sont remplies.' });
  }
  out.push(p.keepScreenOn
    ? { id: 'screen', status: 'ok', Icon: MonitorSmartphone, title: 'L\'écran de la tablette reste allumé', detail: 'Il ne se mettra pas en veille pendant le culte.' }
    : { id: 'screen', status: 'warn', Icon: MonitorSmartphone, title: 'L\'écran de la tablette peut se mettre en veille', detail: 'Activez « Garder l\'écran allumé » ci-dessous.' });
  return out;
}

export function worstStatus(checks: Check[]): CheckStatus {
  if (checks.some(c => c.status === 'bad')) return 'bad';
  if (checks.some(c => c.status === 'warn')) return 'warn';
  return 'ok';
}

const STATUS_ICON: Record<CheckStatus, { Icon: typeof Tv; cls: string }> = {
  ok: { Icon: CheckCircle2, cls: 'text-emerald-400' },
  warn: { Icon: AlertTriangle, cls: 'text-amber-400' },
  bad: { Icon: XCircle, cls: 'text-red-400' },
  info: { Icon: Info, cls: 'text-sky-400' },
};

export default function PreflightPanel({ input, onClose, onKeepScreenOn, training, onTraining, onGuide }: {
  input: PreflightInput; onClose: () => void; onKeepScreenOn: (v: boolean) => void;
  training: boolean; onTraining: (v: boolean) => void; onGuide: () => void;
}) {
  const checks = runChecks(input);
  const worst = worstStatus(checks);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg glass-panel rounded-2xl shadow-2xl border border-border/50 overflow-hidden animate-fade-in" role="dialog" aria-label="Vérification avant le culte">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <h2 className="text-lg font-bold">Avant le culte</h2>
            <p className={cn('text-xs', worst === 'ok' ? 'text-emerald-400' : worst === 'warn' ? 'text-amber-400' : 'text-red-400')}>
              {worst === 'ok' ? 'Tout est prêt.' : worst === 'warn' ? 'Quelques points à vérifier.' : 'Un problème à régler avant de commencer.'}
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} className="h-11 w-11" aria-label="Fermer"><X className="h-5 w-5" /></Button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-2">
          {checks.map(c => {
            const S = STATUS_ICON[c.status];
            return (
              <div key={c.id} className="flex gap-3 rounded-xl border border-border/40 bg-secondary/30 p-3">
                <c.Icon className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{c.title}</p>
                  <p className="text-xs text-muted-foreground leading-snug">{c.detail}</p>
                  {c.id === 'screen' && !input.keepScreenOn && (
                    <Button size="sm" variant="secondary" className="h-10 mt-2" onClick={() => onKeepScreenOn(true)}>Garder l'écran allumé</Button>
                  )}
                </div>
                <S.Icon className={cn('h-5 w-5 shrink-0', S.cls)} />
              </div>
            );
          })}
        </div>

        <div className="border-t border-border p-4 space-y-2">
          <button onClick={() => onTraining(!training)}
            className={cn('w-full min-h-12 px-3 rounded-xl border text-left flex items-center gap-3', training ? 'border-amber-400/60 bg-amber-500/15' : 'border-border/50 bg-secondary/40')}>
            <GraduationCap className={cn('h-5 w-5 shrink-0', training ? 'text-amber-300' : 'text-muted-foreground')} />
            <span className="flex-1">
              <span className="block text-sm font-semibold">{training ? 'Mode entraînement activé' : 'Mode entraînement'}</span>
              <span className="block text-xs text-muted-foreground">Pour former un bénévole : tout marche sur la tablette, mais rien n'est envoyé aux TV.</span>
            </span>
            <span className={cn('h-6 w-11 rounded-full p-0.5 transition-colors shrink-0', training ? 'bg-amber-400' : 'bg-border')}>
              <span className={cn('block h-5 w-5 rounded-full bg-white transition-transform', training && 'translate-x-5')} />
            </span>
          </button>
          <Button variant="ghost" className="w-full h-11 gap-2 text-muted-foreground" onClick={onGuide}>
            <Compass className="h-4 w-4" /> Revoir le guide de prise en main
          </Button>
        </div>
      </div>
    </div>
  );
}
