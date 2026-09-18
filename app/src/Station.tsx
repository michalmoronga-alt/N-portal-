import { useEffect, useRef, useState } from 'react';
import Ring from './Ring';
import type { AgentsState, MediaState, UsageState } from './service';
import { providerActivity } from './ringActivity';
import { useClock, formatDateLong, formatCountdown } from './time';
import { ledTap } from './ledPulse';
import VolumeStrip from './VolumeStrip';
import Progress from './Progress';
import { swipeDirOf } from './swipe';
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
  /** posun v skladbe (ms od začiatku) – odošle sa až po pustení prsta */
  sendSeek: (ms: number) => void;
  bigPlayer?: boolean; // pri aktívnom Chrome: väčšia hudobná karta
  active: boolean; // obrazovka je viditeľná (detail sa zatvorí pri odchode)
}

const TAP_PX = 36; // kratší pohyb než ťah (rovnaká hranica ako v swipe.ts) = klepnutie
const NUDGE_MS = 260; // ohlas ťahu na obale
const TAP_MS = 180; // ohlas klepnutia na obale
const COVER_FADE_MS = 450; // prelínanie obalu (musí sedieť s animáciou `cover-in` v styles.css)

export default function Station({ usage, media, agents, online, sendMedia, sendVolume, sendSeek, bigPlayer, active }: Props) {
  const canPlay = online && !!media?.available;
  const now = useClock();
  const [detail, setDetail] = useState(false);
  const y0 = useRef<number | null>(null);
  useEffect(() => {
    if (!active) setDetail(false);
  }, [active]);

  // gestá na obale skladby: ťah doľava = ďalšia, doprava = predošlá, klepnutie = prehrať/pauza
  const coverStart = useRef<{ x: number; y: number; id: number } | null>(null);
  const [nudge, setNudge] = useState<'left' | 'right' | null>(null);
  const [coverTap, setCoverTap] = useState(false);
  useEffect(() => {
    if (!nudge) return;
    const t = window.setTimeout(() => setNudge(null), NUDGE_MS);
    return () => window.clearTimeout(t);
  }, [nudge]);
  useEffect(() => {
    if (!coverTap) return;
    const t = window.setTimeout(() => setCoverTap(false), TAP_MS);
    return () => window.clearTimeout(t);
  }, [coverTap]);

  // Obal skladby: `art` je väčší obrázok z YouTube (cez Chrome rozšírenie), inak platí `thumb`
  // z Windows. Nový obrázok najprv načítame a až potom ho prelínieme cez starý (dve vrstvy),
  // aby pri prechode z malého na veľký obal nebliklo prázdno.
  const wantCover = media?.art ?? media?.thumb ?? null;
  const [baseCover, setBaseCover] = useState<string | null>(null); // spodná vrstva (už zobrazená)
  const [loadedCover, setLoadedCover] = useState<string | null>(null); // načítaný nový obrázok
  const showBase = wantCover ? baseCover : null;
  const showFade = wantCover && loadedCover === wantCover && loadedCover !== baseCover ? loadedCover : null;
  useEffect(() => {
    if (!wantCover || wantCover === baseCover) return;
    let dead = false;
    const img = new Image();
    img.onload = () => {
      if (!dead) setLoadedCover(wantCover);
    };
    img.onerror = () => {
      /* obrázok sa nenačítal (napr. služba ho už nemá) – necháme predošlý obal */
    };
    img.src = wantCover;
    return () => {
      dead = true;
    };
  }, [wantCover, baseCover]);
  useEffect(() => {
    if (!showFade) return;
    const t = window.setTimeout(() => setBaseCover(showFade), COVER_FADE_MS);
    return () => window.clearTimeout(t);
  }, [showFade]);

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

      <section className="card glass music">
        <div
          className={`cover ${showBase ? 'has' : ''} ${nudge ? `nudge-${nudge}` : ''} ${coverTap ? 'tap' : ''}`}
          style={showBase ? { ['--cover' as string]: `url(${showBase})` } : undefined}
        />
        {showFade && (
          <div
            key={showFade}
            className={`cover top has ${nudge ? `nudge-${nudge}` : ''} ${coverTap ? 'tap' : ''}`}
            style={{ ['--cover' as string]: `url(${showFade})` }}
          />
        )}
        <div className="shade" />
        <VolumeStrip volume={media?.volume ?? null} onChange={online ? sendVolume : () => {}} />
        <div
          className="cover-hit"
          aria-label="Obal skladby – potiahni doľava/doprava, klepni pre pauzu"
          onPointerDown={(e) => {
            if (!canPlay) return;
            coverStart.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
            try {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            } catch {
              /* prst už nie je aktívny – gesto funguje aj bez zachytenia */
            }
          }}
          onPointerUp={(e) => {
            const st = coverStart.current;
            if (!st || st.id !== e.pointerId) return;
            coverStart.current = null;
            if (!canPlay) return;
            const dx = e.clientX - st.x;
            const dy = e.clientY - st.y;
            const dir = swipeDirOf(dx, dy);
            if (dir === 'left') {
              ledTap();
              setNudge('left');
              sendMedia('next');
            } else if (dir === 'right') {
              ledTap();
              setNudge('right');
              sendMedia('prev');
            } else if (!dir && Math.max(Math.abs(dx), Math.abs(dy)) < TAP_PX) {
              ledTap();
              setCoverTap(true);
              sendMedia('toggle');
            }
          }}
          onPointerCancel={() => (coverStart.current = null)}
        />
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
        <Progress media={media} active={active} variant="card" onSeek={online ? sendSeek : undefined} />
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
