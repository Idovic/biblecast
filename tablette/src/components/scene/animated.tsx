/* Fonds animés intégrés — générés par le code, aucun fichier, aucune connexion.
   Deux familles :
   - CSS : animations uniquement en transform / opacity (quasi gratuites pour une TV d'entrée de gamme) ;
   - effets riches (WebGL, voir shaders.tsx) : calculés en petite taille, remplacés tout seuls par
     leur équivalent CSS si la TV saccade ou ne gère pas WebGL.
   Les animations sont calées sur l'horloge : deux calques du même fond restent synchrones
   pendant un fondu enchaîné, et toutes les TV montrent le même mouvement. */
import { useMemo } from 'react';
import { ShaderBackground, shaderSupported } from './shaders';

type RGB = [number, number, number];
export type BgColors = [string, string, string];

export interface AnimatedBackgroundDef {
  id: string;
  label: string;
  /** css = léger ; shader = effet riche (avec repli `fallback`) */
  kind: 'css' | 'shader';
  /** Aperçu statique (vignettes) */
  preview: string;
  base: string;
  blobs: { color: string; size: number; x: number; y: number; dx: number; dy: number; dur: number }[];
  stars?: number;
  embers?: number;
  /** Éléments propres aux nouveaux fonds CSS */
  rays?: boolean;
  cross?: boolean;
  waves?: boolean;
  bokeh?: number;
  clouds?: boolean;
  silk?: boolean;
  shooting?: number;
  prism?: boolean;
  /** Effet riche : nom du shader et fond CSS de repli */
  shader?: string;
  fallback?: string;
  /** Couleurs par défaut et styles préréglés (couleurs modifiables) */
  colors: BgColors;
  styles: { name: string; colors: BgColors }[];
}

const S = (name: string, a: string, b: string, c: string) => ({ name, colors: [a, b, c] as BgColors });

