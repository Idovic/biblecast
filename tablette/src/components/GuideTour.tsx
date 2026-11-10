/* Guide de prise en main : une visite en quelques étapes qui éclaire chaque zone de la régie.
   S'ouvre au premier lancement ; se relance depuis « Avant le culte ». */
import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const GUIDE_DONE_KEY = 'biblecast:guide-done';

interface Step { target?: string; title: string; text: string }

const STEPS: Step[] = [
  { title: 'Bienvenue dans BibleCast', text: 'En une minute, voici l\'essentiel pour projeter la Bible et le culte sur les TV. Vous pourrez revoir ce guide à tout moment.' },
  { target: 'bibliotheque', title: 'Choisir quoi montrer', text: 'Bible, slides, galerie, présentations et vidéos. Dans la Bible, cherchez « jn 3 16 » ou des mots, puis touchez un verset pour le voir dans l\'aperçu.' },
  { target: 'apercu', title: 'Vérifier, puis projeter', text: 'L\'aperçu montre exactement ce que verra l\'assemblée. « Projeter » l\'envoie sur les TV ; un double-toucher sur un verset aussi.' },
  { target: 'deroule', title: 'Préparer le culte', text: 'Touchez le nom du culte pour partir d\'un modèle, puis rangez versets et slides dans chaque moment. Tout s\'enregistre tout seul.' },
  { target: 'direct', title: 'Pendant le culte', text: '▶ passe à l\'élément suivant du déroulé. Bandeau, Nom et Onde s\'affichent par-dessus ce qui est à l\'écran.' },
  { target: 'commandes', title: 'En cas de besoin', text: 'NOIR, LOGO, FOND SEUL et Attente agissent tout de suite sur toutes les TV. Touchez encore pour revenir.' },
  { target: 'tv', title: 'Les TV', text: 'Ici, le nombre de TV reliées. Touchez pour les voir, les renommer (« Gauche », « Droite ») ou choisir ce que chacune affiche.' },
  { target: 'verifier', title: 'Avant chaque culte', text: 'Une vérification rapide : TV, batterie, vidéos, slides à remplir. Vous y trouverez aussi le mode entraînement pour former un bénévole.' },
];

export default function GuideTour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = STEPS[i];

  useLayoutEffect(() => {
    const find = () => {
      const el = step.target ? document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null : null;
      setRect(el && el.offsetParent !== null ? el.getBoundingClientRect() : null);
    };
    find();
    window.addEventListener('resize', find);
    return () => window.removeEventListener('resize', find);
  }, [step.target]);

  const finish = () => { try { localStorage.setItem(GUIDE_DONE_KEY, '1'); } catch { /* ignore */ } onClose(); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carte : sous la zone éclairée s'il y a la place, sinon au-dessus ; au centre sans zone
  const W = Math.min(380, window.innerWidth - 32);
  const pad = 10;
  let cardStyle: React.CSSProperties = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: W };
  if (rect) {
    const left = Math.max(16, Math.min(window.innerWidth - W - 16, rect.left + rect.width / 2 - W / 2));
    const below = window.innerHeight - rect.bottom > 230;
    cardStyle = below ? { left, top: rect.bottom + pad + 8, width: W } : { left, bottom: window.innerHeight - rect.top + pad + 8, width: W };
    // Zone très haute (colonne entière) : carte posée à côté
    if (!below && rect.top < 230) {
      const side = rect.right + W + 24 < window.innerWidth ? rect.right + 16 : Math.max(16, rect.left - W - 16);
      cardStyle = { left: side, top: Math.max(16, rect.top + 40), width: W };
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-label="Guide de prise en main">
      {rect ? (
        <div className="absolute rounded-xl pointer-events-none transition-all duration-300"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(6,5,14,0.74)', border: '2px solid hsl(var(--primary))' }} />
      ) : <div className="absolute inset-0 bg-black/75" />}
      <div className="absolute glass-panel rounded-2xl border border-border/60 shadow-2xl p-4 animate-fade-in" style={cardStyle} key={i}>
        <div className="flex items-start gap-2 mb-2">
          {i === 0 && <span className="h-9 w-9 rounded-lg bg-primary/20 flex items-center justify-center shrink-0"><BookOpen className="h-5 w-5 text-primary" /></span>}
          <div className="flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Étape {i + 1} sur {STEPS.length}</p>
            <h3 className="text-base font-bold leading-tight">{step.title}</h3>
          </div>
          <button onClick={finish} className="h-9 w-9 -mr-1 -mt-1 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Fermer le guide"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{step.text}</p>
        <div className="flex items-center gap-2 mt-4">
          <div className="flex gap-1 flex-1">
            {STEPS.map((_, k) => <span key={k} className={cn('h-1.5 rounded-full transition-all', k === i ? 'w-5 bg-primary' : 'w-1.5 bg-border')} />)}
          </div>
          {i > 0 && <Button variant="ghost" className="h-11 px-3" onClick={() => setI(i - 1)} aria-label="Étape précédente"><ChevronLeft className="h-4 w-4" /></Button>}
          {i === 0 && <Button variant="ghost" className="h-11" onClick={finish}>Plus tard</Button>}
          <Button className="h-11 gap-1 btn-gold" onClick={() => (i < STEPS.length - 1 ? setI(i + 1) : finish())}>
            {i === 0 ? 'Commencer' : i < STEPS.length - 1 ? <>Suivant <ChevronRight className="h-4 w-4" /></> : 'Terminer'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
