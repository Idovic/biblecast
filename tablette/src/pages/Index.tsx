/* Page principale — Mode Présentateur */
import { useState, useEffect, useCallback, useRef, useMemo, useReducer } from 'react';
import { Monitor, BookOpen, Image, Layout, Settings, MonitorOff, Film, Presentation, Mic, Square, Layers, Clock } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BibleSearch, { type BibleNavState } from '@/components/BibleSearch';
import PreviewPanel from '@/components/PreviewPanel';
import QueuePanel from '@/components/QueuePanel';
import GalleryPanel from '@/components/GalleryPanel';
import SlidesEditor from '@/components/SlidesEditor';
import SettingsPanel, { loadSettings, saveSettings, type ChurchSettings } from '@/components/SettingsPanel';
import CastButton from '@/components/CastButton';
import SplashScreen from '@/components/SplashScreen';
import { VideoPanel } from '@/components/VideoPanel';
import PresentationPanel, { loadAllPresentationMeta, PRES_META_KEY } from '@/components/PresentationPanel';
import { useBroadcastSender, useControlReceiver, getLastTheme, getLastDisplay } from '@/hooks/useBroadcastChannel';
import { useLocalServer } from '@/hooks/useLocalServer';
import { loadBible, loadBDS, stepVerse, passagePages, getParallelVerse, formatReference, getVerse, parseReference } from '@/lib/bible';
import { cn, genId } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { BibleData, VerseReference, CustomSlide, QueueItem, DisplayTheme, DisplayMessage, PresentationMeta, TvVideoStatus, TvRole, TvDiag } from '@/types/bible';
import type { SceneContentData, StageOverlay } from '@/components/scene/Scene';
import { archiveProjection } from '@/components/HistoryArchive';
import { applyFontVars } from '@/lib/fonts';
import SlideEditPanel from '@/components/SlideEditPanel';
import SermonPanel from '@/components/SermonPanel';
import DictionaryPanel from '@/components/DictionaryPanel';
import { useSermon } from '@/hooks/useSermon';
import { loadVersion } from '@/lib/versions';
import { insertIntoSection, moveItem, sectionOf, upsertProgramme, loadCurrentMeta, saveCurrentMeta, type ProgrammeMeta } from '@/lib/deroule';

const QUEUE_KEY = 'biblecast:queue';
const MODE_KEY = 'biblecast:mode';
const ROLES_KEY = 'biblecast:roles';

function msgToScene(msg: DisplayMessage | null, id: number): SceneContentData {
  if (msg?.type === 'show-verse' && msg.verse) return { id, kind: 'verse', verse: msg.verse };
  if (msg?.type === 'show-dual-verse' && msg.verse) return { id, kind: 'dual-verse', verse: msg.verse, verse2: msg.verse2 ?? null };
  if (msg?.type === 'show-slide' && msg.slide) return { id, kind: 'slide', slide: msg.slide };
  return { id, kind: 'empty' };
}
function itemToScene(item: QueueItem | undefined, id: number): SceneContentData | null {
  if (!item) return null;
  if (item.type === 'verse' && item.verse) return { id, kind: 'verse', verse: item.verse };
  if (item.type === 'slide' && item.slide) return { id, kind: 'slide', slide: item.slide };
  return null;
}
const CONTENT_TYPES: DisplayMessage['type'][] = ['show-verse', 'show-dual-verse', 'show-slide', 'clear'];
/** Liste point par point : la slide part avec 0 point visible, chaque « Suivant » en ajoute un */
const prepSlide = (s: CustomSlide): CustomSlide => (s.revealBullets && s.slideType === 'bullet-list' ? { ...s, revealed: 0 } : s);

