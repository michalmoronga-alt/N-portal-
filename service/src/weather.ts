// Počasie pre panel (etapa W‑1): Open‑Meteo, bez kľúča a bez registrácie.
// Jediný zdroj, jedno volanie: aktuálny stav + 7 dní. Obnova každých 15 minút.
// Pri výpadku siete držíme posledné známe dáta; po hodine ich označíme `stale` a PWA ich stlmí.
// Chyba siete nikdy nezhodí službu – iba sa (raz, pri zmene) zapíše do logu.
import type { WeatherPlace } from './config.js';

const REFRESH_MS = 15 * 60 * 1000; // ako často ťaháme nové dáta
const RETRY_MS = 60 * 1000; // po neúspechu skúsime skôr než o 15 minút
const TIMEOUT_MS = 8000; // dlhšie čakanie nemá zmysel, panel radšej ukáže staré dáta
const STALE_MS = 60 * 60 * 1000; // po hodine bez úspechu sú dáta „staré“

export interface WeatherCurrent {
  temp: number; // °C
  code: number; // WMO kód počasia
  isDay: boolean;
  wind: number; // km/h
  humidity: number; // %
  precipProb: number; // % – hodnota hodinovej predpovede pre práve bežiacu hodinu
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
  available: boolean; // máme aspoň raz stiahnuté dáta
  stale: boolean; // posledný úspech je starší než hodina
  updatedAt: number | null; // epoch ms posledného úspešného stiahnutia
  place: string;
  current: WeatherCurrent | null;
  hourly: WeatherHour[]; // najbližších 24 hodín od teraz (po hodine)
  daily: WeatherDay[];
}

const HOURS_AHEAD = 24; // koľko hodín predpovede posielame do PWA

type Listener = (s: WeatherState) => void;

