/* Bouton « Écrans TV » — état du serveur local et liste des TV connectées.
   Tout passe par le Wi-Fi de l'église : aucune connexion Internet nécessaire. */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Tv, MonitorX, X, RefreshCw, Film, Monitor } from 'lucide-react';
import QRCode from 'react-qr-code';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LocalServerState } from '@/hooks/useLocalServer';
import type { TvRole, TvDiag } from '@/types/bible';

interface CastButtonProps {
  localServer: LocalServerState;
  roles: Record<string, TvRole>;
  onRoleChange: (tvId: string, role: TvRole) => void;
  /** Noms donnés aux TV sur la tablette (Salle, Entrée…) */
  tvNames: Record<string, string>;
  onRename: (tvId: string, name: string) => void;
  /** Diagnostic renvoyé par chaque TV */
  tvDiag: Record<string, TvDiag>;
}

const ROLE_LABELS: { value: TvRole; label: string; hint: string }[] = [
  { value: 'miroir', label: 'Tout afficher', hint: 'versets, slides, vidéos' },
  { value: 'sans-video', label: 'Sans vidéo', hint: 'garde le texte pendant les vidéos' },
  { value: 'horloge', label: 'Écran d\'attente', hint: 'horloge, annonces, compte à rebours' },
];

export default function CastButton({ localServer, roles, onRoleChange, tvNames, onRename, tvDiag }: CastButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const tvCount = localServer.tvs.length;
  const browserUrl = localServer.httpUrl ? `${localServer.httpUrl}/display?local=1` : null;

  const handleRefreshIP = async () => {
    setIsRefreshing(true);
    try { await localServer.refreshIP(); } finally { setIsRefreshing(false); }
  };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setShowModal(true)}
        title={tvCount > 0 ? `${tvCount} écran(s) TV connecté(s)` : 'Aucune TV connectée'}
        className={cn('gap-1.5 transition-smooth h-10 px-3',
          tvCount > 0 ? 'text-green-400' : 'text-amber-400')}
      >
        {tvCount > 0 ? <Tv className="h-5 w-5" /> : <MonitorX className="h-5 w-5" />}
        <span className="text-sm font-medium">{tvCount > 0 ? `${tvCount} TV` : '0 TV'}</span>
        <span className={cn('h-2 w-2 rounded-full', tvCount > 0 ? 'bg-green-400' : 'bg-amber-400 animate-pulse')} />
      </Button>

      {showModal && createPortal(
        <div
          className="fixed inset-0 z-[9999] overflow-y-auto bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="w-full max-w-md glass-panel rounded-2xl border border-border/50 shadow-2xl animate-fade-in">
              <div className="p-6 pb-2 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <Tv className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground text-base">Écrans TV</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Wi-Fi local, sans Internet</p>
                  </div>
                </div>
                <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground p-2" aria-label="Fermer">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="px-6 py-4 space-y-4">
                {/* Serveur */}
                <div className="flex items-center gap-2">
                  <div className={cn('flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm',
                    localServer.isServerRunning
                      ? 'bg-green-500/10 border-green-500/20 text-green-400'
                      : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400')}>
                    <span className={cn('h-2 w-2 rounded-full shrink-0', localServer.isServerRunning ? 'bg-green-400' : 'bg-yellow-400 animate-pulse')} />
                    {localServer.isServerRunning
                      ? <>Diffusion active — {localServer.localIP ?? 'adresse en cours…'}</>
                      : <>Démarrage du serveur local…</>}
                  </div>
                  <button
                    onClick={handleRefreshIP}
                    disabled={isRefreshing}
                    title="Rafraîchir l'adresse IP"
                    className="h-11 w-11 rounded-lg border border-border/40 bg-secondary/60 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0 disabled:opacity-50"
                  >
                    <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
                  </button>
                </div>

                {/* TV connectées */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">TV connectées ({tvCount})</p>
                  {tvCount === 0 && (
                    <div className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                      Aucune TV pour l'instant. Allumez la TV et ouvrez l'app <strong className="text-foreground">BibleCast TV</strong> :
                      elle trouve la tablette toute seule sur le Wi-Fi.
                    </div>
                  )}
                  {localServer.tvs.map((tv, i) => (
                    <div key={(tv.tvId || tv.address || '') + i} className="rounded-lg bg-secondary/50 border border-border/40">
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Tv className="h-5 w-5 text-green-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        {tv.tvId ? (
                          <input aria-label="Nom de la TV" defaultValue={tvNames[tv.tvId] || tv.name || `TV ${i + 1}`}
                            onBlur={e => onRename(tv.tvId!, e.target.value.trim())}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            className="w-full h-10 rounded-md bg-secondary/60 border border-border/50 px-2 text-sm font-medium text-foreground" />
                        ) : <p className="text-sm font-medium text-foreground truncate">{tv.name || `TV ${i + 1}`}</p>}
                        <p className="text-xs text-muted-foreground">
                          {tv.address ?? ''}{tv.appVersion ? ` · app TV ${tv.appVersion}` : ''}
                        </p>
                      </div>
                      {tv.nativeVideo
                        ? <span className="flex items-center gap-1 text-[11px] text-green-400"><Film className="h-3.5 w-3.5" />vidéo native</span>
                        : <span className="text-[11px] text-amber-400">ancienne app TV</span>}
                    </div>
                    {tv.tvId && tvDiag[tv.tvId] && (
                      <p className="px-3 pb-2 text-[11px] text-muted-foreground">
                        Fluidité {tvDiag[tv.tvId].fps} images/s
                        {tvDiag[tv.tvId].memoryMb ? ` · mémoire ${tvDiag[tv.tvId].memoryMb} Mo` : ''}
                        {` · effets riches ${tvDiag[tv.tvId].webgl ? 'possibles' : 'non pris en charge'}`}
                        {` · fonds : ${tvDiag[tv.tvId].quality === 'eco' ? 'éco' : 'riches'}`}
                        {tvDiag[tv.tvId].screen ? ` · écran ${tvDiag[tv.tvId].screen}` : ''}
                      </p>
                    )}
                    {tv.tvId && (
                      <div className="px-3 pb-3">
                        <label htmlFor={`role-${tv.tvId}`} className="text-[11px] text-muted-foreground">Ce que montre cette TV</label>
                        <select id={`role-${tv.tvId}`} value={roles[tv.tvId] ?? 'miroir'}
                          onChange={e => onRoleChange(tv.tvId!, e.target.value as TvRole)}
                          className="mt-1 w-full h-11 rounded-lg bg-secondary border border-border px-3 text-sm">
                          {ROLE_LABELS.map(r => <option key={r.value} value={r.value}>{r.label} — {r.hint}</option>)}
                        </select>
                      </div>
                    )}
                    </div>
                  ))}
                </div>

                {/* Version navigateur (essai sans l'app TV) : ouvrir l'écran dans un onglet */}
                {!localServer.isNative && (
                  <Button variant="secondary" className="w-full h-11 gap-2"
                    onClick={() => window.open(`${import.meta.env.BASE_URL}display`, '_blank')}>
                    <Monitor className="h-4 w-4" /> Ouvrir un écran TV dans un nouvel onglet
                  </Button>
                )}

                {/* Secours : navigateur */}
                {browserUrl && (
                  <details className="rounded-lg bg-secondary/30 border border-border/30 px-3 py-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer py-1 text-sm">Écran sans l'app TV (navigateur)</summary>
                    <div className="mt-3 space-y-3">
                      <div className="bg-white rounded-xl p-3 flex items-center justify-center">
                        <QRCode value={browserUrl} size={160} level="M" style={{ height: 'auto', maxWidth: '160px', width: '100%' }} />
                      </div>
                      <p className="font-mono break-all text-foreground">{browserUrl}</p>
                    </div>
                  </details>
                )}
              </div>

              <div className="px-6 pb-6 pt-2 border-t border-border/40">
                <Button className="w-full btn-gold h-11" onClick={() => setShowModal(false)}>Fermer</Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
