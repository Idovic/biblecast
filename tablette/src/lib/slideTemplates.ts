/* Catalogue des modèles de slides, rangés par moment du culte.
   Même mise en page partout (étiquette, titre, trait de la couleur de l'église, texte) ;
   un fond propre à chaque moment. Tout reste modifiable après l'ajout.
   Les versets sont ceux de la Louis Segond 1910. « {eglise} » = nom de l'église (Réglages). */
import { genId } from '@/lib/utils';
import type { CustomSlide } from '@/types/bible';

export type TemplateMoment = 'accueil' | 'louange' | 'parole' | 'priere' | 'offrande' | 'vie' | 'evenements' | 'cloture' | 'image';

export const MOMENTS: { id: TemplateMoment; label: string }[] = [
  { id: 'accueil', label: 'Accueil' },
  { id: 'louange', label: 'Louange' },
  { id: 'parole', label: 'Parole' },
  { id: 'priere', label: 'Prière' },
  { id: 'offrande', label: 'Offrande' },
  { id: 'vie', label: 'Vie de l\'église' },
  { id: 'evenements', label: 'Événements' },
  { id: 'cloture', label: 'Clôture' },
  { id: 'image', label: 'Affiche' },
];

/** Fond animé de chaque moment (modifiable sur chaque slide) */
export const MOMENT_BACKGROUND: Record<TemplateMoment, string> = {
  accueil: 'aurore',
  louange: 'pourpre',
  parole: 'nuit',
  priere: 'vagues',
  offrande: 'lumiere',
  vie: 'soie',
  evenements: 'bokeh',
  cloture: 'rayons',
  image: '',
};

type SlideData = Omit<CustomSlide, 'id'>;

export interface SlideTemplate {
  id: string;
  name: string;
  moment: TemplateMoment;
  description: string;
  /** Une ou plusieurs slides (ex. Notre Père en deux écrans) */
  slides: SlideData[];
  /** Exemple montré seulement dans le catalogue, pour les modèles à remplir */
  sample?: Partial<SlideData>[];
}

