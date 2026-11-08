/* Page d'affichage — écran TV / projecteur.
   Le rendu est fait par le moteur de scène partagé (components/scene) :
   fondus enchaînés à deux calques, fonds animés, texte ajusté à l'écran. */
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBroadcastReceiver, useControlSender, getLastDisplay, getLastTheme } from '@/hooks/useBroadcastChannel';
import { useTvLink } from '@/hooks/useTvLink';
import { WS_PORT } from '@/hooks/useLocalServer';
import type { VerseReference, DisplayTheme, DisplayMessage, TvVideoStatus, QueueItem, TvRole } from '@/types/bible';
import { loadBible, getVerse, getChapters, getVerses, parseReference } from '@/lib/bible';
import { loadSettings, type ChurchSettings } from '@/components/SettingsPanel';
import { Stage, type SceneContentData, type StageOverlay } from '@/components/scene/Scene';
import { applyFontVars } from '@/lib/fonts';
import { shaderSupported } from '@/components/scene/shaders';
import { richAllowed } from '@/components/scene/animated';
import { getDailyVerse, getManualVerse, formatClockTime, formatClockDate } from '@/components/scene/standby';
import { Maximize2, Minimize2 } from 'lucide-react';

/* ── Pont vers le lecteur vidéo natif de l'app TV (window.BibleCastTV) ── */
interface NativeVideoBridge {
  isAvailable(): boolean;
  version?(): string;
  play(url: string, optionsJson: string): void;
  pause(): void;
  resume(): void;
  stop(): void;
  seekTo(seconds: number): void;
  seekBy(seconds: number): void;
  setVolume(volume: number): void;
  prefetch?(url: string): void;
}
declare global {
  interface Window {
    BibleCastTV?: NativeVideoBridge;
    __bcVideoEvent?: (e: TvVideoStatus) => void;
    __bcRemote?: (dir: 'next' | 'prev') => void;
  }
}
function getNativeBridge(): NativeVideoBridge | null {
  try { return window.BibleCastTV && window.BibleCastTV.isAvailable() ? window.BibleCastTV : null; }
  catch { return null; }
}

/** Les adresses de médias contiennent l'IP de la tablette au moment du choix ;
 *  la page étant servie par la tablette, on réutilise son adresse actuelle. */
function absMediaUrl(url: string): string {
  try {
    const u = new URL(url, window.location.href);
    if (u.pathname.startsWith('/video/') && window.location.port === '8090') return window.location.origin + u.pathname + u.search;
    return u.href;
  } catch { return url; }
}

const TRANSPARENT_POSTER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const DEFAULT_THEME: DisplayTheme = {
  name: 'Noir classique', className: 'theme-noir-classique', fontSize: 'large', fontFamily: 'serif', bgOpacity: 1,
  verseBackgroundAnimated: 'aurore',
};

/** Message d'affichage → contenu de scène */
function toContent(msg: DisplayMessage | null | undefined, id: number): SceneContentData | null {
  if (!msg) return null;
  if (msg.type === 'show-verse' && msg.verse) return { id, kind: 'verse', verse: msg.verse };
  if (msg.type === 'show-dual-verse' && msg.verse) return { id, kind: 'dual-verse', verse: msg.verse, verse2: msg.verse2 ?? null };
  if (msg.type === 'show-slide' && msg.slide) return { id, kind: 'slide', slide: msg.slide };
  if (msg.type === 'clear') return { id, kind: 'empty' };
  return null;
}

function itemToMessage(item: QueueItem): DisplayMessage | null {
  if (item.type === 'verse' && item.verse) return { type: 'show-verse', verse: item.verse };
  if (item.type === 'slide' && item.slide) return { type: 'show-slide', slide: item.slide };
  return null;
}

