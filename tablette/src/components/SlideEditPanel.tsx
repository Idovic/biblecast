/* Édition d'une slide en grand, au centre : aperçu rendu comme sur la TV en haut,
   réglages en dessous avec des boutons faits pour le doigt (44 px). */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Send, Plus, Image as ImageIcon, AlignLeft, AlignCenter, AlignRight, BookOpen, Scissors,
  FileText, Presentation, List, Frame, Check, Sparkles, KeyboardOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, genId } from '@/lib/utils';
import type { BibleData, CustomSlide, DisplayTheme, SlideType } from '@/types/bible';
import type { ChurchSettings } from '@/components/SettingsPanel';
import RichTextEditor from '@/components/RichTextEditor';
import { SceneView } from '@/components/scene/Scene';
import AnimatedPicker from '@/components/AnimatedPicker';
import { getVerse, parseReference, getParallelVerse } from '@/lib/bible';
import { versionOf } from '@/lib/versions';
import { pickImage } from '@/lib/image';

export const GRADIENT_PRESETS = [
  { label: 'Nuit', value: 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)' },
  { label: 'Violet', value: 'linear-gradient(135deg,#2d1b69,#11998e)' },
  { label: 'Bleu', value: 'linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)' },
  { label: 'Bordeaux', value: 'linear-gradient(135deg,#360033,#0b8793)' },
  { label: 'Forêt', value: 'linear-gradient(135deg,#134e5e,#71b280)' },
  { label: 'Aube', value: 'linear-gradient(135deg,#373b44,#4286f4)' },
  { label: 'Or', value: 'linear-gradient(135deg,#c79231,#3b2a00)' },
  { label: 'Ébène', value: 'linear-gradient(135deg,#232526,#414345)' },
  { label: 'Grenat', value: 'linear-gradient(135deg,#4b0010,#1f003a)' },
];
const TEXT_COLORS = ['#ffffff', '#f5f5dc', '#ffd700', '#87ceeb', '#98fb98', '#ffa07a', '#e0b0ff'];
const TYPES: { t: SlideType; label: string; Icon: typeof FileText }[] = [
  { t: 'text-title', label: 'Titre + texte', Icon: FileText },
  { t: 'title-only', label: 'Titre seul', Icon: Presentation },
  { t: 'verse-title', label: 'Verset', Icon: BookOpen },
  { t: 'bullet-list', label: 'Liste', Icon: List },
  { t: 'image-full', label: 'Affiche / image', Icon: ImageIcon },
  { t: 'blank', label: 'Texte seul', Icon: Frame },
];
const SIZES = [['small', 'S'], ['medium', 'M'], ['large', 'L'], ['xlarge', 'XL']] as const;

interface GalleryImage { id: string; label: string; url: string }

/** Texte simple → paragraphes pour l'éditeur (garde les retours à la ligne) */
function plainToHtml(t: string): string {
  if (!t) return '';
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return t.split('\n').map(l => `<p>${esc(l)}</p>`).join('');
}

/** Au-delà, le texte devient trop petit sur un 42 pouces */
const TOO_LONG_CHARS = 320;
const TOO_MANY_BULLETS = 6;

