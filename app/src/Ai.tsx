// Režim AI: bočný pás (rovnaký ako v SKP – SideStrip) + sklenená karta „Agenti“.
// Rozloženie karty a hodnoty CSS podľa schváleného mocku app/public/mock4.html;
// farebnosť stavov je novšia (fialová „čaká“, zelená „hotovo“, modrá „pracuje“).
// Samotná karta relácie je v AgentCard.tsx (vrátane detailu po ťahu doľava).
import { useEffect, useMemo, useState } from 'react';
import SideStrip from './SideStrip';
import AgentCard from './AgentCard';
import { ProviderLogo } from './Logos';
import type { AgentInfo, AgentStatus, AgentsState, MediaState, UsageState } from './service';
import { useClock, formatDuration as dur, formatAgo as ago } from './time';

interface Props {
  agents: AgentsState | null;
  /** je spojenie so službou? bez neho sú dáta agentov neplatné pre body na kruhoch v páse */
  online: boolean;
  usage: UsageState | null;
  media: MediaState | null;
  sendMedia: (a: 'play' | 'pause' | 'toggle' | 'next' | 'prev') => void;
  /** obrazovka je viditeľná (pri odchode do iného režimu sa otvorený detail zavrie) */
  active: boolean;
}

const RANK: Record<string, number> = { waiting: 0, busy: 1, done: 2, idle: 3 };

export default function Ai({ agents, online, usage, media, sendMedia, active }: Props) {
  const now = useClock();
  const t = now.getTime();

  // poradie: čaká na teba → pracuje → hotovo → nečinný; v skupine podľa poslednej aktivity zostupne
  const list = useMemo(() => {
    const src = agents?.agents ?? [];
    return [...src].sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || b.lastActivity - a.lastActivity);
  }, [agents]);

  const available = agents ? agents.available : true;
  const running = list.filter((a) => a.status !== 'idle');
  const lastIdle = list.find((a) => a.status === 'idle') ?? null;
  const showEmpty = available && running.length === 0;

  // Detail je otvorený vždy najviac na jednej karte a drží sa pri id relácie – keď služba zmení
  // poradie kariet, otvorený detail ostane pri svojom agentovi a karty nepreskakujú.
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    // detail zavrieť pri prepnutí režimu a vtedy, keď agent zmizne zo zoznamu
    setOpenId((id) => (id && active && list.some((a) => a.id === id) ? id : null));
  }, [active, list]);

  return (
    <div className="ai">
      <SideStrip usage={usage} media={media} agents={online ? agents : null} sendMedia={sendMedia} now={now} active={active} />

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
              <AgentCard
                key={a.id}
                agent={a}
                now={t}
                open={openId === a.id}
                onOpen={() => setOpenId(a.id)}
                onClose={() => setOpenId((id) => (id === a.id ? null : id))}
                // AI‑3: klepnutie na nerozvinutú kartu prenesie okno relácie na PC dopredu (zatiaľ bez akcie)
                onTap={() => {}}
              />
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
