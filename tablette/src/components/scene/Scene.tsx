/* Moteur de scène BibleCast — partagé par l'écran TV (Display) et les aperçus
   de la tablette, pour que l'aperçu soit exactement ce que montre la TV.

   Unités : tout est exprimé en « u » = 1 % de la largeur de la scène.
   Une scène de 1920 px et un aperçu de 480 px ont donc la même mise en page. */
import { useEffect, useLayoutEffect, useRef, useState, createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { WaveLayer, type WaveStyle, type WavePosition } from './wave';
import type { CustomSlide, DisplayTheme, VerseReference, SlideType } from '@/types/bible';
import type { ChurchSettings } from '@/components/SettingsPanel';
import { formatReference } from '@/lib/bible';
import { AnimatedBackground, SceneKeyframes, clockDelay } from './animated';

/* ── Types ──────────────────────────────────────────────────────────────── */
export type SceneKind = 'empty' | 'verse' | 'dual-verse' | 'slide';
export interface SceneContentData {
  id: number;
  kind: SceneKind;
  verse?: VerseReference | null;
  verse2?: VerseReference | null;
  slide?: CustomSlide | null;
}
export interface StandbyExtras {
  clockTime?: string;
  clockDate?: string;
  verseOfDay?: VerseReference | null;
  now?: number;
}
export type StageOverlay = 'none' | 'black' | 'logo' | 'background';

export type SceneBg =
  | { key: string; kind: 'image'; url: string; fit: 'cover' | 'contain'; kenBurns: boolean; veil: boolean; blur: boolean }
  | { key: string; kind: 'video'; url: string; veil: boolean }
  | { key: string; kind: 'animated'; id: string; colors?: string[]; veil: boolean }
  | { key: string; kind: 'css'; css: string; veil: boolean };

const DEFAULT_STANDBY = 'linear-gradient(135deg, #1e1b4b 0%, #1c2f6b 40%, #0d1b2a 100%)';
const THEME_BG = 'hsl(var(--display-bg))';

/* ── Polices : uniquement des polices présentes hors ligne ─────────────── */
/** Polices choisies dans les réglages (voir lib/fonts.ts) */
export const SERIF_STACK = 'var(--bc-serif)';
export const SANS_STACK = 'var(--bc-sans)';

/* ── Échelles de texte (en u) ───────────────────────────────────────────── */
const VERSE_MAX: Record<string, number> = { small: 2.8, medium: 3.4, large: 4.0, xlarge: 4.8 };
const SLIDE_TEXT: Record<string, number> = { small: 2.4, medium: 3.0, large: 3.6, xlarge: 4.4 };
const SLIDE_TITLE: Record<string, number> = { small: 3.0, medium: 3.6, large: 4.4, xlarge: 5.2 };

/* ── Fond selon le contenu ──────────────────────────────────────────────── */
export function resolveBackground(c: SceneContentData, theme: DisplayTheme, settings: ChurchSettings): SceneBg {
  const kb = settings.kenBurns !== false;
  const blur = !!settings.displayBgBlur;
  if (c.kind === 'slide' && c.slide) {
    const s = c.slide;
    if (s.slideType === 'image-full' && s.backgroundImage) {
      return { key: 'img-full:' + s.backgroundImage.slice(-64) + s.backgroundImage.length, kind: 'image', url: s.backgroundImage, fit: 'contain', kenBurns: false, veil: false, blur: false };
    }
    if (s.backgroundVideo) return { key: 'vid:' + s.backgroundVideo, kind: 'video', url: s.backgroundVideo, veil: true };
    if (s.backgroundAnimated) return { key: 'anim:' + s.backgroundAnimated + (s.backgroundColors ?? []).join(''), kind: 'animated', id: s.backgroundAnimated, colors: s.backgroundColors, veil: true };
    if (s.backgroundImage) return { key: 'img:' + s.backgroundImage.slice(-64) + s.backgroundImage.length, kind: 'image', url: s.backgroundImage, fit: 'cover', kenBurns: kb, veil: true, blur };
    if (s.backgroundGradient) return { key: 'css:' + s.backgroundGradient, kind: 'css', css: s.backgroundGradient, veil: false };
    if (s.backgroundColor) return { key: 'css:' + s.backgroundColor, kind: 'css', css: s.backgroundColor, veil: false };
  }
  if (c.kind === 'empty') {
    if (settings.standbyBackground) return { key: 'anim:' + settings.standbyBackground + (settings.standbyBackgroundColors ?? []).join(''), kind: 'animated', id: settings.standbyBackground, colors: settings.standbyBackgroundColors, veil: true };
    if (theme.verseBackgroundImage) return { key: 'img:' + theme.verseBackgroundImage.slice(-64), kind: 'image', url: theme.verseBackgroundImage, fit: 'cover', kenBurns: kb, veil: true, blur };
    return { key: 'css:standby', kind: 'css', css: DEFAULT_STANDBY, veil: true };
  }
  if (theme.verseBackgroundVideo) return { key: 'vid:' + theme.verseBackgroundVideo, kind: 'video', url: theme.verseBackgroundVideo, veil: true };
  if (theme.verseBackgroundAnimated) return { key: 'anim:' + theme.verseBackgroundAnimated + (theme.verseBackgroundColors ?? []).join(''), kind: 'animated', id: theme.verseBackgroundAnimated, colors: theme.verseBackgroundColors, veil: true };
  if (theme.verseBackgroundImage) return { key: 'img:' + theme.verseBackgroundImage.slice(-64) + theme.verseBackgroundImage.length, kind: 'image', url: theme.verseBackgroundImage, fit: 'cover', kenBurns: kb, veil: true, blur };
  return { key: 'css:theme:' + theme.className, kind: 'css', css: THEME_BG, veil: false };
}

/* ── Unité de scène ─────────────────────────────────────────────────────── */
const UnitContext = createContext<number>(19.2);
export const useSceneUnit = () => useContext(UnitContext);

/** Racine de scène : mesure sa largeur et fournit l'unité u */
export function SceneRoot({ className, style, children, themeClass }: { className?: string; style?: CSSProperties; children: ReactNode; themeClass?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [u, setU] = useState(19.2);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const update = () => setU(Math.max(1, el.clientWidth / 100));
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener('resize', update);
    return () => { ro?.disconnect(); window.removeEventListener('resize', update); };
  }, []);
  return (
    <UnitContext.Provider value={u}>
      <div ref={ref} className={`relative overflow-hidden ${themeClass ?? ''} ${className ?? ''}`} style={style}>
        <SceneKeyframes />
        {children}
      </div>
    </UnitContext.Provider>
  );
}

