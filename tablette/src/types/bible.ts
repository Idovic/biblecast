export interface BibleData {
  [bookName: string]: {
    [chapter: string]: {
      [verse: string]: string;
    };
  };
}

export interface VerseReference {
  book: string;
  chapter: number;
  verse: number;
  text: string;
  /** Passage de plusieurs versets sur un même écran (verse → verseEnd) */
  verseEnd?: number;
  /** Mots mis en valeur sur la TV (positions des mots dans le texte) */
  highlights?: number[];
  /** Version affichée (ex. Darby) quand ce n'est pas la Bible principale */
  version?: string;
}

export type SlideType = 'text-title' | 'title-only' | 'verse-title' | 'blank' | 'bullet-list' | 'image-full' | 'definition' | 'info' | 'song';

export interface CustomSlide {
  id: string;
  title: string;
  content: string;
  slideType: SlideType;
  bullets?: string[];
  textColor?: string;
  backgroundColor?: string;
  backgroundGradient?: string;
  backgroundImage?: string;
  backgroundVideo?: string;
  /** Fond animé intégré (id, voir components/scene/animated.tsx) */
  backgroundAnimated?: string;
  /** Couleurs choisies pour le fond animé (3) */
  backgroundColors?: string[];
  textShadow?: boolean;
  showLogo?: boolean;
  fontSize?: 'small' | 'medium' | 'large' | 'xlarge';
  titleFontSize?: 'small' | 'medium' | 'large' | 'xlarge';
  textAlign?: 'left' | 'center' | 'right';
  // Texte riche — HTML (optionnel, backward compat : fallback sur content/title)
  contentHtml?: string;
  titleHtml?: string;
  /** Liste à puces : montrer les points un par un (chaque « Suivant » en ajoute un) */
  revealBullets?: boolean;
  /** Nombre de points déjà montrés (dans le message envoyé aux TV) */
  revealed?: number;
  /** Définition du dictionnaire : petite ligne au-dessus du mot, références en bas */
  label?: string;
  footer?: string;
  /** Ligne sous le titre (orateur, date, prénoms des mariés…) */
  subtitle?: string;
  /** Cases « Libellé : valeur » (type info) ; une case vide n'est pas affichée */
  rows?: { label: string; value: string }[];
  /** Repères des listes */
  bulletStyle?: 'puces' | 'numeros' | 'romains';
  /** Voile sombre sur une photo ou une vidéo de fond, de 0 à 80 (%) */
  veil?: number;
}

/** Métadonnées d'une présentation importée (PDF ou images) */
export interface PresentationMeta {
  id: string;
  name: string;
  pageCount: number;
  createdAt: number;
}

export interface QueueItem {
  id: string;
  type: 'verse' | 'slide' | 'section' | 'song';
  verse?: VerseReference;
  slide?: CustomSlide;
  sectionName?: string;
  sectionColor?: string;
  /** Section repliée dans le déroulé */
  collapsed?: boolean;
  /** Onde décorative pendant cet élément (ou tout ce moment, pour une section) */
  wave?: boolean;
  /** Chant (copie au moment de l'ajout : le déroulé reste valable même si le chant change) */
  song?: SongRef;
}

/** Chant dans le déroulé */
export interface SongRef { id: string; title: string; author?: string; lyrics: string; order?: string; linesPerScreen?: number; background?: string; updatedAt: number }

/** Rôle d'une TV : tout afficher, tout sauf les vidéos, ou rester sur l'horloge */
export type TvRole = 'miroir' | 'sans-video' | 'horloge';

/** Diagnostic envoyé par une TV : fluidité mesurée, mémoire, prise en charge des effets riches */
export interface TvDiag {
  fps: number;
  memoryMb?: number;
  webgl: boolean;
  quality: 'riche' | 'eco';
  screen?: string;
}

/** État de lecture vidéo renvoyé par une TV */
export interface TvVideoStatus {
  state: 'loading' | 'buffering' | 'ready' | 'playing' | 'paused' | 'progress' | 'ended' | 'stopped' | 'error' | 'cache' | 'cached';
  /** Copie sur la TV (0-100) */
  percent?: number;
  position?: number;
  duration?: number;
  url?: string;
  error?: string;
}

/** Bandeau nom (« Pasteur Daniel · Prédication ») */
export interface Nameplate { name: string; role?: string }

export interface DisplayMessage {
  type: 'show-verse' | 'show-slide' | 'clear' | 'theme-change' | 'request-next' | 'request-prev' | 'show-dual-verse' | 'queue-update' | 'ticker' | 'time-sync' | 'ping' | 'video-play' | 'video-control'
    /* Protocole v2 */
    | 'state' | 'settings' | 'hello' | 'tv-status' | 'overlay' | 'video-prefetch' | 'roles' | 'wave' | 'nameplate';
  /** NOIR / LOGO / FOND SEUL */
  overlay?: 'none' | 'black' | 'logo' | 'background';
  /** Rôle de chaque TV (par tvId) */
  roles?: Record<string, TvRole>;
  /** Programme du culte, pour le mode secours des TV */
  queue?: QueueItem[];
  /** v2 — état complet envoyé à chaque (re)connexion d'une TV */
  protocol?: number;
  current?: DisplayMessage | null;
  settings?: Record<string, unknown>;
  /** v2 — retour d'une TV */
  tvId?: string;
  name?: string;
  video?: TvVideoStatus;
  verse?: VerseReference;
  verse2?: VerseReference;
  slide?: CustomSlide;
  theme?: DisplayTheme;
  queueCount?: number;
  tickerText?: string;
  /** Onde décorative allumée (type 'wave' et 'state') */
  wave?: boolean;
  /** Bandeau avec un nom, en bas à gauche des TV (type 'nameplate' et 'state') ; null = masqué */
  nameplate?: Nameplate | null;
  timestamp?: number;
  // Vidéo locale
  videoUrl?: string;
  videoFileName?: string;
  videoAction?: 'play' | 'pause' | 'stop' | 'seek' | 'seek-forward' | 'seek-backward';
  videoPosition?: number;
  videoLoop?: boolean;
  /** Envoi ciblé : seules ces TV (tvId) appliquent le message ; absent = toutes */
  target?: string[];
  /** v2 — état propre à une TV quand elle n'affiche pas la même chose que les autres */
  currentByTv?: Record<string, DisplayMessage>;
  overlayByTv?: Record<string, 'none' | 'black' | 'logo' | 'background'>;
  tickerByTv?: Record<string, string>;
  /** v2 — diagnostic d'une TV (avec type 'tv-status') */
  diag?: TvDiag;
}

export interface DisplayTheme {
  name: string;
  className: string;
  fontSize: 'small' | 'medium' | 'large' | 'xlarge';
  fontFamily: 'serif' | 'sans-serif';
  bgOpacity: number;
  verseBackgroundImage?: string;
  verseBackgroundVideo?: string;
  /** Fond animé intégré pour les versets */
  verseBackgroundAnimated?: string;
  verseBackgroundColors?: string[];
  showChurchLogo?: boolean;
  splitLayout?: 'horizontal' | 'vertical';
  churchLogo?: string;
}

export interface SearchResult {
  book: string;
  chapter: number;
  verse: number;
  text: string;
  highlight: string;
}
