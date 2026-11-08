/* Historique des cultes : ce qui a été projeté, jour par jour (libellés seulement). */
import { useState } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import type { DisplayMessage } from '@/types/bible';

const KEY = 'biblecast:archive';
const MAX_DAYS = 120;

type Archive = Record<string, { t: number; label: string }[]>;

function load(): Archive {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

/** Libellé court d'un message projeté (null si rien à archiver) */
function labelOf(msg: DisplayMessage): string | null {
  if ((msg.type === 'show-verse' || msg.type === 'show-dual-verse') && msg.verse) return `${msg.verse.book} ${msg.verse.chapter}:${msg.verse.verse}`;
  if (msg.type === 'show-slide' && msg.slide) {
    if (msg.slide.slideType === 'image-full') return `Présentation : ${msg.slide.title || 'page'}`;
    return `Slide : ${msg.slide.title || 'sans titre'}`;
  }
  if (msg.type === 'video-play') return `Vidéo : ${msg.videoFileName ?? ''}`;
  return null;
}

export function archiveProjection(msg: DisplayMessage) {
  const label = labelOf(msg);
  if (!label) return;
  try {
    const a = load();
    const day = new Date().toISOString().slice(0, 10);
    const list = a[day] ?? [];
    if (list.length && list[list.length - 1].label === label) return; // pas de doublon immédiat
    list.push({ t: Date.now(), label });
    a[day] = list.slice(-500);
    const days = Object.keys(a).sort().reverse();
    for (const d of days.slice(MAX_DAYS)) delete a[d];
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch { /* stockage plein : on ignore */ }
}

export default function HistoryArchive() {
  const [archive] = useState<Archive>(load);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const days = Object.keys(archive).sort().reverse();
  if (days.length === 0) return null;
  return (
    <div className="space-y-1.5 pt-3 mt-3 border-t border-border/40">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <CalendarDays className="h-3.5 w-3.5" /> Cultes précédents
      </p>
      {days.map(d => (
        <div key={d} className="rounded-lg bg-secondary/40">
          <button onClick={() => setOpenDay(openDay === d ? null : d)} className="w-full h-11 px-3 flex items-center justify-between text-sm">
            <span>{new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">{archive[d].length}<ChevronDown className={`h-4 w-4 transition-transform ${openDay === d ? 'rotate-180' : ''}`} /></span>
          </button>
          {openDay === d && (
            <ol className="px-3 pb-3 space-y-1 text-xs text-muted-foreground">
              {archive[d].map((e, i) => (
                <li key={i} className="flex gap-2">
                  <span className="tabular-nums opacity-70">{new Date(e.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="text-foreground/90">{e.label}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </div>
  );
}