/* ── Fond ───────────────────────────────────────────────────────────────── */
const TRANSPARENT_POSTER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function mediaUrl(url: string): string {
  try {
    const u = new URL(url, window.location.href);
    if (u.pathname.startsWith('/video/') && window.location.port === '8090') return window.location.origin + u.pathname + u.search;
    return u.href;
  } catch { return url; }
}

function BgVideoLayer({ url }: { url: string }) {
  const [ready, setReady] = useState(false);
  return (
    <video src={mediaUrl(url)} poster={TRANSPARENT_POSTER} autoPlay loop muted playsInline
      onPlaying={() => setReady(true)}
      className="absolute inset-0 w-full h-full object-cover"
      style={{ pointerEvents: 'none', opacity: ready ? 1 : 0, transition: 'opacity 800ms ease' }} />
  );
}

export function SceneBackground({ bg, still, quality, onFps, paused }: { bg: SceneBg; still?: boolean; quality?: string; onFps?: (fps: number) => void; paused?: boolean }) {
  return (
    <div className={`absolute inset-0${paused ? ' bc-paused' : ''}`} style={{ background: '#000' }}>
      {bg.kind === 'css' && <div className="absolute inset-0" style={{ background: bg.css }} />}
      {bg.kind === 'animated' && <AnimatedBackground id={bg.id} colors={bg.colors} still={still} quality={quality} onFps={onFps} paused={paused} />}
      {bg.kind === 'image' && bg.fit === 'contain' && (
        <div className="absolute inset-0" style={{ backgroundImage: `url(${bg.url})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(28px) brightness(0.55) saturate(1.2)', transform: 'scale(1.15)' }} />
      )}
      {bg.kind === 'image' && (
        <div className="bc-anim absolute inset-0" style={{
          backgroundImage: `url(${bg.url})`, backgroundSize: bg.fit, backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
          filter: bg.blur ? 'blur(8px) brightness(0.8) saturate(1.2)' : undefined,
          animation: bg.kenBurns && !still ? 'bc-kenburns 28s ease-in-out infinite alternate' : undefined,
          animationDelay: bg.kenBurns ? clockDelay(56) : undefined,
          transform: bg.blur ? 'scale(1.08)' : undefined,
          willChange: bg.kenBurns ? 'transform' : undefined,
        }} />
      )}
      {bg.kind === 'video' && (still
        ? <div className="absolute inset-0" style={{ background: DEFAULT_STANDBY }} />
        : <BgVideoLayer url={bg.url} />)}
      {bg.veil && <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.55) 100%)' }} />}
    </div>
  );
}

/* ── Ajustement automatique du texte ────────────────────────────────────── */
function useFitText(boxRef: React.RefObject<HTMLElement>, groupRef: React.RefObject<HTMLElement>, textRef: React.RefObject<HTMLElement>, maxPx: number, minPx: number, deps: unknown[]) {
  const [size, setSize] = useState(maxPx);
  useLayoutEffect(() => {
    const box = boxRef.current, group = groupRef.current, text = textRef.current;
    if (!box || !group || !text) return;
    let s = maxPx;
    text.style.fontSize = `${s}px`;
    for (let i = 0; i < 30 && s > minPx && (group.scrollHeight > box.clientHeight + 1 || group.scrollWidth > box.clientWidth + 1); i++) {
      s = Math.max(minPx, s * 0.93);
      text.style.fontSize = `${s}px`;
    }
    setSize(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxPx, minPx, ...deps]);
  return size;
}

/** Texte qui se réduit jusqu'à tenir dans sa zone ; `footer` (la référence)
 *  reste collé sous le texte et compte dans la place disponible. */
function FitText({ maxU, minU, children, className, style, align = 'center', fitKey, footer, header, gapU = 2 }: {
  maxU: number; minU?: number; children: ReactNode; className?: string; style?: CSSProperties;
  align?: 'center' | 'left' | 'right'; fitKey: string; footer?: ReactNode; header?: ReactNode; gapU?: number;
}) {
  const u = useSceneUnit();
  const box = useRef<HTMLDivElement>(null);
  const group = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const size = useFitText(box, group, text, maxU * u, (minU ?? 1.5) * u, [fitKey, u, style?.lineHeight, style?.fontFamily, !!footer, !!header]);
  return (
    <div ref={box} className="flex-1 min-h-0 w-full flex items-center overflow-hidden"
      style={{ justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center' }}>
      <div ref={group} className="w-full flex flex-col" style={{ gap: footer || header ? gapU * u : 0, alignItems: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center', maxHeight: '100%' }}>
        {header}
        <div ref={text} className={className} style={{ ...style, fontSize: size, width: '100%', textAlign: align }}>{children}</div>
        {footer}
      </div>
    </div>
  );
}

/* ── Contenu ────────────────────────────────────────────────────────────── */
const ACCENT = '#E9C46A';

function lineHeight(settings: ChurchSettings) {
  return settings.lineSpacing === 'tight' ? 1.3 : settings.lineSpacing === 'relaxed' ? 1.85 : 1.55;
}

function verseText(v: VerseReference, settings: ChurchSettings, style: string): ReactNode {
  const q = settings.verseQuotes && style !== 'moderne';
  // Passage : numéros de versets (exposants) rendus petits, en chiffres de la police
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const num = (tok: string, key: string | number) => /^[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/.test(tok)
    ? <span key={key} style={{ fontSize: '0.55em', verticalAlign: '0.6em', opacity: 0.7, fontFamily: SANS_STACK, fontWeight: 600 }}>{tok.split('').map(c => SUP.indexOf(c)).join('')}</span>
    : null;
  if ((!v.highlights || v.highlights.length === 0) && !/[⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(v.text)) return q ? `« ${v.text} »` : v.text;
  // Mots mis en valeur : même mise en page, seule la couleur change (pas de saut de texte)
  const on = new Set(v.highlights ?? []);
  let w = -1;
  const parts = v.text.split(/(\s+)/).map((tok, i) => {
    if (/^\s+$/.test(tok) || tok === '') return tok;
    w++;
    const n = num(tok, i); if (n) return n;
    return on.has(w)
      ? <span key={i} style={{ color: ACCENT, textShadow: '0 0 0.6em rgba(233,196,106,0.55)', transition: 'color 400ms ease' }}>{tok}</span>
      : <span key={i} style={{ transition: 'color 400ms ease' }}>{tok}</span>;
  });
  return <>{q ? '« ' : ''}{parts}{q ? ' »' : ''}</>;
}

function VerseBlock({ verse, theme, settings, version, compact }: {
  verse: VerseReference; theme: DisplayTheme; settings: ChurchSettings; version?: string; compact?: boolean;
}) {
  const u = useSceneUnit();
  const style = settings.verseStyle || 'classique';
  const font = theme.fontFamily === 'serif' ? SERIF_STACK : SANS_STACK;
  const max = (VERSE_MAX[theme.fontSize] ?? 4) * (compact ? 0.72 : 1) * (style === 'bandeau' ? 0.68 : 1);
  const shadow = settings.textShadowDefault !== false ? `0 ${0.12 * u}px ${0.6 * u}px rgba(0,0,0,0.75)` : undefined;
  const ref = `${formatReference(verse)}${version ? ` · ${version}` : ''}`;
  const refEl = settings.showVerseReference !== false && (
    <p style={{
      fontFamily: SANS_STACK, fontWeight: 600, letterSpacing: style === 'classique' ? '0.06em' : '0.16em',
      textTransform: style === 'classique' ? 'none' : 'uppercase',
      fontSize: Math.max(1.3, max * (style === 'classique' ? 0.5 : 0.38)) * u,
      color: style === 'classique' ? 'hsl(var(--display-fg) / 0.78)' : ACCENT,
      animation: 'bc-fade-in 500ms ease-out 350ms both', textShadow: shadow,
    }}>{ref}</p>
  );
  const textEl = (
    <FitText maxU={max} minU={1.4} align={style === 'classique' ? 'center' : 'left'} fitKey={verse.text + style + String(settings.verseQuotes)}
      style={{ fontFamily: font, lineHeight: lineHeight(settings), color: 'hsl(var(--display-fg))', textShadow: shadow, animation: 'bc-rise-in 600ms ease-out both' }}>
      {verseText(verse, settings, style)}
    </FitText>
  );
  if (style === 'moderne') {
    return (
      <div className="h-full w-full flex flex-col" style={{ gap: 1.6 * u }}>
        <div className="flex items-center" style={{ gap: 1.2 * u }}>
          <span style={{ width: 4 * u, height: Math.max(2, 0.25 * u), background: ACCENT, display: 'inline-block' }} />
          {refEl}
        </div>
        {textEl}
      </div>
    );
  }
  if (style === 'bandeau') {
    return (
      <div className="h-full w-full flex flex-col justify-end">
        <div className="w-full flex flex-col" style={{ height: '38%', gap: 0.8 * u }}>
          {refEl}
          {textEl}
        </div>
      </div>
    );
  }
  return (
    <div className="h-full w-full flex flex-col items-center">
      <FitText maxU={max} minU={1.4} align="center" fitKey={verse.text + style + String(settings.verseQuotes)} footer={refEl || undefined} gapU={2.2}
        style={{ fontFamily: font, lineHeight: lineHeight(settings), color: 'hsl(var(--display-fg))', textShadow: shadow, animation: 'bc-rise-in 600ms ease-out both' }}>
        {verseText(verse, settings, style)}
      </FitText>
    </div>
  );
}

function SlideBlock({ slide, theme }: { slide: CustomSlide; theme: DisplayTheme }) {
  const u = useSceneUnit();
  const type: SlideType = slide.slideType || 'text-title';
  const font = theme.fontFamily === 'serif' ? SERIF_STACK : SANS_STACK;
  const size = slide.fontSize ?? theme.fontSize;
  const tsize = slide.titleFontSize ?? slide.fontSize ?? theme.fontSize;
  const fg = slide.textColor || 'hsl(var(--display-fg))';
  const fgDim = slide.textColor ? slide.textColor + 'd9' : 'hsl(var(--display-fg) / 0.82)';
  const align = slide.textAlign ?? 'center';
  const shadow = slide.textShadow ? `0 ${0.12 * u}px ${0.6 * u}px rgba(0,0,0,0.8), 0 ${0.2 * u}px ${1.6 * u}px rgba(0,0,0,0.5)` : undefined;
  const common: CSSProperties = { fontFamily: font, color: fgDim, textShadow: shadow, lineHeight: 1.45 };
  const title = (scale = 1) => slide.title ? (
    <h2 style={{ fontFamily: font, color: fg, fontWeight: 700, lineHeight: 1.15, fontSize: (SLIDE_TITLE[tsize] ?? 4.4) * scale * u, textShadow: shadow, textAlign: align, animation: 'bc-rise-in 600ms ease-out both' }}>
      {slide.title}
    </h2>
  ) : null;

  if (type === 'image-full' || type === 'blank') return null;
  if (type === 'definition') {
    // Dictionnaire biblique : petite ligne dorée, le mot, la définition, les références
    const head = (
      <div style={{ width: '100%' }}>
        {slide.label && <p style={{ fontFamily: SANS_STACK, color: ACCENT, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', fontSize: 1.5 * u, textShadow: shadow, marginBottom: 0.6 * u }}>{slide.label}</p>}
        <h2 style={{ fontFamily: font, color: fg, fontWeight: 700, lineHeight: 1.1, fontSize: (SLIDE_TITLE[tsize] ?? 4.4) * 1.05 * u, textShadow: shadow, animation: 'bc-rise-in 600ms ease-out both' }}>{slide.title}</h2>
        <div style={{ width: 8 * u, height: 0.3 * u, background: ACCENT, borderRadius: u, marginTop: 1.2 * u, opacity: 0.85 }} />
      </div>
    );
    const foot = slide.footer
      ? <p style={{ fontFamily: SANS_STACK, color: ACCENT, fontWeight: 600, fontSize: 1.55 * u, letterSpacing: '0.04em', textShadow: shadow, width: '100%' }}>{slide.footer}</p>
      : undefined;
    return (
      <div className="h-full w-full flex flex-col">
        <FitText maxU={(SLIDE_TEXT[size] ?? 3.6) * 1.15} minU={1.3} align="left" header={head} footer={foot} gapU={2.2}
          fitKey={slide.id + slide.content + (slide.title ?? '') + (slide.footer ?? '')}
          style={{ ...common, color: fg, animation: 'bc-fade-in 600ms ease-out 150ms both' }}>
          {slide.content.split('\n').filter(Boolean).map((para, i) => <p key={i} style={{ marginBottom: '0.55em' }}>{para}</p>)}
        </FitText>
      </div>
    );
  }
  if (type === 'title-only') {
    return <div className="h-full w-full flex flex-col justify-center">
      <FitText maxU={(SLIDE_TITLE[tsize] ?? 4.4) * 1.35} minU={2} align={align} fitKey={slide.id + slide.title}
        style={{ fontFamily: font, color: fg, fontWeight: 700, lineHeight: 1.15, textShadow: shadow, animation: 'bc-rise-in 600ms ease-out both' }}>
        {slide.title}
      </FitText>
    </div>;
  }
  const bullets = (slide.bullets || []).filter(Boolean);
  // Liste point par point : `revealed` = nombre de points déjà montrés (les autres gardent leur place)
  const shown = slide.revealBullets && typeof slide.revealed === 'number' ? slide.revealed : bullets.length;
  const body = type === 'bullet-list' ? (
    <ul style={{ display: 'inline-block', textAlign: 'left', margin: 0, padding: 0, listStyle: 'none' }}>
      {bullets.map((b, i) => (
        <li key={i} style={{ display: 'flex', gap: '0.6em', marginBottom: '0.45em', opacity: i < shown ? 1 : 0,
          transform: i < shown ? 'none' : 'translateY(0.4em)', transition: 'opacity 500ms ease, transform 500ms ease',
          animation: slide.revealBullets ? undefined : `bc-rise-in 500ms ease-out ${150 + i * 120}ms both` }}>
          <span style={{ color: ACCENT }}>•</span><span>{b}</span>
        </li>
      ))}
    </ul>
  ) : slide.contentHtml ? (
    <div className="slide-rich-content" dangerouslySetInnerHTML={{ __html: slide.contentHtml }} />
  ) : (
    <p className="whitespace-pre-wrap">{type === 'verse-title' ? `« ${slide.content} »` : slide.content}</p>
  );
  const header = type === 'verse-title'
    ? (slide.title ? <p style={{ fontFamily: SANS_STACK, color: ACCENT, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', fontSize: 1.9 * u, textAlign: align, textShadow: shadow, width: '100%' }}>{slide.title}</p> : undefined)
    : (slide.title ? <div style={{ width: '100%' }}>{title()}</div> : undefined);
  // Un texte court grandit pour bien remplir un grand écran ; un texte long se réduit
  return (
    <div className="h-full w-full flex flex-col">
      <FitText maxU={(SLIDE_TEXT[size] ?? 3.6) * 1.5} minU={1.3} align={align} header={header} gapU={2.4}
        fitKey={slide.id + (slide.contentHtml ?? slide.content ?? '') + bullets.join('|') + (slide.title ?? '') + type}
        style={{ ...common, ...(type === 'verse-title' ? { fontFamily: SERIF_STACK, color: fg } : {}), animation: 'bc-fade-in 600ms ease-out 150ms both' }}>
        {body}
      </FitText>
    </div>
  );
}

function StandbyBlock({ theme, settings, extras }: { theme: DisplayTheme; settings: ChurchSettings; extras?: StandbyExtras }) {
  const u = useSceneUnit();
  const logo = theme.churchLogo || settings.churchLogo;
  const announcements = (settings.standbyAnnouncements || '').split('\n').map(s => s.trim()).filter(Boolean);
  const [annIdx, setAnnIdx] = useState(0);
  useEffect(() => {
    if (announcements.length < 2) return;
    const id = setInterval(() => setAnnIdx(i => (i + 1) % announcements.length), 8000);
    return () => clearInterval(id);
  }, [announcements.length]);

  // Compte à rebours avant le culte (heure « HH:MM » du jour, dans les 3 h qui viennent)
  let countdown: string | null = null;
  if (settings.countdownTime && /^\d{1,2}:\d{2}$/.test(settings.countdownTime)) {
    const now = new Date(extras?.now ?? Date.now());
    const [h, m] = settings.countdownTime.split(':').map(Number);
    const target = new Date(now); target.setHours(h, m, 0, 0);
    const diff = Math.round((target.getTime() - now.getTime()) / 1000);
    if (diff > 0 && diff <= 3 * 3600) {
      const hh = Math.floor(diff / 3600), mm = Math.floor((diff % 3600) / 60), ss = diff % 60;
      countdown = (hh > 0 ? `${hh}:${String(mm).padStart(2, '0')}` : `${mm}`) + `:${String(ss).padStart(2, '0')}`;
    }
  }
  const fg = 'hsl(var(--display-fg))';
  const shadow = `0 ${0.15 * u}px ${0.8 * u}px rgba(0,0,0,0.7)`;
  return (
    <div className="h-full w-full flex flex-col items-center justify-between text-center" style={{ color: fg }}>
      <div className="flex flex-col items-center" style={{ gap: 0.8 * u }}>
        {logo && <img src={logo} alt="" className="bc-anim object-contain" style={{ height: 6 * u, animation: 'bc-breathe 6s ease-in-out infinite', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,.5))' }} />}
        {settings.churchName && (
          <p style={{ fontFamily: SANS_STACK, fontSize: 1.5 * u, letterSpacing: '0.3em', textTransform: 'uppercase', opacity: 0.75, textShadow: shadow }}>{settings.churchName}</p>
        )}
      </div>

      <div className="w-full flex flex-col items-center" style={{ gap: 1.4 * u, maxWidth: '86%' }}>
        {countdown ? (
          <>
            <p style={{ fontFamily: SANS_STACK, fontSize: 1.4 * u, letterSpacing: '0.3em', textTransform: 'uppercase', color: ACCENT }}>Le culte commence dans</p>
            <p style={{ fontFamily: SANS_STACK, fontWeight: 700, fontSize: 9 * u, lineHeight: 1, fontVariantNumeric: 'tabular-nums', textShadow: shadow }}>{countdown}</p>
          </>
        ) : announcements.length > 0 ? (
          <p key={annIdx} style={{ fontFamily: SERIF_STACK, fontSize: 3 * u, lineHeight: 1.35, textShadow: shadow, animation: 'bc-rise-in 700ms ease-out both' }}>
            {announcements[annIdx % announcements.length]}
          </p>
        ) : settings.showVerseOfDay && extras?.verseOfDay ? (
          <>
            <p style={{ fontFamily: SANS_STACK, fontSize: 1.1 * u, letterSpacing: '0.35em', textTransform: 'uppercase', color: ACCENT, opacity: 0.9 }}>Verset du jour</p>
            <p style={{ fontFamily: SERIF_STACK, fontSize: 2.6 * u, lineHeight: 1.5, textShadow: shadow }}>« {extras.verseOfDay.text} »</p>
            <p style={{ fontFamily: SANS_STACK, fontSize: 1.4 * u, letterSpacing: '0.12em', fontWeight: 600, opacity: 0.75 }}>{formatReference(extras.verseOfDay)}</p>
          </>
        ) : null}
      </div>

      <div className="flex flex-col items-center" style={{ gap: 0.4 * u }}>
        {settings.showClock && extras?.clockTime && !countdown && (
          <p style={{ fontFamily: SANS_STACK, fontWeight: 700, fontSize: 6.5 * u, lineHeight: 1, fontVariantNumeric: 'tabular-nums', opacity: 0.85, textShadow: shadow }}>{extras.clockTime}</p>
        )}
        {settings.showClock && settings.showClockDate && extras?.clockDate && (
          <p style={{ fontFamily: SANS_STACK, fontSize: 1.4 * u, opacity: 0.65 }}>{extras.clockDate}</p>
        )}
        <p style={{ fontFamily: SANS_STACK, fontSize: 0.62 * u, opacity: 0.35, marginTop: 0.6 * u }}>Développé avec ❤️ par le Frère Malachie</p>
      </div>
    </div>
  );
}

/** Textes d'une scène (sans le fond), dans la zone de sécurité TV */
export function SceneContent({ content, theme, settings, extras }: {
  content: SceneContentData; theme: DisplayTheme; settings: ChurchSettings; extras?: StandbyExtras;
}) {
  const u = useSceneUnit();
  const logo = theme.churchLogo || settings.churchLogo;
  const showLogo = !!logo && (
    ((content.kind === 'verse' || content.kind === 'dual-verse') && theme.showChurchLogo) ||
    (content.kind === 'slide' && !!content.slide?.showLogo));
  const safe: CSSProperties = { position: 'absolute', inset: 0, padding: `${5.5 * u * 0.5625}px ${6 * u}px`, display: 'flex', flexDirection: 'column' };
  const split = settings.splitLayout === 'vertical';
  const bible2 = settings.bible2Version && settings.bible2Version !== 'BDS' ? settings.bible2Version : 'Darby';
  return (
    <div style={safe}>
      {showLogo && content.kind !== 'empty' && (
        <img src={logo} alt="" className="object-contain self-center" style={{ height: 4.2 * u, marginBottom: 1.2 * u, opacity: 0.92, filter: 'drop-shadow(0 3px 10px rgba(0,0,0,.5))' }} />
      )}
      <div className="flex-1 min-h-0 w-full">
        {content.kind === 'empty' && <StandbyBlock theme={theme} settings={settings} extras={extras} />}
        {content.kind === 'verse' && content.verse && <VerseBlock verse={content.verse} theme={theme} settings={settings} />}
        {content.kind === 'dual-verse' && content.verse && (
          <div className={`h-full w-full flex ${split ? 'flex-row' : 'flex-col'}`} style={{ gap: 2.5 * u }}>
            <div className="flex-1 min-h-0 min-w-0"><VerseBlock verse={content.verse} theme={theme} settings={settings} version={settings.bibleVersion || 'LSG'} compact /></div>
            {content.verse2 && <div style={{ [split ? 'width' : 'height']: Math.max(1, 0.1 * u), background: 'rgba(255,255,255,0.18)' }} />}
            {content.verse2 && <div className="flex-1 min-h-0 min-w-0"><VerseBlock verse={content.verse2} theme={theme} settings={settings} version={content.verse2.version ?? bible2} compact /></div>}
          </div>
        )}
        {content.kind === 'slide' && content.slide && <SlideBlock slide={content.slide} theme={theme} />}
      </div>
    </div>
  );
}

/** NOIR / LOGO : couvrent tout, en fondu. Sans logo réglé : nom de l'église, sinon une croix. */
function OverlayLayer({ overlay, logo, churchName }: { overlay: StageOverlay; logo?: string; churchName?: string }) {
  const u = useSceneUnit();
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: overlay === 'black' || overlay === 'logo' ? 1 : 0, transition: 'opacity 600ms ease', pointerEvents: 'none', zIndex: 40 }}>
      {overlay === 'logo' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ gap: 2.5 * u }}>
          {logo ? (
            <img src={logo} alt="" className="bc-anim object-contain" style={{ height: '28%', animation: 'bc-breathe 6s ease-in-out infinite' }} />
          ) : (
            <svg viewBox="0 0 40 60" className="bc-anim" style={{ height: churchName ? '18%' : '26%', animation: 'bc-breathe 6s ease-in-out infinite', filter: `drop-shadow(0 0 ${1.5 * u}px rgba(227,180,90,0.55))` }} aria-hidden>
              <path d="M17 0h6v16h17v6H23v38h-6V22H0v-6h17z" fill="#e3b45a" />
            </svg>
          )}
          {!logo && churchName && (
            <div style={{ color: '#fff', fontFamily: SERIF_STACK, fontSize: 3.6 * u, letterSpacing: '0.12em', textAlign: 'center', maxWidth: '80%' }}>{churchName}</div>
          )}
        </div>
      )}
    </div>
  );
}

/** Aperçu statique (tablette) : fond + contenu, même rendu que la TV */
export function SceneView({ content, theme, settings, extras, className, still, overlay = 'none', wave, waveLift }: {
  content: SceneContentData; theme: DisplayTheme; settings: ChurchSettings; extras?: StandbyExtras; className?: string; still?: boolean; overlay?: StageOverlay;
  /** Onde décorative (louange) */
  wave?: boolean; waveLift?: boolean;
}) {
  const bg = resolveBackground(content, theme, settings);
  return (
    <SceneRoot themeClass={theme.className} className={className} style={{ aspectRatio: '16 / 9', width: '100%', background: '#000' }}>
      <SceneBackground bg={bg} still={still} />
      {wave && <WaveLayer on={!!wave} style={settings.waveStyle as WaveStyle} position={settings.wavePosition as WavePosition} color={settings.waveColor} still lift={waveLift} />}
      <div style={{ position: 'absolute', inset: 0, opacity: overlay === 'background' ? 0 : 1, transition: 'opacity 300ms ease' }}>
        <SceneContent content={content} theme={theme} settings={settings} extras={extras} />
      </div>
      <OverlayLayer overlay={overlay} logo={theme.churchLogo || settings.churchLogo} churchName={settings.churchName} />
    </SceneRoot>
  );
}

/* ── Scène TV avec fondus enchaînés (deux calques) ─────────────────────── */
interface Layer<T> { id: number; data: T; phase: 'enter' | 'shown' | 'exit' }

function useLayers<T>(data: T, key: string, durationMs: number, liveUpdate = false): Layer<T>[] {
  const [layers, setLayers] = useState<Layer<T>[]>(() => [{ id: 0, data, phase: 'shown' }]);
  const lastKey = useRef(key);
  const counter = useRef(0);
  const dataRef = useRef(data);
  dataRef.current = data;
  useEffect(() => {
    if (key === lastKey.current) return;
    lastKey.current = key;
    const data = dataRef.current;
    const id = ++counter.current;
    setLayers(ls => [...ls.filter(l => l.phase !== 'exit').map(l => ({ ...l, phase: 'exit' as const })), { id, data, phase: 'enter' }]);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => {
      setLayers(ls => ls.map(l => l.id === id ? { ...l, phase: 'shown' } : l));
    }); });
    const t = setTimeout(() => setLayers(ls => ls.filter(l => l.phase !== 'exit' || l.id > id)), durationMs + 80);
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // Même clé, données changées (liste point par point) : on met à jour le calque affiché sans fondu
  useEffect(() => {
    if (!liveUpdate || key !== lastKey.current) return;
    setLayers(ls => ls.map(l => (l.id === counter.current && l.data !== data) ? { ...l, data } : l));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  return layers;
}

function layerStyle(phase: Layer<unknown>['phase'], style: string, d: number): CSSProperties {
  const ease = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
  const visible = phase === 'shown';
  const base: CSSProperties = { position: 'absolute', inset: 0 };
  if (style === 'fondu-noir') {
    return { ...base, opacity: visible ? 1 : 0, transition: `opacity ${d / 2}ms ${ease} ${phase === 'shown' ? d / 2 : 0}ms` };
  }
  if (style === 'glissement') {
    const x = phase === 'enter' ? '6%' : phase === 'exit' ? '-6%' : '0';
    return { ...base, opacity: visible ? 1 : 0, transform: `translate3d(${x},0,0)`, transition: `opacity ${d}ms ${ease}, transform ${d}ms ${ease}` };
  }
  if (style === 'zoom') {
    const s = phase === 'enter' ? 1.05 : phase === 'exit' ? 0.97 : 1;
    return { ...base, opacity: visible ? 1 : 0, transform: `scale(${s})`, transition: `opacity ${d}ms ${ease}, transform ${d}ms ${ease}` };
  }
  return { ...base, opacity: visible ? 1 : 0, transition: `opacity ${d}ms ${ease}` };
}

export function Stage({ content, theme, settings, extras, overlay = 'none', onBgFps, qualityTick, wave, waveLift }: {
  content: SceneContentData; theme: DisplayTheme; settings: ChurchSettings; extras?: StandbyExtras; overlay?: StageOverlay;
  /** Onde décorative (louange) ; waveLift = au-dessus du bandeau défilant */
  wave?: boolean; waveLift?: boolean;
  /** Fluidité mesurée d'un effet riche (images/s) */
  onBgFps?: (fps: number) => void;
  /** Change quand la TV bascule en qualité éco (force le repli CSS) */
  qualityTick?: number;
}) {
  const d = Math.max(150, Math.min(Number(settings.transitionSpeed) || 700, 2500));
  const style = settings.transitionStyle || 'fondu';
  const bg = resolveBackground(content, theme, settings);
  // Fond : nouveau calque seulement si le fond change → verset après verset, le fond ne bouge pas
  const bgLayers = useLayers(bg, bg.key + '|' + theme.className, Math.round(d * 1.2));
  // Texte : nouveau calque à chaque contenu
  const textLayers = useLayers(content, String(content.id), d, true);
  const logo = theme.churchLogo || settings.churchLogo;
  return (
    <SceneRoot themeClass={theme.className} className="h-screen w-screen cursor-none" style={{ background: '#000' }}>
      {bgLayers.map(l => (
        <div key={l.id} style={{ position: 'absolute', inset: 0, opacity: l.phase === 'enter' ? 0 : 1, transition: `opacity ${Math.round(d * 1.2)}ms ease` }}>
          <SceneBackground key={qualityTick} bg={l.data} quality={settings.bgQuality} onFps={onBgFps} paused={overlay === 'black' || overlay === 'logo'} />
        </div>
      ))}
      <WaveLayer on={!!wave && overlay !== 'black' && overlay !== 'logo'} style={settings.waveStyle as WaveStyle} position={settings.wavePosition as WavePosition} color={settings.waveColor} lift={waveLift} />
      <div style={{ position: 'absolute', inset: 0, opacity: overlay === 'background' ? 0 : 1, transition: 'opacity 500ms ease' }}>
        {textLayers.map(l => (
          <div key={l.id} style={layerStyle(l.phase, style, d)}>
            <SceneContent content={l.data} theme={theme} settings={settings} extras={extras} />
          </div>
        ))}
      </div>
      <OverlayLayer overlay={overlay} logo={logo} churchName={settings.churchName} />
    </SceneRoot>
  );
}
