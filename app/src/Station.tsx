import { useEffect, useRef, useState } from 'react';
import Ring from './Ring';
import type { AgentsState, MediaState, UsageState } from './service';
import { providerActivity } from './ringActivity';
import { useClock, formatDateLong, formatCountdown } from './time';
import { ledTap } from './ledPulse';
import VolumeStrip from './VolumeStrip';
import { ProviderLogo } from './Logos';
import { IconPrev, IconNext, IconPlay, IconPause } from './MediaIcons';

interface Props {
  usage: UsageState | null;
  media: MediaState | null;
  /** stav agentov pre obiehajúce body na kruhoch (null = bez spojenia → žiadne body) */
  agents: AgentsState | null;
  online: boolean; // bez spojenia sú tlačidlá zablokované, obsah ostáva
  sendMedia: (a: 'play' | 'pause' | 'toggle' | 'next' | 'prev') => void;
  sendVolume: (pct: number) => void;
  bigPlayer?: boolean; // pri aktívnom Chrome: väčšia hudobná karta
  active: boolean; // obrazovka je viditeľná (detail sa zatvorí pri odchode)
}

export default function Station({ usage, media, agents, online, sendMedia, sendVolume, bigPlayer, active }: Props) {
  const canPlay = online && !!media?.available;
  const now = useClock();
  const [detail, setDetail] = useState(false);
  const y0 = useRef<number | null>(null);
  useEffect(() => {
    if (!active) setDetail(false);
  }, [active]);

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const stale = !usage || !usage.available || usage.stale;
  const playing = media?.status === 'Playing';
  const ringAgents = online ? agents : null; // bez spojenia sú dáta agentov neplatné → body zmiznú
  const dayName = formatDateLong(now).split(',')[0];
  const dateRest = formatDateLong(now).split(', ')[1] ?? '';

  const fmtDT = (epoch: number | null | undefined) => {
    if (!epoch) return '—';
    const d = new Date(epoch * 1000);
    const days = ['ne', 'po', 'ut', 'st', 'št', 'pi', 'so'];
    return `${days[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}. · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v)} %`);
  const statusText = (s: string | null | undefined) => (s === 'ok' ? 'ok' : s === 'rate_limit' ? 'rate limit' : s ?? '—');

  return (
    <div className={`station ${bigPlayer ? 'big-player' : ''} ${detail ? 'detail-open' : ''}`}>
      <section className="card glass clock">
        <div className="time">
          <span className="d">{hh}</span>
          <span className="d">{mm}</span>
        </div>
        <div className="day">{dayName}</div>
        <div className="date">{dateRest}</div>
      </section>

      <section
        className={`card glass usage ${detail ? 'open' : ''}`}
        onPointerDown={(e) => (y0.current = e.clientY)}
        onPointerUp={(e) => {
          if (y0.current === null) return;
          const dy = e.clientY - y0.current;
          y0.current = null;
          if (dy < -30) setDetail(true);
          else if (dy > 30) setDetail(false);
          else setDetail((d) => !d);
        }}
      >
        <div className="rings">
          <Ring weekly={usage?.codex.weeklyUsed ?? null} label={<><ProviderLogo provider="codex" />Codex</>} stale={stale} activity={providerActivity(ringAgents, 'codex')} />
          <Ring weekly={usage?.claude.weeklyUsed ?? null} session={usage?.claude.sessionUsed ?? null} label={<><ProviderLogo provider="claude" />Claude</>} stale={stale} activity={providerActivity(ringAgents, 'claude')} />
        </div>
        {detail && (
          <div className="dtl">
            <h3><span>Usage</span><span>▼ zavrieť</span></h3>
            <table>
              <thead><tr><th></th><th>Codex</th><th>Claude</th></tr></thead>
              <tbody>
                <tr><td className="k">Týždeň</td><td>{pct(usage?.codex.weeklyUsed)}</td><td>{pct(usage?.claude.weeklyUsed)}</td></tr>
                <tr><td className="k">Reset týždňa</td><td>{fmtDT(usage?.codex.weeklyResetAt)}</td><td>{fmtDT(usage?.claude.weeklyResetAt)}</td></tr>
                <tr><td className="k">5h okno</td><td>{usage?.codex.sessionUsed == null ? '—' : pct(usage.codex.sessionUsed)}</td><td>{pct(usage?.claude.sessionUsed)}</td></tr>
                <tr><td className="k">Reset 5h</td><td>{usage?.codex.sessionResetAt ? formatCountdown(usage.codex.sessionResetAt, now.getTime()) : '—'}</td><td className="cd">{usage?.claude.sessionResetAt ? formatCountdown(usage.claude.sessionResetAt, now.getTime()) : '—'}</td></tr>
                <tr><td className="k">Stav</td><td className={usage?.codex.status === 'ok' ? '' : 'warn'}>{statusText(usage?.codex.status)}</td><td className={usage?.claude.status === 'ok' ? '' : 'warn'}>{statusText(usage?.claude.status)}</td></tr>
              </tbody>
            </table>
            <div className="foot">
              {usage?.available ? `Dáta z NOXUN AI Usage · pred ${Math.round((usage.ageSec ?? 0) / 60)} min · ${usage.mode ?? ''}${usage.stale ? ' · ZASTARANÉ' : ''}` : 'Usage dáta nedostupné'}
            </div>
          </div>
        )}
        {!detail && <div className="hint">{stale ? (usage?.available ? 'Usage dáta sú zastarané' : 'Usage dáta nedostupné') : '▲ potiahni hore: detail'}</div>}
      </section>

      <section className="card glass music" style={media?.thumb ? { ['--cover' as string]: `url(${media.thumb})` } : undefined}>
        <div className={`cover ${media?.thumb ? 'has' : ''}`} />
        <div className="shade" />
        <VolumeStrip volume={media?.volume ?? null} onChange={online ? sendVolume : () => {}} />
        <div className="meta">
          {media?.available ? (
            <>
              <div className="title">{media.title || 'Bez názvu'}</div>
              <div className="artist">{media.artist || ''}</div>
              <div className="src">{appName(media.app)} · {playing ? 'hrá' : 'pauza'}</div>
            </>
          ) : (
            <>
              <div className="title muted">Nič nehrá</div>
              <div className="src">{media?.workerOk ? 'Spusti prehrávanie na PC' : 'Hudobný modul sa spúšťa…'}</div>
            </>
          )}
        </div>
        <div className="ctrl">
          <button onClick={() => { ledTap(); sendMedia('prev'); }} aria-label="Predošlá" disabled={!canPlay}><IconPrev /></button>
          <button className="main" onClick={() => { ledTap(); sendMedia('toggle'); }} aria-label="Prehrať / pauza" disabled={!canPlay}>
            {playing ? <IconPause /> : <IconPlay />}
          </button>
          <button onClick={() => { ledTap(); sendMedia('next'); }} aria-label="Ďalšia" disabled={!canPlay}><IconNext /></button>
        </div>
      </section>
    </div>
  );
}

export function appName(id: string | null): string {
  if (!id) return '';
  const s = id.toLowerCase();
  if (s.includes('chrome')) return 'Chrome';
  if (s.includes('spotify')) return 'Spotify';
  if (s.includes('msedge') || s.includes('edge')) return 'Edge';
  if (s.includes('firefox')) return 'Firefox';
  if (s.includes('vlc')) return 'VLC';
  return id.replace(/\.exe$/i, '').split(/[!\\/]/).pop() ?? id;
}
