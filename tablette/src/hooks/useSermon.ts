/* Écoute de la prédication : la tablette entend les références bibliques et les propose.
   Natif : moteur Vosk hors ligne (plugin LocalServer). Navigateur : mode essai (phrase tapée). */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import type { BibleData } from '@/types/bible';
import { SermonDetector, type Detection } from '@/lib/sermonDetect';
import { LocalServerNative } from '@/hooks/useLocalServer';

export type SermonState = 'idle' | 'loading' | 'listening' | 'essai' | 'error';

export function useSermon(bible: BibleData | null) {
  const isNative = Capacitor.isNativePlatform();
  const [state, setState] = useState<SermonState>('idle');
  const [device, setDevice] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [level, setLevel] = useState(0);
  const [partial, setPartial] = useState('');
  const [detections, setDetections] = useState<Detection[]>([]);
  const detector = useRef(new SermonDetector(bible));
  const subs = useRef<{ remove: () => void }[]>([]);
  useEffect(() => { detector.current.setBible(bible); }, [bible]);

  const feed = useCallback((text: string, isPartial: boolean) => {
    setPartial(text);
    const found = detector.current.feed(text, isPartial);
    if (found.length) setDetections(prev => [...found.reverse(), ...prev].slice(0, 40));
  }, []);

  const cleanup = () => { subs.current.forEach(s => s.remove()); subs.current = []; };

  const start = useCallback(async () => {
    setError(undefined);
    if (!isNative) { setState('essai'); return; }
    setState('loading');
    try {
      cleanup();
      subs.current.push(await LocalServerNative.addListener('sermonText', d => feed(d.text, d.partial)));
      subs.current.push(await LocalServerNative.addListener('sermonLevel', d => setLevel(d.level)));
      subs.current.push(await LocalServerNative.addListener('sermonStatus', d => {
        if (d.device) setDevice(d.device);
        if (d.state === 'listening') setState('listening');
        else if (d.state === 'loading') setState('loading');
        else if (d.state === 'error') { setState('error'); setError(d.error || 'Erreur du micro'); }
        else if (d.state === 'stopped') { setState(s => (s === 'error' ? s : 'idle')); setLevel(0); }
      }));
      await LocalServerNative.sermonStart();
    } catch (e) {
      setState('error'); setError(e instanceof Error ? e.message : String(e));
    }
  }, [isNative, feed]);

  const stop = useCallback(async () => {
    if (isNative) { try { await LocalServerNative.sermonStop(); } catch { /* ignore */ } }
    cleanup();
    setState('idle'); setLevel(0); setPartial('');
  }, [isNative]);

  useEffect(() => () => { cleanup(); if (isNative) LocalServerNative.sermonStop().catch(() => {}); }, [isNative]);

  const dismiss = useCallback((key: string) => setDetections(d => d.filter(x => x.key !== key)), []);
  const clear = useCallback(() => setDetections([]), []);

  return { isNative, state, device, error, level, partial, detections, start, stop, feed, dismiss, clear, active: state !== 'idle' };
}
