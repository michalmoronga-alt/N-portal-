// Spojenie PWA ↔ lokálna služba (WebSocket). Token prichádza v URL (?t=) a ukladá sa do localStorage.
import { useEffect, useRef, useState, useCallback } from 'react';
import { createAudioLevel, pushAudioLevel } from './audioLevel';

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
// ---------- počasie (W-1): kontrakt služby, modul service/src/weather.ts ----------
export interface WeatherCurrent {
  temp: number; // °C
  code: number; // WMO kód počasia
  isDay: boolean;
  wind: number; // km/h
  humidity: number; // %
  precipProb: number; // % – hodinová predpoveď pre práve bežiacu hodinu
}
export interface WeatherHour {
  time: string; // ISO bez zóny v miestnom čase, napr. 2026-09-19T15:00
  temp: number;
  code: number;
  precipProb: number; // %
}
export interface WeatherDay {
  date: string; // YYYY-MM-DD
  code: number;
  tmax: number;
  tmin: number;
  precipProb: number; // %
  precipMm: number;
}
export interface WeatherState {
  available: boolean;
  stale: boolean; // posledné dáta sú staršie než hodina (výpadok siete na PC)
  updatedAt: number | null;
  place: string;
  current: WeatherCurrent | null;
  /** najbližších 24 hodín od teraz (po hodine) – zatiaľ sa nikde nekreslí, čaká na detail počasia */
  hourly: WeatherHour[];
  daily: WeatherDay[];
}
export interface MediaState {
  available: boolean;
  workerOk: boolean;
  app: string | null;
  status: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  thumb: string | null; // obrázok z Windows (z Chrome len 150 × 83 px)
  art: string | null; // väčší obrázok z YouTube (`/art/<id>.jpg`), null = použi `thumb`
  volume: number | null;
  muted: boolean;
  position: number | null; // ms od začiatku skladby v čase `positionAt`; null = prehrávač pozíciu nehlási
  duration: number | null; // ms; null = neznáma dĺžka (živý stream, web bez hlásenia)
  positionAt: number | null; // epoch ms, kedy služba pozíciu namerala
  rate: number; // rýchlosť prehrávania, 1 = normálne
  canSeek: boolean; // prehrávač povoľuje posun v skladbe
}

