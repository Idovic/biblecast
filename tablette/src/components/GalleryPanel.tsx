import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Trash2, Image, Layers, CheckCircle2, ToggleLeft, ToggleRight, Film, Plus, Video } from 'lucide-react';
import { loadSettings } from '@/components/SettingsPanel';
import type { CustomSlide, DisplayTheme } from '@/types/bible';
import AnimatedPicker from '@/components/AnimatedPicker';

// ── Image gallery ──────────────────────────────────────────────────────────────

interface GalleryImage {
  id: string;
  label: string;
  url: string;
}

interface GalleryPanelProps {
  selectedSlide: CustomSlide | null;
  theme: DisplayTheme;
  onApplyToSlide: (imageUrl: string) => void;
  onSetVerseBackground: (imageUrl: string | undefined) => void;
  onSetVerseBackgroundVideo: (videoUrl: string | undefined) => void;
  onApplyVideoToSlide: (videoUrl: string) => void;
  onSetLogo: (show: boolean) => void;
  onThemeChange: (theme: DisplayTheme) => void;
  isNative: boolean;
  onOpenBgVideoPicker: (slot: number) => Promise<{ videoUrl: string; fileName: string } | null>;
  onClearBgVideo: (slot: number) => void;
  /** Fonds animés intégrés */
  onSetVerseAnimated: (id: string | undefined, colors?: string[]) => void;
  onApplyAnimatedToSlide: (id: string, colors?: string[]) => void;
}

const GALLERY_STORAGE_KEY = 'biblecast:gallery';
const BGVIDEO_KEY = 'biblecast:bgvideos';
const MAX_BG_VIDEO_SLOTS = 5;

// ── Image helpers ─────────────────────────────────────────────────────────────

async function compressImage(file: File, maxWidth = 1200, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const ratio = Math.min(maxWidth / img.width, 1);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('canvas context')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('load')); };
    img.src = objectUrl;
  });
}

function useGallery() {
  const [userImages, setUserImages] = useState<GalleryImage[]>(() => {
    try { return JSON.parse(localStorage.getItem(GALLERY_STORAGE_KEY) || '[]'); }
    catch { return []; }
  });
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = (imgs: GalleryImage[]) => {
    setUserImages(imgs);
    try {
      localStorage.setItem(GALLERY_STORAGE_KEY, JSON.stringify(imgs));
      setSaveError(null);
    } catch {
      setSaveError('Espace insuffisant. Supprimez des images pour libérer de la place.');
    }
  };

  const addImage    = (label: string, dataUrl: string) => save([...userImages, { id: `user-${Date.now()}`, label, url: dataUrl }]);
  const removeImage = (id: string) => save(userImages.filter(i => i.id !== id));

  return { userImages, addImage, removeImage, saveError };
}

// ── Bg-video gallery ──────────────────────────────────────────────────────────

interface BgVideoEntry {
  id: string;
  label: string;
  slot: number;   // serveur HTTP slot (0–4), -1 en mode web
  url: string;
}

function useBgVideoGallery() {
  const [bgVideos, setBgVideos] = useState<BgVideoEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem(BGVIDEO_KEY) || '[]'); }
    catch { return []; }
  });

  const save = useCallback((videos: BgVideoEntry[]) => {
    setBgVideos(videos);
    try { localStorage.setItem(BGVIDEO_KEY, JSON.stringify(videos)); } catch { }
  }, []);

  const addBgVideo    = useCallback((entry: BgVideoEntry) => {
    setBgVideos(prev => { const next = [...prev, entry]; save(next); return next; });
  }, [save]);

  const removeBgVideo = useCallback((id: string) => {
    setBgVideos(prev => { const next = prev.filter(v => v.id !== id); save(next); return next; });
  }, [save]);

  const maxSlot = bgVideos.reduce((m, v) => Math.max(m, v.slot), -1);

  return { bgVideos, addBgVideo, removeBgVideo, maxSlot };
}

// ── ImageCard ─────────────────────────────────────────────────────────────────

