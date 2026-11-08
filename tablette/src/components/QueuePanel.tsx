/* Déroulé du culte — un seul endroit pour préparer et suivre le culte, rangé par moments.
   Toucher = aperçu · double-toucher = projeter · appui long = déplacer · « ⋯ » = plus d'actions.
   Toucher un moment le rend actif : les ajouts (versets, slides) s'y rangent. */
import { memo, useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, ChevronDown, History, Plus, MoreHorizontal, Send, Pencil, ArrowUp, ArrowDown, Move, Trash2, ListOrdered, AudioLines } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import type { BibleData, DisplayTheme, QueueItem } from '@/types/bible';
import type { ChurchSettings } from '@/components/SettingsPanel';
import { formatReference } from '@/lib/bible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import ProgrammeMenu from '@/components/ProgrammeMenu';
import HistoryArchive from '@/components/HistoryArchive';
import { SceneView, type SceneContentData } from '@/components/scene/Scene';
import type { ProgrammeMeta } from '@/lib/deroule';

interface QueuePanelProps {
  queue: QueueItem[];
  history: QueueItem[];
  currentId: string | null;
  mode: 'preparer' | 'direct';
  activeSectionId: string | null;
  onSetActiveSection: (id: string | null) => void;
  meta: ProgrammeMeta;
  saved: boolean;
  bible: BibleData | null;
  onRename: (name: string) => void;
  onLoad: (meta: ProgrammeMeta, queue: QueueItem[]) => void;
  onSelectItem: (item: QueueItem) => void;
  onSendItem: (item: QueueItem) => void;
  onEditSlide: (item: QueueItem) => void;
  onRemoveFromQueue: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onMoveAfter: (id: string, afterId: string) => void;
  onToggleCollapse: (sectionId: string) => void;
  /** Onde décorative pendant cet élément / ce moment */
  onToggleWave: (id: string) => void;
  onResend: (item: QueueItem) => void;
  onNext: () => void;
  onPrev: () => void;
  onAddSection: (name: string, color: string) => void;
  theme: DisplayTheme;
  settings: ChurchSettings;
}

const SECTION_COLORS = ['#f4a261', '#e63946', '#457b9d', '#2a9d8f', '#8338ec', '#fb8500'];

function getItemLabel(item: QueueItem): string {
  if (item.type === 'verse' && item.verse) return formatReference(item.verse);
  if (item.type === 'slide' && item.slide) return item.slide.title || 'Slide sans titre';
  if (item.type === 'section') return item.sectionName || 'Moment';
  return '—';
}
function getItemPreview(item: QueueItem): string {
  if (item.type === 'verse' && item.verse) return item.verse.text;
  if (item.type === 'slide' && item.slide) {
    if (item.slide.slideType === 'bullet-list') return (item.slide.bullets || []).filter(Boolean).join(' · ');
    return item.slide.content || '';
  }
  return '';
}
function itemScene(item: QueueItem): SceneContentData {
  if (item.type === 'verse' && item.verse) return { id: 0, kind: 'verse', verse: item.verse };
  if (item.type === 'slide' && item.slide) return { id: 0, kind: 'slide', slide: { ...item.slide, revealed: undefined } };
  return { id: 0, kind: 'empty' };
}

/** Vignette rendue par le moteur de la TV ; recalculée seulement si l'élément change */
const Thumb = memo(function Thumb({ item, theme, settings }: { item: QueueItem; theme: DisplayTheme; settings: ChurchSettings }) {
  return (
    <div className="w-[84px] shrink-0 rounded-md overflow-hidden border border-border/40 pointer-events-none">
      <SceneView content={itemScene(item)} theme={theme} settings={settings} still />
    </div>
  );
});

function useLongPress(onLong: () => void, ms = 550) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  return {
    fired,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        fired.current = false; start.current = { x: e.clientX, y: e.clientY };
        clear(); timer.current = setTimeout(() => { fired.current = true; onLong(); }, ms);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
      },
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
    },
  };
}

