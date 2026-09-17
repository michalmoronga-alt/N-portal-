// Režim AI (AI-1): stav agentov Claude Code a Codex.
// Číta LEN lokálne stavové súbory (nikdy obsah rozhovorov, promptov ani cesty mimo cwd)
// a nikdy nezapisuje do .claude ani .codex.
//   Claude Code: %USERPROFILE%\.claude\sessions\<pid>.json + záznam relácie
//                %USERPROFILE%\.claude\projects\<slug>\<sessionId>.jsonl (čítaný prírastkovo)
//   Codex:       %USERPROFILE%\.codex\state_5.sqlite (vlákna) + thread_history_1.sqlite (ťahy),
//                detail z rolloutu %USERPROFILE%\.codex\sessions\RRRR\MM\DD\rollout-*-<id>.jsonl
// Formáty sú interné a môžu sa zmeniť: pri chybe pošleme available:false s dôvodom, služba nespadne.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { createRequire } from 'node:module';

const requireNode = createRequire(import.meta.url);

// ---------- kontrakt (služba → PWA) ----------

export type AgentStatus = 'busy' | 'waiting' | 'done' | 'idle';

export interface AgentDetail {
  model: string | null;
  effort: string | null;
  turns: number;
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  durationMs: number;
  tools: Record<string, number>;
  branch: string | null;
  origin: string | null; // Codex: kto reláciu spustil (napr. „Claude Code“)
}

export interface AgentEntry {
  id: string; // claude:<pid> / codex:<threadId>
  provider: 'claude' | 'codex';
  project: string;
  cwd: string;
  title: string | null;
  status: AgentStatus;
  since: number; // odkedy platí aktuálny stav
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
  agents: AgentEntry[];
  today: AgentsToday;
}

// ---------- konštanty ----------

const HOME = os.homedir();
const CLAUDE_SESSIONS = path.join(HOME, '.claude', 'sessions');
const CLAUDE_PROJECTS = path.join(HOME, '.claude', 'projects');
const CODEX_DIR = path.join(HOME, '.codex');
const CODEX_STATE_DB = path.join(CODEX_DIR, 'state_5.sqlite');
const CODEX_TURNS_DB = path.join(CODEX_DIR, 'thread_history_1.sqlite');
const CODEX_SESSIONS = path.join(CODEX_DIR, 'sessions');

const POLL_MS = 2000;
const TODAY_SCAN_MS = 30_000; // ako často hľadáme dnes zmenené záznamy mimo živých relácií
const LOOKUP_RETRY_MS = 30_000; // ako často skúšame znova nájsť chýbajúci jsonl relácie
const WAITING_WINDOW_MS = 30 * 60 * 1000;
const DONE_WINDOW_MS = 10 * 60 * 1000;
const CODEX_WINDOW_SEC = 24 * 3600;
// Ťah `inProgress` bez `completed_at` zostane v databáze aj po pade/prerušení Codexu.
// Za „pracuje“ ho berúme len ak sa vlákno práve hýbe (updated_at beží počas ťahu), inak je nečinné.
const CODEX_BUSY_FRESH_MS = 5 * 60 * 1000;
const CHUNK = 256 * 1024;
const UNAVAILABLE_REASON = 'Claude Code alebo Codex zapisuje stav v inom formáte než panel pozná.';

const EMPTY_TODAY: AgentsToday = { projects: 0, turns: 0, activeMs: 0, claudeOut: 0, codexOut: 0 };

// ---------- pomôcky ----------

const yieldToLoop = () => new Promise<void>((r) => setImmediate(r));

function dateKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function stripLongPath(p: string): string {
  return p.replace(/^\\\\\?\\/, '');
}

export function projectOf(cwd: string | null): string {
  const clean = stripLongPath(cwd ?? '').trim();
  if (!clean) return '?';
  if (/scratch-workspaces/i.test(clean)) return 'scratch';
  const parts = clean.split(/[\\/]+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : clean;
}

function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'; // existuje, len nemáme práva
  }
}

