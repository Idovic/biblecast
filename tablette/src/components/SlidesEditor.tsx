/* Bibliothèque de slides — liste avec vignettes rendues comme sur la TV.
   Toucher = aperçu · double-toucher = projeter · crayon = éditer en grand au centre. */
import { useRef, useState } from 'react';
import {
  Plus, Trash2, ChevronUp, ChevronDown, Pencil, Image as ImageIcon,
  Download, Upload, LayoutTemplate, CheckCircle2, Send, Copy, Undo2, List,
} from 'lucide-react';
import { cn, genId } from '@/lib/utils';
import type { CustomSlide, DisplayTheme, SlideType } from '@/types/bible';
import type { ChurchSettings } from '@/components/SettingsPanel';
import { pickImage } from '@/lib/image';
import { SceneView } from '@/components/scene/Scene';
import TemplateCatalog from '@/components/TemplateCatalog';
import { slidesFromTemplate, MOMENT_BACKGROUND, type SlideTemplate } from '@/lib/slideTemplates';

interface SlidesEditorProps {
  slides: CustomSlide[];
  onChange: (slides: CustomSlide[]) => void;
  onProjectSlide?: (slide: CustomSlide) => void;
  currentProjectedSlide?: CustomSlide | null;
  /** Toucher une slide : aperçu au centre */
  onSelectSlide?: (slide: CustomSlide | null) => void;
  /** Ouvrir l'éditeur en grand (au centre) */
  onEditSlide: (id: string) => void;
  editingId: string | null;
  theme: DisplayTheme;
  settings: ChurchSettings;
}

function createSlide(type: SlideType): CustomSlide {
  return {
    id: genId(),
    title: type === 'image-full' ? '' : 'Nouveau titre',
    content: '',
    bullets: type === 'bullet-list' ? ['Premier point', 'Deuxième point'] : undefined,
    slideType: type,
    textColor: '#ffffff',
    backgroundAnimated: type === 'image-full' ? undefined : MOMENT_BACKGROUND.parole,
    fontSize: 'large',
    textAlign: type === 'bullet-list' ? 'left' : 'center',
    textShadow: true,
    showLogo: false,
  };
}

const iconBtn = 'h-9 w-9 rounded-lg border border-border/30 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors';

