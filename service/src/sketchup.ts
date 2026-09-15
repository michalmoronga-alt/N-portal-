// Prepojenie na Ruby prijímač v SketchUpe cez súbory v %USERPROFILE%\.n-portal\e0 (pozri config.ts).
// Protokol je popísaný v sketchup/nportal_e0/main.rb.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { E0_DIR } from './config.js';

const CMD_DIR = path.join(E0_DIR, 'cmd');
const STATE_FILE = path.join(E0_DIR, 'state.txt');
const HEARTBEAT_MAX_SEC = 3;
const TTL_MS = 2000;

/** Akcie, ktoré služba pošle ďalej. Prijímač má vlastný zoznam; oba musia súhlasiť. */
export const ALLOWED_ACTIONS = new Set(['focus_selection', 'view_top', 'view_front', 'view_left', 'view_previous', 'view_all']);

export interface SketchUpLast {
  id: string;
  status: string; // ok | error | expired | rejected
  message: string;
  at: number; // epoch s
}

export interface SketchUpState {
  available: boolean; // prijímač beží, heartbeat čerstvý, model otvorený
  receiverStatus: string; // running | standby | stopped | missing
  heartbeatAge: number | null; // s
  model: string | null;
  selectionCount: number | null;
  last: SketchUpLast | null;
}

export function readState(): SketchUpState {
  let raw: string;
  try {
    raw = fs.readFileSync(STATE_FILE, 'utf8');
  } catch {
    return { available: false, receiverStatus: 'missing', heartbeatAge: null, model: null, selectionCount: null, last: null };
  }
  const kv = new Map<string, string>();
  for (const line of raw.split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0) kv.set(line.slice(0, i), line.slice(i + 1));
  }
  const now = Math.floor(Date.now() / 1000);
  const hb = Number(kv.get('receiver.heartbeat') ?? 0);
  const age = hb > 0 ? now - hb : null;
  const status = kv.get('receiver.status') ?? 'missing';
  const available = status === 'running' && age !== null && age <= HEARTBEAT_MAX_SEC && kv.get('model.ready') === '1';
  const lastId = kv.get('last.id') ?? '';
  return {
    available,
    receiverStatus: status,
    heartbeatAge: age,
    model: kv.get('model.title') ?? null,
    selectionCount: kv.has('selection.count') ? Number(kv.get('selection.count')) : null,
    last: lastId
      ? { id: lastId, status: kv.get('last.status') ?? '', message: kv.get('last.message') ?? '', at: Number(kv.get('last.at') ?? 0) }
      : null,
  };
}

/** Zapíše povel pre prijímač. Vráti ID povelu (podľa neho PWA spáruje výsledok). */
export function sendCommand(action: string, clientId?: string): { id: string } {
  if (!ALLOWED_ACTIONS.has(action)) throw new Error(`Nepovolená akcia: ${action}`);
  fs.mkdirSync(CMD_DIR, { recursive: true });
  const now = Date.now();
  const suffix = clientId && /^[A-Za-z0-9_-]{1,32}$/.test(clientId) ? clientId : crypto.randomBytes(3).toString('hex');
  const id = `${now}-${suffix}`;
  const payload = JSON.stringify({ id, action, created_at: now, ttl_ms: TTL_MS, source: 'service' });
  const tmp = path.join(CMD_DIR, `${id}.tmp`);
  fs.writeFileSync(tmp, payload, 'utf8');
  fs.renameSync(tmp, path.join(CMD_DIR, `${id}.json`));
  return { id };
}
