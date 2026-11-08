/* Écran d'attente : horloge, verset du jour — partagé par la TV et les aperçus de la tablette */
import { useEffect, useMemo, useState } from 'react';
import type { VerseReference } from '@/types/bible';
import type { ChurchSettings } from '@/components/SettingsPanel';
import { loadBible, getVerse, getChapters, getVerses, parseReference } from '@/lib/bible';
import type { StandbyExtras } from '@/components/scene/Scene';

function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

export async function getDailyVerse(): Promise<VerseReference | null> {
  try {
    const bible = await loadBible();
    const daySeed = Math.floor(Date.now() / 86400000);
    const books = Object.keys(bible);
    const bookName = books[Math.floor(seededRandom(daySeed) * books.length)];
    const chapters = getChapters(bible, bookName);
    if (!chapters.length) return null;
    const chapter = chapters[Math.floor(seededRandom(daySeed + 1) * chapters.length)];
    const verses = getVerses(bible, bookName, chapter);
    if (!verses.length) return null;
    const verseNum = verses[Math.floor(seededRandom(daySeed + 2) * verses.length)];
    return getVerse(bible, bookName, chapter, verseNum);
  } catch { return null; }
}

export async function getManualVerse(ref: string): Promise<VerseReference | null> {
  const r = parseReference(ref);
  if (!r) return null;
  try {
    const bible = await loadBible();
    return getVerse(bible, r.book, r.chapter, r.verseStart ?? 1);
  } catch { return null; }
}

export function formatClockTime(now: Date, showSeconds: boolean): string {
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return showSeconds ? `${h}:${m}:${String(now.getSeconds()).padStart(2, '0')}` : `${h}:${m}`;
}

export function formatClockDate(now: Date): string {
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
}


/** Horloge + verset du jour, mis à jour chaque seconde */
export function useStandbyExtras(settings: ChurchSettings, clockOffset = 0): StandbyExtras {
  const [nowMs, setNowMs] = useState(() => Date.now() + clockOffset);
  const [verseOfDay, setVerseOfDay] = useState<VerseReference | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now() + clockOffset), 1000);
    return () => clearInterval(id);
  }, [clockOffset]);
  useEffect(() => {
    if (!settings.showVerseOfDay) { setVerseOfDay(null); return; }
    if (settings.verseOfDayMode === 'manual' && settings.verseOfDayRef) getManualVerse(settings.verseOfDayRef).then(setVerseOfDay);
    else getDailyVerse().then(setVerseOfDay);
  }, [settings.showVerseOfDay, settings.verseOfDayMode, settings.verseOfDayRef]);
  const now = new Date(nowMs);
  const clockTime = settings.showClock ? formatClockTime(now, !!settings.showClockSeconds) : '';
  const clockDate = settings.showClock && settings.showClockDate ? formatClockDate(now) : '';
  return useMemo(() => ({ clockTime, clockDate, verseOfDay, now: nowMs }), [clockTime, clockDate, verseOfDay, nowMs]);
}
