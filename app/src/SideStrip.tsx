// Bočný pás (20 % šírky, bez rámčeka) – zúžený Station: čas a dátum hore, prehrávač v strede,
// mini kruhy usage dole. Zdieľajú ho režimy SKP aj AI a musí v oboch vyzerať úplne rovnako,
// preto tu nie sú žiadne režimové varianty a v styles.css nie sú prepisy `.strip` pre AI.
//
// Poznámka: režim AI mal pôvodne väčšie kruhy (19 vh) a pod nimi podtexty s časom resetu
// („reset so 14:00“, „5h 8 % · reset o 2 h 34 min“). Na telefóne sa to nezmestilo, tak to vypadlo.
// Ak sa niekedy vrátia, patria sem ako voliteľná prop (napr. `resets`) + vlastné pravidlá v CSS,
// nie ako prepisy tried `.strip`.
import Ring from './Ring';
import type { MediaState, UsageState } from './service';
import { formatDateDayMonth } from './time';
import { ledTap } from './ledPulse';
import { ProviderLogo } from './Logos';
import { IconPrev, IconNext, IconPlay, IconPause } from './MediaIcons';

interface Props {
  usage: UsageState | null;
  media: MediaState | null;
  sendMedia: (a: 'play' | 'pause' | 'toggle' | 'next' | 'prev') => void;
  now: Date;
}

export default function SideStrip({ usage, media, sendMedia, now }: Props) {
  const stale = !usage || !usage.available || usage.stale;
  const playing = media?.status === 'Playing';

  return (
    <aside className="strip">
      <div className="strip-time">
        <div className="t">{String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}</div>
        <div className="dd">{formatDateDayMonth(now)}</div>
      </div>
      <div className="player">
        <div className="np">{media?.available ? <><span>♪ </span><b>{media.title || 'Bez názvu'}</b>{media.artist ? ` · ${media.artist}` : ''}</> : <span className="muted">nič nehrá</span>}</div>
        <div className="mus">
          <button onClick={() => { ledTap(); sendMedia('prev'); }} disabled={!media?.available} aria-label="Predošlá"><IconPrev /></button>
          <button className="main" onClick={() => { ledTap(); sendMedia('toggle'); }} disabled={!media?.available} aria-label="Prehrať / pauza">{playing ? <IconPause /> : <IconPlay />}</button>
          <button onClick={() => { ledTap(); sendMedia('next'); }} disabled={!media?.available} aria-label="Ďalšia"><IconNext /></button>
        </div>
      </div>
      <div className="rings">
        <div className="rw"><Ring size="mini" weekly={usage?.codex.weeklyUsed ?? null} label="" stale={stale} /><div className="name"><ProviderLogo provider="codex" />Codex</div></div>
        <div className="rw"><Ring size="mini" weekly={usage?.claude.weeklyUsed ?? null} session={usage?.claude.sessionUsed ?? null} label="" stale={stale} /><div className="name"><ProviderLogo provider="claude" />Claude</div></div>
      </div>
    </aside>
  );
}
