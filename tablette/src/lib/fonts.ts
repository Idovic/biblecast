/* Polices embarquées (public/fonts) : elles marchent sans Internet, sur la tablette comme sur les TV.
   Le choix se fait dans Réglages → Affichage ; le bouton Serif / Sans sous l'aperçu choisit laquelle des deux. */
import type { ChurchSettings } from '@/components/SettingsPanel';

export const SERIF_FONTS = [
  { value: 'Lora', label: 'Lora', note: 'élégante, très lisible' },
  { value: 'Roboto Slab', label: 'Roboto Slab', note: 'solide, pour les grandes salles' },
  { value: 'system', label: 'Police de la TV', note: 'celle d\'Android' },
] as const;

export const SANS_FONTS = [
  { value: 'Lato', label: 'Lato', note: 'douce et claire' },
  { value: 'Poppins', label: 'Poppins', note: 'moderne, géométrique' },
  { value: 'system', label: 'Police de la TV', note: 'celle d\'Android' },
] as const;

const SERIF_FALLBACK = "'Noto Serif', 'Droid Serif', Georgia, 'Times New Roman', serif";
const SANS_FALLBACK = "Roboto, 'Noto Sans', 'Segoe UI', Arial, sans-serif";

export function fontStacks(s: Partial<ChurchSettings>): { serif: string; sans: string } {
  const serif = s.fontSerif && s.fontSerif !== 'system' ? `'${s.fontSerif}', ${SERIF_FALLBACK}` : SERIF_FALLBACK;
  const sans = s.fontSans && s.fontSans !== 'system' ? `'${s.fontSans}', ${SANS_FALLBACK}` : SANS_FALLBACK;
  return { serif, sans };
}

/** Applique les polices choisies au moteur de scène (variables CSS --bc-serif / --bc-sans) */
export function applyFontVars(s: Partial<ChurchSettings>) {
  const { serif, sans } = fontStacks(s);
  const root = document.documentElement.style;
  root.setProperty('--bc-serif', serif);
  root.setProperty('--bc-sans', sans);
}