export const ANIMATED_BACKGROUNDS: AnimatedBackgroundDef[] = [
  /* ── Fonds CSS (légers) ─────────────────────────────────────────────── */
  {
    id: 'aurore', label: 'Aurore', kind: 'css',
    preview: 'linear-gradient(135deg, #061a2b 0%, #0b3b4a 45%, #2b1d5c 100%)',
    base: 'linear-gradient(160deg, #04121f 0%, #082a3a 50%, #160f33 100%)',
    blobs: [
      { color: '0.45', size: 70, x: 15, y: 30, dx: 18, dy: -10, dur: 34 },
      { color: '0.45', size: 80, x: 70, y: 60, dx: -20, dy: 12, dur: 41 },
      { color: '0.30', size: 60, x: 45, y: 15, dx: 10, dy: 18, dur: 29 },
    ],
    colors: ['#20c997', '#5b4cd6', '#38bdf8'],
    styles: [S('Boréale', '#20c997', '#5b4cd6', '#38bdf8'), S('Voile calme', '#6ee7b7', '#93c5fd', '#c4b5fd'), S('Flamboyante', '#f59e0b', '#ec4899', '#22c55e')],
  },
  {
    id: 'lumiere', label: 'Lumière douce', kind: 'css',
    preview: 'radial-gradient(circle at 50% 40%, #6b4a1c 0%, #2a1a0c 55%, #120b06 100%)',
    base: 'radial-gradient(ellipse at 50% 35%, #2b1b0b 0%, #140c05 70%, #0b0603 100%)',
    blobs: [
      { color: '0.42', size: 75, x: 50, y: 30, dx: 8, dy: 6, dur: 38 },
      { color: '0.28', size: 60, x: 25, y: 70, dx: 14, dy: -8, dur: 45 },
      { color: '0.22', size: 55, x: 78, y: 65, dx: -12, dy: -10, dur: 33 },
    ],
    embers: 14,
    colors: ['#ffc45c', '#ff963c', '#ffe4a0'],
    styles: [S('Or', '#ffc45c', '#ff963c', '#ffe4a0'), S('Rosée', '#fda4af', '#fcd34d', '#fde68a'), S('Argent', '#e2e8f0', '#94a3b8', '#f8fafc')],
  },
  {
    id: 'nuit', label: 'Nuit étoilée', kind: 'css',
    preview: 'linear-gradient(180deg, #030616 0%, #0a1440 60%, #1b1f5e 100%)',
    base: 'linear-gradient(180deg, #02040f 0%, #070f33 60%, #141a4f 100%)',
    blobs: [
      { color: '0.28', size: 80, x: 70, y: 85, dx: -10, dy: -6, dur: 50 },
      { color: '0.18', size: 60, x: 20, y: 90, dx: 12, dy: -4, dur: 44 },
    ],
    stars: 110,
    colors: ['#4f46e5', '#0ea5e9', '#a5b4fc'],
    styles: [S('Bleu nuit', '#4f46e5', '#0ea5e9', '#a5b4fc'), S('Violet', '#7c3aed', '#c026d3', '#e9d5ff'), S('Vert', '#059669', '#0d9488', '#a7f3d0')],
  },
  {
    id: 'braises', label: 'Particules dorées', kind: 'css',
    preview: 'radial-gradient(circle at 50% 100%, #5a2a06 0%, #1a0b03 60%, #070302 100%)',
    base: 'radial-gradient(ellipse at 50% 110%, #3d1d05 0%, #140902 60%, #060302 100%)',
    blobs: [{ color: '0.30', size: 70, x: 50, y: 95, dx: 10, dy: -6, dur: 36 }],
    embers: 36,
    colors: ['#f59e0b', '#fb923c', '#fde68a'],
    styles: [S('Braises', '#f59e0b', '#fb923c', '#fde68a'), S('Bleu', '#38bdf8', '#6366f1', '#e0f2fe'), S('Rose', '#f472b6', '#fb7185', '#fce7f3')],
  },
  {
    id: 'ocean', label: 'Océan', kind: 'css',
    preview: 'linear-gradient(160deg, #021b33 0%, #04395e 55%, #0b6b8a 100%)',
    base: 'linear-gradient(160deg, #01111f 0%, #032a46 55%, #054a63 100%)',
    blobs: [
      { color: '0.35', size: 85, x: 20, y: 75, dx: 22, dy: -6, dur: 30 },
      { color: '0.25', size: 70, x: 80, y: 30, dx: -18, dy: 10, dur: 37 },
      { color: '0.35', size: 75, x: 50, y: 50, dx: 6, dy: 14, dur: 43 },
    ],
    colors: ['#0ea5e9', '#2dd4bf', '#1e40af'],
    styles: [S('Océan', '#0ea5e9', '#2dd4bf', '#1e40af'), S('Lagon', '#22d3ee', '#a3e635', '#0891b2'), S('Profond', '#1e3a8a', '#3730a3', '#0e7490')],
  },
  {
    id: 'pourpre', label: 'Pourpre royal', kind: 'css',
    preview: 'linear-gradient(135deg, #1a0629 0%, #3b0d4f 55%, #6b2c12 100%)',
    base: 'linear-gradient(135deg, #12041d 0%, #2a0a3a 55%, #3a1408 100%)',
    blobs: [
      { color: '0.38', size: 75, x: 25, y: 35, dx: 16, dy: 10, dur: 39 },
      { color: '0.22', size: 65, x: 75, y: 70, dx: -14, dy: -12, dur: 46 },
    ],
    colors: ['#a855f7', '#eab308', '#7c3aed'],
    styles: [S('Royal', '#a855f7', '#eab308', '#7c3aed'), S('Grenat', '#be123c', '#f59e0b', '#7f1d1d'), S('Améthyste', '#c084fc', '#f0abfc', '#6d28d9')],
  },
  {
    id: 'aube', label: 'Aube', kind: 'css',
    preview: 'linear-gradient(180deg, #0f1c4d 0%, #6b3a5c 60%, #e07b4c 100%)',
    base: 'linear-gradient(180deg, #0a1438 0%, #3c2450 55%, #7a3b33 100%)',
    blobs: [
      { color: '0.40', size: 85, x: 50, y: 100, dx: 6, dy: -8, dur: 40 },
      { color: '0.22', size: 65, x: 20, y: 60, dx: 14, dy: -6, dur: 35 },
    ],
    colors: ['#fb923c', '#ec4899', '#fde68a'],
    styles: [S('Aube', '#fb923c', '#ec4899', '#fde68a'), S('Crépuscule', '#f43f5e', '#8b5cf6', '#fdba74'), S('Matin clair', '#fcd34d', '#93c5fd', '#fef3c7')],
  },
  {
    id: 'rayons', label: 'Rayons de lumière', kind: 'css',
    preview: 'conic-gradient(from 200deg at 50% -10%, #0b1020, #3b3420 10deg, #0b1020 20deg, #3b3420 30deg, #0b1020 40deg)',
    base: 'linear-gradient(180deg, #14110a 0%, #0b0b12 60%, #07070c 100%)',
    blobs: [{ color: '0.30', size: 70, x: 50, y: 0, dx: 6, dy: 4, dur: 40 }],
    rays: true,
    colors: ['#fcd34d', '#fde68a', '#f59e0b'],
    styles: [S('Doré', '#fcd34d', '#fde68a', '#f59e0b'), S('Céleste', '#bae6fd', '#e0f2fe', '#60a5fa'), S('Blanc', '#ffffff', '#f1f5f9', '#cbd5e1')],
  },
  {
    id: 'croix', label: 'Croix lumineuse', kind: 'css',
    preview: 'radial-gradient(circle at 50% 45%, #3a3020 0%, #0c0b10 60%)',
    base: 'radial-gradient(ellipse at 50% 45%, #17140f 0%, #08080c 70%)',
    blobs: [
      { color: '0.20', size: 70, x: 30, y: 70, dx: 10, dy: -6, dur: 44 },
      { color: '0.18', size: 60, x: 75, y: 30, dx: -10, dy: 8, dur: 38 },
    ],
    cross: true,
    colors: ['#fde68a', '#f59e0b', '#a78bfa'],
    styles: [S('Lumière', '#fde68a', '#f59e0b', '#a78bfa'), S('Pureté', '#ffffff', '#93c5fd', '#e0e7ff'), S('Pâques', '#fcd34d', '#f472b6', '#a3e635')],
  },
  {
    id: 'vagues', label: 'Vagues douces', kind: 'css',
    preview: 'linear-gradient(180deg, #071425 0%, #0d2a4a 60%, #135a7a 100%)',
    base: 'linear-gradient(180deg, #050d1a 0%, #0a1e36 60%, #0c3550 100%)',
    blobs: [{ color: '0.22', size: 70, x: 50, y: 20, dx: 8, dy: 4, dur: 46 }],
    waves: true,
    colors: ['#38bdf8', '#22d3ee', '#818cf8'],
    styles: [S('Mer', '#38bdf8', '#22d3ee', '#818cf8'), S('Coucher', '#fb923c', '#f472b6', '#facc15'), S('Menthe', '#34d399', '#a7f3d0', '#2dd4bf')],
  },
  {
    id: 'bokeh', label: 'Bokeh', kind: 'css',
    preview: 'radial-gradient(circle at 30% 40%, #3b2a55 0%, #0e0a18 60%)',
    base: 'linear-gradient(160deg, #0d0a17 0%, #120e22 60%, #0a0812 100%)',
    blobs: [],
    bokeh: 16,
    colors: ['#f0abfc', '#fcd34d', '#93c5fd'],
    styles: [S('Fête', '#f0abfc', '#fcd34d', '#93c5fd'), S('Or', '#fcd34d', '#fbbf24', '#fde68a'), S('Glacier', '#bae6fd', '#e0e7ff', '#a5f3fc')],
  },
  {
    id: 'nuages', label: 'Nuages lents', kind: 'css',
    preview: 'linear-gradient(180deg, #1c2f55 0%, #3a5a8a 70%, #6b86b0 100%)',
    base: 'linear-gradient(180deg, #0f1c36 0%, #213a63 65%, #3a5683 100%)',
    blobs: [{ color: '0.25', size: 80, x: 70, y: 10, dx: -6, dy: 4, dur: 50 }],
    clouds: true,
    colors: ['#ffffff', '#cbd5e1', '#fde68a'],
    styles: [S('Ciel', '#ffffff', '#cbd5e1', '#fde68a'), S('Rose', '#fecdd3', '#fbcfe8', '#fde68a'), S('Orage doux', '#94a3b8', '#64748b', '#e2e8f0')],
  },
  {
    id: 'soie', label: 'Soie', kind: 'css',
    preview: 'linear-gradient(120deg, #1a0f2e 0%, #3a1f5c 40%, #1a0f2e 60%, #4a2a6c 100%)',
    base: 'linear-gradient(135deg, #0f0a1c 0%, #1b1030 100%)',
    blobs: [],
    silk: true,
    colors: ['#a78bfa', '#f0abfc', '#60a5fa'],
    styles: [S('Lavande', '#a78bfa', '#f0abfc', '#60a5fa'), S('Champagne', '#fcd34d', '#fde68a', '#fb923c'), S('Émeraude', '#34d399', '#2dd4bf', '#a3e635')],
  },
  {
    id: 'filantes', label: 'Étoiles filantes', kind: 'css',
    preview: 'linear-gradient(180deg, #020410 0%, #0b1236 70%, #1a1650 100%)',
    base: 'linear-gradient(180deg, #01030b 0%, #070d2b 70%, #120f3d 100%)',
    blobs: [{ color: '0.22', size: 80, x: 30, y: 90, dx: 10, dy: -4, dur: 48 }],
    stars: 80,
    shooting: 4,
    colors: ['#6366f1', '#38bdf8', '#e0e7ff'],
    styles: [S('Nuit', '#6366f1', '#38bdf8', '#e0e7ff'), S('Violette', '#a855f7', '#ec4899', '#f5d0fe'), S('Verte', '#10b981', '#22d3ee', '#d1fae5')],
  },
  {
    id: 'prisme', label: 'Prisme doux', kind: 'css',
    preview: 'conic-gradient(from 0deg at 50% 50%, #2a1450, #14365a, #145a3a, #5a4a14, #5a1430, #2a1450)',
    base: '#06060c',
    blobs: [],
    prism: true,
    colors: ['#8b5cf6', '#06b6d4', '#f472b6'],
    styles: [S('Arc-en-ciel', '#8b5cf6', '#06b6d4', '#f472b6'), S('Feu', '#f59e0b', '#ef4444', '#facc15'), S('Mer', '#0ea5e9', '#14b8a6', '#6366f1')],
  },

  /* ── Effets riches (WebGL) — repli CSS automatique ──────────────────── */
  {
    id: 'gl-aurore', label: 'Aurore boréale', kind: 'shader', shader: 'aurora', fallback: 'aurore',
    preview: 'linear-gradient(180deg, #0a0a0a 0%, #3a1e5a 30%, #1e5a3a 60%, #050505 100%)',
    base: '#020306', blobs: [],
    colors: ['#ffa62b', '#ff66cc', '#22ff66'],
    styles: [S('Boréale', '#22ff99', '#5b4cd6', '#38bdf8'), S('Voile calme', '#6ee7b7', '#93c5fd', '#c4b5fd'), S('Flamboyante', '#ffa62b', '#ff66cc', '#22ff66')],
  },
  {
    id: 'gl-prisme', label: 'Éclat prismatique', kind: 'shader', shader: 'prism', fallback: 'prisme',
    preview: 'radial-gradient(circle at 50% 50%, #000 0%, #4a2a8a 30%, #1a4a6a 60%, #0a0a1a 100%)',
    base: '#04040a', blobs: [],
    colors: ['#8b5cf6', '#38bdf8', '#ec4899'],
    styles: [S('Aurore douce', '#8b5cf6', '#38bdf8', '#ec4899'), S('Rayons', '#06b6d4', '#111b4a', '#e879f9'), S('Or', '#f59e0b', '#fde68a', '#b45309')],
  },
  {
    id: 'gl-soie', label: 'Soie ondulante', kind: 'shader', shader: 'silk', fallback: 'soie',
    preview: 'linear-gradient(120deg, #120a24, #4a2a7a, #120a24, #6a3a9a)',
    base: '#0a0614', blobs: [],
    colors: ['#3b1d6e', '#7c3aed', '#f0abfc'],
    styles: [S('Violet', '#3b1d6e', '#7c3aed', '#f0abfc'), S('Nuit bleue', '#0c1a3a', '#1d4ed8', '#93c5fd'), S('Bordeaux', '#3f0a1a', '#9f1239', '#fda4af')],
  },
  {
    id: 'gl-rayons', label: 'Rayons divins', kind: 'shader', shader: 'rays', fallback: 'rayons',
    preview: 'conic-gradient(from 160deg at 30% -10%, #08080c, #4a4020 8deg, #08080c 16deg, #4a4020 24deg, #08080c 32deg)',
    base: '#07070b', blobs: [],
    colors: ['#fde68a', '#fbbf24', '#1e1b4b'],
    styles: [S('Doré', '#fde68a', '#fbbf24', '#1e1b4b'), S('Ciel', '#e0f2fe', '#7dd3fc', '#0c1a3a'), S('Aube', '#fdba74', '#f472b6', '#2e1065')],
  },
  {
    id: 'gl-galaxie', label: 'Galaxie', kind: 'shader', shader: 'galaxy', fallback: 'filantes',
    preview: 'radial-gradient(circle at 50% 50%, #e0c8ff 0%, #5a2a9a 15%, #12082a 50%, #020208 100%)',
    base: '#020208', blobs: [],
    colors: ['#6d28d9', '#0ea5e9', '#fef3c7'],
    styles: [S('Voie lactée', '#6d28d9', '#0ea5e9', '#fef3c7'), S('Nébuleuse', '#db2777', '#7c3aed', '#fde68a'), S('Glace', '#0891b2', '#1e3a8a', '#e0f2fe')],
  },
  {
    id: 'gl-plasma', label: 'Plasma', kind: 'shader', shader: 'plasma', fallback: 'aurore',
    preview: 'linear-gradient(135deg, #1e3a8a, #7c3aed, #0e7490)',
    base: '#05050a', blobs: [],
    colors: ['#1e3a8a', '#7c3aed', '#0e7490'],
    styles: [S('Profond', '#1e3a8a', '#7c3aed', '#0e7490'), S('Corail', '#9f1239', '#f97316', '#7c2d12'), S('Forêt', '#14532d', '#0f766e', '#4d7c0f')],
  },
];

