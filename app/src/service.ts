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
  last: SketchUpLast | null;
}

type ServerMsg =
  | { type: 'state'; ts: number; sketchup: SketchUpState }
  | { type: 'ack'; clientId?: string; ok: boolean; id?: string; error?: string }
  | { type: 'pong'; ts: number };

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
    // token z adresy odstrániť, aby sa neukazoval v lište
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
  const [lastAck, setLastAck] = useState<Extract<ServerMsg, { type: 'ack' }> | null>(null);
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
        let msg: ServerMsg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === 'state') setSketchup(msg.sketchup);
        else if (msg.type === 'ack') setLastAck(msg);
      };
      ws.onclose = (ev) => {
        wsRef.current = null;
        setSketchup(null);
        if (closed) return;
        // 401 sa prejaví ako okamžité zatvorenie pred otvorením
        if (ev.code === 1006 && retryRef.current === 0 && connection !== 'open') {
          /* pokračuj v pokusoch – rozlíšenie 401 vs. výpadok nie je v prehliadači spoľahlivé */
        }
        setConnection('closed');
        const delay = Math.min(1000 * 2 ** retryRef.current, 8000);
        retryRef.current += 1;
        timer = window.setTimeout(connect, delay);
      };
      ws.onerror = () => {
        /* onclose nasleduje */
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendCommand = useCallback((action: string): string | null => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return null;
    const id = Math.random().toString(36).slice(2, 8);
    ws.send(JSON.stringify({ type: 'command', action, id }));
    return id;
  }, []);

  return { connection, sketchup, lastAck, sendCommand, hasToken: !!tokenRef.current };
}
