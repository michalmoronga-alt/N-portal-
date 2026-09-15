import Ring from './Ring';
import type { MediaState, UsageState } from './service';
import { useClock, formatDateLong, formatReset } from './time';

interface Props {
  usage: UsageState | null;
  media: MediaState | null;
  sendMedia: (a: 'play' | 'pause' | 'toggle' | 'next' | 'prev') => void;
}

export default function Station({ usage, media, sendMedia }: Props) {
  const now = useClock();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const stale = !usage || !usage.available || usage.stale;
  const playing = media?.status === 'Playing';

  return (
    <div className="station">
      <section className="card clock">
        <div className="time">
          <span>{hh}</span>
          <small>{mm}</small>
        </div>
        <div className="date">{formatDateLong(now)}</div>
      </section>

      <section className="card usage">
        <Ring
          weekly={usage?.codex.weeklyUsed ?? null}
          label="Codex"
          sub={usage?.codex.weeklyResetAt ? `reset ${formatReset(usage.codex.weeklyResetAt)}` : undefined}
          stale={stale}
        />
        <Ring
          weekly={usage?.claude.weeklyUsed ?? null}
          session={usage?.claude.sessionUsed ?? null}
          label={usage?.claude.sessionUsed != null ? `Claude · 5h ${Math.round(usage.claude.sessionUsed)}%` : 'Claude'}
          sub={usage?.claude.weeklyResetAt ? `reset ${formatReset(usage.claude.weeklyResetAt)}` : undefined}
          stale={stale}
        />
        {stale && <div className="usage-note">{usage?.available ? 'Usage dáta sú zastarané' : 'Usage dáta nedostupné'}</div>}
      </section>

      <section className="card music" style={media?.thumb ? { ['--cover' as string]: `url(${media.thumb})` } : undefined}>
        <div className={`cover ${media?.thumb ? 'has' : ''}`} />
        <div className="shade" />
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
          <button onClick={() => sendMedia('prev')} aria-label="Predošlá" disabled={!media?.available}>⏮</button>
          <button className="main" onClick={() => sendMedia('toggle')} aria-label="Prehrať / pauza" disabled={!media?.available}>
            {playing ? '⏸' : '▶'}
          </button>
          <button onClick={() => sendMedia('next')} aria-label="Ďalšia" disabled={!media?.available}>⏭</button>
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
