// Hudba: spúšťa a sleduje hudobného pracovníka (Windows Media Session).
// Uprednostní skompilovaný bin/media-worker.exe (povely cez stdin, obrázok skladby);
// ak chýba, použije scripts/media-worker.ps1 (povely cez súbor, bez obrázka).
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVICE_DIR } from './config.js';

export interface MediaState {
  available: boolean; // existuje aktívny prehrávač
  workerOk: boolean; // pracovník beží
  app: string | null;
  status: 'Playing' | 'Paused' | 'Stopped' | string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  thumb: string | null; // data URL obrázka skladby (z Chrome len 150 × 83 px)
  art: string | null; // cesta k väčšiemu obrázku (`/art/<id>.jpg`) – dopĺňa artwork.ts pri odosielaní; null = použi `thumb`
  volume: number | null; // hlasitosť PC 0–100 (hlavný výstup)
  muted: boolean;
  position: number | null; // ms od začiatku skladby v čase `positionAt`; null = prehrávač nehlási
  duration: number | null; // ms; null = neznáma (živý stream, web bez hlásenia)
  positionAt: number | null; // epoch ms (čas služby), kedy bola `position` nameraná
  rate: number; // rýchlosť prehrávania, 1 = normálne
  canSeek: boolean; // prehrávač povoľuje posun v skladbe
}

/**
 * Úroveň zvuku PC pre equalizer. Nie je súčasťou `MediaState` – ide vlastnou ľahkou témou `audio`,
 * aby sa kvôli nej neposielal celý stav hudby (vrátane obrázka) dvadsaťkrát za sekundu.
 */
export interface AudioState {
  level: number; // vyhladená a normalizovaná úroveň 0–1 (to kreslí PWA): rýchly nábeh, dobeh ~0,8 s
  peak: number; // okamžitá špička, tiež normalizovaná 0–1
  raw: number; // vyhladená úroveň pred normalizáciou (surová hodnota z Windows, býva len 0,05–0,15)
  active: boolean; // hudba hrá → vzorky sa posielajú
}

/** Povely bez hodnoty idú cez `send()`; `seek` má hodnotu a ide cez `seek()` (ako `volume` cez `setVolume()`). */
export const MEDIA_ACTIONS = new Set(['play', 'pause', 'toggle', 'next', 'prev', 'mute', 'unmute', 'seek']);

const here = path.dirname(fileURLToPath(import.meta.url));
const WORKER_EXE = path.resolve(here, '..', 'bin', 'media-worker.exe');
const WORKER_PS1 = path.resolve(here, '..', 'scripts', 'media-worker.ps1');
const CMD_FILE = path.join(SERVICE_DIR, 'media-cmd.txt');

