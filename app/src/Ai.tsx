// Režim AI: bočný pás (čas, dva kruhy usage, malý prehrávač) + sklenená karta „Agenti“.
// Rozloženie a hodnoty CSS podľa schváleného mocku app/public/mock4.html.
import { useMemo } from 'react';
import Ring from './Ring';
import { ProviderLogo } from './Logos';
import type { AgentInfo, AgentStatus, AgentsState, MediaState, UsageState } from './service';
import { useClock, formatDateDayMonth, formatCountdown, formatReset, formatDuration as dur, formatAgo as ago } from './time';
import { ledTap } from './ledPulse';
import { IconPrev, IconNext, IconPlay, IconPause } from './MediaIcons';

interface Props {
  agents: AgentsState | null;
  usage: UsageState | null;
  media: MediaState | null;
  online: boolean;
  sendMedia: (a: 'play' | 'pause' | 'toggle' | 'next' | 'prev') => void;
}

const RANK: Record<string, number> = { waiting: 0, busy: 1, done: 2, idle: 3 };

export default function Ai({ agents, usage, media, online, sendMedia }: Props) {
  const now = useClock();
  const t = now.getTime();
  const stale = !usage || !usage.available || usage.stale;
  const playing = media?.status === 'Playing';

  // poradie: čaká na teba → pracuje → hotovo → nečinný; v skupine podľa poslednej aktivity zostupne
  const list = useMemo(() => {
    const src = agents?.agents ?? [];
    return [...src].sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || b.lastActivity - a.lastActivity);
  }, [agents]);

  const available = agents ? agents.available : true;
  const active = list.filter((a) => a.status !== 'idle');
  const lastIdle = list.find((a) => a.status === 'idle') ?? null;
  const showEmpty = available && active.length === 0;

  const codexSub = usage?.codex.weeklyResetAt ? `reset ${formatReset(usage.codex.weeklyResetAt)}` : 'reset —';
  const claudeSession = usage?.claude.sessionUsed;
  const claudeSub =
    claudeSession === null || claudeSession === undefined
      ? '5h —'
      : `5h ${Math.round(claudeSession)}% · ${usage?.claude.sessionResetAt ? `reset ${formatCountdown(usage.claude.sessionResetAt, t)}` : 'bez resetu'}`;
  const codexFull = !stale && (usage?.codex.weeklyUsed ?? 0) >= 100;
  const claudeFull = !stale && (usage?.claude.weeklyUsed ?? 0) >= 100;

  return (
    <div className="ai">
      <aside className="strip ai-strip">
        <div className="strip-time">
          <div className="t">{String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}</div>
          <div className="dd">{formatDateDayMonth(now)}</div>
        </div>

        <div className="rings">
          <Ring size="ai" weekly={usage?.codex.weeklyUsed ?? null} label={<><ProviderLogo provider="codex" />Codex</>} stale={stale} />
          <div className={`rsub ${codexFull ? 'red' : ''}`}>{codexSub}</div>
          <Ring
            size="ai"
            weekly={usage?.claude.weeklyUsed ?? null}
            session={usage?.claude.sessionUsed ?? null}
            label={<><ProviderLogo provider="claude" />Claude</>}
            stale={stale}
          />
          <div className={`rsub ${claudeFull ? 'red' : ''}`}>{claudeSub}</div>
        </div>

        <div className="player">
          <div className="np">
            {media?.available ? (
              <><span>♪ </span><b>{media.title || 'Bez názvu'}</b>{media.artist ? ` · ${media.artist}` : ''}</>
            ) : (
              <span className="muted">nič nehrá</span>
            )}
          </div>
          <div className="mus">
            <button onClick={() => { ledTap(); sendMedia('prev'); }} disabled={!online || !media?.available} aria-label="Predošlá"><IconPrev /></button>
            <button className="main" onClick={() => { ledTap(); sendMedia('toggle'); }} disabled={!online || !media?.available} aria-label="Prehrať / pauza">
              {playing ? <IconPause /> : <IconPlay />}
            </button>
            <button onClick={() => { ledTap(); sendMedia('next'); }} disabled={!online || !media?.available} aria-label="Ďalšia"><IconNext /></button>
          </div>
        </div>
      </aside>

      <section className={`card glass panel ${available ? '' : 'unavail'}`}>
        <div className="hd">
          <h2>Agenti</h2>
          <span className="sum">{summary(agents, list)}</span>
          <span className="n">{agents ? ago(t - agents.updatedAt) : ''}</span>
        </div>

        {!available ? (
          <div className="empty">
            <div className="ic">⚠</div>
            <div className="big">Stav agentov nedostupný</div>
            <div>{agents?.reason ?? 'Claude Code alebo Codex zapisuje stav v inom formáte než panel pozná.'}<br />Usage a hudba fungujú ďalej.</div>
          </div>
        ) : showEmpty ? (
          <div className="empty">
            <div className="ic">◌</div>
            <div className="big">Žiadny agent nebeží</div>
            {lastIdle && (
              <div>
                Naposledy: <ProviderLogo provider={lastIdle.provider} className="logo inl" colored /> {lastIdle.project}, skončil {hhmm(lastIdle.lastActivity)}
              </div>
            )}
          </div>
        ) : (
          <div className="agents">
            {list.map((a) => (
              <AgentCard key={a.id} agent={a} now={t} />
            ))}
          </div>
        )}

        {agents?.today && (
          <div className="ft">
            <span>dnes: <b>{plural(agents.today.projects, 'projekt', 'projekty', 'projektov')}</b></span>
            <span><b>{plural(agents.today.turns, 'ťah', 'ťahy', 'ťahov')}</b></span>
            <span>aktívne <b>{dur(agents.today.activeMs)}</b></span>
            <span style={{ marginLeft: 'auto' }}>
              <ProviderLogo provider="claude" className="logo inl" colored /> {kilo(agents.today.claudeOut)} out
              {' · '}
              <ProviderLogo provider="codex" className="logo inl" colored /> {kilo(agents.today.codexOut)} out
            </span>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------- karta agenta ----------

const CHIP: Record<string, { cls: string; text: string }> = {
  busy: { cls: 'busy', text: 'pracuje' },
  waiting: { cls: 'wait', text: 'čaká na teba' },
  done: { cls: 'done', text: 'hotovo' },
  idle: { cls: 'idle', text: 'nečinný' },
};

function AgentCard({ agent, now }: { agent: AgentInfo; now: number }) {
  // Častice sa generujú raz na reláciu (useMemo podľa id), aby pri každom heartbeate „nepreskakovali“.
  const parts = useMemo(() => makeParticles(agent.id), [agent.id]);
  const chip = CHIP[agent.status] ?? { cls: 'idle', text: agent.status };
  const flows = agent.status === 'busy' || agent.status === 'waiting';
  const wait = agent.status === 'waiting';
  const cls = agent.status === 'waiting' ? 'wait' : agent.status;

  return (
    <div className={`agent ${agent.provider} ${cls}`}>
      {flows && (
        <div className="flow" aria-hidden="true">
          <div className="sweep" />
          {parts.map((p, i) => (
            <i
              key={i}
              className="p"
              style={{
                top: `${p.top}%`,
                left: wait ? `${p.left}%` : '-2%',
                width: `${p.size}vh`,
                height: `${p.size}vh`,
                opacity: p.op,
                animationDuration: `${wait ? p.waitDur : p.dur}s`,
                animationDelay: `-${p.delay}s`,
              }}
            />
          ))}
        </div>
      )}
      <div className="who"><ProviderLogo provider={agent.provider} /></div>
      <div className="what">
        <div className="proj">{agent.project}</div>
        {agent.title && <div className="sess">{agent.title}</div>}
      </div>
      <div className="st">
        <span className={`chip ${chip.cls}`}><i />{chip.text}</span>
        <span className="meta">{metaText(agent, now)}</span>
      </div>
    </div>
  );
}

function metaText(a: AgentInfo, now: number): string {
  if (a.status === 'busy') return `${dur(now - a.since)} · pred ${dur(now - a.lastActivity)}`;
  if (a.status === 'waiting') return `otázka pred ${dur(now - a.lastActivity)}`;
  if (a.status === 'done') {
    const run = a.startedAt ? ` · trvalo ${dur(a.since - a.startedAt)}` : '';
    return `${ago(now - a.since)}${run}`;
  }
  return `bez aktivity ${dur(now - a.lastActivity)}`;
}

// ---------- častice: náhodné, ale stabilné pre danú reláciu ----------

interface Particle { top: number; left: number; size: number; dur: number; waitDur: number; delay: number; op: number }

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function makeParticles(id: string): Particle[] {
  const r = rng(hash(id));
  const n = 5 + Math.floor(r() * 3); // 5–7 kusov
  return Array.from({ length: n }, () => ({
    top: 8 + r() * 78,
    left: 12 + r() * 72,
    size: 0.35 + r() * 0.35, // 0,35–0,7 vh
    dur: 6 + r() * 6, // pracuje: 6–12 s
    waitDur: 2 + r() * 2, // čaká: 2–4 s
    delay: r() * 10,
    op: 0.45 + r() * 0.45,
  }));
}

// ---------- texty ----------

function hhmm(epochMs: number): string {
  const d = new Date(epochMs);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function kilo(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)} k` : `${n}`;
}

function plural(n: number, one: string, few: string, many: string): string {
  return `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
}

function summary(agents: AgentsState | null, list: AgentInfo[]): string {
  if (!agents) return 'čakám na dáta';
  if (!agents.available) return 'stav nedostupný';
  const c = (s: AgentStatus) => list.filter((a) => a.status === s).length;
  const parts: string[] = [];
  if (c('busy')) parts.push(plural(c('busy'), 'pracuje', 'pracujú', 'pracuje'));
  if (c('waiting')) parts.push(plural(c('waiting'), 'čaká na teba', 'čakajú na teba', 'čaká na teba'));
  if (c('done')) parts.push(`${c('done')} hotovo`);
  return parts.length ? parts.join(' · ') : 'nič nebeží';
}