export default function SlidesEditor({ slides, onChange, onProjectSlide, currentProjectedSlide, onSelectSlide, onEditSlide, editingId, theme, settings }: SlidesEditorProps) {
  const [showTemplates, setShowTemplates] = useState(false);
  const [justProjectedId, setJustProjectedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [imageError, setImageError] = useState('');
  const [deleted, setDeleted] = useState<{ slide: CustomSlide; index: number } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toucher = aperçu au centre, double-toucher = projeter (comme pour les versets)
  const selectSlide = (slide: CustomSlide) => { setSelectedId(slide.id); onSelectSlide?.(slide); };
  const handleProject = (slide: CustomSlide) => {
    onProjectSlide?.(slide);
    setJustProjectedId(slide.id);
    setTimeout(() => setJustProjectedId(prev => prev === slide.id ? null : prev), 2500);
  };
  const addAndEdit = (slide: CustomSlide) => {
    onChange([...slides, slide]);
    setSelectedId(slide.id);
    onEditSlide(slide.id);
  };

  const addSlide = (type: SlideType) => {
    const slide = createSlide(type);
    if (type === 'image-full') {
      pickImage().then(img => { if (img) addAndEdit({ ...slide, backgroundImage: img.dataUrl, title: img.name.replace(/\.[^/.]+$/, '') }); else flashError(); });
      return;
    }
    addAndEdit(slide);
  };
  const addFromTemplate = (template: SlideTemplate) => {
    setShowTemplates(false);
    const made = slidesFromTemplate(template);
    if (made[0].slideType === 'image-full') {
      pickImage().then(img => { if (img) addAndEdit({ ...made[0], backgroundImage: img.dataUrl, title: img.name.replace(/\.[^/.]+$/, '') }); else flashError(); });
      return;
    }
    // Plusieurs écrans (ex. Notre Père) : tous ajoutés, le premier s'ouvre
    onChange([...slides, ...made]);
    setSelectedId(made[0].id);
    onEditSlide(made[0].id);
  };
  const flashError = () => { setImageError('Aucune image choisie, ou image illisible.'); setTimeout(() => setImageError(''), 3000); };

  const duplicateSlide = (id: string) => {
    const idx = slides.findIndex(s => s.id === id);
    if (idx < 0) return;
    const arr = [...slides];
    arr.splice(idx + 1, 0, { ...slides[idx], id: genId() });
    onChange(arr);
  };

  // Suppression avec « Annuler » pendant 6 secondes
  const removeSlide = (id: string) => {
    const index = slides.findIndex(s => s.id === id);
    if (index < 0) return;
    setDeleted({ slide: slides[index], index });
    onChange(slides.filter(s => s.id !== id));
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setDeleted(null), 6000);
  };
  const undoDelete = () => {
    if (!deleted) return;
    const arr = [...slides];
    arr.splice(Math.min(deleted.index, arr.length), 0, deleted.slide);
    onChange(arr);
    setDeleted(null);
  };

  const moveSlide = (id: string, dir: -1 | 1) => {
    const idx = slides.findIndex(s => s.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= slides.length) return;
    const arr = [...slides];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    onChange(arr);
  };

  // Export complet, images comprises : pour passer des slides d'une tablette à une autre
  const handleExport = () => {
    const blob = new Blob([JSON.stringify({ _type: 'biblecast-slides', _version: 2, slides }, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `biblecast-slides-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string);
        const data: CustomSlide[] = Array.isArray(raw) ? raw : Array.isArray(raw?.slides) ? raw.slides : [];
        if (data.length) onChange([...slides, ...data.map(s => ({ ...s, id: genId() }))]);
        else setImageError('Ce fichier ne contient pas de slides.');
      } catch { setImageError('Fichier de slides illisible.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {showTemplates && (
        <TemplateCatalog theme={theme} settings={settings} onPick={addFromTemplate} onClose={() => setShowTemplates(false)} />
      )}

      {/* Créer */}
      <div className="shrink-0 px-2 pt-2 pb-1 space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          <button onClick={() => setShowTemplates(true)}
            className="h-11 flex items-center justify-center gap-1.5 rounded-lg bg-primary/15 hover:bg-primary/25 border border-primary/30 text-sm text-primary font-medium">
            <LayoutTemplate className="h-4 w-4" /> Modèles
          </button>
          <button onClick={() => addSlide('text-title')}
            className="h-11 flex items-center justify-center gap-1 rounded-lg border border-dashed border-border/50 bg-secondary/30 hover:bg-secondary/70 text-sm text-muted-foreground hover:text-foreground">
            <Plus className="h-4 w-4" /> Texte
          </button>
          <button onClick={() => addSlide('bullet-list')}
            className="h-11 flex items-center justify-center gap-1 rounded-lg border border-dashed border-border/50 bg-secondary/30 hover:bg-secondary/70 text-sm text-muted-foreground hover:text-foreground">
            <List className="h-4 w-4" /> Liste
          </button>
          <button onClick={() => addSlide('image-full')}
            className="h-11 flex items-center justify-center gap-1 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10 text-sm text-amber-400">
            <ImageIcon className="h-4 w-4" /> Affiche
          </button>
        </div>
        {imageError && <p className="px-1 text-xs text-destructive">{imageError}</p>}
        {deleted && (
          <div className="rounded-lg bg-secondary border border-border/60 px-3 py-1.5 flex items-center gap-2 text-xs">
            <span className="flex-1 truncate">« {deleted.slide.title || 'Slide'} » supprimée</span>
            <button onClick={undoDelete} className="h-9 px-3 rounded-md bg-primary/20 text-primary font-semibold flex items-center gap-1"><Undo2 className="h-3.5 w-3.5" /> Annuler</button>
          </div>
        )}
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] text-muted-foreground">{slides.length} slide{slides.length > 1 ? 's' : ''}</span>
          <div className="flex gap-1">
            {slides.length > 0 && (
              <button onClick={handleExport} title="Exporter les slides (images comprises)" className={iconBtn}><Download className="h-4 w-4" /></button>
            )}
            <label title="Importer des slides" className={cn(iconBtn, 'cursor-pointer')}>
              <Upload className="h-4 w-4" />
              <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImport} />
            </label>
          </div>
        </div>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-2">
        {slides.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-8 space-y-3 px-4">
            <LayoutTemplate className="h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">Aucune slide</p>
            <button onClick={() => setShowTemplates(true)}
              className="h-11 flex items-center gap-2 px-4 rounded-xl bg-primary/15 hover:bg-primary/25 border border-primary/30 text-sm text-primary font-medium">
              <LayoutTemplate className="h-4 w-4" /> Choisir un modèle
            </button>
          </div>
        )}

        {slides.map((slide, idx) => {
          const isEditing = editingId === slide.id;
          const isProjected = currentProjectedSlide?.id === slide.id;
          const justProjected = justProjectedId === slide.id;
          return (
            <div key={slide.id} className={cn('rounded-xl border p-1.5 transition-colors',
              isEditing ? 'border-primary/60 bg-primary/10' : isProjected ? 'border-green-500/40 bg-green-500/5' : selectedId === slide.id ? 'border-primary/40 bg-secondary/40' : 'border-border/40 bg-secondary/30')}>
              <div className="relative rounded-lg overflow-hidden cursor-pointer"
                onClick={() => selectSlide(slide)}
                onDoubleClick={() => { selectSlide(slide); handleProject(slide); }}
                role="button" aria-label={`Aperçu : ${slide.title || 'slide'}`}>
                <div className="pointer-events-none">
                  <SceneView content={{ id: 0, kind: 'slide', slide: { ...slide, revealed: undefined } }} theme={theme} settings={settings} still />
                </div>
                {justProjected && (
                  <div className="absolute inset-0 flex items-center justify-center bg-green-500/25 pointer-events-none">
                    <span className="text-green-300 font-bold text-sm flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Projetée</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 mt-1.5">
                {isProjected && <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />}
                <span className="text-[11px] text-muted-foreground flex-1 truncate font-medium">{slide.title || 'Sans titre'}</span>
                {onProjectSlide && (
                  <button onClick={() => handleProject(slide)} title="Projeter" aria-label="Projeter"
                    className={cn(iconBtn, isProjected && 'border-green-500/50 text-green-400')}><Send className="h-4 w-4" /></button>
                )}
                <button onClick={() => onEditSlide(slide.id)} title="Modifier en grand" aria-label="Modifier"
                  className={cn(iconBtn, isEditing && 'border-primary/60 bg-primary/20 text-primary')}><Pencil className="h-4 w-4" /></button>
              </div>
              <div className="flex items-center gap-1 mt-1 justify-end">
                <button onClick={() => moveSlide(slide.id, -1)} disabled={idx === 0} className={iconBtn} aria-label="Monter"><ChevronUp className="h-4 w-4" /></button>
                <button onClick={() => moveSlide(slide.id, 1)} disabled={idx === slides.length - 1} className={iconBtn} aria-label="Descendre"><ChevronDown className="h-4 w-4" /></button>
                <button onClick={() => duplicateSlide(slide.id)} className={iconBtn} title="Dupliquer" aria-label="Dupliquer"><Copy className="h-4 w-4" /></button>
                <button onClick={() => removeSlide(slide.id)} className={cn(iconBtn, 'hover:text-destructive')} title="Supprimer" aria-label="Supprimer"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
