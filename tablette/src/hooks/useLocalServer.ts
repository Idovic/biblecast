/* Hook de gestion du serveur local embarqué (Capacitor APK uniquement)
   En mode web normal ce hook est un no-op complet */
import { useEffect, useState, useCallback, useRef } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { DisplayMessage } from '@/types/bible';

export const HTTP_PORT = 8090;
export const WS_PORT = 8091;

interface LocalServerPlugin {
  startServer(options: { httpPort: number; wsPort: number }): Promise<{ success: boolean }>;
  stopServer(): Promise<void>;
  getLocalIP(): Promise<{ ip: string }>;
  sendWsMessage(options: { message: string }): Promise<void>;
  setState(options: { state: string }): Promise<void>;
  getClients(): Promise<{ clients: TvClient[] }>;
  listen(): Promise<{ results: string[] }>;
  /** Écoute de la prédication (Vosk, hors ligne) */
  sermonStart(): Promise<void>;
  sermonStop(): Promise<void>;
  addListener(event: 'sermonText', listener: (data: { text: string; partial: boolean }) => void): Promise<{ remove: () => void }>;
  addListener(event: 'sermonLevel', listener: (data: { level: number }) => void): Promise<{ remove: () => void }>;
  addListener(event: 'sermonStatus', listener: (data: { state: string; device?: string; error?: string }) => void): Promise<{ remove: () => void }>;
  addListener(
    event: 'wsMessage',
    listener: (data: { message: string }) => void
  ): Promise<{ remove: () => void }>;
  addListener(
    event: 'clients',
    listener: (data: { clients: TvClient[] }) => void
  ): Promise<{ remove: () => void }>;
  openVideoPicker(): Promise<{ videoUrl: string; fileName: string; fileSize: number; mimeType: string }>;
  clearVideo(): Promise<void>;
  // Galerie vidéos de fond
  openBgVideoPicker(options: { slot: number }): Promise<{ videoUrl: string; fileName: string; slot: number }>;
  clearBgVideo(options: { slot: number }): Promise<void>;
  listBgVideos(): Promise<{ videos: Array<{ slot: number; fileName: string; videoUrl: string }> }>;
}

const LocalServerPlugin = registerPlugin<LocalServerPlugin>('LocalServer');
/** Accès direct au plugin natif (écoute de la prédication) */
export const LocalServerNative = LocalServerPlugin;

/** Une TV connectée au serveur local */
export interface TvClient {
  tvId?: string;
  name?: string;
  address?: string;
  nativeVideo?: boolean;
  appVersion?: string;
  since?: number;
}

export interface BgVideoEntry {
  id: string;
  label: string;
  slot: number;
  url: string;
}

export interface LocalServerState {
  isNative: boolean;
  isServerRunning: boolean;
  localIP: string | null;
  httpUrl: string | null;
  wsUrl: string | null;
  wsEncodedUrl: string | null;
  sendToWs: (msg: DisplayMessage) => void;
  /** Mémorise l'état complet que chaque TV reçoit à sa (re)connexion */
  setState: (state: DisplayMessage) => void;
  /** TV actuellement connectées */
  tvs: TvClient[];
  /** Recherche vocale (Android) : propositions de transcription */
  listen: () => Promise<string[]>;
  refreshIP: () => Promise<void>;
  openVideoPicker: () => Promise<{ videoUrl: string; fileName: string } | null>;
  clearVideo: () => Promise<void>;
  // Bg video gallery
  openBgVideoPicker: (slot: number) => Promise<{ videoUrl: string; fileName: string } | null>;
  clearBgVideo: (slot: number) => Promise<void>;
  listBgVideos: () => Promise<Array<{ slot: number; fileName: string; videoUrl: string }>>;
}