function tsOf(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Date.parse(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Prírastkové čítanie riadkového jsonl. Drží pozíciu; pri zmenšení súboru číta od začiatku. */
interface Tail {
  offset: number;
  partial: string;
}

async function readNewLines(file: string, tail: Tail, onLine: (o: Record<string, unknown>) => void): Promise<boolean> {
  let st: fs.Stats;
  try {
    st = await fsp.stat(file);
  } catch {
    return false;
  }
  if (st.size < tail.offset) {
    tail.offset = 0;
    tail.partial = '';
  }
  if (st.size === tail.offset) return false;

  let fh: fsp.FileHandle | null = null;
  try {
    fh = await fsp.open(file, 'r');
    const dec = new StringDecoder('utf8');
    const buf = Buffer.allocUnsafe(CHUNK);
    while (tail.offset < st.size) {
      const want = Math.min(CHUNK, st.size - tail.offset);
      const { bytesRead } = await fh.read(buf, 0, want, tail.offset);
      if (bytesRead <= 0) break;
      tail.offset += bytesRead;
      const text = tail.partial + dec.write(buf.subarray(0, bytesRead));
      const lines = text.split('\n');
      tail.partial = lines.pop() ?? '';
      for (const line of lines) {
        const s = line.trim();
        if (!s) continue;
        try {
          const o = JSON.parse(s);
          if (o && typeof o === 'object') onLine(o as Record<string, unknown>);
        } catch {
          /* poškodený alebo neznámy riadok – ignorujeme */
        }
      }
      await yieldToLoop(); // aby cyklus nikdy nezablokoval povely do SketchUpu
    }
    return true;
  } catch {
    return false;
  } finally {
    await fh?.close().catch(() => undefined);
  }
}

// ---------- prehľad jednej relácie Claude ----------

type LastKind = 'assistant-end' | 'assistant-other' | 'user-text' | 'user-tool' | 'other';

interface ClaudeStats {
  tail: Tail;
  customTitle: string | null;
  model: string | null;
  effort: string | null;
  branch: string | null;
  cwd: string | null;
  turns: number;
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  tools: Record<string, number>;
  firstTs: number | null;
  lastTs: number | null;
  lastKind: LastKind;
  todayTurns: number;
  todayOut: number;
  todayActive: boolean;
}

function newClaudeStats(): ClaudeStats {
  return {
    tail: { offset: 0, partial: '' },
    customTitle: null, model: null, effort: null, branch: null, cwd: null,
    turns: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0, tools: {},
    firstTs: null, lastTs: null, lastKind: 'other',
    todayTurns: 0, todayOut: 0, todayActive: false,
  };
}

function feedClaude(st: ClaudeStats, o: Record<string, unknown>, today: string) {
  const type = o.type;
  if (type === 'custom-title') {
    const t = o.customTitle;
    if (typeof t === 'string' && t.trim()) st.customTitle = t.trim().slice(0, 80);
    return;
  }
  const ts = tsOf(o.timestamp);
  const isToday = ts !== null && dateKey(ts) === today;
  const sidechain = o.isSidechain === true;
  if (typeof o.gitBranch === 'string') st.branch = o.gitBranch;
  if (typeof o.cwd === 'string') st.cwd = o.cwd;

  if (type === 'assistant') {
    const m = (o.message ?? {}) as Record<string, unknown>;
    if (typeof m.model === 'string') st.model = m.model;
    if (typeof o.effort === 'string') st.effort = o.effort;
    const u = (m.usage ?? {}) as Record<string, unknown>;
    st.tokensIn += num(u.input_tokens);
    st.tokensOut += num(u.output_tokens);
    st.cacheRead += num(u.cache_read_input_tokens);
    if (isToday) {
      st.todayOut += num(u.output_tokens);
      st.todayActive = true;
    }
    const content = m.content;
    if (Array.isArray(content)) {
      for (const b of content) {
        const blk = b as Record<string, unknown>;
        if (blk && blk.type === 'tool_use' && typeof blk.name === 'string') {
          st.tools[blk.name] = (st.tools[blk.name] ?? 0) + 1;
        }
      }
    }
    if (ts !== null) st.lastTs = Math.max(st.lastTs ?? 0, ts);
    if (!sidechain) st.lastKind = m.stop_reason === 'end_turn' ? 'assistant-end' : 'assistant-other';
    return;
  }

  if (type === 'user') {
    const m = (o.message ?? {}) as Record<string, unknown>;
    const c = m.content;
    let isText = typeof c === 'string' && c.trim().length > 0;
    if (Array.isArray(c)) {
      isText = c.some((b) => {
        const blk = b as Record<string, unknown>;
        return blk && blk.type === 'text';
      });
    }
    if (ts !== null) {
      st.lastTs = Math.max(st.lastTs ?? 0, ts);
      if (st.firstTs === null) st.firstTs = ts;
    }
    if (isText && !sidechain) {
      st.turns += 1;
      st.lastKind = 'user-text';
      if (isToday) {
        st.todayTurns += 1;
        st.todayActive = true;
      }
    } else if (!sidechain) {
      st.lastKind = 'user-tool';
      if (isToday) st.todayActive = true;
    }
    return;
  }

  if (ts !== null) st.lastTs = Math.max(st.lastTs ?? 0, ts);
}

function resetClaudeToday(st: ClaudeStats) {
  st.todayTurns = 0;
  st.todayOut = 0;
  st.todayActive = false;
}

// ---------- prehľad jedného rolloutu Codexu ----------

interface CodexStats {
  tail: Tail;
  model: string | null;
  effort: string | null;
  origin: string | null;
  turns: number;
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  lastTs: number | null;
  todayTurns: number;
  todayOut: number;
  todayActive: boolean;
}

function newCodexStats(): CodexStats {
  return {
    tail: { offset: 0, partial: '' },
    model: null, effort: null, origin: null,
    turns: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0, lastTs: null,
    todayTurns: 0, todayOut: 0, todayActive: false,
  };
}

function feedCodex(st: CodexStats, o: Record<string, unknown>, today: string) {
  const ts = tsOf(o.timestamp);
  const isToday = ts !== null && dateKey(ts) === today;
  if (ts !== null) st.lastTs = Math.max(st.lastTs ?? 0, ts);
  const payload = (o.payload ?? {}) as Record<string, unknown>;

  if (o.type === 'session_meta') {
    if (typeof payload.originator === 'string') st.origin = payload.originator;
    return;
  }
  if (o.type === 'turn_context') {
    if (typeof payload.model === 'string') st.model = payload.model;
    if (typeof payload.effort === 'string') st.effort = payload.effort;
    else {
      const cm = (payload.collaboration_mode ?? {}) as Record<string, unknown>;
      const set = (cm.settings ?? {}) as Record<string, unknown>;
      if (typeof set.reasoning_effort === 'string') st.effort = set.reasoning_effort;
    }
    return;
  }
  if (o.type === 'token_usage_record') {
    const u = (payload.usage ?? {}) as Record<string, unknown>;
    if (isToday) {
      st.todayOut += num(u.output_tokens);
      st.todayActive = true;
    }
    return;
  }
  if (o.type === 'event_msg') {
    if (payload.type === 'task_started') {
      st.turns += 1;
      if (isToday) {
        st.todayTurns += 1;
        st.todayActive = true;
      }
      return;
    }
    if (payload.type === 'token_count') {
      const info = (payload.info ?? {}) as Record<string, unknown>;
      const total = (info.total_token_usage ?? {}) as Record<string, unknown>;
      st.tokensIn = num(total.input_tokens);
      st.tokensOut = num(total.output_tokens);
      st.cacheRead = num(total.cached_input_tokens);
    }
  }
}

function resetCodexToday(st: CodexStats) {
  st.todayTurns = 0;
  st.todayOut = 0;
  st.todayActive = false;
}

// ---------- pamäť prechodov stavu ----------

type RawStatus = 'busy' | 'waiting' | 'idle';

interface Memo {
  raw: RawStatus;
  since: number;
  doneAt: number | null;
}

type Listener = (s: AgentsState) => void;

export class AgentsBridge {
  state: AgentsState = { available: false, reason: null, updatedAt: Date.now(), agents: [], today: { ...EMPTY_TODAY } };

  private listeners: Listener[] = [];
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private stopped = false;
  private log: (m: string) => void;
  private debug = process.env.NPORTAL_DEBUG === '1';

  private claudeFiles = new Map<string, ClaudeStats>(); // cesta jsonl → prehľad
  private codexFiles = new Map<string, CodexStats>(); // cesta rolloutu → prehľad
  private sessionPath = new Map<string, { file: string | null; at: number }>(); // sessionId → jsonl
  private memo = new Map<string, Memo>();
  private lastTodayScan = 0;
  private today = dateKey(Date.now());

  private activeMs = 0; // súčet „busy“ úsekov nameraných od štartu služby
  private lastTick = Date.now();
  private wasBusy = false;

  private lastCodexAgents: AgentEntry[] = [];
  private lastCodexOk = false;
  private lastLogged = '';

  constructor(log: (m: string) => void) {
    this.log = log;
  }

  onChange(fn: Listener) {
    this.listeners.push(fn);
  }

  start() {
    this.stopped = false;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), POLL_MS);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private emit() {
    for (const l of this.listeners) l(this.state);
  }

  // ---------- hlavný cyklus ----------

  private async tick() {
    if (this.stopped || this.ticking) return;
    this.ticking = true;
    const t0 = Date.now();
    try {
      this.rolloverIfNeeded();

      const claude = await this.collectClaude();
      const codex = await this.collectCodex();

      const agents = [...claude.agents, ...codex.agents];
      const now = Date.now();

      // aktívny čas: pripočítavame, kým je ktorýkoľvek agent busy
      const step = Math.min(now - this.lastTick, POLL_MS * 3);
      if (this.wasBusy && step > 0) this.activeMs += step;
      this.lastTick = now;
      this.wasBusy = agents.some((a) => a.status === 'busy');

      const available = claude.ok || codex.ok;
      const state: AgentsState = {
        available,
        reason: available ? null : UNAVAILABLE_REASON,
        updatedAt: now,
        agents: agents.sort(byPriority),
        today: this.buildToday(agents),
      };

      const changed = JSON.stringify(withoutTs(state)) !== JSON.stringify(withoutTs(this.state));
      this.state = state;
      this.logChanges(state, claude.ok, codex.ok);
      if (changed) this.emit();
      if (this.debug) this.log(`agents cyklus ${Date.now() - t0} ms (${agents.length} relácií)`);
    } catch (e) {
      this.state = { available: false, reason: UNAVAILABLE_REASON, updatedAt: Date.now(), agents: [], today: this.buildToday([]) };
      this.log(`agents: neočakávaná chyba – ${(e as Error).message}`);
      this.emit();
    } finally {
      this.ticking = false;
    }
  }

  private rolloverIfNeeded() {
    const key = dateKey(Date.now());
    if (key === this.today) return;
    this.today = key;
    this.activeMs = 0;
    for (const st of this.claudeFiles.values()) resetClaudeToday(st);
    for (const st of this.codexFiles.values()) resetCodexToday(st);
    this.lastTodayScan = 0;
  }

  private buildToday(agents: AgentEntry[]): AgentsToday {
    let turns = 0;
    let claudeOut = 0;
    let codexOut = 0;
    const projects = new Set<string>();
    for (const st of this.claudeFiles.values()) {
      turns += st.todayTurns;
      claudeOut += st.todayOut;
      if (st.todayActive && st.cwd) projects.add(projectOf(st.cwd));
    }
    for (const st of this.codexFiles.values()) {
      turns += st.todayTurns;
      codexOut += st.todayOut;
    }
    for (const a of agents) {
      if (a.provider === 'codex' && dateKey(a.lastActivity) === this.today) projects.add(a.project);
    }
    return { projects: projects.size, turns, activeMs: this.activeMs, claudeOut, codexOut };
  }

  private logChanges(s: AgentsState, claudeOk: boolean, codexOk: boolean) {
    const line = s.available
      ? `${claudeOk ? 'claude ok' : 'claude –'}, ${codexOk ? 'codex ok' : 'codex –'}: ` +
        s.agents.map((a) => `${a.id}=${a.status}`).join(', ')
      : 'nedostupné';
    if (line === this.lastLogged) return;
    this.lastLogged = line;
    this.log(`agenti: ${line || 'nikto nebeží'}`);
  }

  // ---------- Claude Code ----------

  private async collectClaude(): Promise<{ agents: AgentEntry[]; ok: boolean }> {
    let names: string[];
    try {
      names = await fsp.readdir(CLAUDE_SESSIONS);
    } catch {
      return { agents: [], ok: false };
    }

    const agents: AgentEntry[] = [];
    const live = new Set<string>();

    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      let sess: Record<string, unknown>;
      try {
        sess = JSON.parse(await fsp.readFile(path.join(CLAUDE_SESSIONS, name), 'utf8'));
      } catch {
        continue;
      }
      const pid = Number(sess.pid);
      const sessionId = typeof sess.sessionId === 'string' ? sess.sessionId : null;
      if (!sessionId || !pidAlive(pid)) continue; // staré súbory po skončených procesoch

      // Reláciu bez záznamu jsonl (otvorené okno, Michal ešte nič nenapísal) nezobrazujeme:
      // nemá názov, detail ani činnosť a v zozname by robila len šum.
      const file = await this.findSessionFile(sessionId);
      if (!file) continue;
      live.add(file);
      const st = await this.readClaudeFile(file);

      const cwd = (typeof sess.cwd === 'string' ? sess.cwd : st?.cwd) ?? '';
      const updatedAt = tsOf(sess.updatedAt) ?? Date.now();
      const statusUpdatedAt = tsOf(sess.statusUpdatedAt) ?? updatedAt;
      const startedAt = tsOf(sess.startedAt);
      const lastActivity = Math.max(updatedAt, st?.lastTs ?? 0);

      const raw = deriveClaudeStatus(String(sess.status ?? ''), statusUpdatedAt, st?.lastKind ?? 'other', lastActivity);
      const id = `claude:${pid}`;
      const { status, since } = this.applyMemo(id, raw, raw === 'busy' ? statusUpdatedAt : lastActivity);

      agents.push({
        id,
        provider: 'claude',
        project: projectOf(cwd),
        cwd: stripLongPath(cwd),
        title: st?.customTitle ?? null,
        status,
        since,
        lastActivity,
        startedAt,
        pid,
        detail: st
          ? {
              model: st.model,
              effort: st.effort,
              turns: st.turns,
              tokensIn: st.tokensIn,
              tokensOut: st.tokensOut,
              cacheRead: st.cacheRead,
              durationMs: startedAt ? Math.max(0, Date.now() - startedAt) : 0,
              tools: st.tools,
              branch: st.branch,
              origin: null,
            }
          : null,
      });
    }

    await this.scanTodayClaudeFiles(live);
    return { agents, ok: true };
  }

  /** Nájde <sessionId>.jsonl v ktoromkoľvek priečinku projektov (slug neodvodzujeme). */
  private async findSessionFile(sessionId: string): Promise<string | null> {
    const hit = this.sessionPath.get(sessionId);
    if (hit && (hit.file || Date.now() - hit.at < LOOKUP_RETRY_MS)) {
      if (hit.file && fs.existsSync(hit.file)) return hit.file;
      if (hit.file) this.sessionPath.delete(sessionId);
      else return null;
    }
    let dirs: string[];
    try {
      dirs = await fsp.readdir(CLAUDE_PROJECTS);
    } catch {
      this.sessionPath.set(sessionId, { file: null, at: Date.now() });
      return null;
    }
    for (const d of dirs) {
      const p = path.join(CLAUDE_PROJECTS, d, `${sessionId}.jsonl`);
      if (fs.existsSync(p)) {
        this.sessionPath.set(sessionId, { file: p, at: Date.now() });
        return p;
      }
    }
    this.sessionPath.set(sessionId, { file: null, at: Date.now() });
    return null;
  }

  private async readClaudeFile(file: string): Promise<ClaudeStats> {
    let st = this.claudeFiles.get(file);
    if (!st) {
      st = newClaudeStats();
      this.claudeFiles.set(file, st);
    }
    await readNewLines(file, st.tail, (o) => feedClaude(st!, o, this.today));
    return st;
  }

  /** Pre súhrn „dnes“ prejde aj záznamy relácií, ktoré už nebežia, ale dnes sa menili. */
  private async scanTodayClaudeFiles(live: Set<string>) {
    const now = Date.now();
    const rescan = now - this.lastTodayScan >= TODAY_SCAN_MS;
    if (rescan) {
      this.lastTodayScan = now;
      let dirs: string[] = [];
      try {
        dirs = await fsp.readdir(CLAUDE_PROJECTS);
      } catch {
        dirs = [];
      }
      for (const d of dirs) {
        let files: string[] = [];
        try {
          files = await fsp.readdir(path.join(CLAUDE_PROJECTS, d));
        } catch {
          continue;
        }
        for (const f of files) {
          if (!f.endsWith('.jsonl')) continue;
          const p = path.join(CLAUDE_PROJECTS, d, f);
          if (this.claudeFiles.has(p)) continue;
          try {
            const s = await fsp.stat(p);
            if (dateKey(s.mtimeMs) === this.today) this.claudeFiles.set(p, newClaudeStats());
          } catch {
            /* preskoč */
          }
        }
        await yieldToLoop();
      }
      // upraceme záznamy, ktoré už dnes nie sú aktuálne ani živé
      for (const [p, st] of this.claudeFiles) {
        if (live.has(p) || st.todayActive) continue;
        try {
          if (dateKey(fs.statSync(p).mtimeMs) !== this.today) this.claudeFiles.delete(p);
        } catch {
          this.claudeFiles.delete(p);
        }
      }
    }
    // dočítanie prírastkov u nežijúcich, ale dnes zmenených súborov
    for (const [p, st] of this.claudeFiles) {
      if (live.has(p)) continue;
      await readNewLines(p, st.tail, (o) => feedClaude(st, o, this.today));
    }
  }

  // ---------- Codex ----------

  private async collectCodex(): Promise<{ agents: AgentEntry[]; ok: boolean }> {
    let threads: CodexThread[];
    try {
      threads = readCodexThreads();
    } catch (e) {
      if (this.debug) this.log(`agents: Codex databáza nedostupná – ${(e as Error).message}`);
      return { agents: this.lastCodexAgents, ok: this.lastCodexOk }; // posledný známy stav
    }

    const agents: AgentEntry[] = [];
    const seen = new Set<string>();
    const now = Date.now();

    for (const t of threads) {
      const last = t.lastTurn;
      const updatedMs = t.updatedAt * 1000;
      const lastActivity = Math.max(updatedMs, last?.completedAt ? last.completedAt * 1000 : 0, last?.startedAt ? last.startedAt * 1000 : 0);

      let raw: RawStatus;
      if (last && last.status === 'inProgress' && !last.completedAt && now - updatedMs < CODEX_BUSY_FRESH_MS) raw = 'busy';
      else if (last && last.status === 'completed' && now - updatedMs < WAITING_WINDOW_MS) raw = 'waiting';
      else raw = 'idle';

      const id = `codex:${t.id}`;
      const { status, since } = this.applyMemo(id, raw, raw === 'busy' && last?.startedAt ? last.startedAt * 1000 : lastActivity);

      const rollout = await this.findRollout(t);
      let st: CodexStats | null = null;
      if (rollout) {
        seen.add(rollout);
        st = await this.readCodexFile(rollout);
      }

      const title = typeof t.title === 'string' ? t.title.trim() : '';
      agents.push({
        id,
        provider: 'codex',
        project: projectOf(t.cwd),
        cwd: stripLongPath(t.cwd),
        title: title && title.length <= 60 && !/[\r\n]/.test(title) ? title : null,
        status,
        since,
        lastActivity,
        startedAt: t.createdAt * 1000,
        pid: null,
        detail: st
          ? {
              model: st.model,
              effort: st.effort,
              turns: st.turns,
              tokensIn: st.tokensIn,
              tokensOut: st.tokensOut,
              cacheRead: st.cacheRead,
              durationMs: t.durationMs,
              tools: {},
              branch: null,
              origin: st.origin,
            }
          : null,
      });
    }

    for (const p of [...this.codexFiles.keys()]) {
      if (!seen.has(p) && !this.codexFiles.get(p)!.todayActive) this.codexFiles.delete(p);
    }

    this.lastCodexAgents = agents;
    this.lastCodexOk = true;
    return { agents, ok: true };
  }

  private async findRollout(t: CodexThread): Promise<string | null> {
    const direct = stripLongPath(t.rolloutPath ?? '');
    if (direct && fs.existsSync(direct)) return direct;
    // záloha: hľadáme podľa id vlákna v názve rollout-*-<id>.jsonl (RRRR/MM/DD)
    const created = new Date(t.createdAt * 1000);
    const cand = [created, new Date(t.updatedAt * 1000)];
    for (const d of cand) {
      const dir = path.join(CODEX_SESSIONS, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
      try {
        for (const f of await fsp.readdir(dir)) {
          if (f.startsWith('rollout-') && f.endsWith(`${t.id}.jsonl`)) return path.join(dir, f);
        }
      } catch {
        /* priečinok nemusí existovať */
      }
    }
    return null;
  }

  private async readCodexFile(file: string): Promise<CodexStats> {
    let st = this.codexFiles.get(file);
    if (!st) {
      st = newCodexStats();
      this.codexFiles.set(file, st);
    }
    await readNewLines(file, st.tail, (o) => feedCodex(st!, o, this.today));
    return st;
  }

  // ---------- stavy a prechody ----------

  /** „hotovo“ = prvých 10 min po prechode pracuje → čaká (prechody držíme v pamäti procesu). */
  private applyMemo(id: string, raw: RawStatus, sinceHint: number): { status: AgentStatus; since: number } {
    const now = Date.now();
    const prev = this.memo.get(id);
    let memo: Memo;
    if (!prev || prev.raw !== raw) {
      memo = {
        raw,
        since: Number.isFinite(sinceHint) && sinceHint > 0 && sinceHint <= now ? sinceHint : now,
        doneAt: raw === 'waiting' && prev?.raw === 'busy' ? now : null,
      };
    } else {
      memo = prev;
    }
    this.memo.set(id, memo);
    const status: AgentStatus = raw === 'waiting' && memo.doneAt !== null && now - memo.doneAt < DONE_WINDOW_MS ? 'done' : raw;
    return { status, since: memo.since };
  }
}

function deriveClaudeStatus(status: string, statusUpdatedAt: number, lastKind: LastKind, lastActivity: number): RawStatus {
  const now = Date.now();
  if (status === 'busy') return 'busy';
  if (lastKind === 'assistant-end' && now - statusUpdatedAt < WAITING_WINDOW_MS) return 'waiting';
  if (lastKind === 'user-text') return 'busy';
  if (now - lastActivity > WAITING_WINDOW_MS) return 'idle';
  return 'idle';
}

// poradie podľa mocku: čaká na teba → pracuje → hotovo → nečinný (v skupine podľa poslednej aktivity)
const GROUP: Record<AgentStatus, number> = { waiting: 0, busy: 1, done: 2, idle: 3 };

function byPriority(a: AgentEntry, b: AgentEntry): number {
  const d = GROUP[a.status] - GROUP[b.status];
  return d !== 0 ? d : b.lastActivity - a.lastActivity;
}

function withoutTs(s: AgentsState) {
  // pri porovnávaní zmien ignorujeme len tikajúci čas, nie trvanie relácií
  return { ...s, updatedAt: 0, today: { ...s.today, activeMs: Math.round(s.today.activeMs / 5000) }, agents: s.agents.map((a) => ({ ...a, detail: a.detail ? { ...a.detail, durationMs: Math.round(a.detail.durationMs / 5000) } : null })) };
}

// ---------- Codex: čítanie sqlite (read-only, otvoriť → dopyt → zavrieť) ----------

interface CodexTurn {
  status: string;
  startedAt: number | null;
  completedAt: number | null;
}

interface CodexThread {
  id: string;
  title: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  rolloutPath: string | null;
  lastTurn: CodexTurn | null;
  durationMs: number;
}

type SqliteRow = Record<string, unknown>;

function readCodexThreads(): CodexThread[] {
  // node:sqlite je experimentálne; načítame ho lenivo, aby prípadná absencia nezhodila celý modul
  const { DatabaseSync } = requireNode('node:sqlite') as { DatabaseSync: new (p: string, o?: { readOnly?: boolean }) => SqliteDb };
  const since = Math.floor(Date.now() / 1000) - CODEX_WINDOW_SEC;

  const state = new DatabaseSync(CODEX_STATE_DB, { readOnly: true });
  let rows: SqliteRow[];
  try {
    rows = state
      .prepare('select id, title, cwd, created_at, updated_at, rollout_path from threads where archived = 0 and updated_at >= ? order by updated_at desc limit 50')
      .all(since);
  } finally {
    state.close();
  }

  const out: CodexThread[] = [];
  if (rows.length === 0) return out;

  const hist = new DatabaseSync(CODEX_TURNS_DB, { readOnly: true });
  try {
    const lastTurn = hist.prepare('select status, started_at, completed_at from thread_turns where thread_id = ? order by rollout_ordinal desc limit 1');
    const sumDur = hist.prepare('select coalesce(sum(duration_ms), 0) as d from thread_turns where thread_id = ?');
    for (const r of rows) {
      const id = String(r.id);
      const t = lastTurn.get(id) as SqliteRow | undefined;
      const d = sumDur.get(id) as SqliteRow | undefined;
      out.push({
        id,
        title: typeof r.title === 'string' ? r.title : '',
        cwd: typeof r.cwd === 'string' ? r.cwd : '',
        createdAt: Number(r.created_at) || 0,
        updatedAt: Number(r.updated_at) || 0,
        rolloutPath: typeof r.rollout_path === 'string' ? r.rollout_path : null,
        lastTurn: t ? { status: String(t.status), startedAt: t.started_at === null ? null : Number(t.started_at), completedAt: t.completed_at === null ? null : Number(t.completed_at) } : null,
        durationMs: Number(d?.d) || 0,
      });
    }
  } finally {
    hist.close();
  }
  return out;
}

interface SqliteStmt {
  all(...p: unknown[]): SqliteRow[];
  get(...p: unknown[]): SqliteRow | undefined;
}
interface SqliteDb {
  prepare(sql: string): SqliteStmt;
  close(): void;
}

export { UNAVAILABLE_REASON };
