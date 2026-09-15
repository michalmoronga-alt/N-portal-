// Usage Claude / Codex: číta snapshot.txt, ktorý zapisuje existujúci Rainmeter skin NOXUN AI Usage.
// Žiadny druhý zberač; ak skin nebeží, dáta sú „zastarané“ a PWA to zobrazí.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SNAPSHOT =
  process.env.NPORTAL_USAGE_FILE ??
  path.join(os.homedir(), 'Documents', 'Rainmeter', 'Skins', 'NOXUN AI Usage DEMO', '@Resources', 'State', 'snapshot.txt');
const STALE_SEC = 600; // interval zberu je 180 s; po troch vynechaniach považujeme dáta za zastarané

export interface UsageProvider {
  status: string | null; // ok | rate_limit | error …
  weeklyUsed: number | null; // % spotrebované
  weeklyResetAt: number | null; // epoch s
  sessionUsed: number | null; // % 5h okna (Claude); null keď účet 5h okno nemá (Codex)
  sessionResetAt: number | null;
}

export interface UsageState {
  available: boolean; // súbor existuje a dá sa čítať
  stale: boolean; // dáta staršie než STALE_SEC
  ageSec: number | null;
  mode: string | null; // LIVE | DEMO
  claude: UsageProvider;
  codex: UsageProvider;
}

const EMPTY: UsageProvider = { status: null, weeklyUsed: null, weeklyResetAt: null, sessionUsed: null, sessionResetAt: null };

function num(v: string | undefined): number | null {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function provider(kv: Map<string, string>, p: 'claude' | 'codex'): UsageProvider {
  const has = (k: string) => kv.get(`${p}.${k}.availability`) === 'present';
  return {
    status: kv.get(`${p}.status`) ?? null,
    weeklyUsed: has('weekly') ? num(kv.get(`${p}.weekly.used`)) : null,
    weeklyResetAt: has('weekly') ? num(kv.get(`${p}.weekly.reset_at`)) : null,
    sessionUsed: has('session') ? num(kv.get(`${p}.session.used`)) : null,
    sessionResetAt: has('session') ? num(kv.get(`${p}.session.reset_at`)) : null,
  };
}

export function readUsage(): UsageState {
  let raw: string;
  try {
    raw = fs.readFileSync(SNAPSHOT, 'utf8');
  } catch {
    return { available: false, stale: true, ageSec: null, mode: null, claude: EMPTY, codex: EMPTY };
  }
  const kv = new Map<string, string>();
  for (const line of raw.split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0) kv.set(line.slice(0, i), line.slice(i + 1).trim());
  }
  const writtenAt = num(kv.get('written_at'));
  const age = writtenAt ? Math.max(0, Math.floor(Date.now() / 1000) - writtenAt) : null;
  return {
    available: true,
    stale: age === null || age > STALE_SEC,
    ageSec: age,
    mode: kv.get('mode') ?? null,
    claude: provider(kv, 'claude'),
    codex: provider(kv, 'codex'),
  };
}

export const USAGE_FILE = SNAPSHOT;
