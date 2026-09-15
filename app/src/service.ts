// Spojenie PWA ↔ lokálna služba (WebSocket). Token prichádza v URL (?t=) a ukladá sa do localStorage.
import { useEffect, useRef, useState, useCallback } from 'react';

export interface SketchUpLast {
  id: string;
  status: 'ok' | 'error' | 'expired' | 'rejected' | string;
  message: string;
  at: number;
}
export interface SketchUpState {
  available: boolean;
  receiverStatus: string;
  heartbeatAge: number | null;
  model: string | null;
  selectionCount: number | null;
  isolationActive: boolean;
  isolationCount: number;
  hiddenObjectsShown: boolean;
  last: SketchUpLast | null;
  pid: number | null;
  targetReason: 'foreground' | 'single' | 'none' | 'ambiguous';
  instances: { pid: number; model: string | null; available: boolean; selectionCount: number | null }[];
}
export interface ForegroundState {
  available: boolean;
  app: string | null;
  pid: number | null;
  title: string | null;
  kind: 'sketchup' | 'chrome' | 'other';
  ts: number;
}
export interface UsageProvider {
  status: string | null;
  weeklyUsed: number | null;
  weeklyResetAt: number | null;
  sessionUsed: number | null;
  sessionResetAt: number | null;
}
export interface UsageState {
  available: boolean;
  stale: boolean;
  ageSec: number | null;
  mode: string | null;
  claude: UsageProvider;
  codex: UsageProvider;
}
export interface MediaState {
  available: boolean;
  workerOk: boolean;
  app: string | null;
  status: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  thumb: string | null;
}

type ServerMsg =
  | { type: 'sketchup'; ts: number; data: SketchUpState }
  | { type: 'usage'; ts: number; data: UsageState }
  | { type: 'media'; ts: number; data: MediaState }
  | { type: 'foreground'; ts: number; data: ForegroundState }
  | { type: 'ack'; clientId?: string; ok: boolean; id?: string; error?: string }
  | { type: 'pong'; ts: number };

export type Ack = Extract<ServerMsg, { type: 'ack' }>;
export type Connection = 'connecting' | 'open' | 'closed' | 'unauthorized';

const TOKEN_KEY = 'nportal.token';

export function resolveToken(): string | null {
  const fromUrl = new URLSearchParams(location.search).get('t');
  if (fromUrl) {
    try {
      localStorage.setItem(TOKEN_KEY, fromUrl);
    } catch {
      /* súkromné okno a pod. */
    }
    history.replaceState(null, '', location.pathname);
    return fromUrl;
  }
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function useService() {
  const [connection, setConnection] = useState<Connection>('connecting');
  const [sketchup, setSketchup] = useState<SketchUpState | null>(null);
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [media, setMedia] = useState<MediaState | null>(null);
  const [foreground, setForeground] = useState<ForegroundState | null>(null);
  const [lastAck, setLastAck] = useState<Ack | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const tokenRef = useRef<string | null>(null);
  const retryRef = useRef(0);

  useEffect(() => {
    tokenRef.current = resolveToken();
    let closed = false;
    let timer: number | undefined;

    const connect = () => {
      if (closed) return;
      if (!tokenRef.current) {
        setConnection('unauthorized');
        return;
      }
      setConnection('connecting');
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws?t=${encodeURIComponent(tokenRef.current)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setConnection('open');
      };
      ws.onmessage = (ev) => {
        let m: ServerMsg;
        try {
          m = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (m.type === 'sketchup') setSketchup(m.data);
        else if (m.type === 'usage') setUsage(m.data);
        else if (m.type === 'media') setMedia(m.data);
        else if (m.type === 'foreground') setForeground(m.data);
        else if (m.type === 'ack') setLastAck(m);
      };
      ws.onclose = () => {
        wsRef.current = null;
        setSketchup(null);
        if (closed) return;
        setConnection('closed');
        const delay = Math.min(1000 * 2 ** retryRef.current, 8000);
        retryRef.current += 1;
        timer = window.setTimeout(connect, delay);
      };
    };

    connect();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !wsRef.current) {
        window.clearTimeout(timer);
        retryRef.current = 0;
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      closed = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      wsRef.current?.close();
    };
  }, []);

  const sendCommand = useCallback((action: string): string | null => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return null;
    const id = Math.random().toString(36).slice(2, 8);
    ws.send(JSON.stringify({ type: 'command', action, id }));
    return id;
  }, []);

  const sendMedia = useCallback((action: 'play' | 'pause' | 'toggle' | 'next' | 'prev') => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'media', action }));
  }, []);

  return { connection, sketchup, usage, media, foreground, lastAck, sendCommand, sendMedia, hasToken: !!tokenRef.current };
}
