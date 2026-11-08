/* Onde sonore décorative (louange, chorale) — aucun micro, aucun réseau.
   Dessin 2D léger : 30 images/s, toile à résolution réduite, rien en WebGL.
   Le mouvement imite une musique : pulsation régulière + variations lentes, graves plus hauts. */
import { useEffect, useRef } from 'react';

export type WaveStyle = 'barres' | 'miroir' | 'onde' | 'points';
export type WavePosition = 'bas' | 'centre' | 'haut';

export const WAVE_STYLES: { id: WaveStyle; label: string }[] = [
  { id: 'barres', label: 'Barres' },
  { id: 'miroir', label: 'Miroir' },
  { id: 'onde', label: 'Onde' },
  { id: 'points', label: 'Points' },
];
export const WAVE_POSITIONS: { id: WavePosition; label: string }[] = [
  { id: 'bas', label: 'En bas' },
  { id: 'centre', label: 'Au centre' },
  { id: 'haut', label: 'En haut' },
];
export const WAVE_COLORS: { id: string; label: string; swatch: string }[] = [
  { id: '', label: 'Or', swatch: '#E9C46A' },
  { id: '#ffffff', label: 'Blanc', swatch: '#ffffff' },
  { id: '#7dd3fc', label: 'Ciel', swatch: '#7dd3fc' },
  { id: '#c4b5fd', label: 'Lavande', swatch: '#c4b5fd' },
];

const BARS = 48;