export function getAnimatedBackground(id?: string | null): AnimatedBackgroundDef | null {
  if (!id) return null;
  return ANIMATED_BACKGROUNDS.find(b => b.id === id) ?? null;
}

/** Aperçu statique avec les couleurs choisies (vignettes, tablette) */
export function previewOf(def: AnimatedBackgroundDef, colors?: string[]): string {
  if (!colors || colors.length < 3) return def.preview;
  const [a, b, c] = colors;
  return `radial-gradient(circle at 25% 30%, ${a}88 0%, transparent 55%), radial-gradient(circle at 75% 70%, ${b}88 0%, transparent 55%), radial-gradient(circle at 50% 10%, ${c}66 0%, transparent 50%), ${def.base}`;
}

const KEYFRAMES = `
@keyframes bc-drift { 0% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(var(--dx), var(--dy), 0) scale(1.12); } 100% { transform: translate3d(0,0,0) scale(1); } }
@keyframes bc-twinkle { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }
@keyframes bc-rise { 0% { transform: translate3d(0, 0, 0); opacity: 0; } 10% { opacity: .9; } 90% { opacity: .6; } 100% { transform: translate3d(var(--sway), -110vh, 0); opacity: 0; } }
@keyframes bc-kenburns { 0% { transform: scale(1.02) translate3d(0,0,0); } 100% { transform: scale(1.14) translate3d(-2%, -1.5%, 0); } }
@keyframes bc-breathe { 0%, 100% { opacity: .78; transform: scale(1); } 50% { opacity: 1; transform: scale(1.04); } }
@keyframes bc-rise-in { from { opacity: 0; transform: translate3d(0, 0.6em, 0); } to { opacity: 1; transform: none; } }
@keyframes bc-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes bc-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes bc-sway { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(6deg); } }
@keyframes bc-slide-x { from { transform: translate3d(0,0,0); } to { transform: translate3d(-50%,0,0); } }
@keyframes bc-cloud { from { transform: translate3d(-40vw,0,0); } to { transform: translate3d(140vw,0,0); } }
@keyframes bc-silk { 0% { transform: translate3d(-10%, -6%, 0) rotate(-8deg); } 50% { transform: translate3d(6%, 4%, 0) rotate(-4deg); } 100% { transform: translate3d(-10%, -6%, 0) rotate(-8deg); } }
@keyframes bc-shoot { 0%, 88% { transform: translate3d(0,0,0) rotate(-35deg); opacity: 0; } 90% { opacity: 1; } 100% { transform: translate3d(-60vw, 42vw, 0) rotate(-35deg); opacity: 0; } }
@keyframes bc-glow { 0%, 100% { opacity: .55; } 50% { opacity: .95; } }
.bc-paused, .bc-paused * { animation-play-state: paused !important; }
@media (prefers-reduced-motion: reduce) { .bc-anim, .bc-anim * { animation: none !important; } }
`;