export default function Display() {
  const [searchParams] = useSearchParams();
  const tvId = searchParams.get('tv') || 'navigateur';
  const tvName = searchParams.get('name') || 'Écran';
  const isTvApp = !!searchParams.get('ws');
  const wsParam = searchParams.get('ws')
    ?? (searchParams.get('local') === '1' ? `ws://${window.location.hostname}:${WS_PORT}` : null);

  const idRef = useRef(1);
  const [content, setContentState] = useState<SceneContentData>(() => toContent(getLastDisplay(), 0) ?? { id: 0, kind: 'empty' });
  const [theme, setTheme] = useState<DisplayTheme>(() => getLastTheme() ?? DEFAULT_THEME);
  const [settings, setSettings] = useState<ChurchSettings>(loadSettings);
  useEffect(() => { applyFontVars(settings); }, [settings.fontSerif, settings.fontSans]);
  const [overlay, setOverlay] = useState<StageOverlay>('none');
  const [roles, setRoles] = useState<Record<string, TvRole>>({});
  const role: TvRole = roles[tvId] ?? 'miroir';
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [clockTime, setClockTime] = useState('');
  const [clockDate, setClockDate] = useState('');
  const [nowMs, setNowMs] = useState(Date.now());
  const [verseOfDay, setVerseOfDay] = useState<VerseReference | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [tickerText, setTickerText] = useState('');
  const [wave, setWave] = useState(false);
  const nativeVideoRef = useRef<NativeVideoBridge | null>(getNativeBridge());
  const nativeActiveRef = useRef(false);
  const [webVideoUrl, setWebVideoUrl] = useState<string | null>(null);
  const [webVideoLoop, setWebVideoLoop] = useState(false);
  const [webVideoReady, setWebVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [disconnectedLong, setDisconnectedLong] = useState(false);
  const roleRef = useRef(role); roleRef.current = role;
  const sendToTabletRef = useRef<(msg: Record<string, unknown>) => void>(() => {});
  const connectedRef = useRef(false);
  const queueRef = useRef<QueueItem[]>([]);
  const localIndexRef = useRef(-1);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const sendControl = useControlSender();

  const setContent = useCallback((msg: DisplayMessage | null | undefined) => {
    const c = toContent(msg, idRef.current++);
    if (!c) return;
    // Liste point par point : même slide, un point de plus → pas de fondu de tout l'écran
    const sameVerse = (x?: VerseReference | null, y?: VerseReference | null) => !!x && !!y
      && x.book === y.book && x.chapter === y.chapter && x.verse === y.verse && x.verseEnd === y.verseEnd && x.text === y.text;
    setContentState(prev => {
      // Liste point par point : même slide, un point de plus → pas de fondu de tout l'écran
      if (c.kind === 'slide' && prev.kind === 'slide' && c.slide && prev.slide
        && c.slide.id === prev.slide.id && c.slide.revealBullets && typeof c.slide.revealed === 'number') return { ...c, id: prev.id };
      // Mot mis en valeur : même verset, seule la couleur d'un mot change
      if (c.kind === prev.kind && (c.kind === 'verse' || c.kind === 'dual-verse') && sameVerse(c.verse, prev.verse)
        && (c.kind === 'verse' || sameVerse(c.verse2, prev.verse2))) return { ...c, id: prev.id };
      return c;
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setSettings(loadSettings()), 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const update = () => {
      const now = new Date(Date.now() + clockOffset);
      setNowMs(now.getTime());
      setClockTime(settings.showClock ? formatClockTime(now, !!settings.showClockSeconds) : '');
      setClockDate(settings.showClock && settings.showClockDate ? formatClockDate(now) : '');
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [settings.showClock, settings.showClockSeconds, settings.showClockDate, clockOffset]);

  useEffect(() => {
    if (!settings.showVerseOfDay) { setVerseOfDay(null); return; }
    if (settings.verseOfDayMode === 'manual' && settings.verseOfDayRef) getManualVerse(settings.verseOfDayRef).then(setVerseOfDay);
    else getDailyVerse().then(setVerseOfDay);
  }, [settings.showVerseOfDay, settings.verseOfDayMode, settings.verseOfDayRef]);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);
  useEffect(() => {
    resetControlsTimer();
    document.addEventListener('mousemove', resetControlsTimer);
    document.addEventListener('touchstart', resetControlsTimer);
    return () => {
      document.removeEventListener('mousemove', resetControlsTimer);
      document.removeEventListener('touchstart', resetControlsTimer);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [resetControlsTimer]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  }, []);

  /* ── Vidéo ───────────────────────────────────────────────────────────── */
  const lastProgressRef = useRef(0);
  const reportVideo = useCallback((video: TvVideoStatus) => {
    if (video.state === 'progress') {
      const now = Date.now();
      if (now - lastProgressRef.current < 900) return;
      lastProgressRef.current = now;
    }
    sendToTabletRef.current({ type: 'tv-status', tvId, video });
    if (video.state === 'stopped' || video.state === 'error') nativeActiveRef.current = false;
  }, [tvId]);

  const stopVideo = useCallback(() => {
    if (nativeActiveRef.current && nativeVideoRef.current) {
      nativeVideoRef.current.stop();
      nativeActiveRef.current = false;
    }
    setWebVideoReady(false);
    setTimeout(() => {
      setWebVideoUrl(null);
      if (videoRef.current) { try { videoRef.current.pause(); videoRef.current.removeAttribute('src'); videoRef.current.load(); } catch { /* ignore */ } }
    }, 450);
  }, []);

  const playVideo = useCallback((url: string, loop: boolean) => {
    if (roleRef.current !== 'miroir') return; // TV « sans vidéo » ou « horloge »
    const abs = absMediaUrl(url);
    const bridge = nativeVideoRef.current;
    if (bridge) {
      // Le contenu actuel reste affiché ; le lecteur natif apparaît en fondu à sa 1re image
      nativeActiveRef.current = true;
      bridge.play(abs, JSON.stringify({ loop }));
      return;
    }
    setWebVideoReady(false);
    setWebVideoLoop(loop);
    setWebVideoUrl(abs);
  }, []);

  const controlVideo = useCallback((msg: DisplayMessage) => {
    const bridge = nativeActiveRef.current ? nativeVideoRef.current : null;
    const vid = videoRef.current;
    const a = msg.videoAction;
    if (a === 'stop') { stopVideo(); return; }
    if (bridge) {
      if (a === 'play') bridge.resume();
      if (a === 'pause') bridge.pause();
      if (a === 'seek' && msg.videoPosition != null) bridge.seekTo(msg.videoPosition);
      if (a === 'seek-forward') bridge.seekBy(10);
      if (a === 'seek-backward') bridge.seekBy(-10);
      return;
    }
    if (!vid) return;
    if (a === 'play') vid.play().catch(() => {});
    if (a === 'pause') vid.pause();
    if (a === 'seek' && msg.videoPosition != null) vid.currentTime = msg.videoPosition;
    if (a === 'seek-forward') vid.currentTime = Math.min(vid.duration || Infinity, vid.currentTime + 10);
    if (a === 'seek-backward') vid.currentTime = Math.max(0, vid.currentTime - 10);
  }, [stopVideo]);

  /* Mode secours : tablette absente → la télécommande déroule le programme reçu */
  const stepLocal = useCallback((dir: 'next' | 'prev') => {
    const items = queueRef.current.filter(q => q.type !== 'section');
    if (items.length === 0) return;
    let i = localIndexRef.current + (dir === 'next' ? 1 : -1);
    i = Math.max(0, Math.min(items.length - 1, i));
    localIndexRef.current = i;
    setContent(itemToMessage(items[i]));
  }, [setContent]);

  useEffect(() => {
    window.__bcVideoEvent = (e) => reportVideo(e);
    window.__bcRemote = (dir) => {
      if (connectedRef.current) sendToTabletRef.current({ type: dir === 'next' ? 'request-next' : 'request-prev' });
      else stepLocal(dir);
    };
    return () => { window.__bcVideoEvent = undefined; window.__bcRemote = undefined; };
  }, [reportVideo, stepLocal]);

  const applySettings = useCallback((incoming: Record<string, unknown> | undefined) => {
    if (!incoming) return;
    try {
      const merged = { ...loadSettings(), ...incoming } as ChurchSettings;
      localStorage.setItem('biblecast-settings', JSON.stringify(merged));
      setSettings(merged);
    } catch {
      setSettings(prev => ({ ...prev, ...incoming } as ChurchSettings));
    }
  }, []);

  const handleMessage = useCallback((msg: DisplayMessage) => {
    // Envoi ciblé vers d'autres TV : on l'ignore
    if (msg.target && msg.target.length > 0 && !msg.target.includes(tvId)) return;
    const isContent = msg.type === 'show-verse' || msg.type === 'show-dual-verse' || msg.type === 'show-slide' || msg.type === 'clear';
    if (isContent) {
      stopVideo();
      // TV en rôle « horloge » : reste sur l'écran d'attente
      if (roleRef.current === 'horloge') return;
      setContent(msg);
      return;
    }
    switch (msg.type) {
      case 'state': {
        if (msg.theme) setTheme(msg.theme);
        applySettings(msg.settings);
        // Une TV qui a reçu un envoi ciblé garde son propre contenu
        setTickerText(msg.tickerByTv?.[tvId] ?? msg.tickerText ?? '');
        setWave(!!msg.wave);
        const ov = msg.overlayByTv?.[tvId] ?? msg.overlay;
        if (ov) setOverlay(ov);
        if (msg.roles) setRoles(msg.roles);
        if (msg.queue) queueRef.current = msg.queue;
        const cur = msg.currentByTv?.[tvId] ?? msg.current;
        const r = msg.roles?.[tvId] ?? 'miroir';
        if (cur && cur.type === 'video-play' && cur.videoUrl) { if (r === 'miroir') playVideo(cur.videoUrl, !!cur.videoLoop); }
        else if (cur && r !== 'horloge') setContent(cur);
        break;
      }
      case 'settings': applySettings(msg.settings); break;
      case 'overlay': setOverlay(msg.overlay ?? 'none'); break;
      case 'roles': if (msg.roles) setRoles(msg.roles); break;
      case 'queue-update': if (msg.queue) queueRef.current = msg.queue; break;
      case 'theme-change': if (msg.theme) setTheme(msg.theme); break;
      case 'time-sync': if (msg.timestamp) setClockOffset(msg.timestamp - Date.now()); break;
      case 'ticker': setTickerText(msg.tickerText ?? ''); break;
      case 'wave': setWave(!!msg.wave); break;
      case 'video-play': if (msg.videoUrl) playVideo(msg.videoUrl, !!msg.videoLoop); break;
      case 'video-control': controlVideo(msg); break;
      case 'video-prefetch':
        if (msg.videoUrl && roleRef.current === 'miroir') {
          const b = nativeVideoRef.current;
          if (b?.prefetch) b.prefetch(absMediaUrl(msg.videoUrl));
          else reportVideo({ state: 'cached', url: msg.videoUrl, percent: 100 }); // navigateur : lecture directe
        }
        break;
      default: break;
    }
  }, [stopVideo, playVideo, controlVideo, applySettings, setContent, tvId, reportVideo]);

  // Rôle « horloge » choisi en direct → bascule sur l'écran d'attente
  useEffect(() => {
    if (role === 'horloge') { stopVideo(); setContent({ type: 'clear' }); }
    if (role === 'sans-video') stopVideo();
  }, [role, stopVideo, setContent]);

  useBroadcastReceiver(handleMessage);
  const link = useTvLink(wsParam, {
    tvId, name: tvName,
    nativeVideo: !!nativeVideoRef.current,
    appVersion: nativeVideoRef.current?.version?.() ?? undefined,
  }, handleMessage);
  sendToTabletRef.current = link.send;
  connectedRef.current = link.isConnected;

  // ── Qualité des fonds et diagnostic envoyé à la tablette ──
  const [qualityTick, setQualityTick] = useState(0);
  const fpsRef = useRef(0);
  const sendDiag = useCallback(() => {
    const dpr = window.devicePixelRatio || 1;
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    sendToTabletRef.current({ type: 'tv-status', tvId, diag: {
      fps: fpsRef.current, memoryMb: mem ? Math.round(mem * 1024) : undefined, webgl: shaderSupported(),
      quality: richAllowed(settings.bgQuality) ? 'riche' : 'eco',
      screen: `${Math.round(window.screen.width * dpr)}×${Math.round(window.screen.height * dpr)}`,
    } });
  }, [tvId, settings.bgQuality]);
  // Fluidité de base mesurée au démarrage (3 s), puis à chaque effet riche
  useEffect(() => {
    let raf = 0, frames = 0; const t0 = performance.now();
    const tick = (now: number) => { frames++; if (now - t0 < 3000) raf = requestAnimationFrame(tick); else { if (!fpsRef.current) fpsRef.current = Math.round(frames * 1000 / (now - t0)); sendDiag(); } };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (link.isConnected) sendDiag(); }, [link.isConnected, sendDiag]);
  // Un effet riche qui saccade (moins de 24 images/s) → fonds légers sur cette TV
  const handleBgFps = useCallback((fps: number) => {
    if (fps > 0) fpsRef.current = fps;
    if ((settings.bgQuality ?? 'auto') === 'auto' && fps < 24) {
      try { localStorage.setItem('biblecast:tv-quality', 'eco'); } catch { /* ignore */ }
      setQualityTick(x => x + 1);
    }
    sendDiag();
  }, [settings.bgQuality, sendDiag]);
  // Choix « Automatique » ou « Maximum » refait sur la tablette : on retente les effets riches
  const prevQualityRef = useRef(settings.bgQuality);
  useEffect(() => {
    if (prevQualityRef.current === settings.bgQuality) return;
    prevQualityRef.current = settings.bgQuality;
    if (settings.bgQuality !== 'eco') { try { localStorage.removeItem('biblecast:tv-quality'); } catch { /* ignore */ } }
    setQualityTick(x => x + 1);
  }, [settings.bgQuality]);

  useEffect(() => {
    if (!wsParam || link.status === 'connected' || link.status === 'idle') { setDisconnectedLong(false); return; }
    const t = setTimeout(() => setDisconnectedLong(true), 4000);
    return () => clearTimeout(t);
  }, [wsParam, link.status]);

  // Glisser (écran tactile) = suivant / précédent
  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => { touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
    const onTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
      const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
      touchStartRef.current = null;
      if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
      const msg: DisplayMessage = dx < 0 ? { type: 'request-next' } : { type: 'request-prev' };
      sendControl(msg);
      link.send(msg as unknown as Record<string, unknown>);
    };
    document.addEventListener('touchstart', onTouchStart);
    document.addEventListener('touchend', onTouchEnd);
    return () => { document.removeEventListener('touchstart', onTouchStart); document.removeEventListener('touchend', onTouchEnd); };
  }, [sendControl, link]);

  const extras = useMemo(() => ({ clockTime, clockDate, verseOfDay, now: nowMs }), [clockTime, clockDate, verseOfDay, nowMs]);
  const shownContent: SceneContentData = role === 'horloge' ? { id: -1, kind: 'empty' } : content;

  return (
    <div className="h-screen w-screen overflow-hidden relative bg-black">
      <Stage content={shownContent} theme={theme} settings={settings} extras={extras} overlay={overlay} onBgFps={handleBgFps} qualityTick={qualityTick} wave={wave} waveLift={!!tickerText} />

      {disconnectedLong && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm border"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderColor: 'rgba(251,191,36,0.35)', color: '#fbbf24' }}>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#fbbf24', animation: 'pulse 2s infinite' }} />
          Reconnexion à la tablette…
        </div>
      )}

      {!isTvApp && (
        <button onClick={toggleFullscreen}
          className="fixed bottom-4 left-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm border border-white/20 text-white/60 hover:text-white/90 hover:bg-white/10"
          style={{ opacity: showControls ? 1 : 0, transition: 'opacity 400ms ease', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          {isFullscreen ? 'Quitter' : 'Plein écran'}
        </button>
      )}

      {/* Vidéo (secours navigateur) — invisible jusqu'à la première image, puis fondu */}
      {webVideoUrl && (
        <div className="absolute inset-0 z-30 bg-black flex items-center justify-center"
          style={{ opacity: webVideoReady ? 1 : 0, transition: 'opacity 450ms ease', pointerEvents: 'none' }}>
          <video ref={videoRef} src={webVideoUrl} poster={TRANSPARENT_POSTER}
            className="w-full h-full object-contain" playsInline autoPlay loop={webVideoLoop} controls={false} preload="auto"
            onPlaying={() => { setWebVideoReady(true); reportVideo({ state: 'playing', position: videoRef.current?.currentTime, duration: videoRef.current?.duration }); }}
            onPause={() => reportVideo({ state: 'paused', position: videoRef.current?.currentTime, duration: videoRef.current?.duration })}
            onTimeUpdate={() => reportVideo({ state: 'progress', position: videoRef.current?.currentTime, duration: videoRef.current?.duration })}
            onEnded={() => reportVideo({ state: 'ended' })}
            onError={() => { setWebVideoReady(false); reportVideo({ state: 'error', error: videoRef.current?.error?.message || 'lecture impossible' }); }}
          />
        </div>
      )}

      {/* Bandeau d'annonce défilant */}
      {tickerText && overlay !== 'black' && overlay !== 'logo' && (
        <>
          <style>{`@keyframes bc-ticker { from { transform: translateX(105vw); } to { transform: translateX(-100%); } }`}</style>
          <div className="fixed bottom-0 left-0 right-0 z-50 overflow-hidden" style={{ padding: '1.2vw 0', background: 'linear-gradient(to right, rgba(0,0,0,0.88), rgba(0,0,0,0.75), rgba(0,0,0,0.88))' }}>
            <p style={{
              animation: `bc-ticker ${Math.max(15, Math.round(tickerText.length * 0.09))}s linear infinite`,
              whiteSpace: 'nowrap', color: '#FFD700', fontSize: '2.6vw', fontWeight: 600, letterSpacing: '0.02em', willChange: 'transform',
              fontFamily: "Lato, Roboto, 'Noto Sans', Arial, sans-serif",
            }}>
              ▶&nbsp;&nbsp;{tickerText}&nbsp;&nbsp;◀&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;▶&nbsp;&nbsp;{tickerText}&nbsp;&nbsp;◀
            </p>
          </div>
        </>
      )}
    </div>
  );
}
