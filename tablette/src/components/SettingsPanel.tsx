/* Panneau Paramètres de l'église — sauvegarde localStorage */
import { useState } from 'react';
import { X, Upload, Church, Monitor, Type, Layers, Eye, Timer, Sparkles, Clock, BookOpen, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { pickImage } from '@/lib/image';
import { SERIF_FONTS, SANS_FONTS } from '@/lib/fonts';
import { BIBLE_VERSIONS } from '@/lib/versions';
import { cn } from '@/lib/utils';
import { importBDS, clearBDSCache } from '@/lib/bible';
import { ANIMATED_BACKGROUNDS } from '@/components/scene/animated';

/** Groupe de boutons à choix unique (grands boutons, faciles au doigt) */
function Choice<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; hint?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cn('min-h-11 py-2 px-3 rounded-lg border text-left text-xs transition-all',
            value === o.value ? 'border-primary/50 bg-primary/10 text-foreground font-medium' : 'border-border/40 bg-secondary/40 text-muted-foreground hover:bg-secondary/80')}>
          {o.label}
          {o.hint && <span className="block text-[11px] opacity-60 font-normal">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}

export interface ChurchSettings {
  churchName: string;
  churchLogo: string;
  defaultFont: string;
  fontSerif?: string;
  fontSans?: string;
  defaultFontSize: 'normal' | 'large' | 'xlarge';
  transitionSpeed: number;
  bibleVersion: string;
  bible2Version: string;
  showVerseReference: boolean;
  textShadowDefault: boolean;
  autoAdvance: boolean;
  autoAdvanceDelay: number;
  lineSpacing: 'tight' | 'normal' | 'relaxed';
  verseQuotes: boolean;
  displayBgBlur: boolean;
  showClock: boolean;
  showClockSeconds: boolean;
  showClockDate: boolean;
  showVerseOfDay: boolean;
  verseOfDayMode: 'random' | 'manual';
  verseOfDayRef: string;
  autoSleep: boolean;
  autoSleepDelay: number;
  splitLayout: 'horizontal' | 'vertical';
  keepScreenOn: boolean;
  /* Écran TV */
  transitionStyle: 'fondu' | 'fondu-noir' | 'glissement' | 'zoom';
  verseStyle: 'classique' | 'moderne' | 'bandeau';
  kenBurns: boolean;
  /** Fond animé de l'écran d'attente ('' = fond des versets) */
  standbyBackground: string;
  standbyBackgroundColors?: string[];
  /** Fonds animés : auto (riches si la TV suit) / éco (toujours légers) / max (toujours riches) */
  bgQuality?: 'auto' | 'eco' | 'max';
  /** Heure du culte « HH:MM » pour le compte à rebours ('' = désactivé) */
  countdownTime: string;
  /** Annonces affichées en boucle sur l'écran d'attente (une par ligne) */
  standbyAnnouncements: string;
  /** Onde décorative (louange, chorale) */
  waveStyle?: 'barres' | 'miroir' | 'onde' | 'points';
  wavePosition?: 'bas' | 'centre' | 'haut';
  /** '' = or du thème */
  waveColor?: string;
}

const STORAGE_KEY = 'biblecast-settings';

export const DEFAULT_SETTINGS: ChurchSettings = {
  churchName: '',
  churchLogo: '',
  defaultFont: 'Merriweather',
  fontSerif: 'Lora',
  fontSans: 'Lato',
  defaultFontSize: 'large',
  transitionSpeed: 700,
  bibleVersion: 'LSG 1910',
  bible2Version: 'Darby',
  showVerseReference: true,
  textShadowDefault: true,
  autoAdvance: false,
  autoAdvanceDelay: 5000,
  lineSpacing: 'normal',
  verseQuotes: true,
  displayBgBlur: false,
  showClock: true,
  showClockSeconds: false,
  showClockDate: false,
  showVerseOfDay: true,
  verseOfDayMode: 'random',
  verseOfDayRef: '',
  autoSleep: false,
  autoSleepDelay: 5,
  splitLayout: 'horizontal',
  keepScreenOn: false,
  transitionStyle: 'fondu',
  verseStyle: 'classique',
  kenBurns: true,
  standbyBackground: 'aurore',
  bgQuality: 'auto',
  countdownTime: '',
  standbyAnnouncements: '',
};