export function SceneKeyframes() {
  return <style>{KEYFRAMES}</style>;
}

/** Délai négatif calé sur l'horloge : l'animation reprend là où elle en est */
export function clockDelay(durSec: number): string {
  return `-${(Date.now() / 1000) % durSec}s`;
}

/** Pseudo-aléatoire déterministe (même ciel étoilé sur chaque TV) */
function rand(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function hexRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h.padEnd(6, '0');
  return [parseInt(v.slice(0, 2), 16) || 0, parseInt(v.slice(2, 4), 16) || 0, parseInt(v.slice(4, 6), 16) || 0];
}
const rgba = (hex: string, a: number | string) => { const [r, g, b] = hexRgb(hex); return `rgba(${r}, ${g}, ${b}, ${a})`; };

/** Qualité des fonds sur cette TV : « riche » tant qu'elle reste fluide (voir Display) */
export function richAllowed(quality: string | undefined): boolean {
  if (quality === 'eco') return false;
  if (quality === 'max') return true;
  try { return localStorage.getItem('biblecast:tv-quality') !== 'eco'; } catch { return true; }
}

export function AnimatedBackground({ id, colors, still, quality, onFps, paused }: {
  id: string; colors?: string[]; still?: boolean; quality?: string; onFps?: (fps: number) => void; paused?: boolean;
}) {
  const def = getAnimatedBackground(id);
  const c: BgColors = (colors && colors.length >= 3 ? colors.slice(0, 3) : def?.colors ?? ['#ffffff', '#ffffff', '#ffffff']) as BgColors;
  // Effet riche : WebGL si la TV suit, sinon le fond CSS équivalent
  if (def?.kind === 'shader') {
    if (still) return <div className="absolute inset-0" style={{ background: previewOf(def, c) }} />;
    if (def.shader && shaderSupported() && richAllowed(quality)) {
      return <ShaderBackground shader={def.shader} colors={c} paused={paused} onFps={onFps} />;
    }
    return <CssBackground def={getAnimatedBackground(def.fallback) ?? ANIMATED_BACKGROUNDS[0]} colors={c} />;
  }
  if (!def) return null;
  return <CssBackground def={def} colors={c} />;
}