const base = (moment: TemplateMoment, extra: Partial<SlideData>): SlideData => ({
  title: '', content: '', slideType: 'text-title', textColor: '#ffffff', fontSize: 'large', textAlign: 'center',
  textShadow: true, showLogo: false, backgroundAnimated: MOMENT_BACKGROUND[moment] || undefined, ...extra,
});
const one = (id: string, name: string, moment: TemplateMoment, description: string, slide: Partial<SlideData>, sample?: Partial<SlideData>): SlideTemplate =>
  ({ id, name, moment, description, slides: [base(moment, slide)], sample: sample ? [sample] : undefined });

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export const SLIDE_TEMPLATES: SlideTemplate[] = [
  /* ── Accueil ── */
  one('bienvenue', 'Bienvenue', 'accueil', 'Accueil, avec le nom et le logo de l\'église', {
    slideType: 'title-only', label: '{eglise}', title: 'Bienvenue', subtitle: 'Nous sommes heureux de vous accueillir', showLogo: true,
  }),
  one('visiteurs', 'Visiteurs', 'accueil', 'Accueillir ceux qui viennent pour la première fois', {
    label: 'Accueil', title: 'Bienvenue aux visiteurs',
    content: 'Si c\'est votre première visite, nous serions heureux de faire votre connaissance à la fin du culte.',
  }),

  /* ── Louange ── */
  one('louange', 'Louange et adoration', 'louange', 'Titre du temps de louange', {
    slideType: 'title-only', label: 'Louange', title: 'Louange et adoration',
    subtitle: '« Entrez dans ses portes avec des louanges »', footer: 'Psaumes 100:4',
  }),
  one('chorale', 'Chorale', 'louange', 'Prestation de la chorale (nom à ajouter)', {
    slideType: 'title-only', label: 'Louange', title: 'Prestation de la chorale', subtitle: '',
  }, { subtitle: 'Chorale des jeunes' }),

  /* ── Parole ── */
  one('predication', 'Prédication', 'parole', 'Thème, orateur et texte, à remplir', {
    slideType: 'info', label: 'Prédication', title: '', subtitle: '', content: '', footer: '', showLogo: true,
    rows: [{ label: 'Orateur', value: '' }, { label: 'Texte', value: '' }],
  }, {
    title: 'Marcher par la foi', content: 'car nous marchons par la foi et non par la vue,', footer: '2 Corinthiens 5:7',
    rows: [{ label: 'Orateur', value: 'Pasteur Daniel' }, { label: 'Texte', value: '2 Corinthiens 5:1-10' }],
  }),
  one('points', 'Points de prédication', 'parole', 'I, II, III, qui apparaissent un par un', {
    slideType: 'bullet-list', label: 'Prédication', title: '', bullets: ['', '', ''], bulletStyle: 'romains', revealBullets: true, textAlign: 'left',
  }, { title: 'Marcher par la foi', bullets: ['La foi qui écoute', 'La foi qui obéit', 'La foi qui persévère'] }),
  one('verset', 'Verset', 'parole', 'Un verset tiré de la Bible', {
    slideType: 'verse-title', backgroundAnimated: 'rayons',
  }, {
    title: 'Jean 3:16',
    content: 'Car Dieu a tant aimé le monde qu\'il a donné son Fils unique, afin que quiconque croit en lui ne périsse point, mais qu\'il ait la vie éternelle.',
  }),
  one('ecole', 'École du dimanche', 'parole', 'Leçon, texte et moniteur, à remplir', {
    slideType: 'info', label: 'École du dimanche', title: '', content: '', footer: '',
    rows: [{ label: 'Texte', value: '' }, { label: 'Moniteur', value: '' }],
  }, { title: 'David et Goliath', rows: [{ label: 'Texte', value: '1 Samuel 17' }, { label: 'Moniteur', value: 'Frère Paul' }] }),
  one('question', 'Question d\'étude', 'parole', 'Une question pour lancer la discussion', {
    label: 'Question', title: '', content: '',
  }, { content: 'Que nous apprend ce passage sur la fidélité de Dieu ?' }),
  {
    id: 'notre-pere', name: 'Notre Père', moment: 'parole', description: 'Matthieu 6:9-13, en deux écrans',
    slides: [
      base('parole', { label: 'Prions ensemble · 1/2', title: 'Notre Père', footer: 'Matthieu 6:9-10',
        content: 'Notre Père qui es aux cieux! Que ton nom soit sanctifié; que ton règne vienne; que ta volonté soit faite sur la terre comme au ciel.' }),
      base('parole', { label: 'Prions ensemble · 2/2', title: 'Notre Père', footer: 'Matthieu 6:11-13',
        content: 'Donne-nous aujourd\'hui notre pain quotidien; pardonne-nous nos offenses, comme nous aussi nous pardonnons à ceux qui nous ont offensés; ne nous induis pas en tentation, mais délivre-nous du malin. Car c\'est à toi qu\'appartiennent, dans tous les siècles, le règne, la puissance et la gloire. Amen!' }),
    ],
  },
  {
    id: 'symbole', name: 'Symbole des apôtres', moment: 'parole', description: 'Confession de foi dite ensemble, en deux écrans',
    slides: [
      base('parole', { label: 'Confessons notre foi · 1/2', title: 'Symbole des apôtres',
        content: 'Je crois en Dieu, le Père tout-puissant, créateur du ciel et de la terre. Et en Jésus-Christ, son Fils unique, notre Seigneur, qui a été conçu du Saint-Esprit, est né de la vierge Marie, a souffert sous Ponce Pilate, a été crucifié, est mort et a été enseveli, est descendu aux enfers ;' }),
      base('parole', { label: 'Confessons notre foi · 2/2', title: 'Symbole des apôtres',
        content: 'le troisième jour, il est ressuscité des morts, il est monté au ciel, il est assis à la droite de Dieu le Père tout-puissant, d\'où il viendra juger les vivants et les morts. Je crois au Saint-Esprit, à la sainte Église universelle, à la communion des saints, à la rémission des péchés, à la résurrection de la chair, à la vie éternelle. Amen.' }),
    ],
  },

  /* ── Prière ── */
  one('priere', 'Prière d\'intercession', 'priere', 'Temps de prière, avec Jacques 5:16', {
    label: 'Prière', title: 'Prière d\'intercession',
    content: '… La prière fervente du juste a une grande efficace.', footer: 'Jacques 5:16',
  }),
  one('sujets', 'Sujets de prière', 'priere', 'Liste qui apparaît point par point', {
    slideType: 'bullet-list', label: 'Prière', title: 'Sujets de prière', bullets: ['', '', ''], revealBullets: true, textAlign: 'left',
  }, { bullets: ['Les malades de l\'assemblée', 'Les familles', 'Notre pays'] }),

  /* ── Offrande ── */
  one('offrande', 'Dîmes et offrandes', 'offrande', 'Avec 2 Corinthiens 9:7', {
    label: 'Offrande', title: 'Dîmes et offrandes',
    content: 'Que chacun donne comme il l\'a résolu en son cœur, sans tristesse ni contrainte; car Dieu aime celui qui donne avec joie.',
    footer: '2 Corinthiens 9:7',
  }),
  one('dimes', 'Dîmes · Malachie 3:10', 'offrande', 'Le verset complet de Malachie 3:10', {
    label: 'Offrande', title: 'Dîmes et offrandes',
    content: 'Apportez à la maison du trésor toutes les dîmes, Afin qu\'il y ait de la nourriture dans ma maison; Mettez-moi de la sorte à l\'épreuve, Dit l\'Éternel des armées. Et vous verrez si je n\'ouvre pas pour vous les écluses des cieux, Si je ne répands pas sur vous la bénédiction en abondance.',
    footer: 'Malachie 3:10',
  }),

  /* ── Vie de l'église ── */
  one('annonces', 'Annonces', 'vie', 'Les annonces de la semaine', {
    slideType: 'bullet-list', label: 'Annonces', title: 'Cette semaine', bullets: ['', ''], textAlign: 'left',
  }, { bullets: ['Réunion de prière mercredi à 18 h', 'Répétition de la chorale samedi à 16 h'] }),
  one('evenement', 'Annonce d\'événement', 'vie', 'Quoi, quand, où, contact, à remplir', {
    slideType: 'info', label: 'Annonce', title: '', content: '',
    rows: [{ label: 'Quand', value: '' }, { label: 'Où', value: '' }, { label: 'Contact', value: '' }],
  }, {
    title: 'Convention de la jeunesse', content: 'Trois jours de louange et d\'enseignement.',
    rows: [{ label: 'Quand', value: 'Du 18 au 20 décembre' }, { label: 'Où', value: 'Au temple' }, { label: 'Contact', value: 'Frère Moïse' }],
  }),
  one('programme', 'Programme de la semaine', 'vie', 'Un jour par ligne ; les jours vides sont cachés', {
    slideType: 'info', label: 'Programme', title: 'Programme de la semaine',
    rows: DAYS.map(d => ({ label: d, value: '' })),
  }, {
    rows: DAYS.map(d => ({ label: d, value: ({ Mardi: 'Étude biblique · 18 h', Mercredi: 'Réunion de prière · 18 h', Vendredi: 'Veillée de prière · 21 h', Dimanche: 'Culte · 9 h' } as Record<string, string>)[d] ?? '' })),
  }),
  one('anniversaires', 'Anniversaires du mois', 'vie', 'Prénoms et dates', {
    slideType: 'bullet-list', label: 'Joyeux anniversaire', title: 'Anniversaires du mois', bullets: ['', '', ''], textAlign: 'left',
  }, { bullets: ['Ruth · 3', 'Daniel · 12', 'Esther · 21'] }),
  one('temoignages', 'Témoignages', 'vie', 'Temps de partage, avec Psaumes 66:16', {
    label: 'Partage', title: 'Témoignages',
    content: '« Venez, écoutez, vous tous qui craignez Dieu, et je raconterai Ce qu\'il a fait à mon âme. »', footer: 'Psaumes 66:16',
  }),

  /* ── Événements ── */
  one('sainte-cene', 'Sainte Cène', 'evenements', 'Avec 1 Corinthiens 11:26', {
    label: 'Sainte Cène', title: 'Le repas du Seigneur', backgroundAnimated: 'croix',
    content: 'Car toutes les fois que vous mangez ce pain et que vous buvez cette coupe, vous annoncez la mort du Seigneur, jusqu\'à ce qu\'il vienne.',
    footer: '1 Corinthiens 11:26',
  }),
  one('bapteme', 'Baptême', 'evenements', 'Prénoms des baptisés et Romains 6:4', {
    label: 'Baptême', title: 'Baptême', subtitle: '', backgroundAnimated: 'ocean',
    content: 'Nous avons donc été ensevelis avec lui par le baptême en sa mort, afin que, comme Christ est ressuscité des morts par la gloire du Père, de même nous aussi nous marchions en nouveauté de vie.',
    footer: 'Romains 6:4',
  }, { subtitle: 'Paul, Lydie et Corneille' }),
  one('mariage', 'Mariage', 'evenements', 'Prénoms des mariés, date, Ecclésiaste 4:12', {
    label: 'Mariage', title: '', subtitle: '',
    content: '… et la corde à trois fils ne se rompt pas facilement.', footer: 'Ecclésiaste 4:12',
  }, { title: 'Daniel & Esther', subtitle: 'Samedi 12 décembre' }),
  one('dedicace', 'Dédicace d\'enfant', 'evenements', 'Prénom de l\'enfant et Marc 10:14', {
    label: 'Dédicace d\'enfant', title: '', backgroundAnimated: 'aube',
    content: '… Laissez venir à moi les petits enfants, et ne les en empêchez pas; car le royaume de Dieu est pour ceux qui leur ressemblent.',
    footer: 'Marc 10:14',
  }, { title: 'Bienvenue, petite Grâce' }),

  /* ── Clôture ── */
  one('benediction', 'Bénédiction', 'cloture', 'Nombres 6:24-26', {
    label: 'Bénédiction', title: '',
    content: 'Que l\'Éternel te bénisse, et qu\'il te garde! Que l\'Éternel fasse luire sa face sur toi, et qu\'il t\'accorde sa grâce! Que l\'Éternel tourne sa face vers toi, et qu\'il te donne la paix!',
    footer: 'Nombres 6:24-26',
  }),
  one('au-revoir', 'Que Dieu vous bénisse', 'cloture', 'Fin du culte, prochain rendez-vous', {
    slideType: 'title-only', label: '{eglise}', title: 'Que Dieu vous bénisse', subtitle: '', showLogo: true,
  }, { subtitle: 'Prochain culte : dimanche à 9 h' }),

  /* ── Affiche ── */
  {
    id: 'visuel', name: 'Affiche / image', moment: 'image', description: 'Une affiche, une invitation, un flyer',
    slides: [{ title: '', content: '', slideType: 'image-full', textColor: '#ffffff', fontSize: 'large', textAlign: 'center', textShadow: false, showLogo: false }],
  },
];

export function templateById(id: string): SlideTemplate | undefined {
  return SLIDE_TEMPLATES.find(t => t.id === id);
}

/** Slides prêtes à ajouter (nouveaux identifiants) */
export function slidesFromTemplate(t: SlideTemplate): CustomSlide[] {
  return t.slides.map(s => ({ id: genId(), ...structuredCloneSafe(s) }));
}

/** Version d'exemple pour la miniature du catalogue */
export function templatePreview(t: SlideTemplate): CustomSlide {
  return { id: 'tpl-' + t.id, ...t.slides[0], ...(t.sample?.[0] ?? {}) };
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
