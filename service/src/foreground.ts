// Aktívne okno (E4): spúšťa bin/fg-worker.exe a hlási zmeny. Len názov procesu, PID a titulok.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type ForegroundKind = 'sketchup' | 'chrome' | 'other';

export interface ForegroundState {
  available: boolean; // sonda beží
  app: string | null; // názov procesu (SketchUp, chrome, explorer …)
  pid: number | null;
  title: string | null;
  kind: ForegroundKind;
  ts: number;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const WORKER_EXE = path.resolve(here, '..', 'bin', 'fg-worker.exe');

export function kindOf(app: string | null): ForegroundKind {
  const a = (app ?? '').toLowerCase();
  if (a === 'sketchup') return 'sketchup';
  if (a === 'chrome' || a === 'msedge' || a === 'firefox' || a === 'brave') return 'chrome';
  return 'other';
}

type Listener = (s: ForegroundState) => void;

export class ForegroundBridge {
  state: ForegroundState = { available: false, app: null, pid: null, title: null, kind: 'other', ts: Date.now() };
  private proc: ChildProcess | null = null;
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

  private emit() {
    for (const l of this.listeners) l(this.state);
  }

  private spawnWorker() {
    if (this.stopped) return;
    if (!fs.existsSync(WORKER_EXE)) {
      this.log('fg-worker.exe chýba – AUTO režim nebude fungovať (spusti helper/build.ps1)');
      return;
    }
    const proc = spawn(WORKER_EXE, [], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
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
    proc.stderr!.on('data', (d: string) => this.log(`fg-worker stderr: ${d.trim().slice(0, 200)}`));
    proc.on('error', (e) => this.log(`fg-worker sa nespustil: ${e.message}`));
    proc.on('exit', (code) => {
      this.log(`fg-worker skončil (kód ${code})`);
      this.proc = null;
      this.state = { ...this.state, available: false };
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
      return;
    }
    if (msg.type === 'ready') {
      this.restarts = 0;
      this.state = { ...this.state, available: true };
      this.log('fg-worker pripravený');
      this.emit();
    } else if (msg.type === 'fg') {
      const app = (msg.app as string) || null;
      this.state = { available: true, app, pid: Number(msg.pid) || null, title: (msg.title as string) ?? null, kind: kindOf(app), ts: Date.now() };
      this.emit();
    } else if (msg.type === 'error') {
      this.log(`fg-worker chyba: ${msg.message}`);
    }
  }
}
