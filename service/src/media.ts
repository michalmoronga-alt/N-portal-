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
  thumb: string | null; // data URL obrázka skladby
  volume: number | null; // hlasitosť PC 0–100 (hlavný výstup)
  muted: boolean;
}

export const MEDIA_ACTIONS = new Set(['play', 'pause', 'toggle', 'next', 'prev', 'mute', 'unmute']);

const here = path.dirname(fileURLToPath(import.meta.url));
const WORKER_EXE = path.resolve(here, '..', 'bin', 'media-worker.exe');
const WORKER_PS1 = path.resolve(here, '..', 'scripts', 'media-worker.ps1');
const CMD_FILE = path.join(SERVICE_DIR, 'media-cmd.txt');

type Listener = (s: MediaState) => void;

export class MediaBridge {
  state: MediaState = { available: false, workerOk: false, app: null, status: null, title: null, artist: null, album: null, thumb: null, volume: null, muted: false };
  private proc: ChildProcess | null = null;
  private useExe = false;
  private listeners: Listener[] = [];
  private restarts = 0;
  private stopped = false;
  private log: (m: string) => void;

  constructor(log: (m: string) => void) {
    this.log = log;
  }

  onChange(fn: Listener) {
    this.listeners.push(fn);
  }

  start() {
    this.stopped = false;
    this.spawnWorker();
  }

  stop() {
    this.stopped = true;
    this.proc?.kill();
    this.proc = null;
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

  /** Pošle povel pracovníkovi (vykoná ho do ~250 ms). */
  send(action: string): boolean {
    if (!MEDIA_ACTIONS.has(action) || !this.state.workerOk) return false;
    if (this.useExe && this.proc?.stdin?.writable) {
      this.proc.stdin.write(action + '\n');
      return true;
    }
    fs.mkdirSync(SERVICE_DIR, { recursive: true });
    fs.writeFileSync(CMD_FILE, action, 'utf8');
    return true;
  }

  private emit() {
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
      this.state = { ...this.state, workerOk: false, available: false };
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
      case 'media':
        this.state = {
          ...this.state,
          workerOk: true,
          available: msg.available === true,
          app: (msg.app as string) ?? null,
          status: (msg.status as string) ?? null,
          title: (msg.title as string) ?? null,
          artist: (msg.artist as string) ?? null,
          album: (msg.album as string) ?? null,
          thumb: (msg.thumb as string) ?? null,
        };
        this.emit();
        break;
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