type ServerMsg =
  | { type: 'sketchup'; ts: number; data: SketchUpState }
  | { type: 'usage'; ts: number; data: UsageState }
  | { type: 'media'; ts: number; data: MediaState }
  | { type: 'foreground'; ts: number; data: ForegroundState }
  | { type: 'agents'; ts: number; data: AgentsState }
  | { type: 'weather'; ts: number; data: WeatherState }
  // úroveň zvuku pre equalizer: ~20× za s a len počas prehrávania, mimo `MediaState`
  | { type: 'audio'; ts: number; data: { level: number; peak: number } }
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
const DEMO_PARAMS = (() => {
  try {
    return new URLSearchParams(location.search);
  } catch {
    return new URLSearchParams();
  }
})();
const DEMO_AGENTS = DEMO_PARAMS.get('demo') === 'agents';
// `?demo=media` – test priebehu skladby a posunu bez služby na PC. Doplnky (len pre demo):
// `&big=1` hlási aktívny Chrome (väčší prehrávač), `&nodur=1` skladbu bez známej dĺžky (prúžok skrytý).
const DEMO_MEDIA = DEMO_PARAMS.get('demo') === 'media';
// `?demo=ambient` – test ambientného režimu bez služby na PC: dáta ako pri `demo=media` (hudba hrá,
// simulovaná úroveň) plus jeden pracujúci agent, ktorý po 20 s prejde do „čaká na teba“ (štítok
// a automatické ukončenie ambientu). Ambient sa v App.tsx spustí už po 5 s od načítania.
// Doplnky: `&night=1` vynúti nočný jas, `&photo=1` simuluje stav po 30 min (video pauznuté).
const DEMO_AMBIENT = DEMO_PARAMS.get('demo') === 'ambient';
// `?demo=weather` – test riadku počasia v Station a v páse bez služby na PC.
// Doplnky: `&stale=1` simuluje výpadok (tlmený riadok so značkou „·“), `&wxoff=1` počasie nedostupné.
const DEMO_WEATHER = DEMO_PARAMS.get('demo') === 'weather';
// `?demo=details` – test detailov cez celú obrazovku (W‑2) bez služby na PC: hudba, počasie aj usage
// naraz s pevnými hodnotami, takže sa dajú otvoriť všetky tri detaily. `&mode=skp` (alebo `station`,
// `ai`) spustí panel rovno v danom režime.
const DEMO_DETAILS = DEMO_PARAMS.get('demo') === 'details';
const MODE_PARAM = DEMO_PARAMS.get('mode');
const DEMO_MODE = MODE_PARAM === 'station' || MODE_PARAM === 'skp' || MODE_PARAM === 'ai' ? MODE_PARAM : null;
export const DEMO = {
  ambient: DEMO_AMBIENT,
  night: DEMO_PARAMS.get('night') === '1',
  photo: DEMO_PARAMS.get('photo') === '1',
  /** ukážkový štartovací režim (`&mode=…`); `?demo=details` štartuje v Station, ak sa neurčí inak */
  mode: (DEMO_MODE ?? (DEMO_DETAILS ? 'station' : null)) as 'station' | 'skp' | 'ai' | null,
};
const DEMO_AMBIENT_SWITCH_MS = 20000; // po tomto čase prejde agent z „pracuje“ do „čaká na teba“
const DEMO_ANY = DEMO_AGENTS || DEMO_MEDIA || DEMO_AMBIENT || DEMO_WEATHER || DEMO_DETAILS;
const DEMO_PHASE_MS = 6000;
const DEMO_TICK_MS = 1000;
const AUDIO_HZ = 20; // ako často posiela úroveň zvuku služba (a teda aj demo)

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
  const [weather, setWeather] = useState<WeatherState | null>(null);
  const [lastAck, setLastAck] = useState<Ack | null>(null);
  const [offlineSince, setOfflineSince] = useState<number>(() => Date.now()); // od kedy nie je spojenie (0 = je)
  const wsRef = useRef<WebSocket | null>(null);
  // Úroveň zvuku pre equalizer zámerne mimo React stavu: chodí 20× za sekundu a prekresľovať
  // pri nej celý strom by starý telefón nezvládol. Equalizer si ju číta vo svojom rAF loope.
  const audioRef = useRef(createAudioLevel());
  const demoRef = useRef<MediaState | null>(null); // živý stav hudby v `?demo=media`
  const tokenRef = useRef<string | null>(null);
  const retryRef = useRef(0);
  const lastMsgRef = useRef(0);

  useEffect(() => {
    // počasie má v každom ukážkovom režime pevné dáta, nech sa dá riadok overiť všade rovnako
    if (DEMO_ANY) setWeather(demoWeather());

    if (DEMO_WEATHER) {
      setConnection('open');
      setOfflineSince(0);
      setUsage(demoUsage());
      setMedia(demoMedia());
      setForeground({ available: true, app: 'explorer.exe', pid: 4321, title: 'Plocha', kind: 'other', ts: Date.now() });
      setAgents(demoAmbientAgents('busy'));
      return;
    }

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

    if (DEMO_MEDIA || DEMO_AMBIENT || DEMO_DETAILS) {
      setConnection('open');
      setOfflineSince(0);
      const big = DEMO_PARAMS.get('big') !== null;
      setForeground({
        available: true,
        app: big ? 'chrome.exe' : 'explorer.exe',
        pid: 4321,
        title: big ? 'YouTube – Chrome' : 'Plocha',
        kind: big ? 'chrome' : 'other',
        ts: Date.now(),
      });
      setUsage(demoUsage());
      // ambient: agent najprv pracuje (body na kruhu), po 20 s „čaká na teba“ (štítok + koniec ambientu)
      let tAgent = 0;
      if (DEMO_AMBIENT) {
        setAgents(demoAmbientAgents('busy'));
        tAgent = window.setTimeout(() => setAgents(demoAmbientAgents('waiting')), DEMO_AMBIENT_SWITCH_MS);
      }
      const st = demoMedia(DEMO_PARAMS.get('nodur') === null);
      demoRef.current = st;
      setMedia({ ...st });
      // ako služba: raz za sekundu nová pozícia (pri pauze sa nemení)
      const t = window.setInterval(() => {
        const m = demoRef.current;
        if (!m || m.status !== 'Playing' || m.position === null) return;
        const now = Date.now();
        let p = m.position + (now - (m.positionAt ?? now)) * (m.rate || 1);
        if (m.duration !== null && p >= m.duration) p = 0; // demo hrá dokola
        m.position = p;
        m.positionAt = now;
        setMedia({ ...m });
      }, DEMO_TICK_MS);
      // ako služba: úroveň zvuku 20× za sekundu (simulovaná hudba 128 BPM) len počas prehrávania,
      // pri pauze jedna posledná správa s nulou a potom ticho
      const sim = createSimLevel();
      let wasPlaying = false;
      const ta = window.setInterval(() => {
        const playing = demoRef.current?.status === 'Playing';
        if (!playing) {
          if (wasPlaying) pushAudioLevel(audioRef.current, 0);
          wasPlaying = false;
          return;
        }
        wasPlaying = true;
        pushAudioLevel(audioRef.current, sim(1 / AUDIO_HZ));
      }, 1000 / AUDIO_HZ);
      return () => {
        window.clearInterval(t);
        window.clearInterval(ta);
        window.clearTimeout(tAgent);
      };
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
        else if (m.type === 'weather') setWeather(m.data);
        else if (m.type === 'audio') pushAudioLevel(audioRef.current, m.data?.level, m.data?.peak);
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
      // odkaz uvoľniť hneď, nie až v `onclose`: vo vývoji React efekt zámerne zopakuje a ďalší
      // `connect()` by inak videl starý socket a už sa nikdy nepripojil (v builde sa efekt nezopakuje)
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
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
    if (DEMO_MEDIA || DEMO_DETAILS) {
      demoCommand(demoRef.current, action, setMedia);
      return;
    }
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'media', action }));
  }, []);

  const sendVolume = useCallback((pct: number) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'media', action: 'volume', value: Math.max(0, Math.min(100, Math.round(pct))) }));
  }, []);

  /** Posun v skladbe (ms od začiatku) – odosiela sa až po pustení prsta, jeden povel. */
  const sendSeek = useCallback((ms: number) => {
    const value = Math.max(0, Math.round(ms));
    if (DEMO_MEDIA || DEMO_DETAILS) {
      const m = demoRef.current;
      if (!m) return;
      m.position = m.duration === null ? value : Math.min(value, m.duration);
      m.positionAt = Date.now();
      setMedia({ ...m });
      return;
    }
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'media', action: 'seek', value }));
  }, []);

  return { connection, offlineSince, sketchup, usage, media, foreground, agents, weather, audio: audioRef, lastAck, sendCommand, sendMedia, sendVolume, sendSeek, hasToken: DEMO_ANY || !!tokenRef.current };
}

