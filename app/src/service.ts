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
  kind: 'sketchup' | 'chrome' | 'ai' | 'other';
  ts: number;
}

// ---------- režim AI: stav agentov (kontrakt v docs/AI-REZIM.md) ----------
export type AgentStatus = 'busy' | 'waiting' | 'done' | 'idle';
export interface AgentDetail {
  model: string | null;
  effort: string | null;
  turns: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  cacheRead: number | null;
  durationMs: number | null;
  tools: Record<string, number> | null;
  branch: string | null;
  origin: string | null;
}
export interface AgentInfo {
  id: string;
  provider: 'claude' | 'codex' | string;
  project: string;
  cwd: string | null;
  title: string | null; // vlastný názov relácie; null = riadok sa nezobrazí
  status: AgentStatus;
  since: number; // od kedy trvá aktuálny stav
  lastActivity: number;
  startedAt: number | null;
  pid: number | null;
  detail: AgentDetail | null;
}
export interface AgentsToday {
  projects: number;
  turns: number;
  activeMs: number;
  claudeOut: number;
  codexOut: number;
}
export interface AgentsState {
  available: boolean;
  reason: string | null;
  updatedAt: number;
  agents: AgentInfo[];
  today: AgentsToday | null;
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
  | { type: 'agents'; ts: number; data: AgentsState }
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

// Ukážkový režim na test v prehliadači bez služby na PC: adresa `...?demo=agents`.
// Namiesto WebSocketu nastaví pevné usage/hudbu, aktívne okno „ai“ a každých 6 s prehodí fázu
// agentov (pracujú → čaká na teba → hotovo → nič nebeží → nedostupné → …), aby sa dal overiť
// štítok v hornom páse, LED aj toast. Bez parametra sa nič nemení, bežnej prevádzky sa to netýka.
const DEMO_AGENTS = (() => {
  try {
    return new URLSearchParams(location.search).get('demo') === 'agents';
  } catch {
    return false;
  }
})();
const DEMO_PHASE_MS = 6000;

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
  // Stav agentov necháme pri odpojení tak, ako prišiel naposledy – UI ho zošedí cez celoplošný stav výpadku.
  const [agents, setAgents] = useState<AgentsState | null>(null);
  const [lastAck, setLastAck] = useState<Ack | null>(null);
  const [offlineSince, setOfflineSince] = useState<number>(() => Date.now()); // od kedy nie je spojenie (0 = je)
  const wsRef = useRef<WebSocket | null>(null);
  const tokenRef = useRef<string | null>(null);
  const retryRef = useRef(0);
  const lastMsgRef = useRef(0);

  useEffect(() => {
    if (DEMO_AGENTS) {
      setConnection('open');
      setOfflineSince(0);
      setForeground({ available: true, app: 'claude.exe', pid: 4321, title: 'Claude Code', kind: 'ai', ts: Date.now() });
      setUsage(demoUsage());
      setMedia(demoMedia());
      let phase = 0;
      const step = () => {
        setAgents(demoAgents(phase));
        phase = (phase + 1) % 5;
      };
      step();
      const t = window.setInterval(step, DEMO_PHASE_MS);
      return () => window.clearInterval(t);
    }

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
        else if (m.type === 'agents') setAgents(m.data);
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

  return { connection, offlineSince, sketchup, usage, media, foreground, agents, lastAck, sendCommand, sendMedia, sendVolume, hasToken: DEMO_AGENTS || !!tokenRef.current };
}

// ---------- ukážkové dáta pre `?demo=agents` (nikdy sa nepoužijú v bežnej prevádzke) ----------

function demoUsage(): UsageState {
  const nowSec = Math.round(Date.now() / 1000);
  // najbližšia sobota 14:00 – kvôli podtextu „reset so 14:00“ ako v mocku
  const sat = new Date();
  sat.setHours(14, 0, 0, 0);
  sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7 || 7));
  return {
    available: true,
    stale: false,
    ageSec: 42,
    mode: 'demo',
    claude: { status: 'ok', weeklyUsed: 37, weeklyResetAt: nowSec + 3 * 86400, sessionUsed: 8, sessionResetAt: nowSec + 9240 },
    codex: { status: 'rate_limit', weeklyUsed: 100, weeklyResetAt: Math.round(sat.getTime() / 1000), sessionUsed: null, sessionResetAt: null },
  };
}

function demoMedia(): MediaState {
  return {
    available: true,
    workerOk: true,
    app: 'chrome.exe',
    status: 'Playing',
    title: 'Refew – ADHD (OFFICIAL)',
    artist: 'Refew',
    album: null,
    thumb: null,
    volume: 42,
    muted: false,
  };
}

const DEMO_TODAY: AgentsToday = { projects: 3, turns: 41, activeMs: 7_800_000, claudeOut: 128505, codexOut: 11295 };

function demoAgent(
  id: string,
  provider: 'claude' | 'codex',
  project: string,
  title: string | null,
  status: AgentStatus,
  sinceAgoMs: number,
  lastAgoMs: number,
  startedAgoMs: number,
): AgentInfo {
  const t = Date.now();
  return {
    id,
    provider,
    project,
    cwd: `C:\\APP DEV\\${project}`,
    title,
    status,
    since: t - sinceAgoMs,
    lastActivity: t - lastAgoMs,
    startedAt: t - startedAgoMs,
    pid: 100000 + id.length,
    detail: null,
  };
}

function demoAgents(phase: number): AgentsState {
  const updatedAt = Date.now() - 3000;
  const min = 60_000;
  const a1 = (s: AgentStatus, lastAgo: number) => demoAgent('claude:113120', 'claude', 'N‑portal', 'N portal ďalšie kroky', s, 4 * min, lastAgo, 40 * min);
  const a2 = (s: AgentStatus, sinceAgo: number, lastAgo: number) =>
    demoAgent('claude:118844', 'claude', 'RUBY ENGINE', 'Noxun engine UI/UX sekcia čela', s, sinceAgo, lastAgo, sinceAgo + 14 * min);
  const a3 = demoAgent('codex:9f21', 'codex', 'RUBY ENGINE', 'gpt‑6‑astra · xhigh', 'busy', 2 * min, 1000, 20 * min);
  const a4 = demoAgent('claude:100777', 'claude', 'N‑portal', null, 'idle', 25 * min, 25 * min, 90 * min);

  if (phase === 0) return { available: true, reason: null, updatedAt, agents: [a1('busy', 6000), a2('busy', 12 * min, 20000), a3], today: DEMO_TODAY };
  if (phase === 1) return { available: true, reason: null, updatedAt, agents: [a1('waiting', 40000), a2('busy', 12 * min, 20000), a3], today: DEMO_TODAY };
  if (phase === 2) return { available: true, reason: null, updatedAt, agents: [a2('done', 2 * min, 2 * min), a3, a4], today: DEMO_TODAY };
  if (phase === 3) return { available: true, reason: null, updatedAt, agents: [a4], today: DEMO_TODAY };
  return {
    available: false,
    reason: 'Claude Code alebo Codex zapisuje stav v inom formáte než panel pozná.',
    updatedAt,
    agents: [],
    today: DEMO_TODAY,
  };
}