function ItemRow({ item, isCurrent, isNext, inSection, moving, moveSource, theme, settings, onTap, onDouble, onLong, onMenu, sectionWave }: {
  item: QueueItem; sectionWave?: boolean; isCurrent: boolean; isNext: boolean; inSection: boolean; moving: boolean; moveSource: boolean;
  theme: DisplayTheme; settings: ChurchSettings;
  onTap: () => void; onDouble: () => void; onLong: () => void; onMenu: () => void;
}) {
  const lp = useLongPress(onLong);
  return (
    <div className={cn('relative flex items-center gap-2 p-1.5 pr-1 rounded-xl border transition-colors select-none cursor-pointer',
      inSection && 'ml-2',
      isCurrent ? 'bg-primary/15 border-primary/60' : moveSource ? 'border-sky-400 border-dashed bg-sky-400/10' : 'bg-secondary/50 border-transparent hover:border-primary/20',
      moving && !moveSource && 'border-dashed border-sky-400/40')}
      {...lp.handlers}
      onClick={() => { if (lp.fired.current) { lp.fired.current = false; return; } onTap(); }}
      onDoubleClick={onDouble}
      onContextMenu={e => e.preventDefault()}
      role="button" aria-label={getItemLabel(item)}>
      <Thumb item={item} theme={theme} settings={settings} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn('text-[10px] font-semibold', item.type === 'verse' ? 'text-primary' : 'text-sky-300')}>{item.type === 'verse' ? 'Verset' : item.slide?.slideType === 'definition' ? 'Dictionnaire' : 'Slide'}</span>
          {isCurrent && <span className="text-[10px] font-bold text-primary">▶ EN COURS</span>}
          {isNext && !isCurrent && <span className="text-[10px] font-semibold text-sky-400">SUIVANT</span>}
          {(item.wave || sectionWave) && <AudioLines className="h-3 w-3 text-sky-300 ml-auto shrink-0" aria-label="avec onde" />}
        </div>
        <p className={cn('font-semibold text-xs truncate', isCurrent ? 'text-primary' : 'text-foreground')}>{getItemLabel(item)}</p>
        <p className="text-[10px] text-muted-foreground line-clamp-1">{getItemPreview(item)}</p>
      </div>
      <button onClick={e => { e.stopPropagation(); onMenu(); }} onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
        className="h-10 w-9 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary"
        aria-label={`Actions pour ${getItemLabel(item)}`}>
        <MoreHorizontal className="h-5 w-5" />
      </button>
    </div>
  );
}