/** Hauteur (0..1) de chaque barre à l'instant t (secondes) — déterministe, identique sur toutes les TV */
function levels(t: number, out: Float32Array) {
  const beat = 60 / 76; // ~76 battements/min, tempo de louange
  const phase = (t % beat) / beat;
  const pulse = Math.exp(-phase * 5) * 0.35;                  // attaque puis retombée
  const swell = 0.68 + 0.2 * Math.sin(t * 0.21) + 0.1 * Math.sin(t * 0.53 + 1.7); // montées lentes, jamais à plat
  for (let i = 0; i < BARS; i++) {
    const x = i / (BARS - 1);
    const tilt = 1 - x * 0.55;                                  // les graves (à gauche) plus hauts
    const n = 0.5
      + 0.22 * Math.sin(t * 2.3 + i * 0.61)
      + 0.16 * Math.sin(t * 3.7 - i * 0.37 + 2.1)
      + 0.12 * Math.sin(t * 6.1 + i * 1.13);
    const v = (n * swell + pulse * (1 - x * 0.6)) * tilt;
    out[i] = Math.max(0.05, Math.min(1, Math.pow(v * 1.25, 1.15)));
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(f, 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [233, 196, 106];
}

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, lv: Float32Array, style: WaveStyle, rgb: [number, number, number], anchor: 'bottom' | 'middle' | 'top', t: number) {
  ctx.clearRect(0, 0, w, h);
  const [r, g, b] = rgb;
  const col = (a: number) => `rgba(${r},${g},${b},${a})`;
  const margin = w * 0.06;
  const span = w - margin * 2;
  const step = span / BARS;

  if (style === 'onde') {
    // Trois ondes lisses superposées, l'amplitude suit la « musique »
    const avg = lv.reduce((a, v) => a + v, 0) / BARS;
    const lines = [{ a: 0.22, f: 2.1, sp: 0.9, k: 0.8 }, { a: 0.45, f: 3.3, sp: -1.3, k: 0.65 }, { a: 0.95, f: 2.7, sp: 1.7, k: 1 }];
    const mid = anchor === 'top' ? h * 0.45 : anchor === 'bottom' ? h * 0.55 : h / 2;
    for (const L of lines) {
      ctx.beginPath();
      const N = 96;
      for (let k = 0; k <= N; k++) {
        const u = k / N;
        const env = Math.sin(u * Math.PI);                      // nul aux bords
        const local = lv[Math.min(BARS - 1, Math.floor(u * BARS))];
        const amp = h * 0.85 * L.k * env * (0.4 * avg + 0.6 * local);
        const y = mid + amp * (0.7 * Math.sin(u * Math.PI * 2 * L.f + t * L.sp) + 0.3 * Math.sin(u * Math.PI * 2 * L.f * 2.3 - t * L.sp * 1.4));
        const x = margin + u * span;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = col(L.a);
      ctx.lineWidth = Math.max(1.5, h * 0.03);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.stroke();
    }
    return;
  }

  const bw = step * (style === 'points' ? 0.38 : 0.56);
  const grad = anchor === 'top'
    ? ctx.createLinearGradient(0, 0, 0, h) : ctx.createLinearGradient(0, h, 0, 0);
  grad.addColorStop(0, col(0.95));
  grad.addColorStop(1, col(0.35));

  for (let i = 0; i < BARS; i++) {
    // Bords adoucis : les barres des extrémités s'effacent
    const edge = Math.min(1, Math.min(i, BARS - 1 - i) / 5 + 0.25);
    const x = margin + i * step + (step - bw) / 2;
    const v = lv[i] * edge;
    if (style === 'points') {
      const dot = bw;
      const n = Math.max(1, Math.round((v * h * 0.92) / (dot * 1.4)));
      for (let k = 0; k < n; k++) {
        const y = anchor === 'top' ? dot + k * dot * 1.4 : anchor === 'middle' ? h / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * dot * 1.4 : h - dot - k * dot * 1.4;
        ctx.fillStyle = col(0.9 - (k / n) * 0.55);
        ctx.beginPath(); ctx.arc(x + dot / 2, y, dot / 2, 0, Math.PI * 2); ctx.fill();
      }
      continue;
    }
    const mirror = style === 'miroir' || anchor === 'middle';
    const bh = v * h * (mirror ? 0.46 : 0.92);
    const y = mirror ? h / 2 - bh : anchor === 'top' ? 0 : h - bh;
    const hh = mirror ? bh * 2 : bh;
    ctx.fillStyle = mirror ? col(0.85) : grad;
    const rr = Math.min(bw / 2, hh / 2);
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, bw, hh, rr);
    else ctx.rect(x, y, bw, hh);
    ctx.fill();
  }
}

/** Calque d'onde. still = une seule image (aperçus de la tablette). */
export function WaveLayer({ on, style = 'barres', position = 'bas', color = '', still, lift }: {
  on: boolean; style?: WaveStyle; position?: WavePosition; color?: string; still?: boolean;
  /** Relève l'onde au-dessus du bandeau défilant */
  lift?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const anchor = position === 'centre' ? 'middle' : position === 'haut' ? 'top' : 'bottom';
  const rgb = hexToRgb(color || '#E9C46A');
  const rgbKey = rgb.join(',');

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !on) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    // Toile à résolution réduite : la TV agrandit, le processeur souffle
    const fit = () => {
      const scale = still ? 1 : 0.5;
      cv.width = Math.max(320, Math.round(cv.clientWidth * scale * (window.devicePixelRatio > 1 ? 1.2 : 1)));
      cv.height = Math.max(60, Math.round(cv.clientHeight * scale * (window.devicePixelRatio > 1 ? 1.2 : 1)));
    };
    fit();
    const lv = new Float32Array(BARS);
    if (still) { levels(12.3, lv); draw(ctx, cv.width, cv.height, lv, style, rgb, anchor, 12.3); return; }
    let raf = 0; let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 33) return; // ~30 images/s
      last = now;
      const t = Date.now() / 1000;
      levels(t, lv);
      draw(ctx, cv.width, cv.height, lv, style, rgb, anchor, t);
    };
    raf = requestAnimationFrame(loop);
    const onResize = () => fit();
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, style, anchor, rgbKey, still]);

  const box: React.CSSProperties = position === 'centre'
    ? { top: '30%', height: '40%', opacity: on ? 0.45 : 0 }
    : position === 'haut'
      ? { top: '2%', height: '17%', opacity: on ? 0.9 : 0 }
      : { bottom: lift ? '6.2%' : '1.5%', height: '17%', opacity: on ? 0.9 : 0 };
  return (
    <canvas ref={ref} aria-hidden
      style={{ position: 'absolute', left: 0, width: '100%', pointerEvents: 'none', transition: 'opacity 700ms ease, bottom 400ms ease', ...box }} />
  );
}