function CssBackground({ def, colors }: { def: AnimatedBackgroundDef; colors: BgColors }) {
  const [c1, c2, c3] = colors;
  const stars = useMemo(() => Array.from({ length: def.stars ?? 0 }, (_, i) => ({
    x: rand(i + 1) * 100, y: rand(i + 101) * 75, s: 1 + rand(i + 201) * 2.2, d: 2.5 + rand(i + 301) * 4,
  })), [def.stars]);
  const embers = useMemo(() => Array.from({ length: def.embers ?? 0 }, (_, i) => ({
    x: rand(i + 401) * 100, s: 2 + rand(i + 501) * 4, d: 14 + rand(i + 601) * 16, sway: (rand(i + 701) - 0.5) * 120,
  })), [def.embers]);
  const bokeh = useMemo(() => Array.from({ length: def.bokeh ?? 0 }, (_, i) => ({
    x: rand(i + 801) * 100, y: rand(i + 901) * 100, s: 6 + rand(i + 1001) * 14, d: 26 + rand(i + 1101) * 30,
    dx: (rand(i + 1201) - 0.5) * 14, dy: (rand(i + 1301) - 0.5) * 10, o: 0.18 + rand(i + 1401) * 0.3, c: i % 3,
  })), [def.bokeh]);
  const pal = [c1, c2, c3];
  return (
    <div className="bc-anim absolute inset-0 overflow-hidden" style={{ background: def.base }}>
      {def.blobs.map((b, i) => (
        <div key={i} className="absolute rounded-full" style={{
          width: `${b.size}vmax`, height: `${b.size}vmax`,
          left: `${b.x}%`, top: `${b.y}%`, marginLeft: `-${b.size / 2}vmax`, marginTop: `-${b.size / 2}vmax`,
          background: `radial-gradient(circle, ${rgba(pal[i % 3], b.color)} 0%, transparent 68%)`,
          ['--dx' as string]: `${b.dx}vmax`, ['--dy' as string]: `${b.dy}vmax`,
          animation: `bc-drift ${b.dur}s ease-in-out infinite`, animationDelay: clockDelay(b.dur),
          willChange: 'transform',
        }} />
      ))}

      {/* Rayons : un seul grand calque qui oscille (le rendu est calculé une fois) */}
      {def.rays && (
        <div className="absolute" style={{
          left: '50%', top: '-60%', width: '200vmax', height: '200vmax', marginLeft: '-100vmax', transformOrigin: '50% 50%',
          background: `repeating-conic-gradient(from 0deg at 50% 50%, ${rgba(c1, 0.16)} 0deg 4deg, transparent 4deg 13deg, ${rgba(c2, 0.10)} 13deg 16deg, transparent 16deg 26deg)`,
          WebkitMaskImage: 'radial-gradient(circle at 50% 50%, black 0%, transparent 60%)', maskImage: 'radial-gradient(circle at 50% 50%, black 0%, transparent 60%)',
          animation: 'bc-sway 60s ease-in-out infinite', animationDelay: clockDelay(60), willChange: 'transform',
        }} />
      )}

      {/* Croix : deux barres lumineuses qui respirent */}
      {def.cross && (
        <div className="absolute inset-0" style={{ animation: 'bc-glow 9s ease-in-out infinite', animationDelay: clockDelay(9) }}>
          <div className="absolute" style={{ left: '50%', top: '14%', width: '2.2vmax', height: '62%', marginLeft: '-1.1vmax', borderRadius: '2vmax',
            background: `linear-gradient(180deg, transparent, ${rgba(c1, 0.55)} 20%, ${rgba(c1, 0.55)} 80%, transparent)`, boxShadow: `0 0 8vmax 2vmax ${rgba(c2, 0.25)}` }} />
          <div className="absolute" style={{ left: '30%', top: '30%', width: '40%', height: '2.2vmax', borderRadius: '2vmax',
            background: `linear-gradient(90deg, transparent, ${rgba(c1, 0.55)} 20%, ${rgba(c1, 0.55)} 80%, transparent)`, boxShadow: `0 0 8vmax 2vmax ${rgba(c2, 0.2)}` }} />
        </div>
      )}

      {/* Vagues : bandes très larges qui glissent (deux fois la largeur, boucle invisible) */}
      {def.waves && [0, 1, 2].map(i => (
        <div key={`w${i}`} className="absolute left-0" style={{
          bottom: `${-8 + i * 9}%`, width: '200%', height: '45%',
          background: `radial-gradient(60% 55% at 25% 100%, ${rgba(pal[i], 0.28 - i * 0.06)} 0%, transparent 70%), radial-gradient(60% 55% at 75% 100%, ${rgba(pal[(i + 1) % 3], 0.22 - i * 0.05)} 0%, transparent 70%)`,
          animation: `bc-slide-x ${40 + i * 14}s linear infinite`, animationDelay: clockDelay(40 + i * 14), willChange: 'transform',
        }} />
      ))}

      {bokeh.map((b, i) => (
        <span key={`b${i}`} className="absolute rounded-full" style={{
          left: `${b.x}%`, top: `${b.y}%`, width: `${b.s}vmin`, height: `${b.s}vmin`,
          background: `radial-gradient(circle, ${rgba(pal[b.c], b.o)} 0%, ${rgba(pal[b.c], b.o * 0.5)} 55%, transparent 72%)`,
          ['--dx' as string]: `${b.dx}vmax`, ['--dy' as string]: `${b.dy}vmax`,
          animation: `bc-drift ${b.d}s ease-in-out infinite`, animationDelay: clockDelay(b.d + i), willChange: 'transform',
        }} />
      ))}

      {def.clouds && [0, 1, 2, 3].map(i => (
        <div key={`c${i}`} className="absolute" style={{
          top: `${8 + i * 17}%`, left: 0, width: `${38 + (i % 2) * 18}vw`, height: `${14 + (i % 3) * 5}vh`,
          background: `radial-gradient(ellipse at center, ${rgba(pal[i % 3], 0.16 - i * 0.02)} 0%, transparent 70%)`,
          animation: `bc-cloud ${120 + i * 35}s linear infinite`, animationDelay: clockDelay(120 + i * 35 + i * 40), willChange: 'transform',
        }} />
      ))}

      {def.silk && [0, 1].map(i => (
        <div key={`s${i}`} className="absolute" style={{
          inset: '-30%',
          background: `repeating-linear-gradient(${115 + i * 20}deg, transparent 0 6vmax, ${rgba(pal[i], 0.18)} 10vmax, transparent 15vmax, ${rgba(pal[2], 0.10)} 19vmax, transparent 24vmax)`,
          animation: `bc-silk ${48 + i * 17}s ease-in-out infinite`, animationDelay: clockDelay(48 + i * 17), willChange: 'transform',
        }} />
      ))}

      {def.prism && (
        <div className="absolute" style={{
          left: '50%', top: '50%', width: '160vmax', height: '160vmax', marginLeft: '-80vmax', marginTop: '-80vmax',
          background: `conic-gradient(from 0deg, ${rgba(c1, 0.32)}, ${rgba(c2, 0.32)}, ${rgba(c3, 0.32)}, ${rgba(c1, 0.32)})`,
          WebkitMaskImage: 'radial-gradient(circle, black 0%, transparent 55%)', maskImage: 'radial-gradient(circle, black 0%, transparent 55%)',
          animation: 'bc-spin 120s linear infinite', animationDelay: clockDelay(120), willChange: 'transform',
        }} />
      )}

      {stars.map((s, i) => (
        <span key={`st${i}`} className="absolute rounded-full bg-white" style={{
          left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s,
          animation: `bc-twinkle ${s.d}s ease-in-out infinite`, animationDelay: clockDelay(s.d + i * 0.37),
        }} />
      ))}
      {Array.from({ length: def.shooting ?? 0 }, (_, i) => (
        <span key={`sh${i}`} className="absolute" style={{
          left: `${55 + rand(i + 1501) * 45}%`, top: `${rand(i + 1601) * 35}%`, width: '14vmax', height: 2,
          background: `linear-gradient(90deg, ${rgba(c3, 0.95)}, transparent)`, transformOrigin: '0 50%',
          animation: `bc-shoot ${9 + i * 4}s linear infinite`, animationDelay: clockDelay(9 + i * 4 + i * 2.3), willChange: 'transform, opacity',
        }} />
      ))}
      {embers.map((e, i) => (
        <span key={`e${i}`} className="absolute rounded-full" style={{
          left: `${e.x}%`, bottom: '-2%', width: e.s, height: e.s,
          background: `radial-gradient(circle, ${rgba(c3, 1)} 0%, ${rgba(c1, 0.6)} 50%, transparent 75%)`,
          ['--sway' as string]: `${e.sway}px`,
          animation: `bc-rise ${e.d}s linear infinite`, animationDelay: clockDelay(e.d + i * 1.3),
          willChange: 'transform, opacity',
        }} />
      ))}
    </div>
  );
}
