import { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Pause, Square, Upload, Film, Volume2, SkipBack, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import type { DisplayMessage, TvVideoStatus } from '@/types/bible';

interface VideoPanelProps {
  isNative: boolean;
  onSend?: (msg: DisplayMessage) => void;
  onOpenVideoPicker?: () => Promise<{ videoUrl: string; fileName: string } | null>;
  onClearVideo?: () => Promise<void>;
  /** État renvoyé par la TV (lecture, position, durée, erreur) */
  tvStatus?: TvVideoStatus | null;
  /** Copie de la vidéo sur chaque TV */
  tvCache?: Record<string, { url?: string; percent: number; error?: string }>;
  tvNames?: Record<string, string>;
  tvCount?: number;
}

export function VideoPanel({ isNative, onSend, onOpenVideoPicker, onClearVideo, tvStatus, tvCache = {}, tvNames = {}, tvCount = 0 }: VideoPanelProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);

  const [loop, setLoop] = useState(false);
  const [tvError, setTvError] = useState<string | null>(null);
  const [tvReady, setTvReady] = useState(false);

  // La TV renvoie son état réel : barre de progression, pause, fin, erreur
  useEffect(() => {
    if (!tvStatus || !isSent) return;
    if (tvStatus.duration && tvStatus.duration > 0) setDuration(tvStatus.duration);
    if (typeof tvStatus.position === 'number') setProgress(tvStatus.position);
    if (tvStatus.state === 'playing') { setIsPlaying(true); setTvReady(true); setTvError(null); }
    if (tvStatus.state === 'ready') setTvReady(true);
    if (tvStatus.state === 'paused' || tvStatus.state === 'ended') setIsPlaying(false);
    if (tvStatus.state === 'error') { setIsPlaying(false); setTvError(tvStatus.error || 'Lecture impossible sur la TV'); }
  }, [tvStatus, isSent]);

  // Ref pour aperçu local (non utilisé pour TV mais utile pour feedback UI)
  const previewRef = useRef<HTMLVideoElement>(null);

  // ── Sélection d'une vidéo ─────────────────────────────────────────────
  const handlePickVideo = useCallback(async () => {
    if (!isNative || !onOpenVideoPicker) return;
    setLoading(true);
    const result = await onOpenVideoPicker();
    setLoading(false);
    if (result) {
      setVideoUrl(result.videoUrl);
      setFileName(result.fileName);
      setIsPlaying(false);
      setIsSent(false);
      setProgress(0);
    }
  }, [isNative, onOpenVideoPicker]);

  // ── Web fallback : blob URL local (BroadcastChannel uniquement) ───────
  const handleWebFilePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setFileName(file.name);
    setIsPlaying(false);
    setIsSent(false);
    setProgress(0);
  }, []);

  // ── Envoi vers TV ─────────────────────────────────────────────────────
  const sendPlay = useCallback(() => {
    if (!videoUrl || !onSend) return;
    onSend({ type: 'video-play', videoUrl, videoFileName: fileName ?? undefined, videoLoop: loop });
    setIsPlaying(true);
    setIsSent(true);
    setTvReady(false);
    setTvError(null);
  }, [videoUrl, fileName, onSend, loop]);

  const sendControl = useCallback((action: 'play' | 'pause' | 'stop') => {
    if (!onSend) return;
    onSend({ type: 'video-control', videoAction: action });
    if (action === 'play')  setIsPlaying(true);
    if (action === 'pause') setIsPlaying(false);
    if (action === 'stop')  { setIsPlaying(false); setIsSent(false); setProgress(0); }
  }, [onSend]);

  const sendSeek = useCallback((pos: number) => {
    if (!onSend) return;
    onSend({ type: 'video-control', videoAction: 'seek', videoPosition: pos });
    setProgress(pos);
  }, [onSend]);

  const sendSeekRelative = useCallback((dir: 'forward' | 'backward') => {
    if (!onSend) return;
    onSend({ type: 'video-control', videoAction: dir === 'forward' ? 'seek-forward' : 'seek-backward' });
  }, [onSend]);

  // ── Suppression vidéo ─────────────────────────────────────────────────
  const handleClear = useCallback(async () => {
    sendControl('stop');
    setVideoUrl(null);
    setFileName(null);
    setIsSent(false);
    await onClearVideo?.();
  }, [sendControl, onClearVideo]);

  // ── Formatage temps ───────────────────────────────────────────────────
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      {/* En-tête */}
      <div className="flex items-center gap-2">
        <Film className="w-5 h-5 text-primary" />
        <h2 className="font-semibold text-base">Diffusion Vidéo</h2>
      </div>

      {/* Zone sélection */}
      {!videoUrl ? (
        <div className="flex flex-col items-center justify-center gap-4 flex-1
                        border-2 border-dashed border-border rounded-xl py-10 px-4">
          <Film className="w-12 h-12 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground text-center">
            Sélectionne une vidéo depuis la galerie ou l'espace de stockage
          </p>

          {isNative ? (
            <Button onClick={handlePickVideo} disabled={loading} className="gap-2">
              <Upload className="w-4 h-4" />
              {loading ? 'Ouverture...' : 'Choisir une vidéo'}
            </Button>
          ) : (
            <label className="cursor-pointer">
              <Button asChild variant="outline" className="gap-2">
                <span>
                  <Upload className="w-4 h-4" />
                  Choisir une vidéo
                </span>
              </Button>
              <input
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleWebFilePick}
              />
            </label>
          )}

          <p className="text-xs text-muted-foreground opacity-60 text-center">
            Formats : MP4, WebM, MKV, MOV, AVI
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 flex-1">
          {/* Info fichier */}
          <div className="flex items-start gap-3 bg-muted rounded-lg p-3">
            <Film className="w-8 h-8 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{fileName}</p>
              {isSent && !tvError && (
                <p className={`text-xs mt-0.5 ${tvReady ? 'text-green-500' : 'text-amber-400'}`}>
                  {!tvReady ? 'Chargement sur la TV…' : isPlaying ? 'En lecture sur TV' : 'En pause sur TV'}
                </p>
              )}
              {tvError && (
                <p className="text-xs mt-0.5 text-destructive">Erreur TV : {tvError}</p>
              )}
            </div>
            <Button variant="ghost" size="sm" className="text-xs shrink-0" onClick={handleClear}>
              Changer
            </Button>
          </div>

          {/* Aperçu local masqué — charge les métadonnées pour la durée */}
          {!isNative && videoUrl && (
            <video
              ref={previewRef}
              src={videoUrl}
              className="w-full rounded-lg max-h-40 bg-black"
              controls={false}
              onLoadedMetadata={() => setDuration(previewRef.current?.duration ?? 0)}
              onTimeUpdate={() => setProgress(previewRef.current?.currentTime ?? 0)}
            />
          )}

          {/* Barre de progression (seek) */}
          {isSent && duration > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-10 text-right">
                {formatTime(progress)}
              </span>
              <Slider
                min={0}
                max={duration}
                step={1}
                value={[progress]}
                onValueChange={([v]) => sendSeek(v)}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-10">
                {formatTime(duration)}
              </span>
            </div>
          )}

          {/* Boutons seek ±10s — toujours visibles pendant diffusion */}
          {isSent && (
            <div className="flex gap-2 justify-center">
              <Button variant="outline" size="sm" className="gap-1.5 flex-1"
                      onClick={() => sendSeekRelative('backward')}>
                <SkipBack className="w-4 h-4" />
                -10s
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 flex-1"
                      onClick={() => sendSeekRelative('forward')}>
                +10s
                <SkipForward className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Préparer : copier la vidéo sur chaque TV avant de la lancer */}
          {!isSent && videoUrl && (
            <div className="rounded-lg border border-border/50 bg-secondary/30 p-3 space-y-2">
              <Button variant="outline" className="w-full h-11 gap-2"
                onClick={() => onSend?.({ type: 'video-prefetch', videoUrl })}>
                Préparer sur les TV
              </Button>
              {(() => {
                const key = (u?: string) => (u ?? '').split('?v=')[1] ?? u;
                const entries = Object.entries(tvCache).filter(([, c]) => key(c.url) === key(videoUrl));
                if (entries.length === 0) return (
                  <p className="text-xs text-muted-foreground">Copie la vidéo dans chaque TV : elle démarrera ensuite tout de suite, sans attente.{tvCount === 0 ? ' Aucune TV connectée.' : ''}</p>
                );
                return entries.map(([id, c]) => (
                  <div key={id} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground truncate">{tvNames[id] ?? 'TV'}</span>
                      <span className={c.error ? 'text-destructive' : c.percent >= 100 ? 'text-green-500' : 'text-amber-400'}>
                        {c.error ? 'échec' : c.percent >= 100 ? 'prête' : `${c.percent} %`}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div className={`h-full ${c.percent >= 100 ? 'bg-green-500' : 'bg-amber-400'}`} style={{ width: `${c.percent}%` }} />
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}

          {/* Lecture en boucle (choisie avant l'envoi) */}
          {!isSent && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground px-1">
              <input type="checkbox" checked={loop} onChange={e => setLoop(e.target.checked)} className="h-4 w-4" />
              Lire en boucle
            </label>
          )}

          {/* Boutons de contrôle */}
          <div className="flex gap-2 justify-center mt-auto">
            {!isSent ? (
              <Button className="gap-2 flex-1" onClick={sendPlay}>
                <Play className="w-4 h-4" />
                Diffuser sur TV
              </Button>
            ) : (
              <>
                {isPlaying ? (
                  <Button variant="outline" className="gap-2 flex-1"
                          onClick={() => sendControl('pause')}>
                    <Pause className="w-4 h-4" />
                    Pause
                  </Button>
                ) : (
                  <Button variant="outline" className="gap-2 flex-1"
                          onClick={() => sendControl('play')}>
                    <Play className="w-4 h-4" />
                    Reprendre
                  </Button>
                )}
                <Button variant="destructive" className="gap-2"
                        onClick={() => sendControl('stop')}>
                  <Square className="w-4 h-4" />
                  Arrêter
                </Button>
              </>
            )}
          </div>

          {/* Bouton changer vidéo */}
          {isNative && !isSent && (
            <Button variant="ghost" size="sm" className="gap-2" onClick={handlePickVideo}>
              <Upload className="w-4 h-4" />
              Choisir une autre vidéo
            </Button>
          )}
        </div>
      )}

      {/* Note info */}
      <p className="text-xs text-muted-foreground opacity-60 text-center">
        La TV et la tablette doivent être sur le même réseau WiFi
      </p>
    </div>
  );
}