type Listener = (s: MediaState) => void;
type AudioListener = (a: AudioState) => void;

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export class MediaBridge {
  state: MediaState = {
    available: false, workerOk: false, app: null, status: null, title: null, artist: null, album: null, thumb: null, art: null,
    volume: null, muted: false, position: null, duration: null, positionAt: null, rate: 1, canSeek: false,
  };
  audio: AudioState = { level: 0, peak: 0, raw: 0, active: false };
  private proc: ChildProcess | null = null;
  private useExe = false;
  private listeners: Listener[] = [];
  private audioListeners: AudioListener[] = [];
  private restarts = 0;
  private stopped = false;
  private log: (m: string) => void;

  constructor(log: (m: string) => void) {
    this.log = log;
  }

  onChange(fn: Listener) {
    this.listeners.push(fn);
  }

  /** Úroveň zvuku (equalizer): počas prehrávania 20× za sekundu, po zastavení posledná nula. */
  onAudio(fn: AudioListener) {
    this.audioListeners.push(fn);
  }

  start() {
    this.stopped = false;
    this.spawnWorker();
  }

  stop() {
    this.stopped = true;
    this.stopAudio();
    this.proc?.kill();
    this.proc = null;
  }

  // ---- úroveň zvuku pre equalizer ----
  private static readonly AUDIO_TICK_MS = 50; // najviac 20 správ za sekundu (Windows časovač dáva reálne ~16)
  private static readonly AUDIO_DECAY = 0.06; // pokles za 50 ms → z 1 na 0 asi za 0,8 s
  private static readonly AUDIO_MAX_DECAY = 0.002; // pokles bežiaceho maxima za 50 ms → z 1 na 0 za ~25 s
  private static readonly AUDIO_MAX_FLOOR = 0.03; // pod touto hlasitosťou už nezosilňujeme (bol by to len šum)
  private static readonly AUDIO_WARMUP_MS = 2000; // kým sa maximum ustáli, radšej nezosilňuj naslepo
  private audioTimer: NodeJS.Timeout | null = null;
  private audioTickMax: number | null = null; // najvyššia špička od posledného tiku (zlúčenie vzoriek)
  private audioTickAt = 0; // čas posledného tiku, aby dobeh nezávisel od presnosti časovača
  private audioRunMax = 0; // bežiace maximum hlasitosti; medzi skladbami sa nenuluje, len pomaly klesá
  private audioStartedAt = 0; // začiatok prehrávania (kvôli rozbehu normalizácie)

  /** Podľa stavu prehrávania zapne alebo vypne prúd úrovne. Volá sa pri každej zmene stavu hudby. */
  private syncAudio() {
    const playing = this.state.workerOk && this.state.available && this.state.status === 'Playing';
    if (playing === this.audio.active) return;
    if (playing) {
      this.audio = { level: 0, peak: 0, raw: 0, active: true };
      this.audioTickMax = null;
      this.audioTickAt = 0;
      this.audioStartedAt = Date.now(); // `audioRunMax` zostáva z minula, nech prvé sekundy nie sú prestrelené
      this.audioTimer = setInterval(() => this.audioTick(), MediaBridge.AUDIO_TICK_MS);
      this.audioTimer.unref?.();
    } else {
      this.stopAudio();
      this.emitAudio(); // posledná správa: rovná úroveň, PWA equalizer schová
    }
  }

  private stopAudio() {
    if (this.audioTimer) clearInterval(this.audioTimer);
    this.audioTimer = null;
    this.audioTickMax = null;
    this.audio = { level: 0, peak: 0, raw: 0, active: false };
  }

  /**
   * Jeden tik (50 ms): z došlých vzoriek vezme najvyššiu, vyhladí úroveň a pošle ju ďalej.
   * Hudba z prehliadača dáva surovo len okolo 0,1, preto sa úroveň ešte automaticky zosilní
   * podľa bežiaceho maxima (to klesá pomaly, ~25 s z 1 na 0, takže tichá pasáž hneď nezosilnie šum).
   */
  private audioTick() {
    const peak = this.audioTickMax ?? this.audio.raw; // bez novej vzorky platí posledná hodnota
    this.audioTickMax = null;
    const now = Date.now();
    const dt = this.audioTickAt ? Math.min(500, now - this.audioTickAt) : MediaBridge.AUDIO_TICK_MS;
    this.audioTickAt = now;
    const steps = dt / MediaBridge.AUDIO_TICK_MS;

    const raw = Math.max(0, Math.min(1, Math.max(peak, this.audio.raw - MediaBridge.AUDIO_DECAY * steps)));
    this.audioRunMax = Math.max(peak, this.audioRunMax - MediaBridge.AUDIO_MAX_DECAY * steps);

    // Pri tichu (maximum pod prahom) normalizáciu radšej vypneme, nech sa šum nerozšíri na celú výšku.
    const quiet = this.audioRunMax < MediaBridge.AUDIO_MAX_FLOOR;
    const warm = now - this.audioStartedAt >= MediaBridge.AUDIO_WARMUP_MS;
    // rezerva 15 %: bežné špičky pristanú ~0,87, jednotku dosiahnu len najsilnejšie (žiara nenaráža do stropu)
    const div = quiet && warm ? 1 : Math.max(this.audioRunMax, MediaBridge.AUDIO_MAX_FLOOR) * 1.15;
    const norm = (v: number) => r3(Math.max(0, Math.min(1, v / div)));

    this.audio = { level: norm(raw), peak: norm(peak), raw: r3(raw), active: true };
    this.emitAudio();
  }

  private emitAudio() {
    for (const l of this.audioListeners) l(this.audio);
  }

  private volTimer: NodeJS.Timeout | null = null;
  private volPending: number | null = null;
  private volLastSent = 0;
  private static readonly VOL_MIN_GAP_MS = 150;

  /** Nastaví hlasitosť PC (0–100). Rýchle zmeny počas ťahu zlučuje: najviac jedna hodnota za 150 ms, vždy posledná. */
  setVolume(pct: number): boolean {
    if (!Number.isFinite(pct) || !this.state.workerOk || !this.useExe || !this.proc?.stdin?.writable) return false;
    const v = Math.max(0, Math.min(100, Math.round(pct)));
    const now = Date.now();
    const wait = MediaBridge.VOL_MIN_GAP_MS - (now - this.volLastSent);
    if (wait <= 0 && this.volTimer === null) {
      this.volLastSent = now;
      this.proc.stdin.write(`vol ${v}\n`);
      return true;
    }
    this.volPending = v;
    if (this.volTimer === null) {
      this.volTimer = setTimeout(() => {
        this.volTimer = null;
        const p = this.volPending;
        this.volPending = null;
        if (p !== null && this.proc?.stdin?.writable) {
          this.volLastSent = Date.now();
          this.proc.stdin.write(`vol ${p}\n`);
        }
      }, Math.max(wait, 10));
    }
    return true;
  }

  /** Posun v skladbe na `ms` od začiatku. Ignoruje sa, ak prehrávač posun nepodporuje. */
  seek(ms: number): boolean {
    if (!Number.isFinite(ms) || ms < 0) return false;
    if (!this.state.workerOk || !this.useExe || !this.proc?.stdin?.writable) return false;
    if (!this.state.canSeek) {
      this.log(`media seek ${Math.round(ms)} ms zamietnutý: prehrávač posun nepodporuje`);
      return false;
    }
    this.proc.stdin.write(`seek ${Math.round(ms)}\n`);
    return true;
  }

  /** Pošle povel pracovníkovi bez hodnoty (vykoná ho do ~250 ms). */
  send(action: string): boolean {
    if (action === 'seek' || !MEDIA_ACTIONS.has(action) || !this.state.workerOk) return false;
    if (this.useExe && this.proc?.stdin?.writable) {
      this.proc.stdin.write(action + '\n');
      return true;
    }
    fs.mkdirSync(SERVICE_DIR, { recursive: true });
    fs.writeFileSync(CMD_FILE, action, 'utf8');
    return true;
  }

  private emit() {
    this.syncAudio();
    for (const l of this.listeners) l(this.state);
  }

  private spawnWorker() {
    if (this.stopped) return;
    this.useExe = fs.existsSync(WORKER_EXE);
    let proc: ChildProcess;
    if (this.useExe) {
      proc = spawn(WORKER_EXE, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } else {
      const ps = path.join(process.env.WINDIR ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      proc = spawn(ps, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', WORKER_PS1, '-CommandFile', CMD_FILE], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    }
    this.log(`media-worker: ${this.useExe ? 'exe' : 'powershell (bez obrázka skladby – spusti helper/build.ps1)'}`);
    this.proc = proc;
    let buf = '';
    proc.stdout!.setEncoding('utf8');
    proc.stdout!.on('data', (chunk: string) => {
      buf += chunk;
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) this.handleLine(line);
      }
    });
    proc.stderr!.setEncoding('utf8');
    proc.stderr!.on('data', (d: string) => this.log(`media-worker stderr: ${d.trim().slice(0, 300)}`));
    proc.on('error', (e) => this.log(`media-worker sa nespustil: ${e.message}`));
    proc.on('exit', (code) => {
      this.log(`media-worker skončil (kód ${code})`);
      this.proc = null;
      this.state = { ...this.state, workerOk: false, available: false, position: null, positionAt: null, duration: null, canSeek: false };
      this.emit();
      if (!this.stopped) {
        const delay = Math.min(2000 * 2 ** this.restarts, 30000);
        this.restarts += 1;
        setTimeout(() => this.spawnWorker(), delay);
      }
    });
  }

  private handleLine(line: string) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line);
    } catch {
      this.log(`media-worker: nečitateľný riadok: ${line.slice(0, 120)}`);
      return;
    }
    switch (msg.type) {
      case 'ready':
        this.restarts = 0;
        this.state = { ...this.state, workerOk: true };
        this.log('media-worker pripravený');
        this.emit();
        break;
      case 'media': {
        const av = msg.available === true;
        this.state = {
          ...this.state,
          workerOk: true,
          available: av,
          app: (msg.app as string) ?? null,
          status: (msg.status as string) ?? null,
          title: (msg.title as string) ?? null,
          artist: (msg.artist as string) ?? null,
          album: (msg.album as string) ?? null,
          thumb: (msg.thumb as string) ?? null,
          // pozícia patrí k predošlej skladbe/stavu – pracovník ju pošle hneď v správe `timeline`
          position: null,
          positionAt: null,
          duration: null,
          // bez prehrávača nemá zmysel ponúkať posun
          canSeek: av ? this.state.canSeek : false,
          rate: av ? this.state.rate : 1,
        };
        this.emit();
        break;
      }
      case 'timeline': {
        const pos = msg.position === null || msg.position === undefined ? null : Number(msg.position);
        const dur = msg.duration === null || msg.duration === undefined ? null : Number(msg.duration);
        const rate = Number(msg.rate);
        this.state = {
          ...this.state,
          workerOk: true,
          position: pos === null || !Number.isFinite(pos) ? null : pos,
          duration: dur === null || !Number.isFinite(dur) ? null : dur,
          positionAt: pos === null || !Number.isFinite(pos) ? null : Date.now(),
          rate: Number.isFinite(rate) && rate > 0 ? rate : 1,
          canSeek: msg.canSeek === true,
        };
        this.emit();
        break;
      }
      case 'audio': {
        // Vzorka špičky z workera; do stavu hudby nezasahuje, len sa odloží pre najbližší tik.
        const p = Number(msg.peak);
        if (!Number.isFinite(p)) break;
        const v = Math.max(0, Math.min(1, p));
        this.audioTickMax = this.audioTickMax === null ? v : Math.max(this.audioTickMax, v);
        break;
      }
      case 'volume':
        this.state = { ...this.state, workerOk: true, volume: Number(msg.level), muted: msg.muted === true };
        this.emit();
        break;
      case 'ack':
        if (msg.ok !== true) this.log(`media povel ${msg.action} zlyhal: ${msg.error ?? ''}`);
        break;
      case 'error':
        this.log(`media-worker chyba: ${msg.message}`);
        break;
    }
  }
}
