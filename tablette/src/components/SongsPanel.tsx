/* Chants : recherche, fiche du chant en tuiles (toucher = aperçu, double-toucher = projeter à partir d'ici),
   ajout au déroulé, saisie et partage par fichier. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Music2, Plus, Search, Send, Pencil, Upload, Download, ListPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { CustomSlide, DisplayTheme } from '@/types/bible';
import type { ChurchSettings } from '@/components/SettingsPanel';
import SongEditor from '@/components/SongEditor';
import { loadSongs, saveSong, deleteSong, saveSongs, searchSongs, songScreens, songSlides, firstLine, exportSongsJson, parseSongsFile, newSong, type Song } from '@/lib/songs';

export default function SongsPanel({ onPreview, onProject, onAddToDeroule, live, theme, settings, onSongWave }: {
  onPreview: (slide: CustomSlide) => void;
  /** Projette le chant à partir de l'écran `index` */
  onProject: (song: Song, index: number) => void;
  onAddToDeroule: (song: Song) => void;
  /** Chant en cours sur les TV */
  live: { songId: string; index: number } | null;
  theme: DisplayTheme; settings: ChurchSettings;
  onSongWave: (on: boolean) => void;
}) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Song | null>(null);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const lastTap = useRef<{ i: number; t: number } | null>(null);

  const refresh = () => loadSongs().then(s => { setSongs(s); setLoaded(true); });
  useEffect(() => { refresh(); }, []);
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3500); };

  const list = useMemo(() => searchSongs(songs, q), [songs, q]);
  const open = songs.find(s => s.id === openId) ?? null;
  const screens = useMemo(() => (open ? songScreens(open) : []), [open]);
  const slides = useMemo(() => (open ? songSlides(open) : []), [open]);

  const tapScreen = (i: number) => {
    if (!open) return;
    const now = Date.now();
    if (lastTap.current && lastTap.current.i === i && now - lastTap.current.t < 400) { onProject(open, i); lastTap.current = null; return; }
    lastTap.current = { i, t: now };
    // Pendant le chant (en direct) : un toucher suffit pour sauter à cet endroit
    if (live?.songId === open.id) onProject(open, i); else onPreview(slides[i]);
  };

  const handleSave = async (s: Song) => {
    if (await saveSong(s)) { setEditing(null); setOpenId(s.id); refresh(); }
    else flash('Enregistrement impossible : mémoire de la tablette pleine ?');
  };
  const handleDelete = async (s: Song) => { await deleteSong(s.id); setEditing(null); setOpenId(null); refresh(); };

  const handleExport = async () => {
    const data = exportSongsJson(songs);
    const name = `biblecast-chants-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      const file = new File([data], name, { type: 'application/json' });
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Chants BibleCast' }); return; }
    } catch { /* téléchargement */ }
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 800);
  };
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const list = parseSongsFile(String(ev.target?.result ?? ''), songs);
      if (!list.length) { flash('Aucun chant trouvé dans ce fichier.'); return; }
      const n = await saveSongs(list); refresh();
      flash(`${n} chant${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''}.`);
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {editing && <SongEditor song={editing} theme={theme} settings={settings} onSave={handleSave} onDelete={songs.some(s => s.id === editing.id) ? handleDelete : undefined} onClose={() => setEditing(null)} />}
      <input ref={fileRef} type="file" accept=".json,.txt,application/json,text/plain" className="hidden" onChange={handleImport} />

      {!open ? (
        <>
          <div className="shrink-0 px-2 pt-2 space-y-1.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Titre, auteur ou paroles…" aria-label="Chercher un chant" className="h-11 pl-9 pr-9 bg-secondary" />
              {q && <button onClick={() => setQ('')} className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center text-muted-foreground" aria-label="Effacer"><X className="h-4 w-4" /></button>}
            </div>
            <div className="flex gap-1.5">
              <Button onClick={() => setEditing(newSong())} className="flex-1 h-11 gap-1.5 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30"><Plus className="h-4 w-4" /> Nouveau chant</Button>
              <button onClick={() => fileRef.current?.click()} title="Importer des chants (.json ou .txt)" aria-label="Importer des chants" className="h-11 w-11 rounded-lg border border-border/40 flex items-center justify-center text-muted-foreground hover:text-foreground"><Upload className="h-4 w-4" /></button>
              <button onClick={handleExport} disabled={!songs.length} title="Partager tous les chants (fichier)" aria-label="Exporter les chants" className="h-11 w-11 rounded-lg border border-border/40 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"><Download className="h-4 w-4" /></button>
            </div>
            {msg && <p className="text-xs text-primary px-1">{msg}</p>}
            <div className="flex items-center justify-between px-1">
              <p className="text-[11px] text-muted-foreground">{songs.length} chant{songs.length > 1 ? 's' : ''}</p>
              <button onClick={() => onSongWave(settings.songWave === false)} className="h-8 flex items-center gap-1.5 text-[11px] text-muted-foreground" aria-pressed={settings.songWave !== false}>
                <span className={cn('h-4 w-7 rounded-full p-0.5 transition-colors', settings.songWave !== false ? 'bg-sky-400' : 'bg-border')}>
                  <span className={cn('block h-3 w-3 rounded-full bg-white transition-transform', settings.songWave !== false && 'translate-x-3')} />
                </span>
                Onde pendant les chants
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 space-y-1">
            {loaded && !songs.length && (
              <div className="text-center px-4 py-8 space-y-3">
                <Music2 className="h-10 w-10 mx-auto text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Aucun chant pour l'instant.</p>
                <p className="text-xs text-muted-foreground leading-relaxed">« Nouveau chant », puis collez les paroles : une ligne vide entre les strophes, et « Refrain » au-dessus du refrain. Ou importez un fichier de chants partagé par une autre église.</p>
              </div>
            )}
            {list.map(s => (
              <button key={s.id} onClick={() => setOpenId(s.id)}
                className={cn('w-full text-left rounded-lg px-3 py-2.5 border transition-colors', live?.songId === s.id ? 'border-primary/50 bg-primary/10' : 'border-transparent hover:bg-secondary/60')}>
                <p className="text-sm font-semibold leading-tight truncate">{s.title}</p>
                <p className="text-[11px] text-muted-foreground truncate">{[s.author, firstLine(s)].filter(Boolean).join(' · ')}</p>
              </button>
            ))}
            {loaded && songs.length > 0 && !list.length && <p className="text-xs text-muted-foreground text-center py-6">Aucun chant ne correspond.</p>}
          </div>
        </>
      ) : (
        <>
          <div className="shrink-0 px-2 pt-2 space-y-2">
            <div className="flex items-start gap-1">
              <button onClick={() => setOpenId(null)} className="h-10 w-10 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Retour à la liste"><ArrowLeft className="h-5 w-5" /></button>
              <div className="flex-1 min-w-0 pt-1">
                <p className="font-semibold leading-tight">{open.title}</p>
                {open.author && <p className="text-[11px] text-muted-foreground">{open.author}</p>}
              </div>
              <button onClick={() => setEditing(open)} className="h-10 w-10 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Modifier le chant"><Pencil className="h-4 w-4" /></button>
            </div>
            <div className="flex gap-1.5">
              <Button onClick={() => onProject(open, 0)} className="flex-1 h-11 gap-1.5 btn-gold"><Send className="h-4 w-4" /> Projeter</Button>
              <Button variant="secondary" onClick={() => { onAddToDeroule(open); flash('Ajouté au déroulé.'); }} className="h-11 gap-1.5"><ListPlus className="h-4 w-4" /> Déroulé</Button>
            </div>
            {msg && <p className="text-xs text-primary px-1">{msg}</p>}
            <p className="text-[11px] text-muted-foreground px-1">{screens.length} écrans · toucher = aperçu · double-toucher = projeter d'ici</p>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 pt-1 space-y-1.5">
            {screens.map((sc, i) => {
              const isLive = live?.songId === open.id && live.index === i;
              const startsSection = i === 0 || screens[i - 1].key !== sc.key;
              return (
                <button key={i} onClick={() => tapScreen(i)}
                  className={cn('w-full text-left rounded-lg border px-2.5 py-2 flex gap-2 transition-colors',
                    isLive ? 'border-primary bg-primary/15 ring-2 ring-primary/30' : 'border-border/40 bg-secondary/30 hover:bg-secondary/60')}>
                  <span className={cn('shrink-0 h-6 min-w-8 px-1.5 rounded-md text-[11px] font-bold flex items-center justify-center',
                    sc.key.startsWith('R') ? 'bg-primary/25 text-primary' : 'bg-secondary text-muted-foreground', !startsSection && 'opacity-40')}>{sc.short}</span>
                  <span className="text-xs leading-snug text-foreground/90 line-clamp-2">{sc.lines.join(' / ')}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
