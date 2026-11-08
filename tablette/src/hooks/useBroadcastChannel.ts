/* Hook pour la communication entre onglets via BroadcastChannel
   + relais optionnel vers PeerJS (cross-device) */
import { useEffect, useRef, useCallback } from 'react';
import type { DisplayMessage } from '@/types/bible';

const CHANNEL_NAME = 'biblecast-display';
const CONTROL_CHANNEL = 'biblecast-control';
const STORAGE_KEY = 'biblecast:last-display';
const THEME_KEY = 'biblecast:theme';

export function useBroadcastSender(
  peerSend?: (msg: DisplayMessage) => void,
  localWsSend?: (msg: DisplayMessage) => void
) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const peerSendRef = useRef(peerSend);
  const localWsSendRef = useRef(localWsSend);
  peerSendRef.current = peerSend;
  localWsSendRef.current = localWsSend;

  useEffect(() => {
    channelRef.current = new BroadcastChannel(CHANNEL_NAME);
    return () => channelRef.current?.close();
  }, []);

  const send = useCallback((message: DisplayMessage) => {
    channelRef.current?.postMessage(message);
    peerSendRef.current?.(message);
    localWsSendRef.current?.(message);
    try {
      if (
        message.type === 'show-verse' ||
        message.type === 'show-slide' ||
        message.type === 'clear' ||
        message.type === 'show-dual-verse'
      ) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(message));
      }
      if (message.type === 'theme-change' && message.theme) {
        localStorage.setItem(THEME_KEY, JSON.stringify(message.theme));
      }
    } catch { }
  }, []);

  return send;
}

export function useBroadcastReceiver(onMessage: (msg: DisplayMessage) => void) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event) => onMessageRef.current(event.data);
    return () => channel.close();
  }, []);
}

export function useControlSender() {
  const channelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    channelRef.current = new BroadcastChannel(CONTROL_CHANNEL);
    return () => channelRef.current?.close();
  }, []);
  return useCallback((msg: DisplayMessage) => {
    channelRef.current?.postMessage(msg);
  }, []);
}

export function useControlReceiver(onMessage: (msg: DisplayMessage) => void) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  useEffect(() => {
    const channel = new BroadcastChannel(CONTROL_CHANNEL);
    channel.onmessage = (e) => onMessageRef.current(e.data);
    return () => channel.close();
  }, []);
}

export function getLastDisplay(): DisplayMessage | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DisplayMessage) : null;
  } catch {
    return null;
  }
}

export function getLastTheme(): DisplayMessage['theme'] | null {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