/* ── Sauvegarde des présentations (IndexedDB biblecast-pres-db / pages) ── */
function openPresDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open('biblecast-pres-db', 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('pages')) req.result.createObjectStore('pages'); };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function idbExportAll(): Promise<Record<string, string[]>> {
  const db = await openPresDb();
  return new Promise((res, rej) => {
    const out: Record<string, string[]> = {};
    const req = db.transaction('pages', 'readonly').objectStore('pages').openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (c) { out[String(c.key)] = c.value as string[]; c.continue(); } else { db.close(); res(out); }
    };
    req.onerror = () => { db.close(); rej(req.error); };
  });
}
async function idbImportAll(data: Record<string, string[]>): Promise<void> {
  const db = await openPresDb();
  return new Promise((res, rej) => {
    const tx = db.transaction('pages', 'readwrite');
    const store = tx.objectStore('pages');
    Object.entries(data).forEach(([id, pages]) => store.put(pages, id));
    tx.oncomplete = () => { db.close(); res(); };
    tx.onerror = () => { db.close(); rej(tx.error); };
  });
}

export function loadSettings(): ChurchSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const merged: ChurchSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      if (!BIBLE_VERSIONS.some(v => v.id === merged.bible2Version)) merged.bible2Version = 'Darby';
      return merged;
    }
  } catch { }
  return DEFAULT_SETTINGS;
}

export function saveSettings(s: ChurchSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* mémoire pleine */ }
}



const SPEEDS = [
  { label: 'Rapide (300ms)', value: 300 },
  { label: 'Normal (0,7 s)', value: 700 },
  { label: 'Lent (1s)', value: 1000 },
  { label: 'Très lent (1.5s)', value: 1500 },
];

const AUTO_DELAYS = [
  { label: '3s', value: 3000 },
  { label: '5s', value: 5000 },
  { label: '8s', value: 8000 },
  { label: '12s', value: 12000 },
  { label: '20s', value: 20000 },
];

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        'flex items-center justify-between w-full px-3 py-2.5 rounded-lg border text-sm transition-all',
        checked ? 'border-primary/50 bg-primary/10 text-foreground' : 'border-border/40 bg-secondary/40 text-muted-foreground hover:bg-secondary/80'
      )}
    >
      <span>{label}</span>
      <div className={cn('w-9 h-5 rounded-full transition-colors relative', checked ? 'bg-primary' : 'bg-border')}>
        <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
      </div>
    </button>
  );
}

interface SettingsPanelProps {
  onClose: () => void;
  onBible2Imported?: () => void;
}