function ColResizeHandle() {
  const [dragging, setDragging] = useState(false);
  return (
    <PanelResizeHandle
      onDragging={setDragging}
      className={cn(
        'group relative flex-shrink-0 flex items-center justify-center cursor-col-resize transition-colors z-10',
        'w-[6px]',
        dragging ? 'bg-primary/10' : 'bg-transparent hover:bg-primary/[0.07]'
      )}
    >
      <div
        className={cn(
          'absolute inset-y-0 left-1/2 -translate-x-1/2 w-px transition-all duration-150',
          dragging ? 'bg-primary/70' : 'bg-border group-hover:bg-primary/50'
        )}
      />
      <div
        className={cn(
          'relative z-10 flex flex-col gap-[3px] transition-opacity duration-150',
          dragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
      >
        {[0, 1, 2, 3, 4].map(i => (
          <span
            key={i}
            className={cn(
              'block w-1 h-1 rounded-full transition-colors',
              dragging ? 'bg-primary' : 'bg-primary/60'
            )}
          />
        ))}
      </div>
    </PanelResizeHandle>
  );
}

const INITIAL_NAV: BibleNavState = { view: 'books', selectedBook: null, selectedChapter: null, searchQuery: '', alphaFilter: null };

export default function Index() {
  const [bible, setBible] = useState<BibleData | null>(null);
  const [bible2, setBible2] = useState<BibleData | null>(null);
  const [bibleLoading, setBibleLoading] = useState(true);
  const [bibleNavState, setBibleNavState] = useState<BibleNavState>(INITIAL_NAV);
  // Onglet Bible : versets ou dictionnaire biblique
  const [bibleMode, setBibleMode] = useState<'versets' | 'dico'>('versets');
  const [selectedVerse, setSelectedVerse] = useState<VerseReference | null>(null);
  const [selectedVerse2, setSelectedVerse2] = useState<VerseReference | null>(null);
  const [selectedSlide, setSelectedSlide] = useState<CustomSlide | null>(null);
  const [projectedVerse, setProjectedVerse] = useState<VerseReference | null>(null);
  const [projectedSlide, setProjectedSlide] = useState<CustomSlide | null>(null);
  // Programme du culte : sauvegardé, il survit à la fermeture de l'app
  const [queue, setQueue] = useState<QueueItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
    catch { return []; }
  });
  const [history, setHistory] = useState<QueueItem[]>([]);
  const [slides, setSlides] = useState<CustomSlide[]>(() => {
    try { return JSON.parse(localStorage.getItem('biblecast:slides') || '[]'); }
    catch { return []; }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [currentTimelineId, setCurrentTimelineId] = useState<string | null>(null);
  // Déroulé du culte : nom, moment actif (où vont les ajouts), enregistrement automatique
  const [programme, setProgramme] = useState<ProgrammeMeta>(loadCurrentMeta);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [programmeSaved, setProgrammeSaved] = useState(true);
  // Slide ouverte dans l'éditeur en grand (bibliothèque ou élément du déroulé)
  const [editTarget, setEditTarget] = useState<{ kind: 'library' | 'queue'; id: string } | null>(null);
  const [tickerText, setTickerText] = useState('');
  const [settings, setSettings] = useState<ChurchSettings>(loadSettings);
  const [theme, setTheme] = useState<DisplayTheme>(() => {
    const saved = getLastTheme();
    return saved ?? {
      name: 'Noir classique',
      className: 'theme-noir-classique',
      fontSize: 'large',
      fontFamily: 'serif',
      bgOpacity: 1,
      verseBackgroundAnimated: 'aurore',
    };
  });
  const autoAdvanceRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastProjectionTimeRef = useRef<number>(Date.now());
  const timelineNextRef = useRef<() => void>(() => {});
  const timelinePrevRef = useRef<() => void>(() => {});

  // ── Présentations (PDF / images) ──────────────────────────────────────────
  const [presentations, setPresentations] = useState<PresentationMeta[]>(loadAllPresentationMeta);
  // Position "curseur" — survit aux changements d'onglet
  const [activePresentationId, setActivePresentationId] = useState<string | null>(null);
  const [activePresentationPage, setActivePresentationPage] = useState(0);
  // Ce qui est actuellement sur l'écran TV
  const [projectedPresentationId, setProjectedPresentationId] = useState<string | null>(null);
  const [projectedPresentationPage, setProjectedPresentationPage] = useState(0);

  // ── Messages des TV : télécommande (suivant / précédent) et état vidéo ──
  const [tvVideo, setTvVideo] = useState<TvVideoStatus | null>(null);
  // Copie des vidéos sur chaque TV : { tvId: { url, percent, error } }
  const [tvCache, setTvCache] = useState<Record<string, { url?: string; percent: number; error?: string }>>({});
  // Diagnostic de chaque TV (fluidité, mémoire, effets riches)
  const [tvDiag, setTvDiag] = useState<Record<string, TvDiag>>({});
  const handleTvMessage = useCallback((msg: DisplayMessage) => {
    if (msg.type === 'tv-status' && msg.diag && msg.tvId) { const d = msg.diag; setTvDiag(x => ({ ...x, [msg.tvId!]: d })); return; }
    if (msg.type === 'request-next') timelineNextRef.current();
    else if (msg.type === 'request-prev') timelinePrevRef.current();
    else if (msg.type === 'tv-status' && msg.video) {
      const v = msg.video;
      if (v.state === 'cache' || v.state === 'cached' || (v.state === 'error' && v.percent !== undefined)) {
        const id = msg.tvId || '?';
        setTvCache(c => ({ ...c, [id]: { url: v.url, percent: v.state === 'cached' ? 100 : v.percent ?? 0, error: v.state === 'error' ? v.error : undefined } }));
      } else setTvVideo(v);
    }
  }, []);
  const localServer = useLocalServer(handleTvMessage);
  const rawSend = useBroadcastSender(undefined, localServer.sendToWs);

  // ── Mode de la régie, NOIR / LOGO / FOND SEUL, rôle de chaque TV ──
  const [uiMode, setUiMode] = useState<'preparer' | 'direct'>(() => {
    try { return (localStorage.getItem(MODE_KEY) as 'preparer' | 'direct') || 'preparer'; } catch { return 'preparer'; }
  });
  useEffect(() => { try { localStorage.setItem(MODE_KEY, uiMode); } catch { /* ignore */ } }, [uiMode]);
  const [overlay, setOverlayState] = useState<StageOverlay>('none');
  const overlayRef = useRef<StageOverlay>('none');
  // Noms donnés aux TV (Salle, Entrée…)
  const [tvNames, setTvNames] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('biblecast:tvnames') || '{}'); } catch { return {}; }
  });
  const handleRenameTv = useCallback((id: string, name: string) => {
    setTvNames(prev => {
      const next = { ...prev }; if (name) next[id] = name; else delete next[id];
      try { localStorage.setItem('biblecast:tvnames', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);
  const [roles, setRoles] = useState<Record<string, TvRole>>(() => {
    try { return JSON.parse(localStorage.getItem(ROLES_KEY) || '{}'); } catch { return {}; }
  });

  // ── État complet : ce que chaque TV reçoit dès sa (re)connexion ──
  const currentRef = useRef<DisplayMessage | null>(getLastDisplay());
  const beforeVideoRef = useRef<DisplayMessage | null>(null);
  const tickerRef = useRef('');
  // Onde décorative : allumée à la main (reste) ou par un élément du déroulé (s'éteint après)
  const [waveOn, setWaveOn] = useState(false);
  const waveRef = useRef(false);
  const waveAutoRef = useRef(false);
  const waveIntentRef = useRef<boolean | null>(null);
  const [stateVersion, bumpState] = useReducer((x: number) => x + 1, 0);
  // ── Envoi ciblé : « Envoyer à » une seule TV ; revient tout seul sur « Toutes » après un envoi ──
  const [targetTv, setTargetTvState] = useState<string | null>(null);
  const targetTvRef = useRef<string | null>(null);
  const setTargetTv = useCallback((id: string | null) => { targetTvRef.current = id; setTargetTvState(id); }, []);
  const currentByTvRef = useRef<Record<string, DisplayMessage>>({});
  const overlayByTvRef = useRef<Record<string, StageOverlay>>({});
  const tickerByTvRef = useRef<Record<string, string>>({});
  const beforeVideoByTvRef = useRef<Record<string, DisplayMessage | null>>({});

  const send = useCallback((msg: DisplayMessage) => {
    const isContent = CONTENT_TYPES.includes(msg.type);
    const targetable = isContent || msg.type === 'video-play' || msg.type === 'video-control' || msg.type === 'ticker';
    const tv = targetable ? targetTvRef.current : null;
    if (isContent || msg.type === 'video-play') archiveProjection(msg);

    if (tv) {
      waveIntentRef.current = null;
      // Une seule TV : son état est gardé à part, les autres ne bougent pas
      const out: DisplayMessage = { ...msg, target: [tv] };
      if (isContent || msg.type === 'video-play') {
        if ((overlayByTvRef.current[tv] ?? overlayRef.current) !== 'none' && msg.type !== 'clear') {
          overlayByTvRef.current[tv] = 'none';
          rawSend({ type: 'overlay', overlay: 'none', target: [tv] });
        }
        if (msg.type === 'video-play') {
          const prev = currentByTvRef.current[tv] ?? currentRef.current;
          if (prev?.type !== 'video-play') beforeVideoByTvRef.current[tv] = prev;
        }
        currentByTvRef.current[tv] = msg;
        if (msg.type === 'video-play') setTvVideo(null);
        setTargetTv(null); // retour automatique sur « Toutes »
      } else if (msg.type === 'video-control' && msg.videoAction === 'stop') {
        const back = beforeVideoByTvRef.current[tv];
        if (back) currentByTvRef.current[tv] = back; else delete currentByTvRef.current[tv];
      } else if (msg.type === 'ticker') {
        tickerByTvRef.current[tv] = msg.tickerText ?? '';
        setTargetTv(null);
      }
      bumpState();
      rawSend(out);
      return;
    }

    if (isContent || msg.type === 'video-play') {
      // Projeter du contenu enlève l'écran noir / le logo, et toutes les TV repartent ensemble
      if (msg.type !== 'clear' && (overlayRef.current !== 'none' || Object.keys(overlayByTvRef.current).length)) {
        overlayRef.current = 'none'; setOverlayState('none'); overlayByTvRef.current = {};
        rawSend({ type: 'overlay', overlay: 'none' });
      }
    }
    if (isContent || msg.type === 'video-play') {
      // Onde : un élément du déroulé « avec onde » l'allume ; tout autre contenu éteint l'onde automatique
      const want = waveIntentRef.current; waveIntentRef.current = null;
      if (want && !waveRef.current) { waveRef.current = true; waveAutoRef.current = true; setWaveOn(true); rawSend({ type: 'wave', wave: true }); }
      else if (!want && waveRef.current && waveAutoRef.current) { waveRef.current = false; waveAutoRef.current = false; setWaveOn(false); rawSend({ type: 'wave', wave: false }); }
    }
    if (isContent) {
      currentRef.current = msg; beforeVideoRef.current = null; currentByTvRef.current = {}; bumpState();
    } else if (msg.type === 'video-play') {
      if (currentRef.current?.type !== 'video-play') beforeVideoRef.current = currentRef.current;
      currentRef.current = msg; currentByTvRef.current = {}; setTvVideo(null); bumpState();
    } else if (msg.type === 'video-control' && msg.videoAction === 'stop') {
      currentRef.current = beforeVideoRef.current; beforeVideoRef.current = null; bumpState();
    } else if (msg.type === 'ticker') {
      tickerRef.current = msg.tickerText ?? ''; tickerByTvRef.current = {}; bumpState();
    }
    rawSend(msg);
  }, [rawSend, setTargetTv]);
  const { toast } = useToast();

  useEffect(() => {
    setBibleLoading(true);
    loadBible()
      .then(data => {
        setBible(data);
        setBibleLoading(false);
      })
      .catch(err => {
        console.error(err);
        setBibleLoading(false);
      });
  }, []);

  // 2e version : Darby
  useEffect(() => {
    let alive = true;
    loadVersion(settings.bible2Version || 'Darby').then(d => { if (alive) setBible2(d && Object.keys(d).length ? d : null); });
    return () => { alive = false; };
  }, [settings.bible2Version]);

  useEffect(() => {
    send({ type: 'theme-change', theme: { ...theme, churchLogo: settings.churchLogo || undefined } });
  }, [theme, settings.churchLogo, send]);

  // Mémoire pleine : on prévient au lieu de planter l'application
  const storageWarnedRef = useRef(false);
  useEffect(() => {
    try {
      localStorage.setItem('biblecast:slides', JSON.stringify(slides));
      storageWarnedRef.current = false;
    } catch {
      if (!storageWarnedRef.current) {
        storageWarnedRef.current = true;
        toast({ title: 'Mémoire de la tablette pleine', description: 'Les dernières slides ne sont pas enregistrées. Supprimez des slides avec image ou d\'anciens programmes.', variant: 'destructive', duration: 8000 });
      }
    }
  }, [slides, toast]);

  useEffect(() => {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch { /* stockage plein */ }
  }, [queue]);

  // Le déroulé s'enregistre tout seul sous son nom
  useEffect(() => {
    saveCurrentMeta(programme);
    if (queue.length === 0) { setProgrammeSaved(true); return; }
    setProgrammeSaved(false);
    const t = setTimeout(() => setProgrammeSaved(upsertProgramme(programme, queue)), 700);
    return () => clearTimeout(t);
  }, [queue, programme]);
  // Un moment supprimé ne peut plus recevoir les ajouts
  useEffect(() => {
    if (activeSectionId && !queue.some(q => q.id === activeSectionId)) setActiveSectionId(null);
  }, [queue, activeSectionId]);

  // Polices choisies → moteur de scène (aperçus)
  useEffect(() => { applyFontVars(settings); }, [settings.fontSerif, settings.fontSans]);

  // Réglages d'affichage → TV (avant : la TV ne voyait pas les réglages de la tablette)
  const settingsJson = useMemo(() => JSON.stringify(settings), [settings]);
  useEffect(() => {
    rawSend({ type: 'settings', settings: JSON.parse(settingsJson) });
    bumpState();
  }, [settingsJson, rawSend]);

  const handleOverlay = useCallback((o: StageOverlay) => {
    const tv = targetTvRef.current;
    if (tv) {
      // NOIR / LOGO / FOND SEUL sur une seule TV ; le sélecteur revient sur « Toutes »
      overlayByTvRef.current[tv] = o;
      rawSend({ type: 'overlay', overlay: o, target: [tv] });
      setTargetTv(null);
    } else {
      overlayRef.current = o; setOverlayState(o); overlayByTvRef.current = {};
      rawSend({ type: 'overlay', overlay: o });
    }
    bumpState();
  }, [rawSend, setTargetTv]);

  const handleRoleChange = useCallback((tvId: string, role: TvRole) => {
    setRoles(prev => {
      const next = { ...prev, [tvId]: role };
      try { localStorage.setItem(ROLES_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      rawSend({ type: 'roles', roles: next });
      return next;
    });
    bumpState();
  }, [rawSend]);

  // Programme envoyé aux TV : elles peuvent le dérouler seules si la tablette s'éteint
  useEffect(() => {
    rawSend({ type: 'queue-update', queue });
    bumpState();
  }, [queue, rawSend]);

  useEffect(() => {
    localServer.setState({
      type: 'state',
      protocol: 2,
      overlay: overlayRef.current,
      roles,
      queue,
      theme: { ...theme, churchLogo: settings.churchLogo || undefined },
      settings: JSON.parse(settingsJson),
      current: currentRef.current,
      tickerText: tickerRef.current,
      wave: waveRef.current,
      currentByTv: currentByTvRef.current,
      overlayByTv: overlayByTvRef.current,
      tickerByTv: tickerByTvRef.current,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateVersion, theme, settingsJson, roles, localServer.isServerRunning, localServer.setState]);

  // Sync horloge TV — envoie le timestamp de la tablette toutes les 5 secondes
  useEffect(() => {
    const syncTime = () => send({ type: 'time-sync', timestamp: Date.now() });
    syncTime(); // immédiatement au démarrage
    const id = setInterval(syncTime, 5_000);
    return () => clearInterval(id);
  }, [send]);

  useEffect(() => {
    const interval = setInterval(() => setSettings(loadSettings()), 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!settings.keepScreenOn) return;
    let wakeLock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch { }
    };
    acquire();
    const onVisChange = () => { if (document.visibilityState === 'visible') acquire(); };
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisChange);
      wakeLock?.release().catch(() => {});
    };
  }, [settings.keepScreenOn]);

  useEffect(() => {
    if (!settings.autoSleep) return;
    const check = setInterval(() => {
      const elapsedMin = (Date.now() - lastProjectionTimeRef.current) / 60000;
      if (elapsedMin >= settings.autoSleepDelay) {
        send({ type: 'clear' });
        lastProjectionTimeRef.current = Date.now();
      }
    }, 30000);
    return () => clearInterval(check);
  }, [settings.autoSleep, settings.autoSleepDelay, send]);

  const handleSelectVerse = useCallback((verse: VerseReference) => {
    setSelectedVerse(verse);
    setSelectedSlide(null);
  }, []);

  const handleSelectVerse2 = useCallback((verse: VerseReference | null) => {
    setSelectedVerse2(verse);
  }, []);

  const handleSelectSlide = useCallback((slide: CustomSlide | null) => {
    setSelectedSlide(slide);
    if (slide !== null) setSelectedVerse(null);
  }, []);

  // D'où vient ce qui est projeté : la Bible (▶ = verset suivant), un passage (▶ = écran suivant) ou le déroulé
  const sourceRef = useRef<'bible' | 'timeline' | null>(null);
  const passageRef = useRef<{ pages: VerseReference[]; index: number } | null>(null);

  const handleProjectVerse = useCallback((verse: VerseReference, forced2?: VerseReference | null) => {
    // Double version : le parallèle est recalculé pour CE verset (pas celui touché avant) ;
    // forced2 = version comparée choisie dans la recherche « toutes les versions »
    const v2 = forced2 ?? (selectedVerse2 && bible2 ? getParallelVerse(bible2, verse) : null);
    if (v2) {
      send({ type: 'show-dual-verse', verse, verse2: v2 });
      setSelectedVerse2(v2);
    } else {
      send({ type: 'show-verse', verse });
    }
    sourceRef.current = 'bible'; passageRef.current = null;
    setSelectedVerse(verse);
    setSelectedSlide(null);
    setProjectedVerse(verse);
    setProjectedSlide(null);
    const item: QueueItem = { id: genId(), type: 'verse', verse };
    setHistory(prev => [item, ...prev]);
    toast({
      title: `${verse.book} ${verse.chapter}:${verse.verse}`,
      description: 'Projeté sur l\'écran',
      duration: 1800,
    });
  }, [send, toast, selectedVerse2, bible2]);

  /** Passage entier (« Romains 8:28-39 ») : découpé en écrans, ▶ passe à l'écran suivant */
  const handleProjectPassage = useCallback((verses: VerseReference[]) => {
    const pages = passagePages(verses);
    if (!pages.length) return;
    passageRef.current = { pages, index: 0 }; sourceRef.current = 'bible';
    send({ type: 'show-verse', verse: pages[0] });
    setSelectedVerse(pages[0]); setSelectedVerse2(null); setSelectedSlide(null); setProjectedVerse(pages[0]); setProjectedSlide(null);
    lastProjectionTimeRef.current = Date.now();
    toast({ title: formatReference({ ...verses[0], verseEnd: verses[verses.length - 1].verse }), description: `${pages.length} écran${pages.length > 1 ? 's' : ''} — ▶ pour avancer`, duration: 2500 });
  }, [send, toast]);

  /** Lecture suivie : écran suivant du passage, ou verset suivant de la Bible. true si c'était le cas. */
  const stepFollow = useCallback((dir: 1 | -1): boolean => {
    if (targetTvRef.current) return false;
    const pr = passageRef.current;
    if (pr) {
      const i = pr.index + dir;
      if (i >= 0 && i < pr.pages.length) {
        pr.index = i;
        send({ type: 'show-verse', verse: pr.pages[i] });
        setSelectedVerse(pr.pages[i]); setProjectedVerse(pr.pages[i]);
        return true;
      }
      if (dir === 1) return true; // fin du passage : on reste dessus
    }
    const cur = currentRef.current;
    if (sourceRef.current !== 'bible' || !bible || !cur?.verse || (cur.type !== 'show-verse' && cur.type !== 'show-dual-verse')) return false;
    const base = { ...cur.verse, highlights: undefined };
    const next = stepVerse(bible, base, dir);
    if (!next) return true;
    passageRef.current = null;
    if (cur.type === 'show-dual-verse' && bible2) {
      const v2 = getParallelVerse(bible2, next);
      send({ type: 'show-dual-verse', verse: next, verse2: v2 }); setSelectedVerse2(v2);
    } else send({ type: 'show-verse', verse: next });
    setSelectedVerse(next); setProjectedVerse(next);
    lastProjectionTimeRef.current = Date.now();
    return true;
  }, [send, bible, bible2]);

  /** Mot mis en valeur sur la TV (verset en direct) */
  const handleToggleWord = useCallback((index: number) => {
    const cur = currentRef.current;
    if (!cur?.verse || (cur.type !== 'show-verse' && cur.type !== 'show-dual-verse')) return;
    const h = new Set(cur.verse.highlights ?? []);
    if (h.has(index)) h.delete(index); else h.add(index);
    send({ ...cur, target: undefined, verse: { ...cur.verse, highlights: [...h].sort((a, b) => a - b) } });
  }, [send]);

  const handleProjectSlide = useCallback((slide: CustomSlide) => {
    sourceRef.current = null; passageRef.current = null;
    send({ type: 'show-slide', slide: prepSlide(slide) });
    setSelectedSlide(slide);
    setSelectedVerse(null);
    setProjectedSlide(slide);
    setProjectedVerse(null);
    lastProjectionTimeRef.current = Date.now();
    const item: QueueItem = { id: genId(), type: 'slide', slide };
    setHistory(prev => [item, ...prev]);
  }, [send]);

  const handleSendToDisplay = useCallback(() => {
    passageRef.current = null;
    sourceRef.current = selectedVerse ? 'bible' : null;
    if (selectedVerse) {
      if (selectedVerse2) {
        send({ type: 'show-dual-verse', verse: selectedVerse, verse2: selectedVerse2 });
      } else {
        send({ type: 'show-verse', verse: selectedVerse });
      }
      setProjectedVerse(selectedVerse);
      setProjectedSlide(null);
      lastProjectionTimeRef.current = Date.now();
      const item: QueueItem = { id: genId(), type: 'verse', verse: selectedVerse };
      setHistory(prev => [item, ...prev]);
    } else if (selectedSlide) {
      send({ type: 'show-slide', slide: prepSlide(selectedSlide) });
      setProjectedVerse(null);
      setProjectedSlide(selectedSlide);
      lastProjectionTimeRef.current = Date.now();
      const item: QueueItem = { id: genId(), type: 'slide', slide: selectedSlide };
      setHistory(prev => [item, ...prev]);
    }
  }, [selectedVerse, selectedVerse2, selectedSlide, send]);

  // Les ajouts vont dans le moment actif (sinon à la fin)
  const addItems = useCallback((items: QueueItem[]) => {
    setQueue(prev => insertIntoSection(prev, activeSectionId, items));
  }, [activeSectionId]);

  const handleAddToQueue = useCallback(() => {
    if (selectedVerse) addItems([{ id: genId(), type: 'verse', verse: selectedVerse }]);
    else if (selectedSlide) addItems([{ id: genId(), type: 'slide', slide: { ...selectedSlide, revealed: undefined } }]);
  }, [selectedVerse, selectedSlide, addItems]);

  const handleAddMultipleVerses = useCallback((verses: VerseReference[]) => {
    const items: QueueItem[] = verses.map(v => ({
      id: genId(),
      type: 'verse' as const,
      verse: v,
    }));
    addItems(items);
  }, [addItems]);

  const handleClearDisplay = useCallback(() => {
    send({ type: 'clear' });
  }, [send]);

  const handleWave = useCallback((on: boolean) => {
    waveRef.current = on; waveAutoRef.current = false; setWaveOn(on);
    rawSend({ type: 'wave', wave: on });
    bumpState();
  }, [rawSend]);

  const handleWaveSettings = useCallback((patch: Partial<ChurchSettings>) => {
    const next = { ...loadSettings(), ...patch };
    saveSettings(next); setSettings(next);
  }, []);

  const handleTimelineSendItem = useCallback((item: QueueItem) => {
    sourceRef.current = 'timeline'; passageRef.current = null;
    const sec = sectionOf(queue)[item.id];
    waveIntentRef.current = !!(item.wave || (sec && queue.find(q => q.id === sec)?.wave));
    if (item.type === 'verse' && item.verse) {
      send({ type: 'show-verse', verse: item.verse });
      setSelectedVerse(item.verse);
      setSelectedSlide(null);
      setProjectedVerse(item.verse);
      setProjectedSlide(null);
    } else if (item.type === 'slide' && item.slide) {
      send({ type: 'show-slide', slide: prepSlide(item.slide) });
      setSelectedSlide(item.slide);
      setSelectedVerse(null);
      setProjectedVerse(null);
      setProjectedSlide(item.slide);
    }
    lastProjectionTimeRef.current = Date.now();
    setCurrentTimelineId(item.id);
    setHistory(prev => [item, ...prev]);
  }, [send, queue]);

  /** Liste point par point en cours : montre (ou retire) un point. Renvoie true si c'était le cas. */
  const stepReveal = useCallback((dir: 1 | -1): boolean => {
    const cur = currentRef.current;
    if (targetTvRef.current || cur?.type !== 'show-slide' || !cur.slide?.revealBullets) return false;
    const total = (cur.slide.bullets ?? []).filter(Boolean).length;
    const next = (cur.slide.revealed ?? total) + dir;
    if (next < 0 || next > total) return false;
    send({ type: 'show-slide', slide: { ...cur.slide, revealed: next } });
    return true;
  }, [send]);

  const handleTimelineNext = useCallback(() => {
    if (stepReveal(1)) return;
    if (stepFollow(1)) return;
    const nonSection = queue.filter(q => q.type !== 'section');
    if (nonSection.length === 0) return;
    if (!currentTimelineId) {
      handleTimelineSendItem(nonSection[0]);
      return;
    }
    const idx = nonSection.findIndex(q => q.id === currentTimelineId);
    if (idx < nonSection.length - 1) handleTimelineSendItem(nonSection[idx + 1]);
  }, [queue, currentTimelineId, handleTimelineSendItem, stepReveal, stepFollow]);

  const handleTimelinePrev = useCallback(() => {
    if (stepReveal(-1)) return;
    if (stepFollow(-1)) return;
    const nonSection = queue.filter(q => q.type !== 'section');
    if (!currentTimelineId) return;
    const idx = nonSection.findIndex(q => q.id === currentTimelineId);
    if (idx > 0) handleTimelineSendItem(nonSection[idx - 1]);
  }, [queue, currentTimelineId, handleTimelineSendItem, stepReveal, stepFollow]);

  useEffect(() => { timelineNextRef.current = handleTimelineNext; }, [handleTimelineNext]);
  useEffect(() => { timelinePrevRef.current = handleTimelinePrev; }, [handleTimelinePrev]);

  useControlReceiver(useCallback((msg: DisplayMessage) => {
    if (msg.type === 'request-next') handleTimelineNext();
    else if (msg.type === 'request-prev') handleTimelinePrev();
  }, [handleTimelineNext, handleTimelinePrev]));

  useEffect(() => {
    if (autoAdvanceRef.current) clearInterval(autoAdvanceRef.current);
    if (settings.autoAdvance && currentTimelineId) {
      autoAdvanceRef.current = setInterval(() => handleTimelineNext(), settings.autoAdvanceDelay ?? 5000);
    }
    return () => { if (autoAdvanceRef.current) clearInterval(autoAdvanceRef.current); };
  }, [settings.autoAdvance, settings.autoAdvanceDelay, currentTimelineId, handleTimelineNext]);

  const handleRemoveFromQueue = useCallback((id: string) => {
    setQueue(prev => prev.filter(q => q.id !== id));
    if (currentTimelineId === id) setCurrentTimelineId(null);
  }, [currentTimelineId]);

  const handleMoveUp = useCallback((id: string) => {
    setQueue(prev => {
      const i = prev.findIndex(q => q.id === id);
      if (i <= 0) return prev;
      const arr = [...prev];
      [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
      return arr;
    });
  }, []);

  const handleMoveDown = useCallback((id: string) => {
    setQueue(prev => {
      const i = prev.findIndex(q => q.id === id);
      if (i < 0 || i >= prev.length - 1) return prev;
      const arr = [...prev];
      [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      return arr;
    });
  }, []);

  const handleResend = useCallback((item: QueueItem) => {
    if (item.type === 'verse' && item.verse) {
      send({ type: 'show-verse', verse: item.verse });
      setSelectedVerse(item.verse);
      setSelectedSlide(null);
    } else if (item.type === 'slide' && item.slide) {
      send({ type: 'show-slide', slide: prepSlide(item.slide) });
      setSelectedSlide(item.slide);
      setSelectedVerse(null);
    }
  }, [send]);

  const handleSendSlide = useCallback((slide: CustomSlide) => {
    send({ type: 'show-slide', slide: prepSlide(slide) });
    setSelectedSlide(slide);
    setSelectedVerse(null);
    const item: QueueItem = { id: genId(), type: 'slide', slide };
    setHistory(prev => [item, ...prev]);
  }, [send]);

  const handleAddSection = useCallback((name: string, color: string) => {
    const id = genId();
    setQueue(prev => [...prev, { id, type: 'section', sectionName: name, sectionColor: color }]);
    setActiveSectionId(id); // le nouveau moment reçoit les prochains ajouts
  }, []);

  const handleSelectQueueItem = useCallback((item: QueueItem) => {
    if (item.type === 'verse' && item.verse) { setSelectedVerse(item.verse); setSelectedVerse2(null); setSelectedSlide(null); }
    else if (item.type === 'slide' && item.slide) { setSelectedSlide(item.slide); setSelectedVerse(null); }
  }, []);
  const handleMoveAfter = useCallback((id: string, afterId: string) => setQueue(prev => moveItem(prev, id, afterId)), []);
  const handleToggleCollapse = useCallback((id: string) => setQueue(prev => prev.map(q => q.id === id ? { ...q, collapsed: !q.collapsed } : q)), []);
  const handleToggleItemWave = useCallback((id: string) => setQueue(prev => prev.map(q => q.id === id ? { ...q, wave: !q.wave } : q)), []);
  const handleLoadProgramme = useCallback((meta: ProgrammeMeta, items: QueueItem[]) => {
    setProgramme(meta); setQueue(items); setCurrentTimelineId(null); setActiveSectionId(null);
  }, []);
  const handleTicker = useCallback((text: string) => { setTickerText(text); send({ type: 'ticker', tickerText: text }); }, [send]);

  // Éditeur en grand
  const editingSlide: CustomSlide | null = editTarget
    ? (editTarget.kind === 'library' ? slides.find(s => s.id === editTarget.id) : queue.find(q => q.id === editTarget.id)?.slide) ?? null
    : null;
  const handleEditChange = useCallback((s: CustomSlide) => {
    if (!editTarget) return;
    if (editTarget.kind === 'library') setSlides(prev => prev.map(x => x.id === s.id ? s : x));
    else setQueue(prev => prev.map(q => q.id === editTarget.id ? { ...q, slide: s } : q));
    setSelectedSlide(s); setSelectedVerse(null);
  }, [editTarget]);
  const handleEditSplit = useCallback((parts: CustomSlide[]) => {
    if (!editTarget || parts.length < 2) return;
    if (editTarget.kind === 'library') {
      setSlides(prev => { const i = prev.findIndex(x => x.id === parts[0].id); if (i < 0) return prev; const a = [...prev]; a.splice(i, 1, ...parts); return a; });
    } else {
      setQueue(prev => {
        const i = prev.findIndex(q => q.id === editTarget.id); if (i < 0) return prev;
        const a = [...prev];
        a.splice(i, 1, { ...prev[i], slide: parts[0] }, ...parts.slice(1).map(sl => ({ id: genId(), type: 'slide' as const, slide: sl })));
        return a;
      });
    }
    setSelectedSlide(parts[0]);
  }, [editTarget]);
  // Une slide supprimée ferme l'éditeur
  useEffect(() => { if (editTarget && !editingSlide) setEditTarget(null); }, [editTarget, editingSlide]);

  const handleQueueReorder = useCallback((from: number, to: number) => {
    setQueue(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return arr;
    });
  }, []);

  const handleApplyToSlide = useCallback((imageUrl: string) => {
    if (!selectedSlide) return;
    const updated = { ...selectedSlide, backgroundImage: imageUrl, backgroundAnimated: undefined };
    setSlides(prev => prev.map(s => s.id === updated.id ? updated : s));
    setSelectedSlide(updated);
  }, [selectedSlide]);

  const handleApplyVideoToSlide = useCallback((videoUrl: string) => {
    if (!selectedSlide) return;
    const updated = { ...selectedSlide, backgroundVideo: videoUrl };
    setSlides(prev => prev.map(s => s.id === updated.id ? updated : s));
    setSelectedSlide(updated);
  }, [selectedSlide]);

  // Un seul type de fond actif pour les versets : image, vidéo ou fond animé
  const handleSetVerseBackground = useCallback((imageUrl: string | undefined) => {
    setTheme(t => ({ ...t, verseBackgroundImage: imageUrl, ...(imageUrl ? { verseBackgroundAnimated: undefined, verseBackgroundVideo: undefined } : {}) }));
  }, []);

  const handleSetVerseBackgroundVideo = useCallback((videoUrl: string | undefined) => {
    setTheme(t => ({ ...t, verseBackgroundVideo: videoUrl, ...(videoUrl ? { verseBackgroundAnimated: undefined } : {}) }));
  }, []);

  const handleSetVerseAnimated = useCallback((id: string | undefined, colors?: string[]) => {
    setTheme(t => ({ ...t, verseBackgroundAnimated: id, verseBackgroundColors: id ? colors : undefined, ...(id ? { verseBackgroundImage: undefined, verseBackgroundVideo: undefined } : {}) }));
  }, []);

  const handleApplyAnimatedToSlide = useCallback((id: string, colors?: string[]) => {
    if (!selectedSlide) return;
    const updated: CustomSlide = { ...selectedSlide, backgroundAnimated: id, backgroundColors: colors, backgroundImage: undefined, backgroundVideo: undefined };
    setSlides(prev => prev.map(s => s.id === updated.id ? updated : s));
    setSelectedSlide(updated);
  }, [selectedSlide]);

  const handleSetLogo = useCallback((show: boolean) => {
    setTheme(t => ({ ...t, showChurchLogo: show }));
  }, []);

  const handleBible2Imported = useCallback(() => {
    loadBDS().then(data => {
      if (Object.keys(data).length > 0) setBible2(data);
    }).catch(() => {});
  }, []);

  // ── Handlers présentations ─────────────────────────────────────────────────
  /** Projette une page de présentation sur la TV. */
  const handleProjectPresentationPage = useCallback((presentationId: string, page: number, imageUrl: string) => {
    if (!presentationId || !imageUrl) return;
    try {
      const meta = presentations.find(p => p.id === presentationId);
      const slide: CustomSlide = {
        id: `pres-${presentationId}-p${page}`,
        title: meta?.name ?? '',
        content: '',
        slideType: 'image-full',
        backgroundImage: imageUrl,
      };
      send({ type: 'show-slide', slide });
      setProjectedPresentationId(presentationId);
      setProjectedPresentationPage(page);
      setActivePresentationPage(page);
      lastProjectionTimeRef.current = Date.now();
    } catch (err) {
      console.warn('[Pres] Erreur projection:', err);
    }
  }, [send, presentations]);

  /** Met à jour le curseur de navigation (sans forcément projeter). */
  const handlePresentationNavigate = useCallback((
    presentationId: string,
    page: number,
    _project: boolean, // projection déjà gérée par onProjectPage dans PresentationPanel
  ) => {
    setActivePresentationId(presentationId || null);
    setActivePresentationPage(page);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (target.isContentEditable) return;

      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          handleSendToDisplay();
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          handleTimelineNext();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          handleTimelinePrev();
          break;
        case 'Escape':
          e.preventDefault();
          handleClearDisplay();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleSendToDisplay, handleTimelineNext, handleTimelinePrev, handleClearDisplay]);

  // ── Écoute de la prédication ──
  const sermon = useSermon(bible);
  const versesOfRef = useCallback((r: VerseReference): VerseReference[] => {
    if (!bible || !r.verseEnd) return [r];
    const out: VerseReference[] = [];
    for (let v = r.verse; v <= r.verseEnd; v++) { const x = getVerse(bible, r.book, r.chapter, v); if (x) out.push(x); }
    return out;
  }, [bible]);
  // Dictionnaire : aperçu, projection, déroulé, ouverture d'une référence dans la Bible
  const handleDicoAdd = useCallback((sls: CustomSlide[]) => {
    addItems(sls.map(sl => ({ id: genId(), type: 'slide' as const, slide: sl })));
  }, [addItems]);
  const handleDicoOpenRef = useCallback((ref: string) => {
    const r = parseReference(ref);
    if (!r || !bible) return;
    const v = getVerse(bible, r.book, r.chapter, r.verseStart ?? 1);
    setBibleNavState(s => ({ ...s, view: 'verses', selectedBook: r.book, selectedChapter: r.chapter }));
    setBibleMode('versets');
    if (v) { setSelectedVerse(v); setSelectedVerse2(null); setSelectedSlide(null); }
  }, [bible]);
  const handleSermonPreview = useCallback((r: VerseReference) => { setSelectedVerse(r); setSelectedVerse2(null); setSelectedSlide(null); }, []);
  const handleSermonProject = useCallback((r: VerseReference) => {
    if (r.verseEnd) handleProjectPassage(versesOfRef(r)); else handleProjectVerse(r);
  }, [handleProjectPassage, handleProjectVerse, versesOfRef]);
  const handleSermonAdd = useCallback((r: VerseReference) => {
    addItems(versesOfRef(r).map(v => ({ id: genId(), type: 'verse' as const, verse: v })));
    toast({ title: formatReference(r), description: 'Ajouté au déroulé', duration: 1500 });
  }, [addItems, versesOfRef, toast]);

  // ── Scènes pour les aperçus (même moteur que la TV) ──
  const selectedScene = useMemo<SceneContentData | null>(() => {
    if (selectedVerse) return selectedVerse2
      ? { id: 1, kind: 'dual-verse', verse: selectedVerse, verse2: selectedVerse2 }
      : { id: 1, kind: 'verse', verse: selectedVerse };
    if (selectedSlide) return { id: 1, kind: 'slide', slide: selectedSlide };
    return null;
  }, [selectedVerse, selectedVerse2, selectedSlide]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const liveScene = useMemo(() => msgToScene(currentRef.current, stateVersion), [stateVersion]);
  // TV connectées (avec leur nom) ; en navigateur, liste de démonstration pour les tests
  const tvList = useMemo(() => {
    const real = localServer.tvs.filter(t => t.tvId).map((t, i) => ({ id: t.tvId!, name: tvNames[t.tvId!] || t.name || `TV ${i + 1}` }));
    if (real.length || localServer.isNative) return real;
    try { return JSON.parse(localStorage.getItem('biblecast:demo-tvs') || '[]') as { id: string; name: string }[]; } catch { return []; }
  }, [localServer.tvs, localServer.isNative, tvNames]);
  // Quand les TV n'affichent pas la même chose : une vignette par TV
  const perTv = useMemo(() => {
    const differs = Object.keys(currentByTvRef.current).length > 0 || Object.keys(overlayByTvRef.current).length > 0;
    if (!differs) return null;
    return tvList.map(t => ({
      id: t.id, name: t.name,
      content: msgToScene(currentByTvRef.current[t.id] ?? currentRef.current, stateVersion),
      overlay: overlayByTvRef.current[t.id] ?? overlayRef.current,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateVersion, tvList]);
  const nextScene = useMemo(() => {
    const items = queue.filter(q => q.type !== 'section');
    const idx = currentTimelineId ? items.findIndex(q => q.id === currentTimelineId) : -1;
    const item = items[idx + 1];
    const label = item ? (item.type === 'verse' && item.verse ? `${item.verse.book} ${item.verse.chapter}:${item.verse.verse}` : item.slide?.title || 'Slide') : undefined;
    return { content: itemToScene(item, idx + 1), label };
  }, [queue, currentTimelineId]);

  return (
    <>
      <SplashScreen loading={bibleLoading} />

      <div className="h-screen flex flex-col overflow-hidden">
        <header className="h-14 flex items-center px-4 border-b border-border shrink-0 glass-panel">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">BibleCast</h1>
          </div>
          {/* Préparer (avant le culte) / Direct (pendant le culte) */}
          <div className="ml-4 flex rounded-xl bg-secondary/70 p-1 border border-border/50" role="tablist" aria-label="Mode de la régie">
            {([['preparer', 'Préparer'], ['direct', 'Direct']] as const).map(([m, label]) => (
              <button key={m} role="tab" aria-selected={uiMode === m} onClick={() => setUiMode(m)}
                className={cn('h-9 px-4 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors',
                  uiMode === m ? (m === 'direct' ? 'bg-red-600 text-white' : 'bg-primary text-primary-foreground') : 'text-muted-foreground')}>
                {m === 'direct' && <span className={cn('h-2 w-2 rounded-full', uiMode === 'direct' ? 'bg-white animate-pulse' : 'bg-red-500')} />}
                {label}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant={sermon.active ? 'default' : 'ghost'} onClick={() => (sermon.active ? sermon.stop() : sermon.start())}
              className={cn('h-10 px-3 gap-1.5', sermon.active ? 'bg-red-600 hover:bg-red-500 text-white' : 'text-muted-foreground')}
              title="Écouter la prédication et proposer les versets cités">
              <Mic className={cn('h-4 w-4', sermon.active && 'animate-pulse')} />
              <span className="text-sm">{sermon.active ? 'Écoute' : 'Écouter'}</span>
            </Button>
            <CastButton localServer={localServer} roles={roles} onRoleChange={handleRoleChange} tvNames={tvNames} onRename={handleRenameTv} tvDiag={tvDiag} />
            {/* Commandes de direct : agissent tout de suite sur les TV */}
            <div className="flex items-center gap-1 ml-1 pl-2 border-l border-border/60" role="group" aria-label="Commandes de direct">
              {([['black', 'NOIR', Square], ['logo', 'LOGO', Image], ['background', 'FOND SEUL', Layers]] as const).map(([o, label, Icon]) => (
                <button key={o} onClick={() => handleOverlay(overlay === o ? 'none' : o)} aria-pressed={overlay === o}
                  className={cn('h-10 px-3 rounded-lg border text-[13px] font-bold tracking-wide flex items-center gap-1.5 transition-colors',
                    overlay === o ? 'bg-amber-500 text-black border-amber-400 shadow-[0_0_0_3px_rgba(245,158,11,0.25)]' : 'bg-secondary/60 border-border/50 text-foreground hover:bg-secondary')}>
                  <Icon className="h-4 w-4" />{label}
                </button>
              ))}
              <button onClick={handleClearDisplay} title="Écran d'attente : horloge, annonces (Échap)" aria-label="Écran d'attente"
                className="h-10 px-3 rounded-lg border bg-secondary/60 border-border/50 text-foreground hover:bg-secondary text-[13px] font-bold flex items-center gap-1.5">
                <Clock className="h-4 w-4" />Attente
              </button>
            </div>
            <Button
              size="sm" variant="ghost"
              className="h-10 w-10 p-0 text-muted-foreground hover:text-foreground transition-smooth"
              onClick={() => setShowSettings(true)}
              title="Réglages" aria-label="Réglages"
            >
              <Settings className="h-5 w-5" />
            </Button>

          </div>
        </header>

        <PanelGroup direction="horizontal" className="flex-1 overflow-hidden">

          <Panel
            defaultSize={23}
            minSize={14}
            maxSize={45}
            className="flex flex-col glass-panel overflow-hidden"
          >
            <Tabs defaultValue="bible" className="flex flex-col h-full">
              <TabsList className="mx-2 mt-2 bg-secondary/80 backdrop-blur-sm shrink-0 grid grid-cols-5 h-auto p-1 gap-0.5">
                <TabsTrigger value="bible" className="min-w-0 flex-col gap-0.5 px-0.5 py-1.5 text-[11px] leading-none transition-smooth data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                  <BookOpen className="h-4 w-4" /> Bible
                </TabsTrigger>
                <TabsTrigger value="slides" className="min-w-0 flex-col gap-0.5 px-0.5 py-1.5 text-[11px] leading-none transition-smooth data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                  <Layout className="h-4 w-4" /> Slides
                </TabsTrigger>
                <TabsTrigger value="gallery" className="min-w-0 flex-col gap-0.5 px-0.5 py-1.5 text-[11px] leading-none transition-smooth data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                  <Image className="h-4 w-4" /> Galerie
                </TabsTrigger>
                <TabsTrigger value="pres" className="min-w-0 flex-col gap-0.5 px-0.5 py-1.5 text-[11px] leading-none transition-smooth data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                  <Presentation className="h-4 w-4" /> Prés.
                </TabsTrigger>
                <TabsTrigger value="video" className="min-w-0 flex-col gap-0.5 px-0.5 py-1.5 text-[11px] leading-none transition-smooth data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                  <Film className="h-4 w-4" /> Vidéo
                </TabsTrigger>
              </TabsList>

              <TabsContent value="bible" forceMount className="flex-1 mt-0 overflow-hidden flex-col data-[state=active]:flex data-[state=inactive]:hidden">
                <div className="mx-2 mt-2 shrink-0 grid grid-cols-2 rounded-lg bg-secondary/60 p-0.5 border border-border/40" role="tablist" aria-label="Bible ou dictionnaire">
                  {([['versets', 'Versets'], ['dico', 'Dictionnaire']] as const).map(([m, label]) => (
                    <button key={m} role="tab" aria-selected={bibleMode === m} onClick={() => setBibleMode(m)}
                      className={cn('h-9 rounded-md text-xs font-semibold', bibleMode === m ? 'bg-primary/20 text-primary' : 'text-muted-foreground')}>
                      {label}
                    </button>
                  ))}
                </div>
                {bibleMode === 'dico' && (
                  <div className="flex-1 min-h-0">
                    <DictionaryPanel verse={selectedVerse} onPreview={handleSelectSlide} onProject={handleProjectSlide} onAdd={handleDicoAdd} onOpenRef={handleDicoOpenRef} />
                  </div>
                )}
                <div className={cn('flex-1 min-h-0', bibleMode === 'dico' && 'hidden')}>
                <BibleSearch
                  bible={bible}
                  bible2={bible2}
                  bible2Name={settings.bible2Version || 'Darby'}
                  navState={bibleNavState}
                  onNavStateChange={setBibleNavState}
                  onSelectVerse={handleSelectVerse}
                  onSelectVerse2={handleSelectVerse2}
                  onProjectVerse={handleProjectVerse}
                  onAddMultipleVerses={handleAddMultipleVerses}
                  onProjectPassage={handleProjectPassage}
                  currentProjectedVerse={projectedVerse}
                  onVoice={localServer.isNative ? localServer.listen : undefined}
                />
                </div>
              </TabsContent>

              <TabsContent value="slides" forceMount className="flex-1 mt-0 overflow-hidden data-[state=inactive]:hidden">
                <SlidesEditor
                  slides={slides}
                  onChange={setSlides}
                  onProjectSlide={handleProjectSlide}
                  currentProjectedSlide={projectedSlide}
                  onSelectSlide={handleSelectSlide}
                  onEditSlide={(id) => { setEditTarget({ kind: 'library', id }); const sl = slides.find(x => x.id === id); if (sl) handleSelectSlide(sl); }}
                  editingId={editTarget?.kind === 'library' ? editTarget.id : null}
                  theme={theme}
                  settings={settings}
                />
              </TabsContent>

              <TabsContent value="gallery" forceMount className="flex-1 mt-0 overflow-hidden data-[state=inactive]:hidden">
                <GalleryPanel
                  selectedSlide={selectedSlide}
                  theme={theme}
                  onApplyToSlide={handleApplyToSlide}
                  onApplyVideoToSlide={handleApplyVideoToSlide}
                  onSetVerseBackground={handleSetVerseBackground}
                  onSetVerseBackgroundVideo={handleSetVerseBackgroundVideo}
                  onSetLogo={handleSetLogo}
                  onThemeChange={setTheme}
                  isNative={localServer.isNative}
                  onOpenBgVideoPicker={localServer.openBgVideoPicker}
                  onClearBgVideo={localServer.clearBgVideo}
                  onSetVerseAnimated={handleSetVerseAnimated}
                  onApplyAnimatedToSlide={handleApplyAnimatedToSlide}
                />
              </TabsContent>

              <TabsContent value="pres" forceMount className="flex-1 mt-0 overflow-hidden data-[state=inactive]:hidden">
                <PresentationPanel
                  presentations={presentations}
                  onPresentationsChange={setPresentations}
                  activePresentationId={activePresentationId}
                  activePage={activePresentationPage}
                  projectedPresentationId={projectedPresentationId}
                  projectedPage={projectedPresentationPage}
                  onProjectPage={handleProjectPresentationPage}
                  onNavigate={handlePresentationNavigate}
                />
              </TabsContent>

              <TabsContent value="video" forceMount className="flex-1 mt-0 overflow-hidden data-[state=inactive]:hidden">
                <VideoPanel
                  isNative={localServer.isNative}
                  tvStatus={tvVideo}
                  tvCache={tvCache}
                  tvNames={Object.fromEntries(localServer.tvs.map(t => [t.tvId ?? '', t.name ?? 'TV']))}
                  tvCount={localServer.tvs.length}
                  onSend={send}
                  onOpenVideoPicker={localServer.openVideoPicker}
                  onClearVideo={localServer.clearVideo}
                />
              </TabsContent>
            </Tabs>
          </Panel>

          <ColResizeHandle />

          <Panel defaultSize={54} minSize={25} className="flex flex-col overflow-hidden">
            {sermon.active && (
              <div className="shrink-0 max-h-[42%] flex flex-col min-h-0">
                <SermonPanel sermon={sermon} onPreview={handleSermonPreview} onProject={handleSermonProject} onAdd={handleSermonAdd} />
              </div>
            )}
            <div className="flex-1 min-h-0 flex flex-col">
            {editingSlide ? (
              <SlideEditPanel
                slide={editingSlide}
                where={editTarget?.kind === 'queue' ? 'deroule' : 'library'}
                onChange={handleEditChange}
                onSplit={handleEditSplit}
                onClose={() => setEditTarget(null)}
                onProject={handleProjectSlide}
                onAddToDeroule={editTarget?.kind === 'library' ? (sl) => addItems([{ id: genId(), type: 'slide', slide: { ...sl } }]) : undefined}
                theme={theme}
                settings={settings}
                bible={bible}
                bible2={bible2}
              />
            ) : (
            <PreviewPanel
              mode={uiMode}
              selected={selectedScene}
              hasSelection={!!(selectedVerse || selectedSlide)}
              live={liveScene}
              next={nextScene.content}
              nextLabel={nextScene.label}
              onSendToDisplay={handleSendToDisplay}
              onAddToQueue={handleAddToQueue}
              onClearDisplay={handleClearDisplay}
              onPrev={handleTimelinePrev}
              onNext={handleTimelineNext}
              overlay={overlay}
              onOverlay={handleOverlay}
              theme={theme}
              onThemeChange={setTheme}
              settings={settings}
              churchLogo={settings.churchLogo}
              tickerText={tickerText}
              onTicker={handleTicker}
              waveOn={waveOn}
              onWave={handleWave}
              onWaveSettings={handleWaveSettings}
              liveVerse={(currentRef.current?.type === 'show-verse' || currentRef.current?.type === 'show-dual-verse') ? currentRef.current.verse ?? null : null}
              onToggleWord={handleToggleWord}
              tvs={tvList}
              targetTv={targetTv}
              onTargetTv={setTargetTv}
              perTv={perTv}
            />
            )}
            </div>
          </Panel>

          <ColResizeHandle />

          <Panel
            defaultSize={23}
            minSize={14}
            maxSize={40}
            className="flex flex-col glass-panel overflow-hidden"
          >
            <QueuePanel
              queue={queue}
              history={history}
              currentId={currentTimelineId}
              mode={uiMode}
              activeSectionId={activeSectionId}
              onSetActiveSection={setActiveSectionId}
              meta={programme}
              saved={programmeSaved}
              bible={bible}
              onRename={(name) => setProgramme(m => ({ ...m, name }))}
              onLoad={handleLoadProgramme}
              onSelectItem={handleSelectQueueItem}
              onSendItem={handleTimelineSendItem}
              onEditSlide={(item) => { setEditTarget({ kind: 'queue', id: item.id }); if (item.slide) handleSelectSlide(item.slide); }}
              onRemoveFromQueue={handleRemoveFromQueue}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
              onMoveAfter={handleMoveAfter}
              onToggleCollapse={handleToggleCollapse}
              onToggleWave={handleToggleItemWave}
              onResend={handleResend}
              onNext={handleTimelineNext}
              onPrev={handleTimelinePrev}
              onAddSection={handleAddSection}
              theme={theme}
              settings={settings}
            />
          </Panel>

        </PanelGroup>

        {showSettings && (
          <SettingsPanel
            onClose={() => setShowSettings(false)}
            onBible2Imported={handleBible2Imported}
          />
        )}
      </div>
    </>
  );
}