export function useLocalServer(onTvMessage?: (msg: DisplayMessage) => void): LocalServerState {
  const isNative = Capacitor.isNativePlatform();
  const [isServerRunning, setIsServerRunning] = useState(false);
  const [localIP, setLocalIP] = useState<string | null>(null);
  const listenerRef = useRef<{ remove: () => void } | null>(null);
  const clientsListenerRef = useRef<{ remove: () => void } | null>(null);
  const [tvs, setTvs] = useState<TvClient[]>([]);
  const onTvMessageRef = useRef(onTvMessage);
  onTvMessageRef.current = onTvMessage;

  const listen = useCallback(async (): Promise<string[]> => {
    if (!isNative) return [];
    try { return (await LocalServerPlugin.listen()).results ?? []; } catch { return []; }
  }, [isNative]);

  const setState = useCallback((state: DisplayMessage) => {
    if (!isNative) return;
    try {
      LocalServerPlugin.setState({ state: JSON.stringify(state) }).catch(() => {});
    } catch { }
  }, [isNative]);

  const sendToWs = useCallback((msg: DisplayMessage) => {
    if (!isNative) return;
    try {
      LocalServerPlugin.sendWsMessage({ message: JSON.stringify(msg) }).catch(() => {});
    } catch { }
  }, [isNative]);

  const refreshIP = useCallback(async () => {
    if (!isNative) return;
    try {
      const result = await LocalServerPlugin.getLocalIP();
      const ip = result.ip || null;
      if (ip && ip !== '127.0.0.1') setLocalIP(ip);
    } catch { }
  }, [isNative]);

  /** Ouvre le file picker Android et retourne l'URL de streaming vidéo plein écran. */
  const openVideoPicker = useCallback(async (): Promise<{ videoUrl: string; fileName: string } | null> => {
    if (!isNative) return null;
    try {
      const result = await LocalServerPlugin.openVideoPicker();
      // ?v= : identifiant de la vidéo, pour que chaque TV la garde en cache sous une clé unique
      const v = encodeURIComponent(`${result.fileName}-${result.fileSize}`);
      return { videoUrl: `${result.videoUrl}?v=${v}`, fileName: result.fileName };
    } catch {
      return null;
    }
  }, [isNative]);

  /** Supprime la vidéo plein écran du serveur HTTP. */
  const clearVideo = useCallback(async () => {
    if (!isNative) return;
    await LocalServerPlugin.clearVideo().catch(() => {});
  }, [isNative]);

  /** Ouvre le file picker pour une vidéo de fond (slot 0-4). */
  const openBgVideoPicker = useCallback(async (slot: number): Promise<{ videoUrl: string; fileName: string } | null> => {
    if (!isNative) return null;
    try {
      const result = await LocalServerPlugin.openBgVideoPicker({ slot });
      return { videoUrl: result.videoUrl, fileName: result.fileName };
    } catch {
      return null;
    }
  }, [isNative]);

  /** Efface un slot de vidéo de fond. */
  const clearBgVideo = useCallback(async (slot: number) => {
    if (!isNative) return;
    await LocalServerPlugin.clearBgVideo({ slot }).catch(() => {});
  }, [isNative]);

  /** Retourne la liste persistée des vidéos de fond. */
  const listBgVideos = useCallback(async (): Promise<Array<{ slot: number; fileName: string; videoUrl: string }>> => {
    if (!isNative) return [];
    try {
      const result = await LocalServerPlugin.listBgVideos();
      return result.videos ?? [];
    } catch {
      return [];
    }
  }, [isNative]);

  useEffect(() => {
    if (!isNative) return;

    let cancelled = false;

    (async () => {
      try {
        listenerRef.current = await LocalServerPlugin.addListener('wsMessage', (data) => {
          try {
            const msg = JSON.parse(data.message) as DisplayMessage;
            if (msg && typeof msg === 'object' && 'type' in msg) onTvMessageRef.current?.(msg);
          } catch { }
        });
        clientsListenerRef.current = await LocalServerPlugin.addListener('clients', (data) => {
          setTvs(Array.isArray(data.clients) ? data.clients : []);
        });
        await LocalServerPlugin.startServer({ httpPort: HTTP_PORT, wsPort: WS_PORT });
        const result = await LocalServerPlugin.getLocalIP();
        if (!cancelled) {
          const ip = result.ip || null;
          if (ip && ip !== '127.0.0.1') setLocalIP(ip);
          setIsServerRunning(true);
        }
      } catch (err) {
        console.warn('[LocalServer] démarrage échoué:', err);
      }
    })();

    return () => {
      cancelled = true;
      listenerRef.current?.remove();
      listenerRef.current = null;
      clientsListenerRef.current?.remove();
      clientsListenerRef.current = null;
      setTvs([]);
      LocalServerPlugin.stopServer().catch(() => {});
      setIsServerRunning(false);
    };
  }, [isNative]);

  const httpUrl = localIP ? `http://${localIP}:${HTTP_PORT}` : null;
  const wsUrl = localIP ? `ws://${localIP}:${WS_PORT}` : null;
  const wsEncodedUrl = wsUrl ? encodeURIComponent(wsUrl) : null;

  return {
    isNative, isServerRunning, localIP, httpUrl, wsUrl, wsEncodedUrl,
    sendToWs, setState, tvs, listen, refreshIP, openVideoPicker, clearVideo,
    openBgVideoPicker, clearBgVideo, listBgVideos,
  };
}