export default function SettingsPanel({ onClose, onBible2Imported }: SettingsPanelProps) {
  const [settings, setSettings] = useState<ChurchSettings>(loadSettings);
  const [bdsStatus, setBdsStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [backupStatus, setBackupStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const BACKUP_KEYS = [
    'biblecast-settings',
    'biblecast:slides',
    'biblecast:gallery',
    'biblecast:favorites',
    'biblecast:theme',
    'biblecast:queue',
    'biblecast:programmes',
    'biblecast:archive',
    'biblecast:roles',
    'biblecast:presentations',
    'biblecast:bgvideos',
    'biblecast:ticker-draft',
    'biblecast:recent-books',
  ];

  const handleExportData = async () => {
    const backup: Record<string, unknown> = { _version: 2, _date: new Date().toISOString() };
    // Pages des présentations PDF / images (IndexedDB)
    try { backup._presentationPages = await idbExportAll(); } catch { /* ignore */ }
    BACKUP_KEYS.forEach(key => {
      const val = localStorage.getItem(key);
      if (val !== null) {
        try { backup[key] = JSON.parse(val); }
        catch { backup[key] = val; }
      }
    });
    const jsonStr = JSON.stringify(backup, null, 2);
    const fileName = `biblecast-backup-${new Date().toISOString().slice(0, 10)}.json`;

    // Android (Capacitor) : Web Share API avec fichier → ouvre la feuille de partage Android
    try {
      const file = new File([jsonStr], fileName, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'BibleCast – Sauvegarde' });
        return;
      }
    } catch { /* fallback */ }

    // Fallback navigateur web : téléchargement direct
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
  };

  const handleImportData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    // Attacher au DOM — obligatoire sur Android pour que le picker s'ouvre
    document.body.appendChild(input);
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      document.body.removeChild(input);
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (typeof data !== 'object' || !data._version) {
            setBackupStatus('error');
            setTimeout(() => setBackupStatus('idle'), 3000);
            return;
          }
          BACKUP_KEYS.forEach(key => {
            if (key in data) {
              try { localStorage.setItem(key, typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key])); } catch { /* plein */ }
            }
          });
          if (data._presentationPages && typeof data._presentationPages === 'object') {
            idbImportAll(data._presentationPages as Record<string, string[]>).catch(() => {});
          }
          setBackupStatus('success');
          setTimeout(() => {
            setBackupStatus('idle');
            if (window.confirm('Données restaurées ! Recharger l\'application pour appliquer tous les changements ?')) {
              window.location.reload();
            }
          }, 1500);
        } catch {
          setBackupStatus('error');
          setTimeout(() => setBackupStatus('idle'), 3000);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const set = <K extends keyof ChurchSettings>(key: K, val: ChurchSettings[K]) => {
    const updated = { ...settings, [key]: val };
    setSettings(updated);
    saveSettings(updated);
  };

  const handleLogoUpload = () => {
    pickImage({ maxWidth: 800, keepTransparency: true, accept: 'image/png,image/svg+xml,image/jpeg,image/webp' })
      .then(img => { if (img) set('churchLogo', img.dataUrl); });
  };

  const handleBDSImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (typeof data === 'object' && !Array.isArray(data)) {
            importBDS(data);
            clearBDSCache();
            setBdsStatus('success');
            onBible2Imported?.();
            setTimeout(() => setBdsStatus('idle'), 3000);
          } else {
            setBdsStatus('error');
            setTimeout(() => setBdsStatus('idle'), 3000);
          }
        } catch {
          setBdsStatus('error');
          setTimeout(() => setBdsStatus('idle'), 3000);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg glass-panel rounded-2xl shadow-2xl border border-border/50 overflow-hidden animate-fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Church className="h-5 w-5 text-primary" />
            Paramètres
          </h2>
          <Button size="icon" variant="ghost" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <Tabs defaultValue="church" className="flex flex-col" style={{ maxHeight: '75vh' }}>
          <TabsList className="mx-4 mt-3 bg-secondary/80 shrink-0">
            <TabsTrigger value="church" className="flex-1 text-xs gap-1 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Church className="h-3.5 w-3.5" /> Église
            </TabsTrigger>
            <TabsTrigger value="display" className="flex-1 text-xs gap-1 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Monitor className="h-3.5 w-3.5" /> Affichage
            </TabsTrigger>
            <TabsTrigger value="bible2" className="flex-1 text-xs gap-1 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Database className="h-3.5 w-3.5" /> Bibles
            </TabsTrigger>
            <TabsTrigger value="presentation" className="flex-1 text-xs gap-1 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Layers className="h-3.5 w-3.5" /> Présentation
            </TabsTrigger>
            <TabsTrigger value="data" className="flex-1 text-xs gap-1 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Upload className="h-3.5 w-3.5" /> Données
            </TabsTrigger>
          </TabsList>

          {/* ── Onglet Église ── */}
          <TabsContent value="church" className="overflow-y-auto px-6 py-4 space-y-5">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Church className="h-3.5 w-3.5" /> Nom de l'église
              </Label>
              <Input value={settings.churchName}
                onChange={(e) => set('churchName', e.target.value)}
                placeholder="Ex: Église de la Grâce"
                className="bg-secondary border-border" />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Logo</Label>
              <div className="flex items-center gap-3">
                {settings.churchLogo ? (
                  <div className="relative">
                    <img src={settings.churchLogo} alt="Logo" className="h-14 w-14 object-contain rounded-lg bg-secondary p-1 border border-border" />
                    <button onClick={() => set('churchLogo', '')}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-xs">
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="h-14 w-14 rounded-lg bg-secondary border border-dashed border-border flex items-center justify-center text-muted-foreground">
                    <Upload className="h-5 w-5" />
                  </div>
                )}
                <Button size="sm" variant="secondary" onClick={handleLogoUpload} className="gap-1.5">
                  <Upload className="h-4 w-4" /> {settings.churchLogo ? 'Changer' : 'Uploader'}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Type className="h-3.5 w-3.5" /> Version biblique principale
              </Label>
              <Input value={settings.bibleVersion}
                onChange={(e) => set('bibleVersion', e.target.value)}
                placeholder="Ex: LSG 1910, NEG..."
                className="bg-secondary border-border" />
            </div>
          </TabsContent>

          {/* ── Onglet Affichage ── */}
          <TabsContent value="display" className="overflow-y-auto px-6 py-4 space-y-5">
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Type className="h-3.5 w-3.5" /> Polices sur la TV <span className="opacity-60">(intégrées, sans Internet)</span>
              </Label>
              {([['Serif', 'fontSerif', SERIF_FONTS, 'var(--bc-serif)'], ['Sans serif', 'fontSans', SANS_FONTS, 'var(--bc-sans)']] as const).map(([title, key, list]) => (
                <div key={key} className="space-y-1.5">
                  <p className="text-[11px] text-muted-foreground">{title}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {list.map(f => {
                      const active = (settings[key] ?? list[0].value) === f.value;
                      const family = f.value === 'system' ? (key === 'fontSerif' ? 'serif' : 'sans-serif') : `'${f.value}'`;
                      return (
                        <button key={f.value} onClick={() => set(key, f.value)}
                          className={cn('min-h-[56px] py-2 px-2 rounded-lg border text-left transition-all',
                            active ? 'border-primary/50 bg-primary/10 text-foreground' : 'border-border/40 bg-secondary/40 text-muted-foreground hover:bg-secondary/80')}>
                          <span className="block text-base leading-tight" style={{ fontFamily: family }}>Dieu a tant aimé</span>
                          <span className="block text-[10px] opacity-60 mt-0.5">{f.label} · {f.note}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">Le bouton Serif / Sans sous l'aperçu choisit laquelle des deux est utilisée.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Vitesse de transition</Label>
              <div className="grid grid-cols-2 gap-2">
                {SPEEDS.map(sp => (
                  <button key={sp.value} onClick={() => set('transitionSpeed', sp.value)}
                    className={cn('py-2 px-3 rounded-lg border text-xs transition-all',
                      settings.transitionSpeed === sp.value ? 'border-primary/50 bg-primary/10 text-foreground font-medium' : 'border-border/40 bg-secondary/40 text-muted-foreground hover:bg-secondary/80'
                    )}>
                    {sp.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Style de transition</Label>
              <Choice value={settings.transitionStyle ?? 'fondu'} onChange={v => set('transitionStyle', v)} options={[
                { value: 'fondu', label: 'Fondu enchaîné', hint: 'recommandé' },
                { value: 'fondu-noir', label: 'Fondu par le noir' },
                { value: 'glissement', label: 'Glissement' },
                { value: 'zoom', label: 'Zoom doux' },
              ]} />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Qualité des fonds animés sur les TV</Label>
              <Choice value={settings.bgQuality ?? 'auto'} onChange={v => set('bgQuality', v)} options={[
                { value: 'auto', label: 'Automatique', hint: 'effets riches si la TV reste fluide' },
                { value: 'eco', label: 'Éco', hint: 'toujours les fonds légers' },
                { value: 'max', label: 'Maximum', hint: 'toujours les effets riches' },
              ]} />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Mise en page des versets</Label>
              <Choice value={settings.verseStyle ?? 'classique'} onChange={v => set('verseStyle', v)} options={[
                { value: 'classique', label: 'Classique', hint: 'centré, référence dessous' },
                { value: 'moderne', label: 'Moderne', hint: 'référence en haut, à gauche' },
                { value: 'bandeau', label: 'Bandeau bas', hint: 'pour filmer le culte' },
              ]} />
              <Toggle checked={settings.kenBurns !== false} onChange={v => set('kenBurns', v)}
                label="Zoom lent sur les photos de fond" />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" /> Interlignage du texte
              </Label>
              <div className="flex gap-2">
                {(['tight', 'normal', 'relaxed'] as const).map(ls => (
                  <button key={ls} onClick={() => set('lineSpacing', ls)}
                    className={cn('flex-1 py-2 rounded-lg border text-xs transition-all',
                      settings.lineSpacing === ls ? 'border-primary/50 bg-primary/10 text-foreground font-medium' : 'border-border/40 bg-secondary/40 text-muted-foreground hover:bg-secondary/80'
                    )}>
                    {ls === 'tight' ? 'Compact' : ls === 'normal' ? 'Normal' : 'Aéré'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5" /> Options visuelles
              </Label>
              <div className="space-y-2">
                <Toggle checked={settings.showVerseReference} onChange={v => set('showVerseReference', v)}
                  label="Afficher la référence (livre chap:v)" />
                <Toggle checked={settings.verseQuotes} onChange={v => set('verseQuotes', v)}
                  label="Guillemets autour des versets" />
                <Toggle checked={settings.textShadowDefault} onChange={v => set('textShadowDefault', v)}
                  label="Ombre du texte par défaut" />
                <Toggle checked={settings.displayBgBlur} onChange={v => set('displayBgBlur', v)}
                  label="Flou d'arrière-plan sur fond image" />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Écran de veille
              </Label>
              <div className="bg-secondary/40 rounded-xl p-4 space-y-4">
                <div className="space-y-2">
                  <Label className="text-[11px] text-muted-foreground">Fond de l'écran d'attente</Label>
                  <select value={settings.standbyBackground ?? ''} onChange={e => set('standbyBackground', e.target.value)}
                    className="w-full h-11 rounded-lg bg-secondary border border-border px-3 text-sm">
                    <option value="">Comme les versets</option>
                    {ANIMATED_BACKGROUNDS.map(b => <option key={b.id} value={b.id}>{b.kind === 'shader' ? 'Effet riche' : 'Animé'} : {b.label}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[11px] text-muted-foreground">Heure du culte (compte à rebours affiché dans les 3 h avant)</Label>
                  <Input type="time" value={settings.countdownTime ?? ''} onChange={e => set('countdownTime', e.target.value)}
                    className="bg-secondary h-11" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[11px] text-muted-foreground">Annonces en boucle (une par ligne, toutes les 8 s)</Label>
                  <textarea value={settings.standbyAnnouncements ?? ''} onChange={e => set('standbyAnnouncements', e.target.value)}
                    rows={3} placeholder={'Bienvenue à tous !\nRéunion de prière mercredi à 18 h'}
                    className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm" />
                </div>
                <Toggle checked={settings.showClock} onChange={v => set('showClock', v)}
                  label="Afficher l'horloge" />
                {settings.showClock && (
                  <div className="pl-4 border-l-2 border-primary/20 space-y-2">
                    <Toggle checked={settings.showClockSeconds} onChange={v => set('showClockSeconds', v)}
                      label="Afficher les secondes (HH:MM:SS)" />
                    <Toggle checked={settings.showClockDate} onChange={v => set('showClockDate', v)}
                      label="Afficher la date sous l'horloge" />
                  </div>
                )}
                <div className="space-y-2">
                  <Toggle checked={settings.autoSleep} onChange={v => set('autoSleep', v)}
                    label="Veille automatique" />
                  {settings.autoSleep && (
                    <div className="pl-4 border-l-2 border-primary/20">
                      <Label className="text-[10px] text-muted-foreground mb-2 block">
                        Passer en veille après (sans projection)
                      </Label>
                      <div className="flex gap-2 flex-wrap">
                        {[1, 3, 5, 10, 15].map(m => (
                          <button key={m} onClick={() => set('autoSleepDelay', m)}
                            className={cn('px-3 py-1.5 rounded-lg border text-xs transition-all',
                              settings.autoSleepDelay === m
                                ? 'border-primary/50 bg-primary/10 text-foreground font-medium'
                                : 'border-border/40 bg-secondary/60 text-muted-foreground hover:bg-secondary'
                            )}>
                            {m} min
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <Toggle checked={settings.showVerseOfDay} onChange={v => set('showVerseOfDay', v)}
                    label="Verset du jour" />
                  {settings.showVerseOfDay && (
                    <div className="pl-4 border-l-2 border-primary/20 space-y-3">
                      <div className="flex gap-2">
                        {(['random', 'manual'] as const).map(mode => (
                          <button key={mode}
                            onClick={() => set('verseOfDayMode', mode)}
                            className={cn(
                              'flex-1 py-1.5 px-3 rounded-lg border text-xs transition-all',
                              settings.verseOfDayMode === mode
                                ? 'border-primary/50 bg-primary/10 text-foreground font-medium'
                                : 'border-border/40 bg-secondary/60 text-muted-foreground hover:bg-secondary'
                            )}>
                            <BookOpen className="h-3 w-3 inline mr-1.5" />
                            {mode === 'random' ? 'Aléatoire (quotidien)' : 'Manuel'}
                          </button>
                        ))}
                      </div>
                      {settings.verseOfDayMode === 'manual' && (
                        <div>
                          <Label className="text-[10px] text-muted-foreground mb-1 block">
                            Référence (ex : Jean 3:16)
                          </Label>
                          <Input
                            value={settings.verseOfDayRef}
                            onChange={e => set('verseOfDayRef', e.target.value)}
                            placeholder="Jean 3:16"
                            className="bg-secondary text-sm h-8"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Onglet Bibles ── */}
          <TabsContent value="bible2" className="overflow-y-auto px-6 py-4 space-y-5">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5" /> Bible secondaire (double version)
              </Label>
              <div className="bg-secondary/40 rounded-xl p-4 space-y-4">
                <div className="space-y-2">
                  <Label className="text-[11px] text-muted-foreground">Version affichée à côté de la LSG (bouton « + » dans Bible)</Label>
                  <p className="text-sm font-medium">Darby (1885) <span className="text-xs text-muted-foreground font-normal">· traduction protestante très fidèle au texte original, libre de droits</span></p>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] text-muted-foreground">Importer le fichier JSON de la Bible secondaire</Label>
                  <Button size="sm" variant="secondary" onClick={handleBDSImport} className="w-full gap-2">
                    <Upload className="h-4 w-4" />
                    Importer un fichier Bible (JSON)
                  </Button>
                  {bdsStatus === 'success' && (
                    <p className="text-xs text-green-400 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-green-400" />
                      Bible importée avec succès — redémarrez si nécessaire
                    </p>
                  )}
                  {bdsStatus === 'error' && (
                    <p className="text-xs text-destructive flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-destructive" />
                      Fichier invalide — format JSON biblique attendu
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                    Format attendu : {`{ "Genèse": { "1": { "1": "Au commencement..." } } }`}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] text-muted-foreground">Disposition de l'écran partagé</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { value: 'horizontal', label: 'Haut / Bas', desc: '▭ ▭' },
                      { value: 'vertical', label: 'Gauche / Droite', desc: '▯▯' },
                    ] as const).map(opt => (
                      <button key={opt.value}
                        onClick={() => set('splitLayout', opt.value)}
                        className={cn(
                          'py-3 px-3 rounded-lg border text-xs transition-all flex flex-col items-center gap-1',
                          settings.splitLayout === opt.value
                            ? 'border-primary/50 bg-primary/10 text-foreground font-medium'
                            : 'border-border/40 bg-secondary/40 text-muted-foreground hover:bg-secondary/80'
                        )}>
                        <span className="text-base">{opt.desc}</span>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Onglet Présentation ── */}
          <TabsContent value="presentation" className="overflow-y-auto px-6 py-4 space-y-5">
            {/* Avance automatique */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5" /> Avance automatique
              </Label>
              <Toggle checked={settings.autoAdvance} onChange={v => set('autoAdvance', v)}
                label="Avancer automatiquement dans la timeline" />
              {settings.autoAdvance && (
                <div className="mt-2">
                  <Label className="text-xs text-muted-foreground mb-2 block">Délai entre chaque item</Label>
                  <div className="flex gap-2 flex-wrap">
                    {AUTO_DELAYS.map(d => (
                      <button key={d.value} onClick={() => set('autoAdvanceDelay', d.value)}
                        className={cn('px-3 py-1.5 rounded-lg border text-xs transition-all',
                          settings.autoAdvanceDelay === d.value ? 'border-primary/50 bg-primary/10 text-foreground font-medium' : 'border-border/40 bg-secondary/40 text-muted-foreground hover:bg-secondary/80'
                        )}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Gestes tactiles */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Gestes tactiles — Écran Display (TV)
              </Label>
              <div className="bg-secondary/40 rounded-xl p-4 space-y-3 text-xs text-muted-foreground">
                {[
                  { icon: '👆', gesture: 'Double-tap verset', action: 'Projeter directement sur TV' },
                  { icon: '👈', gesture: 'Glisser ← (Display)', action: 'Verset / slide suivant(e)' },
                  { icon: '👉', gesture: 'Glisser → (Display)', action: 'Verset / slide précédent(e)' },
                  { icon: '☑️', gesture: 'Sélection multiple', action: 'Sélectionner plusieurs versets' },
                  { icon: '🎞️', gesture: 'Bouton ▶ (timeline)', action: 'Lancer l\'avance automatique' },
                ].map(({ icon, gesture, action }) => (
                  <div key={gesture} className="flex items-start gap-3">
                    <span className="text-base shrink-0 mt-0.5">{icon}</span>
                    <div>
                      <p className="font-medium text-foreground text-[11px]">{gesture}</p>
                      <p className="opacity-70 text-[10px]">{action}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Comportement tablette */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Monitor className="h-3.5 w-3.5" /> Comportement tablette
              </Label>
              <div className="bg-secondary/40 rounded-xl p-4 space-y-3">
                <Toggle
                  checked={settings.keepScreenOn ?? false}
                  onChange={v => set('keepScreenOn', v)}
                  label="Garder l'écran allumé pendant la présentation"
                />
                <p className="text-[10px] text-muted-foreground/60 pl-0.5 leading-relaxed">
                  Empêche la tablette de se mettre en veille automatiquement pendant le culte.
                </p>
              </div>
            </div>
          </TabsContent>

          {/* ── Onglet Données ── */}
          <TabsContent value="data" className="overflow-y-auto px-6 py-4 space-y-5">
            {/* Export */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5" /> Sauvegarde des données
              </Label>
              <div className="bg-secondary/40 rounded-xl p-4 space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Exportez toutes vos données (slides, présentations, programmes, favoris, historique, paramètres, galerie) dans un seul fichier. Utile avant de réinstaller l'application.
                </p>
                <Button onClick={handleExportData} className="w-full gap-2" variant="secondary">
                  <Database className="h-4 w-4" />
                  Exporter les données
                </Button>
              </div>
            </div>

            {/* Import */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5" /> Restaurer une sauvegarde
              </Label>
              <div className="bg-secondary/40 rounded-xl p-4 space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Importez un fichier de sauvegarde BibleCast pour restaurer vos données. L'application sera rechargée.
                </p>
                {backupStatus === 'success' && (
                  <p className="text-xs text-green-400 bg-green-500/10 rounded-lg px-3 py-2">✓ Données restaurées avec succès.</p>
                )}
                {backupStatus === 'error' && (
                  <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">Fichier invalide. Vérifiez qu'il s'agit d'un fichier exporté par BibleCast.</p>
                )}
                <Button onClick={handleImportData} className="w-full gap-2" variant="secondary">
                  <Upload className="h-4 w-4" />
                  Restaurer depuis un fichier
                </Button>
              </div>
            </div>

            {/* Infos storage */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Données sauvegardées</Label>
              <div className="bg-secondary/40 rounded-xl p-3 space-y-1">
                {['biblecast:slides', 'biblecast:favorites', 'biblecast:gallery', 'biblecast-settings'].map(key => {
                  const val = localStorage.getItem(key);
                  const size = val ? Math.round(val.length / 1024) : 0;
                  const label = key.replace('biblecast:', '').replace('biblecast-', '');
                  return val ? (
                    <div key={key} className="flex justify-between text-[10px]">
                      <span className="text-muted-foreground capitalize">{label}</span>
                      <span className="text-foreground">{size} Ko</span>
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="px-6 py-3 border-t border-border/40 text-center">
          <p className="text-[10px] text-muted-foreground/40">
            Développé avec ❤️ par le Frère Malachie
          </p>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end shrink-0">
          <Button onClick={onClose} className="btn-gold px-6">Fermer</Button>
        </div>
      </div>
    </div>
  );
}