/** Odpoveď Open‑Meteo – čítame len polia, ktoré sme si vyžiadali. */
interface ApiResponse {
  current?: {
    time?: unknown;
    temperature_2m?: unknown;
    weather_code?: unknown;
    is_day?: unknown;
    wind_speed_10m?: unknown;
    relative_humidity_2m?: unknown;
  };
  hourly?: {
    time?: unknown;
    temperature_2m?: unknown;
    weather_code?: unknown;
    precipitation_probability?: unknown;
  };
  daily?: {
    time?: unknown;
    weather_code?: unknown;
    temperature_2m_max?: unknown;
    temperature_2m_min?: unknown;
    precipitation_probability_max?: unknown;
    precipitation_sum?: unknown;
  };
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function weatherUrl(place: WeatherPlace): string {
  const p = new URLSearchParams({
    latitude: String(place.lat),
    longitude: String(place.lon),
    current: 'temperature_2m,weather_code,is_day,wind_speed_10m,relative_humidity_2m',
    hourly: 'temperature_2m,weather_code,precipitation_probability',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum',
    timezone: 'Europe/Bratislava',
    forecast_days: '7',
  });
  return `${process.env.NPORTAL_WEATHER_URL ?? 'https://api.open-meteo.com/v1/forecast'}?${p}`;
}

/** Miestny čas „teraz“ zarovnaný na celú hodinu, vo formáte hodinových značiek Open‑Meteo. */
function hourKey(apiNow: unknown): string {
  if (typeof apiNow === 'string' && apiNow.length >= 13) return `${apiNow.slice(0, 13)}:00`;
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`;
}

/** Prevod odpovede na náš kontrakt; chýbajúce polia = neúplné dáta → výnimka, staré dáta ostanú platiť. */
function parse(json: ApiResponse): { current: WeatherCurrent; hourly: WeatherHour[]; daily: WeatherDay[] } {
  const c = json.current;
  if (!c || typeof c.temperature_2m !== 'number') throw new Error('odpoveď bez aktuálneho počasia');

  // hodinová predpoveď: od práve bežiacej hodiny, najviac 24 položiek
  const h = json.hourly ?? {};
  const hTimes = arr(h.time).map(String);
  const hTemp = arr(h.temperature_2m);
  const hCode = arr(h.weather_code);
  const hProb = arr(h.precipitation_probability);
  const nowKey = hourKey(c.time);
  let from = hTimes.findIndex((t) => t >= nowKey);
  if (from < 0) from = 0;
  const hourly: WeatherHour[] = hTimes.slice(from, from + HOURS_AHEAD).map((time, i) => ({
    time,
    temp: Math.round(num(hTemp[from + i]) * 10) / 10,
    code: Math.round(num(hCode[from + i])),
    precipProb: Math.round(num(hProb[from + i])),
  }));

  const current: WeatherCurrent = {
    temp: Math.round(num(c.temperature_2m) * 10) / 10,
    code: Math.round(num(c.weather_code)),
    isDay: num(c.is_day, 1) === 1,
    wind: Math.round(num(c.wind_speed_10m)),
    humidity: Math.round(num(c.relative_humidity_2m)),
    precipProb: hourly.length ? hourly[0].precipProb : 0,
  };
  const d = json.daily ?? {};
  const days = arr(d.time);
  const codes = arr(d.weather_code);
  const tmax = arr(d.temperature_2m_max);
  const tmin = arr(d.temperature_2m_min);
  const prob = arr(d.precipitation_probability_max);
  const sum = arr(d.precipitation_sum);
  const daily: WeatherDay[] = days.map((date, i) => ({
    date: String(date),
    code: Math.round(num(codes[i])),
    tmax: Math.round(num(tmax[i])),
    tmin: Math.round(num(tmin[i])),
    precipProb: Math.round(num(prob[i])),
    precipMm: Math.round(num(sum[i]) * 10) / 10,
  }));
  return { current, hourly, daily };
}

export class WeatherBridge {
  state: WeatherState;

  private listeners: Listener[] = [];
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private fetching = false;
  private lastOk: number | null = null; // epoch ms posledného úspechu
  private wasOk: boolean | null = null; // aby sme logovali len zmeny (úspech po chybe a naopak)
  private log: (m: string) => void;

  constructor(private place: WeatherPlace, log: (m: string) => void) {
    this.log = log;
    this.state = { available: false, stale: false, updatedAt: null, place: place.name, current: null, hourly: [], daily: [] };
  }

  onChange(fn: Listener) {
    this.listeners.push(fn);
  }

  start() {
    this.stopped = false;
    void this.tick();
    this.schedule(REFRESH_MS);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(ms: number) {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.tick();
    }, ms);
  }

  private emit() {
    for (const l of this.listeners) l(this.state);
  }

  /** Prepočíta `stale` podľa času posledného úspechu; vráti true, keď sa príznak zmenil. */
  refreshStale(): boolean {
    const stale = this.lastOk !== null && Date.now() - this.lastOk > STALE_MS;
    if (stale === this.state.stale) return false;
    this.state = { ...this.state, stale };
    return true;
  }

  private async tick() {
    if (this.stopped || this.fetching) return;
    this.fetching = true;
    let ok = false;
    try {
      const res = await fetch(weatherUrl(this.place), {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { current, hourly, daily } = parse((await res.json()) as ApiResponse);
      const now = Date.now();
      this.lastOk = now;
      const next: WeatherState = { available: true, stale: false, updatedAt: now, place: this.place.name, current, hourly, daily };
      const changed = JSON.stringify(next) !== JSON.stringify(this.state);
      this.state = next;
      ok = true;
      if (this.wasOk === false) this.log(`počasie: dáta opäť chodia (${this.place.name})`);
      this.wasOk = true;
      if (changed) this.emit();
    } catch (e) {
      if (this.wasOk !== false) this.log(`počasie nedostupné (${(e as Error).message}) – držím posledné dáta`);
      this.wasOk = false;
      if (this.refreshStale()) this.emit();
    } finally {
      this.fetching = false;
      this.schedule(ok ? REFRESH_MS : RETRY_MS);
    }
  }
}