export default function QueuePanel(p: QueuePanelProps) {
  const { queue, history, currentId, activeSectionId, theme, settings } = p;
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [sectionName, setSectionName] = useState('');
  const [sectionColor, setSectionColor] = useState(SECTION_COLORS[0]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const items = queue.filter(q => q.type !== 'section');
  const currentIdx = currentId ? items.findIndex(q => q.id === currentId) : -1;
  const nextId = items[currentIdx + 1]?.id ?? null;
  const activeSection = queue.find(q => q.id === activeSectionId);
  const hasSections = queue.some(q => q.type === 'section');

  // En direct : la liste suit le culte
  useEffect(() => {
    if (p.mode !== 'direct' || !currentId) return;
    rowRefs.current[currentId]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [currentId, p.mode]);

  const handleAddSection = () => {
    if (!sectionName.trim()) return;
    p.onAddSection(sectionName.trim(), sectionColor);
    setSectionName(''); setShowSectionForm(false);
  };
  const drop = (afterId: string) => { if (movingId) { p.onMoveAfter(movingId, afterId); setMovingId(null); } };

  // Rendu : moments repliables, éléments rangés dessous
  let collapsed = false;
  let inSection = false;
  let secWave = false;
  const rows: React.ReactNode[] = [];
  queue.forEach((item, idx) => {
    if (item.type === 'section') {
      collapsed = !!item.collapsed; inSection = true; secWave = !!item.wave;
      const color = item.sectionColor || '#f4a261';
      const active = item.id === activeSectionId;
      let n = 0; for (let i = idx + 1; i < queue.length && queue[i].type !== 'section'; i++) n++;
      rows.push(
        <div key={item.id} ref={el => { rowRefs.current[item.id] = el; }} className="relative">
          <div className={cn('flex items-center gap-1 rounded-xl border pl-1 pr-1 mt-2 transition-colors',
            active ? 'border-primary bg-primary/10' : movingId ? 'border-dashed border-sky-400/60' : 'border-transparent')}>
            <button onClick={() => p.onToggleCollapse(item.id)} className="h-10 w-8 flex items-center justify-center text-muted-foreground" aria-label={item.collapsed ? 'Déplier' : 'Replier'}>
              <ChevronDown className={cn('h-4 w-4 transition-transform', item.collapsed && '-rotate-90')} />
            </button>
            <button className="flex-1 min-w-0 h-10 flex items-center gap-2 text-left"
              onClick={() => movingId ? drop(item.id) : p.onSetActiveSection(active ? null : item.id)}>
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
              <span className="text-xs font-bold uppercase tracking-wide truncate" style={{ color }}>{item.sectionName}</span>
              <span className="text-[10px] text-muted-foreground">{n}</span>
              {item.wave && <AudioLines className="h-3.5 w-3.5 text-sky-300 shrink-0" aria-label="onde pendant ce moment" />}
              {active && <span className="ml-auto text-[10px] text-primary font-semibold shrink-0">ajouts ici</span>}
            </button>
            <button onClick={() => setMenuId(menuId === item.id ? null : item.id)} className="h-10 w-9 flex items-center justify-center text-muted-foreground hover:text-foreground" aria-label={`Actions pour ${item.sectionName}`}>
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
          {menuId === item.id && (
            <div className="absolute right-1 top-full z-30 mt-1 w-56 rounded-xl border border-border bg-popover shadow-xl p-1">
              <button className="w-full h-11 px-3 rounded-lg text-sm flex items-center gap-2 hover:bg-secondary" onClick={() => { p.onToggleWave(item.id); setMenuId(null); }}>
                <AudioLines className="h-4 w-4 text-sky-300" /> {item.wave ? "Retirer l'onde de ce moment" : 'Onde pendant tout ce moment'}
              </button>
              <button className="w-full h-11 px-3 rounded-lg text-sm flex items-center gap-2 hover:bg-secondary text-destructive" onClick={() => { p.onRemoveFromQueue(item.id); setMenuId(null); }}>
                <Trash2 className="h-4 w-4" /> Supprimer le moment
              </button>
            </div>
          )}
        </div>,
      );
      return;
    }
    if (collapsed && item.id !== currentId) return;
    rows.push(
      <div key={item.id} ref={el => { rowRefs.current[item.id] = el; }} className="relative">
        <ItemRow item={item} isCurrent={item.id === currentId} isNext={item.id === nextId} inSection={inSection}
          moving={!!movingId} moveSource={movingId === item.id} theme={theme} settings={settings} sectionWave={inSection && secWave}
          onTap={() => movingId ? drop(item.id) : p.onSelectItem(item)}
          onDouble={() => { if (!movingId) p.onSendItem(item); }}
          onLong={() => { setMovingId(item.id); setMenuId(null); }}
          onMenu={() => setMenuId(menuId === item.id ? null : item.id)} />
        {menuId === item.id && (
          <div className="absolute right-1 top-full z-30 mt-1 w-52 rounded-xl border border-border bg-popover shadow-xl p-1">
            {([
              ['Projeter', Send, () => p.onSendItem(item)],
              ...(item.type === 'slide' ? [['Modifier la slide', Pencil, () => p.onEditSlide(item)] as const] : []),
              [item.wave ? "Sans onde" : 'Avec onde (louange)', AudioLines, () => p.onToggleWave(item.id)],
              ['Monter', ArrowUp, () => p.onMoveUp(item.id)],
              ['Descendre', ArrowDown, () => p.onMoveDown(item.id)],
              ['Déplacer…', Move, () => setMovingId(item.id)],
              ['Supprimer', Trash2, () => p.onRemoveFromQueue(item.id)],
            ] as const).map(([label, Icon, fn]) => (
              <button key={label} className={cn('w-full h-11 px-3 rounded-lg text-sm flex items-center gap-2 hover:bg-secondary', label === 'Supprimer' && 'text-destructive')}
                onClick={() => { fn(); setMenuId(null); }}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        )}
      </div>,
    );
  });

  return (
    <Tabs defaultValue="timeline" className="flex flex-col h-full">
      <TabsList className="mx-3 mt-3 bg-secondary/80 backdrop-blur-sm">
        <TabsTrigger value="timeline" className="flex-1 gap-1.5 transition-smooth data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
          <ListOrdered className="h-4 w-4" /> Déroulé
        </TabsTrigger>
        <TabsTrigger value="history" className="flex-1 gap-1.5 transition-smooth data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
          <History className="h-4 w-4" /> Historique
        </TabsTrigger>
      </TabsList>

      <TabsContent value="timeline" className="flex-1 mt-0 overflow-hidden flex flex-col data-[state=inactive]:hidden">
        <div className="px-3 pt-2">
          <ProgrammeMenu meta={p.meta} queue={queue} bible={p.bible} saved={p.saved} onRename={p.onRename} onLoad={p.onLoad} />
        </div>
        {/* Navigation + nouveau moment */}
        <div className="px-3 py-2 border-b border-border flex items-center gap-1.5">
          <Button size="sm" variant="secondary" onClick={p.onPrev} disabled={currentIdx <= 0} className="h-10 w-10 p-0" title="Précédent">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="flex-1 text-center text-xs text-muted-foreground">
            {currentIdx >= 0 ? `${currentIdx + 1} / ${items.length}` : `— / ${items.length}`}
          </span>
          <Button size="sm" variant="secondary" onClick={p.onNext} disabled={items.length === 0 || currentIdx >= items.length - 1} className="h-10 w-10 p-0" title="Suivant">
            <ChevronRight className="h-5 w-5" />
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setShowSectionForm(v => !v)} className="h-10 px-2.5 gap-1 ml-1" title="Ajouter un moment">
            <Plus className="h-4 w-4" /><span className="text-xs">Moment</span>
          </Button>
        </div>

        {showSectionForm && (
          <div className="px-3 py-2.5 border-b border-border bg-secondary/30 space-y-2">
            <Input value={sectionName} onChange={e => setSectionName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddSection()}
              placeholder="Nom du moment (ex : Louange)" className="bg-secondary h-11 text-sm" autoFocus />
            <div className="flex items-center gap-2">
              {SECTION_COLORS.map(c => (
                <button key={c} onClick={() => setSectionColor(c)} aria-label={`Couleur ${c}`}
                  className={cn('w-7 h-7 rounded-full border-2 transition-all', sectionColor === c ? 'border-white scale-110' : 'border-transparent opacity-70')}
                  style={{ backgroundColor: c }} />
              ))}
              <div className="flex-1" />
              <Button size="sm" variant="ghost" className="h-10 text-xs px-2" onClick={() => setShowSectionForm(false)}>Annuler</Button>
              <Button size="sm" className="h-10 text-xs px-3 btn-gold" onClick={handleAddSection} disabled={!sectionName.trim()}>Ajouter</Button>
            </div>
          </div>
        )}

        {/* Où vont les ajouts / déplacement en cours */}
        {movingId ? (
          <div className="mx-3 mt-2 rounded-lg bg-sky-500/15 border border-sky-400/40 px-3 py-2 flex items-center gap-2 text-xs text-sky-200">
            <Move className="h-4 w-4 shrink-0" />
            <span className="flex-1">Touchez l'élément ou le moment après lequel le placer.</span>
            <button className="h-9 px-2 rounded-md bg-secondary text-foreground" onClick={() => setMovingId(null)}>Annuler</button>
          </div>
        ) : hasSections && (
          <div className="mx-3 mt-2 text-[11px] text-muted-foreground flex items-center gap-1.5 min-h-[28px]">
            {activeSection ? (
              <>
                <span className="flex-1">Les ajouts vont dans <b className="text-primary">{activeSection.sectionName}</b></span>
                <button className="h-7 w-7 flex items-center justify-center rounded hover:bg-secondary" onClick={() => p.onSetActiveSection(null)} aria-label="Ajouter à la fin"><X className="h-3.5 w-3.5" /></button>
              </>
            ) : <span>Touchez un moment pour y ranger les ajouts.</span>}
          </div>
        )}

        <ScrollArea className="flex-1">
          <div className="p-3 pb-24 space-y-1.5" onClick={e => { if (e.target === e.currentTarget) setMenuId(null); }}>
            {queue.length === 0 && (
              <div className="text-muted-foreground text-sm text-center py-6 space-y-2">
                <p>Déroulé vide.</p>
                <p className="text-xs">Touchez le nom du culte en haut pour partir d'un modèle, ou ajoutez des versets et des slides.</p>
              </div>
            )}
            {rows}
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="history" className="flex-1 mt-0 overflow-hidden data-[state=inactive]:hidden">
        <ScrollArea className="h-full">
          <div className="p-3 space-y-2">
            {history.length === 0 && <p className="text-muted-foreground text-sm text-center py-4">Aucun élément projeté.</p>}
            {history.map(item => (
              <button key={item.id} onClick={() => p.onResend(item)}
                className="w-full text-left p-3 bg-secondary/60 hover:bg-surface-hover rounded-lg border border-transparent hover:border-primary/15 transition-smooth">
                <span className={cn('text-[10px] font-medium', item.type === 'verse' ? 'text-primary' : 'text-sky-300')}>{item.type === 'verse' ? 'Verset' : 'Slide'}</span>
                <p className="text-primary font-semibold text-sm">{getItemLabel(item)}</p>
                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{getItemPreview(item)}</p>
              </button>
            ))}
            <HistoryArchive />
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}
