// Prepojenie na Ruby prijímače v SketchUpe cez súbory v %USERPROFILE%\.n-portal\e0 (pozri config.ts).
// E4: každá relácia SketchUpu (proces) má vlastný state-<pid>.txt a cmd\<pid>\. Cieľ povelu vyberá služba.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { E0_DIR } from './config.js';

const CMD_ROOT = path.join(E0_DIR, 'cmd');
const HEARTBEAT_MAX_SEC = 3;
const STALE_DELETE_SEC = 120; // stav bez heartbeatu dlhšie než toto sa zmaže (spadnutý SketchUp)
const TTL_MS = 2000;

/** Akcie, ktoré služba pošle ďalej. Prijímač má vlastný zoznam; oba musia súhlasiť. */
export const ALLOWED_ACTIONS = new Set([
  'focus_selection',
  'view_top', 'view_front', 'view_left', 'view_previous', 'view_all',
  'isolate_toggle', 'hidden_objects_toggle',
]);

export interface SketchUpLast {
  id: string;
  status: string; // ok | error | expired | rejected
  message: string;
  at: number; // epoch s
}

export interface SketchUpInstance {
  pid: number;
  available: boolean; // prijímač beží, heartbeat čerstvý, model otvorený
  receiverStatus: string;
  heartbeatAge: number | null;
  model: string | null;
  selectionCount: number | null;
  isolationActive: boolean;
  isolationCount: number;
  hiddenObjectsShown: boolean;
  last: SketchUpLast | null;
}

/** Stav pre PWA: cieľová relácia (alebo „nedostupné“) + prehľad všetkých relácií. */
export interface SketchUpState extends Omit<SketchUpInstance, 'pid'> {
  pid: number | null;
  targetReason: 'foreground' | 'single' | 'none' | 'ambiguous';
  instances: { pid: number; model: string | null; available: boolean; selectionCount: number | null }[];
}

function parseState(file: string, pid: number): SketchUpInstance | null {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const kv = new Map<string, string>();
  for (const line of raw.split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0) kv.set(line.slice(0, i), line.slice(i + 1));
  }
  const now = Math.floor(Date.now() / 1000);
  const hb = Number(kv.get('receiver.heartbeat') ?? 0);
  const age = hb > 0 ? now - hb : null;
  if (age !== null && age > STALE_DELETE_SEC) {
    try {
      fs.unlinkSync(file);
      fs.rmSync(path.join(CMD_ROOT, String(pid)), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    return null;
  }
  const status = kv.get('receiver.status') ?? 'missing';
  const lastId = kv.get('last.id') ?? '';
  return {
    pid,
    available: status === 'running' && age !== null && age <= HEARTBEAT_MAX_SEC && kv.get('model.ready') === '1',
    receiverStatus: status,
    heartbeatAge: age,
    model: kv.get('model.title') ?? null,
    selectionCount: kv.has('selection.count') ? Number(kv.get('selection.count')) : null,
    isolationActive: kv.get('isolation.active') === '1',
    isolationCount: Number(kv.get('isolation.count') ?? 0) || 0,
    hiddenObjectsShown: kv.get('view.hidden_objects') === '1',
    last: lastId
      ? { id: lastId, status: kv.get('last.status') ?? '', message: kv.get('last.message') ?? '', at: Number(kv.get('last.at') ?? 0) }
      : null,
  };
}

/** Všetky živé relácie (heartbeat do 3 s). */
export function readInstances(): SketchUpInstance[] {
  let files: string[];
  try {
    files = fs.readdirSync(E0_DIR).filter((f) => /^state-\d+\.txt$/.test(f));
  } catch {
    return [];
  }
  const out: SketchUpInstance[] = [];
  for (const f of files) {
    const pid = Number(f.slice(6, -4));
    const st = parseState(path.join(E0_DIR, f), pid);
    if (st && st.heartbeatAge !== null && st.heartbeatAge <= HEARTBEAT_MAX_SEC) out.push(st);
  }
  return out.sort((a, b) => a.pid - b.pid);
}

const UNAVAILABLE: Omit<SketchUpState, 'targetReason' | 'instances'> = {
  pid: null, available: false, receiverStatus: 'missing', heartbeatAge: null, model: null, selectionCount: null,
  isolationActive: false, isolationCount: 0, hiddenObjectsShown: false, last: null,
};

/**
 * Cieľ povelu: relácia, ktorej okno bolo naposledy v popredí; ak taká nežije a beží práve jedna, tá;
 * pri viacerých bez jasného cieľa nič (tlačidlá šedé, kým používateľ neklikne do jedného SketchUpu).
 */
export function buildState(instances: SketchUpInstance[], preferredPid: number | null): SketchUpState {
  const summary = instances.map((i) => ({ pid: i.pid, model: i.model, available: i.available, selectionCount: i.selectionCount }));
  let target: SketchUpInstance | undefined;
  let reason: SketchUpState['targetReason'] = 'none';
  if (preferredPid !== null) {
    target = instances.find((i) => i.pid === preferredPid);
    if (target) reason = 'foreground';
  }
  if (!target && instances.length === 1) {
    target = instances[0];
    reason = 'single';
  }
  if (!target) {
    return { ...UNAVAILABLE, receiverStatus: instances.length > 1 ? 'ambiguous' : 'missing', targetReason: instances.length > 1 ? 'ambiguous' : 'none', instances: summary };
  }
  return { ...target, targetReason: reason, instances: summary };
}

/** Zapíše povel pre konkrétnu reláciu. Vráti ID povelu (podľa neho PWA spáruje výsledok). */
export function sendCommand(pid: number, action: string, clientId?: string): { id: string } {
  if (!ALLOWED_ACTIONS.has(action)) throw new Error(`Nepovolená akcia: ${action}`);
  const dir = path.join(CMD_ROOT, String(pid));
  fs.mkdirSync(dir, { recursive: true });
  const now = Date.now();
  const suffix = clientId && /^[A-Za-z0-9_-]{1,32}$/.test(clientId) ? clientId : crypto.randomBytes(3).toString('hex');
  const id = `${now}-${suffix}`;
  const payload = JSON.stringify({ id, action, created_at: now, ttl_ms: TTL_MS, source: 'service' });
  const tmp = path.join(dir, `${id}.tmp`);
  fs.writeFileSync(tmp, payload, 'utf8');
  fs.renameSync(tmp, path.join(dir, `${id}.json`));
  return { id };
}