/** Découpe un texte en morceaux d'environ `max` caractères, sans couper les phrases */
function splitText(text: string, max = 240): string[] {
  const parts = text.split(/\n+/).flatMap(p => p.length <= max ? [p] : (p.match(/[^.!?;]+[.!?;]*\s*/g) ?? [p]));
  const out: string[] = [];
  let cur = '';
  for (const part of parts) {
    if (cur && (cur + ' ' + part).length > max) { out.push(cur.trim()); cur = part; }
    else cur = cur ? `${cur}${cur.endsWith('\n') ? '' : ' '}${part}` : part;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function slideIsTooLong(s: CustomSlide): boolean {
  if (s.slideType === 'bullet-list') return (s.bullets ?? []).filter(Boolean).length > TOO_MANY_BULLETS;
  if (s.slideType === 'text-title' || s.slideType === 'blank' || s.slideType === 'verse-title') return (s.content ?? '').length > TOO_LONG_CHARS;
  return false;
}

export function splitSlide(s: CustomSlide): CustomSlide[] {
  let chunks: Partial<CustomSlide>[];
  if (s.slideType === 'bullet-list') {
    const b = (s.bullets ?? []).filter(Boolean);
    chunks = [];
    for (let i = 0; i < b.length; i += 5) chunks.push({ bullets: b.slice(i, i + 5) });
  } else {
    chunks = splitText(s.content ?? '').map(c => ({ content: c, contentHtml: undefined }));
  }
  if (chunks.length < 2) return [s];
  return chunks.map((c, i) => ({ ...s, ...c, id: i === 0 ? s.id : genId(), title: s.title ? `${s.title}${i > 0 ? ` (${i + 1}/${chunks.length})` : ` (1/${chunks.length})`}` : s.title }));
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1.5">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)}
          className={cn('flex-1 h-11 rounded-lg border text-sm font-semibold transition-colors',
            value === v ? 'border-primary/60 bg-primary/15 text-primary' : 'border-border/40 bg-secondary/40 text-muted-foreground hover:text-foreground')}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div data-field className="space-y-1.5 scroll-mt-28">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function SlideEditPanel({ slide, where, onChange, onSplit, onClose, onProject, onAddToDeroule, theme, settings, bible, bible2 }: {
  slide: CustomSlide;
  where: 'library' | 'deroule';
  onChange: (s: CustomSlide) => void;
  onSplit: (slides: CustomSlide[]) => void;
  onClose: () => void;
  onProject: (s: CustomSlide) => void;
  onAddToDeroule?: (s: CustomSlide) => void;
  theme: DisplayTheme; settings: ChurchSettings;
  bible: BibleData | null; bible2: BibleData | null;
}) {
  const set = (patch: Partial<CustomSlide>) => onChange({ ...slide, ...patch });
  const [bgTab, setBgTab] = useState<'anime' | 'couleur' | 'photo'>(slide.backgroundImage ? 'photo' : slide.backgroundAnimated ? 'anime' : 'couleur');
  const [photos, setPhotos] = useState<GalleryImage[]>([]);
  const [verseRef, setVerseRef] = useState(slide.slideType === 'verse-title' ? slide.title : '');
  const [verseVersion, setVerseVersion] = useState<'LSG' | 'Darby'>('LSG');
  const v2Name = versionOf(bible2) ?? 'Darby';
  const [verseError, setVerseError] = useState('');
  const [added, setAdded] = useState(false);
  const [editorKey, setEditorKey] = useState(0); // recrée l'éditeur quand le texte est rempli depuis la Bible

  /* Clavier de la tablette : pendant la saisie, l'aperçu devient une vignette et le champ
     remonte en haut, pour rester visible au-dessus du clavier. */
  const scrollRef = useRef<HTMLDivElement>(null);
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    let blurTimer: ReturnType<typeof setTimeout> | undefined;
    const isField = (el: EventTarget | null): el is HTMLElement =>
      el instanceof HTMLElement && (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range', 'color', 'file'].includes((el as HTMLInputElement).type)));
    const reveal = (el: HTMLElement) => {
      const target = el.closest('[data-field]') as HTMLElement | null ?? el;
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
    const onIn = (e: FocusEvent) => {
      if (!isField(e.target)) return;
      clearTimeout(blurTimer);
      setTyping(true);
      const el = e.target;
      setTimeout(() => reveal(el), 120);
      setTimeout(() => reveal(el), 450); // une fois le clavier monté
    };
    const onOut = () => { blurTimer = setTimeout(() => { if (!isField(document.activeElement)) setTyping(false); }, 150); };
    box.addEventListener('focusin', onIn);
    box.addEventListener('focusout', onOut);
    return () => { box.removeEventListener('focusin', onIn); box.removeEventListener('focusout', onOut); clearTimeout(blurTimer); };
  }, []);
  const hideKeyboard = () => { (document.activeElement as HTMLElement | null)?.blur(); setTyping(false); };

  // Photos : fonds fournis + images de la galerie
  useEffect(() => {
    let user: GalleryImage[] = [];
    try { user = JSON.parse(localStorage.getItem('biblecast:gallery') || '[]'); } catch { /* ignore */ }
    fetch(import.meta.env.BASE_URL + 'backgrounds/index.json').then(r => r.json())
      .then((imgs: GalleryImage[]) => setPhotos([...imgs.map(i => ({ ...i, url: i.url.startsWith('/') ? import.meta.env.BASE_URL.replace(/\/$/, '') + i.url : i.url })), ...user]))
      .catch(() => setPhotos(user));
  }, []);

  const scene = useMemo(() => ({ id: 1, kind: 'slide' as const, slide: { ...slide, revealed: undefined } }), [slide]);
  const tooLong = slideIsTooLong(slide);
  const isImage = slide.slideType === 'image-full';

  const fillVerse = () => {
    const r = parseReference(verseRef);
    const src = verseVersion === 'Darby' ? bible2 : bible;
    if (!r || !bible) { setVerseError('Référence non reconnue (ex : Jean 3:16 ou Ps 23 1-3)'); return; }
    const from = r.verseStart ?? 1, to = r.verseEnd ?? from;
    const texts: string[] = [];
    for (let v = from; v <= to; v++) {
      const lsg = getVerse(bible, r.book, r.chapter, v);
      if (!lsg) continue;
      const verse = verseVersion === 'Darby' && src ? getParallelVerse(src, lsg) : lsg;
      if (verse) texts.push(verse.text);
    }
    if (!texts.length) { setVerseError('Verset introuvable dans cette Bible'); return; }
    setVerseError('');
    const ref = `${r.book} ${r.chapter}${r.verseStart ? `:${from}${to > from ? `-${to}` : ''}` : ''}`;
    set({ title: verseVersion === 'Darby' ? `${ref} · ${v2Name}` : ref, content: texts.join(' '), contentHtml: undefined });
    setEditorKey(k => k + 1);
  };

  const setBackground = (patch: Partial<CustomSlide>) => set({ backgroundAnimated: undefined, backgroundColors: undefined, backgroundImage: undefined, backgroundGradient: undefined, backgroundVideo: undefined, ...patch });

  return (
    <div className="flex flex-col h-full">
      {/* En-tête */}
      <div className="px-4 py-2.5 border-b border-border/50 flex items-center gap-2 shrink-0">
        <Sparkles className="h-4 w-4 text-primary" />
        <p className="font-semibold text-sm flex-1 truncate">Modifier la slide {where === 'deroule' ? '· dans le déroulé' : ''}</p>
        <Button onClick={onClose} className="h-11 px-4 gap-1.5 btn-gold"><Check className="h-4 w-4" /> Terminé</Button>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        {/* Aperçu en direct, rendu comme sur la TV (en vignette pendant la saisie) */}
        <div className={cn('sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/30', typing ? 'px-4 py-2' : 'px-4 pt-3 pb-3')}>
          <div className={cn('max-w-xl mx-auto', typing && 'flex items-center gap-3')}>
            <div className={cn('rounded-lg overflow-hidden border border-border/50', typing ? 'w-36 shrink-0' : '')}>
              <SceneView content={scene} theme={theme} settings={settings} />
            </div>
            {typing && (
              <>
                <p className="flex-1 text-xs text-muted-foreground leading-snug">Aperçu réduit pendant la saisie</p>
                <Button variant="secondary" className="h-11 gap-1.5 shrink-0" onMouseDown={e => e.preventDefault()} onClick={hideKeyboard}>
                  <KeyboardOff className="h-4 w-4" /> Fermer le clavier
                </Button>
              </>
            )}
          </div>
          {tooLong && !typing && (
            <div className="max-w-xl mx-auto mt-2 rounded-lg bg-amber-500/10 border border-amber-500/40 px-3 py-2 flex items-center gap-2 text-xs text-amber-200">
              <span className="flex-1">Texte long : il sera petit sur la TV.</span>
              <Button size="sm" variant="secondary" className="h-10 gap-1.5" onClick={() => onSplit(splitSlide(slide))}>
                <Scissors className="h-4 w-4" /> Découper en plusieurs slides
              </Button>
            </div>
          )}
        </div>

        <div className="max-w-xl mx-auto p-4 space-y-5">
          <Field label="Type">
            <div className="grid grid-cols-3 gap-1.5">
              {TYPES.map(({ t, label, Icon }) => (
                <button key={t} onClick={() => set({ slideType: t })}
                  className={cn('h-11 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5',
                    slide.slideType === t ? 'border-primary/60 bg-primary/15 text-primary' : 'border-border/40 bg-secondary/40 text-muted-foreground hover:text-foreground')}>
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
          </Field>

          {slide.slideType === 'verse-title' && (
            <Field label="Verset depuis la Bible" hint={verseError || 'Le texte et la référence se remplissent tout seuls.'}>
              <div className="flex gap-2">
                <Input value={verseRef} onChange={e => setVerseRef(e.target.value)} onKeyDown={e => e.key === 'Enter' && fillVerse()}
                  placeholder="Jean 3:16 ou Ps 23 1-3" className="h-11 bg-secondary flex-1" />
                {bible2 && (
                  <div className="flex rounded-lg border border-border/40 overflow-hidden">
                    {(['LSG', 'Darby'] as const).map(v => (
                      <button key={v} onClick={() => setVerseVersion(v)} className={cn('h-11 px-3 text-xs font-semibold', verseVersion === v ? 'bg-primary/20 text-primary' : 'bg-secondary/40 text-muted-foreground')}>{v === 'LSG' ? 'LSG' : v2Name}</button>
                    ))}
                  </div>
                )}
                <Button onClick={fillVerse} className="h-11 gap-1.5"><BookOpen className="h-4 w-4" /> Remplir</Button>
              </div>
            </Field>
          )}

          {!isImage && (
            <Field label={slide.slideType === 'verse-title' ? 'Référence affichée' : 'Titre'}>
              <Input value={slide.title} onChange={e => set({ title: e.target.value })} placeholder="Titre de la slide" className="h-11 bg-secondary text-base" />
            </Field>
          )}

          {(slide.slideType === 'text-title' || slide.slideType === 'blank' || slide.slideType === 'verse-title') && (
            <Field label="Texte">
              <RichTextEditor key={`${slide.id}-${editorKey}`}
                value={slide.contentHtml ?? plainToHtml(slide.content ?? '')}
                onChange={(html, plain) => set({ contentHtml: html, content: plain })}
                placeholder="Saisissez le texte…" minHeight="140px" />
            </Field>
          )}

          {slide.slideType === 'bullet-list' && (
            <Field label="Points (un par ligne)">
              <textarea value={(slide.bullets ?? []).join('\n')} onChange={e => set({ bullets: e.target.value.split('\n') })}
                placeholder={'Premier point\nDeuxième point\nTroisième point'}
                className="w-full min-h-[140px] rounded-lg border border-border/50 bg-secondary text-base px-3 py-2 resize-y text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                style={{ lineHeight: 1.6 }} />
              <button onClick={() => set({ revealBullets: !slide.revealBullets })}
                className={cn('w-full min-h-[44px] px-3 rounded-lg border text-sm text-left flex items-center gap-2',
                  slide.revealBullets ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-border/40 bg-secondary/40 text-muted-foreground')}>
                <span className={cn('h-5 w-5 rounded border flex items-center justify-center', slide.revealBullets ? 'bg-primary border-primary text-primary-foreground' : 'border-border')}>{slide.revealBullets && <Check className="h-3.5 w-3.5" />}</span>
                Montrer les points un par un (chaque « Suivant » en ajoute un)
              </button>
            </Field>
          )}

          {isImage && (
            <Field label="Affiche ou image" hint="Une affiche verticale garde ses côtés remplis par une version floutée d'elle-même.">
              <Button variant="secondary" className="h-11 gap-2" onClick={() => pickImage().then(img => img && set({ backgroundImage: img.dataUrl }))}>
                <ImageIcon className="h-4 w-4" /> {slide.backgroundImage ? 'Changer l\'image' : 'Choisir une image'}
              </Button>
            </Field>
          )}

          {!isImage && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Taille du texte">
                  <Seg value={slide.fontSize ?? 'large'} options={SIZES} onChange={v => set({ fontSize: v })} />
                </Field>
                {slide.slideType !== 'title-only' && slide.slideType !== 'verse-title' && slide.slideType !== 'blank' ? (
                  <Field label="Taille du titre">
                    <Seg value={slide.titleFontSize ?? 'medium'} options={SIZES} onChange={v => set({ titleFontSize: v })} />
                  </Field>
                ) : <div />}
              </div>
              <Field label="Alignement">
                <div className="flex gap-1.5">
                  {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([v, Icon]) => (
                    <button key={v} onClick={() => set({ textAlign: v })} aria-label={`Aligner ${v}`}
                      className={cn('flex-1 h-11 rounded-lg border flex items-center justify-center',
                        (slide.textAlign ?? 'center') === v ? 'border-primary/60 bg-primary/15 text-primary' : 'border-border/40 bg-secondary/40 text-muted-foreground')}>
                      <Icon className="h-5 w-5" />
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Fond">
                <div className="flex gap-1.5">
                  {([['anime', 'Animés'], ['couleur', 'Dégradés'], ['photo', 'Photos']] as const).map(([v, label]) => (
                    <button key={v} onClick={() => setBgTab(v)}
                      className={cn('flex-1 h-10 rounded-lg text-sm font-medium', bgTab === v ? 'bg-secondary text-foreground' : 'text-muted-foreground')}>{label}</button>
                  ))}
                </div>
                {bgTab === 'anime' && (
                  <AnimatedPicker value={slide.backgroundAnimated} colors={slide.backgroundColors}
                    onChange={(id, colors) => id ? setBackground({ backgroundAnimated: id, backgroundColors: colors }) : set({ backgroundAnimated: undefined, backgroundColors: undefined })} />
                )}
                {bgTab === 'couleur' && (
                  <div className="grid grid-cols-5 gap-2">
                    {GRADIENT_PRESETS.map(g => (
                      <button key={g.value} onClick={() => setBackground({ backgroundGradient: g.value })} title={g.label} aria-label={g.label}
                        className={cn('h-11 rounded-lg border-2', slide.backgroundGradient === g.value && !slide.backgroundAnimated && !slide.backgroundImage ? 'border-primary' : 'border-transparent')}
                        style={{ background: g.value }} />
                    ))}
                  </div>
                )}
                {bgTab === 'photo' && (
                  <div className="grid grid-cols-4 gap-2">
                    <button onClick={() => pickImage().then(img => img && setBackground({ backgroundImage: img.dataUrl }))}
                      className="h-14 rounded-lg border border-dashed border-border/60 text-[11px] text-muted-foreground flex flex-col items-center justify-center gap-0.5">
                      <Plus className="h-4 w-4" /> Importer
                    </button>
                    {photos.map(ph => (
                      <button key={ph.id} onClick={() => setBackground({ backgroundImage: ph.url })} aria-label={ph.label}
                        className={cn('h-14 rounded-lg border-2 bg-cover bg-center', slide.backgroundImage === ph.url ? 'border-primary' : 'border-transparent')}
                        style={{ backgroundImage: `url(${ph.url})` }} />
                    ))}
                  </div>
                )}
              </Field>

              <Field label="Couleur du texte">
                <div className="flex gap-2 items-center flex-wrap">
                  {TEXT_COLORS.map(c => (
                    <button key={c} onClick={() => set({ textColor: c })} aria-label={`Couleur ${c}`}
                      className={cn('h-10 w-10 rounded-full border-2', slide.textColor === c ? 'border-primary scale-110' : 'border-border/30')}
                      style={{ background: c }} />
                  ))}
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                    <input type="color" value={slide.textColor ?? '#ffffff'} onChange={e => set({ textColor: e.target.value })} className="h-10 w-10 rounded border border-border/30 bg-transparent" />
                    Autre
                  </label>
                </div>
              </Field>

              <div className="flex gap-2">
                {([['textShadow', 'Ombre du texte'], ['showLogo', 'Logo de l\'église']] as const).map(([k, label]) => (
                  <button key={k} onClick={() => set({ [k]: !slide[k] })}
                    className={cn('flex-1 h-11 rounded-lg border text-sm', slide[k] ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border/40 bg-secondary/40 text-muted-foreground')}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
          {/* Espace pour pouvoir remonter le dernier champ au-dessus du clavier */}
          {typing && <div aria-hidden className="h-[55vh]" />}
        </div>
      </div>

      {/* Actions (cachées pendant la saisie : le clavier les couvrirait) */}
      <div className={cn('p-3 border-t border-border flex gap-2 shrink-0', typing && 'hidden')}>
        <Button onClick={() => onProject(slide)} className="flex-[2] h-12 text-base font-bold btn-gold rounded-xl gap-2">
          <Send className="h-5 w-5" /> PROJETER
        </Button>
        {onAddToDeroule && (
          <Button variant="secondary" className="flex-1 h-12 rounded-xl gap-2" onClick={() => { onAddToDeroule(slide); setAdded(true); setTimeout(() => setAdded(false), 1800); }}>
            {added ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {added ? 'Ajoutée' : 'Déroulé'}
          </Button>
        )}
        <Button variant="ghost" className="h-12 w-12 p-0 rounded-xl" onClick={onClose} aria-label="Fermer"><X className="h-5 w-5" /></Button>
      </div>
    </div>
  );
}
