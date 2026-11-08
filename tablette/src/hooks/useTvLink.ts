/* Lien TV → tablette par WebSocket local (Wi-Fi de l'église, sans Internet).
   Remplace PeerJS (qui passait par un serveur sur Internet). */
import { useEffect, useRef, useState, useCallback } from 'react';
import type { DisplayMessage } from '@/types/bible';

export type TvLinkStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface TvIdentity {
  tvId: string;
  name: string;
  nativeVideo: boolean;
  appVersion?: string;
}

export interface TvLinkState {
  status: TvLinkStatus;
  isConnected: boolean;
  /** Envoie un message à la tablette (ignoré si déconnecté). */
  send: (msg: Record<string, unknown>) => void;
}

export function useTvLink(
  wsUrl: string | null,
  identity: TvIdentity,
  onMessage: (msg: DisplayMessage) => void,
): TvLinkState {
  const [status, setStatus] = useState<TvLinkStatus>('idle');
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = useCallback((msg: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify(msg)); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    if (!wsUrl) return;
    let disposed = false;

    const scheduleRetry = () => {
      if (disposed) return;
      const delay = Math.min(1000 * Math.pow(1.5, retryCountRef.current), 5000);
      retryCountRef.current++;
      retryTimerRef.current = setTimeout(connect, delay);
    };

    function connect() {
      if (disposed) return;
      setStatus('connecting');
      try {
        const ws = new WebSocket(wsUrl!);
        wsRef.current = ws;
        ws.onopen = () => {
          setStatus('connected');
          retryCountRef.current = 0;
          // Présentation : la tablette répond avec l'état complet
          try { ws.send(JSON.stringify({ type: 'hello', ...identityRef.current })); } catch { /* ignore */ }
        };
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string) as DisplayMessage;
            if (msg && typeof msg === 'object' && 'type' in msg) onMessageRef.current(msg);
          } catch { /* ignore */ }
        };
        ws.onclose = () => { setStatus('error'); scheduleRetry(); };
        ws.onerror = () => { setStatus('error'); };
      } catch {
        setStatus('error');
        scheduleRetry();
      }
    }

    connect();
    return () => {
      disposed = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      try { wsRef.current?.close(); } catch { /* ignore */ }
      wsRef.current = null;
      retryCountRef.current = 0;
      setStatus('idle');
    };
  }, [wsUrl]);

  return { status, isConnected: status === 'connected', send };
}
