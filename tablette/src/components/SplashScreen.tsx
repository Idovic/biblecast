/* Écran de démarrage pendant le chargement de la Bible */
import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';

interface SplashScreenProps {
  loading: boolean;
}

export default function SplashScreen({ loading }: SplashScreenProps) {
  const [dots, setDots] = useState('');
  const [fadeOut, setFadeOut] = useState(false);
  const [unmounted, setUnmounted] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 400);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!loading) {
      setFadeOut(true);
      const timer = setTimeout(() => setUnmounted(true), 750);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  if (unmounted) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background"
      style={{
        opacity: fadeOut ? 0 : 1,
        transition: 'opacity 600ms ease-out',
        pointerEvents: fadeOut ? 'none' : 'all',
      }}
    >
      <div className="flex flex-col items-center gap-8">
        <div className="relative">
          <div className="h-24 w-24 rounded-3xl bg-primary/15 border border-primary/30 flex items-center justify-center shadow-xl shadow-primary/10">
            <BookOpen className="h-12 w-12 text-primary" />
          </div>
          <div className="absolute -inset-2 rounded-3xl bg-primary/5 animate-pulse" />
        </div>

        <div className="flex flex-col items-center gap-2">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">BibleCast</h1>
          <p className="text-sm text-muted-foreground">Logiciel de projection liturgique</p>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="w-56 h-1 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: loading ? '70%' : '100%' }}
            />
          </div>
          <p className="text-xs text-muted-foreground/70">
            Chargement de la Bible{dots}
          </p>
        </div>
      </div>
    </div>
  );
}