function ImageCard({
  image, isActiveVerse, canDelete, onApplySlide, onApplyVerse, onDelete,
}: {
  image: GalleryImage;
  isActiveVerse: boolean;
  canDelete?: boolean;
  onApplySlide: () => void;
  onApplyVerse: () => void;
  onDelete?: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`relative rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
        isActiveVerse ? 'border-amber-400' : 'border-transparent hover:border-border/60'
      }`}
      style={{ aspectRatio: '16/9' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => setHovered(h => !h)}
    >
      <img src={image.url} alt={image.label} className="w-full h-full object-cover" loading="lazy" />
      {isActiveVerse && (
        <div className="absolute top-1 right-1"><CheckCircle2 className="h-4 w-4 text-amber-400 drop-shadow" /></div>
      )}
      {hovered && (
        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1.5 p-1">
          <p className="text-white text-[10px] font-medium truncate w-full text-center px-1">{image.label}</p>
          <div className="flex gap-1">
            <button onClick={e => { e.stopPropagation(); onApplySlide(); }}
              className="bg-white/20 hover:bg-white/40 text-white text-xs px-3 py-1.5 rounded flex items-center gap-1 transition-colors">
              <Layers className="h-3 w-3" /> Slide
            </button>
            <button onClick={e => { e.stopPropagation(); onApplyVerse(); }}
              className="bg-amber-500/80 hover:bg-amber-500 text-white text-xs px-3 py-1.5 rounded flex items-center gap-1 transition-colors">
              <Image className="h-3 w-3" /> Versets
            </button>
          </div>
          {canDelete && onDelete && (
            <button onClick={e => { e.stopPropagation(); onDelete(); }}
              className="absolute top-1 right-1 bg-red-500/80 hover:bg-red-600 text-white rounded p-0.5 transition-colors">
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── VideoCard ─────────────────────────────────────────────────────────────────

function VideoCard({
  entry, isActiveVerse, onApplySlide, onApplyVerse, onDelete,
}: {
  entry: BgVideoEntry;
  isActiveVerse: boolean;
  onApplySlide: () => void;
  onApplyVerse: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`relative rounded-lg overflow-hidden cursor-pointer border-2 transition-all bg-black/40 ${
        isActiveVerse ? 'border-violet-400' : 'border-transparent hover:border-border/60'
      }`}
      style={{ aspectRatio: '16/9' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => setHovered(h => !h)}
    >
      <video
        src={entry.url + '#t=0.5'}
        className="w-full h-full object-cover opacity-60"
        muted
        preload="metadata"
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <Film className={`h-6 w-6 drop-shadow ${isActiveVerse ? 'text-violet-300' : 'text-white/60'}`} />
      </div>
      {isActiveVerse && (
        <div className="absolute top-1 right-1"><CheckCircle2 className="h-4 w-4 text-violet-400 drop-shadow" /></div>
      )}
      {hovered && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-1.5 p-1">
          <p className="text-white text-[10px] font-medium truncate w-full text-center px-1">{entry.label}</p>
          <div className="flex gap-1">
            <button onClick={e => { e.stopPropagation(); onApplySlide(); }}
              className="bg-white/20 hover:bg-white/40 text-white text-xs px-3 py-1.5 rounded flex items-center gap-1 transition-colors">
              <Layers className="h-3 w-3" /> Slide
            </button>
            <button onClick={e => { e.stopPropagation(); onApplyVerse(); }}
              className="bg-violet-500/80 hover:bg-violet-500 text-white text-xs px-3 py-1.5 rounded flex items-center gap-1 transition-colors">
              <Video className="h-3 w-3" /> Versets
            </button>
          </div>
          <button onClick={e => { e.stopPropagation(); onDelete(); }}
            className="absolute top-1 right-1 bg-red-500/80 hover:bg-red-600 text-white rounded p-0.5 transition-colors">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── GalleryPanel ──────────────────────────────────────────────────────────────

export default function GalleryPanel({
  selectedSlide,
  theme,
  onApplyToSlide,
  onSetVerseBackground,
  onSetVerseBackgroundVideo,
  onApplyVideoToSlide,
  onSetLogo,
  onThemeChange,
  isNative,
  onOpenBgVideoPicker,
  onClearBgVideo,
  onSetVerseAnimated,
  onApplyAnimatedToSlide,
}: GalleryPanelProps) {
  const [presetImages, setPresetImages] = useState<GalleryImage[]>([]);
  const { userImages, addImage, removeImage, saveError } = useGallery();
  const { bgVideos, addBgVideo, removeBgVideo, maxSlot } = useBgVideoGallery();
  const fileRef      = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const settings     = loadSettings();

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'backgrounds/index.json')
      .then(r => r.json())
      .then((imgs: GalleryImage[]) =>
        setPresetImages(imgs.map(img => ({
          ...img,
          url: img.url.startsWith('/') ? import.meta.env.BASE_URL.replace(/\/$/, '') + img.url : img.url,
        })))
      )
      .catch(() => setPresetImages([]));
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const dataUrl = await compressImage(file);
      addImage(file.name.replace(/\.[^.]+$/, ''), dataUrl);
    } catch {
      alert('Impossible de charger cette image. Vérifiez le format (JPG, PNG, WebP).');
    }
  };

  // ── Ajout d'une vidéo de fond ──────────────────────────────────────────
  const handleAddBgVideo = async () => {
    if (bgVideos.length >= MAX_BG_VIDEO_SLOTS) {
      alert('Maximum 5 vidéos de fond. Supprimez-en une pour en ajouter une autre.');
      return;
    }
    const nextSlot = maxSlot + 1;

    if (isNative) {
      const result = await onOpenBgVideoPicker(nextSlot);
      if (result) {
        addBgVideo({ id: `bgv-${Date.now()}`, label: result.fileName, slot: nextSlot, url: result.videoUrl });
      }
    } else {
      videoFileRef.current?.click();
    }
  };

  const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const url = URL.createObjectURL(file);
    addBgVideo({ id: `bgv-${Date.now()}`, label: file.name.replace(/\.[^.]+$/, ''), slot: -1, url });
  };

  const handleDeleteBgVideo = (entry: BgVideoEntry) => {
    if (theme.verseBackgroundVideo === entry.url) onSetVerseBackgroundVideo(undefined);
    if (entry.slot >= 0) onClearBgVideo(entry.slot);
    removeBgVideo(entry.id);
  };

  const activeVerseUrl      = theme.verseBackgroundImage;
  const activeVerseVideoUrl = theme.verseBackgroundVideo;

  // Suppress unused-var warning: selectedSlide is kept for future per-slide video state
  void selectedSlide;

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-5">

      {/* ── Fonds animés intégrés (aucun fichier, marchent hors ligne) ─────── */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Fonds animés
        </h3>
        <p className="text-[11px] text-muted-foreground mb-2">Pour les versets. Le bouton plus bas l'applique aussi à la slide choisie.</p>
        <AnimatedPicker value={theme.verseBackgroundAnimated} colors={theme.verseBackgroundColors} cols={2}
          onChange={(id, colors) => onSetVerseAnimated(id, colors)} />
        {theme.verseBackgroundAnimated && (
          <button onClick={() => onApplyAnimatedToSlide(theme.verseBackgroundAnimated!, theme.verseBackgroundColors)} disabled={!selectedSlide}
            className="mt-2 w-full h-11 rounded-lg text-sm font-medium bg-secondary/70 hover:bg-secondary disabled:opacity-40">
            {selectedSlide ? `Appliquer à la slide « ${selectedSlide.title || 'sans titre'} »` : 'Touchez une slide pour lui appliquer ce fond'}
          </button>
        )}
      </section>

      {/* ── Fonds prédéfinis ──────────────────────────────────────────────── */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Fonds prédéfinis
        </h3>
        {presetImages.length === 0 ? (
          <p className="text-xs text-muted-foreground/60 italic">Chargement…</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {presetImages.map(img => (
              <ImageCard
                key={img.id}
                image={img}
                isActiveVerse={activeVerseUrl === img.url}
                onApplySlide={() => onApplyToSlide(img.url)}
                onApplyVerse={() =>
                  activeVerseUrl === img.url ? onSetVerseBackground(undefined) : onSetVerseBackground(img.url)
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Mes fonds image ───────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Mes fonds
          </h3>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <Upload className="h-3.5 w-3.5" /> Ajouter
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
        </div>
        {saveError && (
          <p className="text-xs text-destructive mb-2 bg-destructive/10 rounded px-2 py-1">{saveError}</p>
        )}
        {userImages.length === 0 ? (
          <div className="border-2 border-dashed border-border/40 rounded-lg p-6 text-center cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => fileRef.current?.click()}>
            <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground/60">Cliquez pour ajouter une image</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {userImages.map(img => (
              <ImageCard
                key={img.id}
                image={img}
                isActiveVerse={activeVerseUrl === img.url}
                canDelete
                onApplySlide={() => onApplyToSlide(img.url)}
                onApplyVerse={() =>
                  activeVerseUrl === img.url ? onSetVerseBackground(undefined) : onSetVerseBackground(img.url)
                }
                onDelete={() => {
                  if (activeVerseUrl === img.url) onSetVerseBackground(undefined);
                  removeImage(img.id);
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Fond image verset actif ───────────────────────────────────────── */}
      {activeVerseUrl && (
        <section>
          <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-center gap-2">
              <img src={activeVerseUrl} alt="Fond actif" className="h-8 w-14 object-cover rounded" />
              <div>
                <p className="text-xs font-medium text-amber-400">Fond image actif</p>
                <p className="text-[10px] text-muted-foreground/60">Affiché sur tous les versets</p>
              </div>
            </div>
            <button onClick={() => onSetVerseBackground(undefined)} className="text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      {/* ── Vidéos de fond ───────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <Film className="h-3.5 w-3.5" /> Vidéos de fond
          </h3>
          {bgVideos.length < MAX_BG_VIDEO_SLOTS && (
            <button
              onClick={handleAddBgVideo}
              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Ajouter
            </button>
          )}
          <input ref={videoFileRef} type="file" accept="video/*" className="hidden" onChange={handleVideoFileChange} />
        </div>

        {bgVideos.length === 0 ? (
          <div className="border-2 border-dashed border-border/40 rounded-lg p-6 text-center cursor-pointer hover:border-violet-500/40 transition-colors"
            onClick={handleAddBgVideo}>
            <Film className="h-6 w-6 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground/60">Cliquez pour ajouter une vidéo de fond</p>
            {!isNative && (
              <p className="text-[10px] text-muted-foreground/40 mt-1">Mode web : session uniquement</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {bgVideos.map(entry => (
              <VideoCard
                key={entry.id}
                entry={entry}
                isActiveVerse={activeVerseVideoUrl === entry.url}
                onApplySlide={() => onApplyVideoToSlide(entry.url)}
                onApplyVerse={() =>
                  activeVerseVideoUrl === entry.url
                    ? onSetVerseBackgroundVideo(undefined)
                    : onSetVerseBackgroundVideo(entry.url)
                }
                onDelete={() => handleDeleteBgVideo(entry)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Fond vidéo verset actif ───────────────────────────────────────── */}
      {activeVerseVideoUrl && (
        <section>
          <div className="flex items-center justify-between p-3 rounded-lg bg-violet-500/10 border border-violet-500/30">
            <div className="flex items-center gap-2">
              <div className="h-8 w-14 rounded bg-black/60 flex items-center justify-center">
                <Film className="h-4 w-4 text-violet-300" />
              </div>
              <div>
                <p className="text-xs font-medium text-violet-400">Fond vidéo actif</p>
                <p className="text-[10px] text-muted-foreground/60">Affiché sur tous les versets</p>
              </div>
            </div>
            <button onClick={() => onSetVerseBackgroundVideo(undefined)} className="text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      {/* ── Logo d'église ─────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Logo d'église
        </h3>
        {settings.churchLogo ? (
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border/40">
            <div className="flex items-center gap-3">
              <img src={settings.churchLogo} alt="Logo" className="h-10 w-10 object-contain rounded bg-secondary p-1 border border-border" />
              <div>
                <p className="text-sm font-medium">{settings.churchName || 'Logo'}</p>
                <p className="text-[10px] text-muted-foreground/60">Superposé en haut des présentations</p>
              </div>
            </div>
            <button
              onClick={() => onSetLogo(!theme.showChurchLogo)}
              className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                theme.showChurchLogo ? 'text-amber-400' : 'text-muted-foreground'
              }`}
            >
              {theme.showChurchLogo ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
              {theme.showChurchLogo ? 'Activé' : 'Désactivé'}
            </button>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-secondary/30 border border-border/30 text-center">
            <p className="text-xs text-muted-foreground/60">
              Ajoutez un logo dans les <strong>Paramètres</strong> pour l'activer
            </p>
          </div>
        )}
      </section>

      {/* ── Typographie versets ───────────────────────────────────────────── */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Typographie versets
        </h3>
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground w-14">Taille</span>
            {(['small','medium','large','xlarge'] as const).map(sz => (
              <button key={sz} onClick={() => onThemeChange({ ...theme, fontSize: sz })}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  theme.fontSize === sz ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-secondary/80 text-muted-foreground'
                }`}>
                {sz === 'small' ? 'S' : sz === 'medium' ? 'M' : sz === 'large' ? 'L' : 'XL'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground w-14">Police</span>
            {(['serif','sans-serif'] as const).map(ff => (
              <button key={ff} onClick={() => onThemeChange({ ...theme, fontFamily: ff })}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  theme.fontFamily === ff ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-secondary/80 text-muted-foreground'
                }`}>
                {ff === 'serif' ? 'Serif' : 'Sans'}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