/**
 * Simulovaná úroveň zvuku pre `?demo=media` (1 : 1 z mocku `mock6.html`): pomalá obálka
 * a „údery“ ~128 BPM. Konštanty mocku platia pre 60 snímok za sekundu, tu ich prepočítavame
 * na krok `dt`, aby demo vyzeralo rovnako aj pri 20 správach za sekundu.
 */
function createSimLevel() {
  let level = 0;
  let env = 0;
  let lastBeat = 0;
  return (dt: number): number => {
    const t = performance.now() / 1000;
    const k = Math.max(1, dt * 60); // koľko „snímok mocku“ padne do jedného kroku
    const beat = 60 / 128;
    if (t - lastBeat > beat) {
      lastBeat += beat;
      if (t - lastBeat > beat) lastBeat = t;
      env = 0.75 + Math.random() * 0.25;
    }
    env *= Math.pow(0.94, k); // dozvuk úderu
    const target = 0.28 + env * 0.55 + Math.sin(t * 1.7) * 0.06 + Math.sin(t * 5.3) * 0.04;
    level += (target - level) * (1 - Math.pow(1 - 0.35, k));
    return Math.max(0, Math.min(1, level));
  };
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

const DEMO_TRACKS: { title: string; artist: string; duration: number }[] = [
  { title: 'Refew – ADHD (OFFICIAL)', artist: 'Refew', duration: 225000 },
  { title: 'Nočná zmena', artist: 'Kontrafakt', duration: 198000 },
  { title: 'Dlhý live set', artist: 'Rádio', duration: 4230000 },
];

function demoMedia(withDuration = true): MediaState {
  const t = DEMO_TRACKS[0];
  return {
    available: true,
    workerOk: true,
    app: 'chrome.exe',
    status: 'Playing',
    title: t.title,
    artist: t.artist,
    album: null,
    thumb: null,
    art: null,
    volume: 42,
    muted: false,
    position: 0,
    duration: withDuration ? t.duration : null,
    positionAt: Date.now(),
    rate: 1,
    canSeek: true,
  };
}

/** Povely hudby v `?demo=media`: vykonajú sa lokálne, aby sa dal panel testovať bez služby. */
function demoCommand(m: MediaState | null, action: string, push: (s: MediaState) => void) {
  if (!m) return;
  const now = Date.now();
  if (action === 'toggle' || action === 'play' || action === 'pause') {
    const playing = m.status === 'Playing';
    const next = action === 'toggle' ? !playing : action === 'play';
    if (playing && m.position !== null) m.position += (now - (m.positionAt ?? now)) * (m.rate || 1);
    m.status = next ? 'Playing' : 'Paused';
    m.positionAt = now;
  } else if (action === 'next' || action === 'prev') {
    const i = DEMO_TRACKS.findIndex((t) => t.title === m.title);
    const step = action === 'next' ? 1 : DEMO_TRACKS.length - 1;
    const t = DEMO_TRACKS[(Math.max(0, i) + step) % DEMO_TRACKS.length];
    m.title = t.title;
    m.artist = t.artist;
    m.duration = m.duration === null ? null : t.duration;
    m.position = 0;
    m.positionAt = now;
  } else return;
  push({ ...m });
}

/**
 * Ukážkové počasie pre `?demo=weather` (a pre ostatné demo režimy): aktuálne 12 °C, kód 2
 * (polooblačno), deň; 7 dní s rôznymi kódmi, nech sa dajú overiť všetky skupiny ikon.
 */
function demoWeather(): WeatherState {
  const day = (i: number) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const codes = [2, 3, 61, 71, 95, 45, 80];
  return {
    available: DEMO_PARAMS.get('wxoff') !== '1',
    stale: DEMO_PARAMS.get('stale') === '1',
    updatedAt: Date.now() - (DEMO_PARAMS.get('stale') === '1' ? 95 * 60_000 : 4 * 60_000),
    place: 'Liptovský Mikuláš',
    current: { temp: 12, code: 2, isDay: true, wind: 9, humidity: 62, precipProb: 10 },
    // hodinová krivka cez deň: v noci 7 °, na obed 22 °, večer späť k 9 °
    hourly: Array.from({ length: 24 }, (_, i) => {
      const d = new Date();
      d.setMinutes(0, 0, 0);
      d.setHours(d.getHours() + i);
      const hour = d.getHours();
      const warm = Math.cos(((hour - 14) / 24) * 2 * Math.PI); // maximum o 14:00
      const p = (n: number) => String(n).padStart(2, '0');
      return {
        time: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(hour)}:00`,
        temp: Math.round((7 + (warm + 1) / 2 * 15) * 10) / 10, // 7 → 22 → 9 °
        code: hour >= 6 && hour < 18 ? 2 : 3,
        precipProb: Math.min(90, (i % 8) * 12),
      };
    }),
    daily: codes.map((code, i) => ({
      date: day(i),
      code,
      tmax: 18 - i,
      tmin: 8 - Math.floor(i / 2),
      precipProb: i * 13,
      precipMm: i % 3,
    })),
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

/** `?demo=ambient`: jedna relácia Claude – najprv „pracuje“, po 20 s „čaká na teba“. */
function demoAmbientAgents(status: AgentStatus): AgentsState {
  const min = 60_000;
  const since = status === 'busy' ? 3 * min : 2000;
  return {
    available: true,
    reason: null,
    updatedAt: Date.now(),
    agents: [demoAgent('claude:ambient', 'claude', 'N‑portal', 'ambientný režim', status, since, 2000, 18 * min)],
    today: DEMO_TODAY,
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
