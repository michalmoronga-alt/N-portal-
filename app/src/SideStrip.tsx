// Bočný pás (20 % šírky, bez rámčeka) – zúžený Station: čas a dátum hore, prehrávač v strede,
// mini kruhy usage dole. Zdieľajú ho režimy SKP aj AI a musí v oboch vyzerať úplne rovnako,
// preto tu nie sú žiadne režimové varianty a v styles.css nie sú prepisy `.strip` pre AI.
//
// Poznámka: režim AI mal pôvodne väčšie kruhy (19 vh) a pod nimi podtexty s časom resetu
// („reset so 14:00“, „5h 8 % · reset o 2 h 34 min“). Na telefóne sa to nezmestilo, tak to vypadlo.
// Ak sa niekedy vrátia, patria sem ako voliteľná prop (napr. `resets`) + vlastné pravidlá v CSS,
// nie ako prepisy tried `.strip`.
import Ring from './Ring';
import Progress from './Progress';
import type { AgentsState, MediaState, UsageState, WeatherState } from './service';
import { providerActivity } from './ringActivity';
import { formatDateDayMonth } from './time';
import { ledTap } from './ledPulse';
import { ProviderLogo } from './Logos';
import WeatherIcon from './WeatherIcon';
import { IconPrev, IconNext, IconPlay, IconPause } from './MediaIcons';
import { useTapOpen, type DetailKind } from './Overlay';

interface Props {
  usage: UsageState | null;
  media: MediaState | null;
  /** stav agentov pre obiehajúce body na mini kruhoch (null = bez spojenia → žiadne body) */
  agents: AgentsState | null;
  /** počasie – malá ikona s teplotou pod dátumom; nedostupné = riadok sa nezobrazí */
  weather: WeatherState | null;
  sendMedia: (a: 'play' | 'pause' | 'toggle' | 'next' | 'prev') => void;
  now: Date;
  /** obrazovka je viditeľná – inak sa linka priebehu neprekresľuje */
  active: boolean;
  /** klepnutie na hodiny / prehrávač / kruhy otvorí detail cez celú obrazovku (W‑2) */
  onDetail: (kind: DetailKind) => void;
}

export default function SideStrip({ usage, media, agents, weather, sendMedia, now, active, onDetail }: Props) {
  const stale = !usage || !usage.available || usage.stale;
  const playing = media?.status === 'Playing';
  const wx = weather?.available && weather.current ? weather : null;
  const openWeather = useTapOpen(() => onDetail('weather'));
  const openPlayer = useTapOpen(() => onDetail('player'));
  const openUsage = useTapOpen(() => onDetail('usage'));

  return (
    <aside className="strip">
      <div className="strip-time" {...openWeather}>
        <div className="t">{String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}</div>
        <div className="dd">{formatDateDayMonth(now)}</div>
        {wx && (
          <div className={`wx-mini ${wx.stale ? 'stale' : ''}`} title={wx.stale ? 'staré údaje' : wx.place}>
            <WeatherIcon code={wx.current!.code} isDay={wx.current!.isDay} />
            <span>{Math.round(wx.current!.temp)} °</span>
          </div>
        )}
      </div>
      <div className="player" {...openPlayer}>
        <div className="np">{media?.available ? <><span>♪ </span><b>{media.title || 'Bez názvu'}</b>{media.artist ? ` · ${media.artist}` : ''}</> : <span className="muted">nič nehrá</span>}</div>
        <Progress media={media} active={active} variant="mini" />
        <div className="mus">
          <button onClick={() => { ledTap(); sendMedia('prev'); }} disabled={!media?.available} aria-label="Predošlá"><IconPrev /></button>
          <button className="main" onClick={() => { ledTap(); sendMedia('toggle'); }} disabled={!media?.available} aria-label="Prehrať / pauza">{playing ? <IconPause /> : <IconPlay />}</button>
          <button onClick={() => { ledTap(); sendMedia('next'); }} disabled={!media?.available} aria-label="Ďalšia"><IconNext /></button>
        </div>
      </div>
      <div className="rings" {...openUsage}>
        <div className="rw"><Ring size="mini" weekly={usage?.codex.weeklyUsed ?? null} label="" stale={stale} activity={providerActivity(agents, 'codex')} /><div className="name"><ProviderLogo provider="codex" />Codex</div></div>
        <div className="rw"><Ring size="mini" weekly={usage?.claude.weeklyUsed ?? null} session={usage?.claude.sessionUsed ?? null} label="" stale={stale} activity={providerActivity(agents, 'claude')} /><div className="name"><ProviderLogo provider="claude" />Claude</div></div>
      </div>
    </aside>
  );
}
