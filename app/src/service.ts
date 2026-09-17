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
  xrayOn: boolean;
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
  volume: number | null;
  muted: boolean;
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
// Strážca spojenia: služba posiela stav SketchUpu najmenej každé 2 s. Ak dlhšie nič nepríde,
// spojenie je mŕtve (výpadok Wi‑Fi, spánok telefónu, pád služby) aj keď prehliadač ešte nehlási zatvorenie.
const SILENCE_PING_MS = 3500; // po tomto tichu pošli ping
const SILENCE_DROP_MS = 7000; // po tomto tichu spojenie zahoď a pripoj sa znova
const CONNECT_TIMEOUT_MS = 4000; // pripájanie bez odpovede (napr. zmena adresy PC) → skús znova
const RETRY_MAX_MS = 5000;

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
  const [offlineSince, setOfflineSince] = useState<number>(() => Date.now()); // od kedy nie je spojenie (0 = je)
  const wsRef = useRef<WebSocket | null>(null);
  const tokenRef = useRef<string | null>(null);
  const retryRef = useRef(0);
  const lastMsgRef = useRef(0);

  useEffect(() => {
    tokenRef.current = resolveToken();
    let closed = false;
    let timer: number | undefined;
    let connectGuard: number | undefined;

    const markOffline = () => setOfflineSince((v) => (v ? v : Date.now()));

    const schedule = (delay: number) => {
      if (closed) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(connect, delay);
    };

    /** Zahodí aktuálne spojenie bez čakania na zatváranie (mŕtvy socket) a hneď skúsi znova. */
    const drop = (why: string) => {
      const ws = wsRef.current;
      if (!ws) return;
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
      window.clearTimeout(connectGuard);
      setSketchup(null);
      setConnection('closed');
      markOffline();
      console.info(`[n-portal] spojenie zahodené: ${why}`);
      schedule(300);
    };

    const connect = () => {
      if (closed || wsRef.current) return;
      if (!tokenRef.current) {
        setConnection('unauthorized');
        return;
      }
      setConnection('connecting');
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws?t=${encodeURIComponent(tokenRef.current)}`);
      wsRef.current = ws;
      window.clearTimeout(connectGuard);
      connectGuard = window.setTimeout(() => {
        if (wsRef.current === ws && ws.readyState === WebSocket.CONNECTING) {
          retryRef.current += 1;
          drop('pripájanie bez odpovede');
        }
      }, CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        window.clearTimeout(connectGuard);
        retryRef.current = 0;
        lastMsgRef.current = Date.now();
        setConnection('open');
        setOfflineSince(0);
      };
      ws.onmessage = (ev) => {
        lastMsgRef.current = Date.now();
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
        if (wsRef.current === ws) wsRef.current = null;
        window.clearTimeout(connectGuard);
        setSketchup(null);
        if (closed) return;
        setConnection('closed');
        markOffline();
        const delay = Math.min(1000 * 2 ** retryRef.current, RETRY_MAX_MS);
        retryRef.current += 1;
        schedule(delay);
      };
    };

    connect();

    // strážca: ticho → ping; dlhé ticho → zahodiť a pripojiť znova
    const watchdog = window.setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const silence = Date.now() - lastMsgRef.current;
      if (silence > SILENCE_DROP_MS) drop(`ticho ${Math.round(silence / 1000)} s`);
      else if (silence > SILENCE_PING_MS) {
        try {
          ws.send(JSON.stringify({ type: 'ping' }));
        } catch {
          /* ignore */
        }
      }
    }, 1000);

    // návrat z pozadia / obnovenie siete: neveriť starému socketu, pripojiť hneď
    const wake = (why: string) => {
      if (closed) return;
      retryRef.current = 0;
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && Date.now() - lastMsgRef.current > SILENCE_PING_MS) drop(`${why}, socket bez správ`);
      else if (ws && ws.readyState === WebSocket.CONNECTING) drop(`${why}, viselo pripájanie`);
      else if (!ws) schedule(0);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') wake('návrat na obrazovku');
    };
    const onOnline = () => wake('sieť späť');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('pageshow', onVisible);
    return () => {
      closed = true;
      window.clearTimeout(timer);
      window.clearTimeout(connectGuard);
      window.clearInterval(watchdog);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pageshow', onVisible);
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

  const sendMedia = useCallback((action: 'play' | 'pause' | 'toggle' | 'next' | 'prev' | 'mute' | 'unmute') => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'media', action }));
  }, []);

  const sendVolume = useCallback((pct: number) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'media', action: 'volume', value: Math.max(0, Math.min(100, Math.round(pct))) }));
  }, []);

  return { connection, offlineSince, sketchup, usage, media, foreground, lastAck, sendCommand, sendMedia, sendVolume, hasToken: !!tokenRef.current };
}
