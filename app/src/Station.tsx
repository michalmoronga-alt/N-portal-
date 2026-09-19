import { type RefObject } from 'react';
import Ring from './Ring';
import type { AudioLevel } from './audioLevel';
import type { AgentsState, MediaState, UsageState, WeatherState } from './service';
import { providerActivity } from './ringActivity';
import { useClock, formatDateLong } from './time';
import MusicCard from './MusicCard';
import { ProviderLogo } from './Logos';
import WeatherIcon from './WeatherIcon';
import { useTapOpen, type DetailKind } from './Overlay';

interface Props {
  usage: UsageState | null;
  media: MediaState | null;
  /** stav agentov pre obiehajúce body na kruhoch (null = bez spojenia → žiadne body) */
  agents: AgentsState | null;
  /** počasie v spodnom riadku hodín; nedostupné = riadok je prázdny, ale výška ostáva */
  weather: WeatherState | null;
  /** živá úroveň zvuku z PC pre equalizer (zámerne mimo React stavu, chodí 20× za s) */
  audio: RefObject<AudioLevel>;
  online: boolean; // bez spojenia sú tlačidlá zablokované, obsah ostáva
  sendMedia: (a: 'play' | 'pause' | 'toggle' | 'next' | 'prev') => void;
  sendVolume: (pct: number) => void;
  /** posun v skladbe (ms od začiatku) – odošle sa až po pustení prsta */
  sendSeek: (ms: number) => void;
  bigPlayer?: boolean; // pri aktívnom Chrome: väčšia hudobná karta
  active: boolean; // obrazovka je viditeľná
  /** otvorenie detailu cez celú obrazovku (W‑2); prehrávač v Station detail nemá */
  onDetail: (kind: DetailKind) => void;
}

export default function Station({ usage, media, agents, weather, audio, online, sendMedia, sendVolume, sendSeek, bigPlayer, active, onDetail }: Props) {
  const now = useClock();
  const openWeather = useTapOpen(() => onDetail('weather'));
  const openUsage = useTapOpen(() => onDetail('usage'));

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const stale = !usage || !usage.available || usage.stale;
  const ringAgents = online ? agents : null; // bez spojenia sú dáta agentov neplatné → body zmiznú
  const wx = weather?.available && weather.current ? weather : null;
  const dayName = formatDateLong(now).split(',')[0];
  const dateRest = formatDateLong(now).split(', ')[1] ?? '';

  return (
    <div className={`station ${bigPlayer ? 'big-player' : ''}`}>
      {/* hodiny v2: deň a dátum hore, čas v strede, dole veľká ikona počasia s teplotou (bez popisu) */}
      <section className="card glass clock" {...openWeather}>
        <div className="cdate">
          <div className="day">{dayName}</div>
          <div className="date">{dateRest}</div>
        </div>
        <div className="time">
          <span className="d">{hh}</span>
          <span className="d">{mm}</span>
        </div>
        {/* pri nedostupnom počasí je riadok prázdny, ale výšku si drží – hodiny sa nepohnú */}
        <div className={`wx ${wx?.stale ? 'stale' : ''}`} title={wx ? (wx.stale ? `${wx.place} · staré údaje` : wx.place) : undefined}>
          {wx && (
            <>
              <WeatherIcon code={wx.current!.code} isDay={wx.current!.isDay} />
              <b>{wx.stale ? '· ' : ''}{Math.round(wx.current!.temp)} °</b>
            </>
          )}
        </div>
      </section>

      <section className="card glass usage" {...openUsage}>
        <div className="rings">
          <Ring weekly={usage?.codex.weeklyUsed ?? null} label={<><ProviderLogo provider="codex" />Codex</>} stale={stale} activity={providerActivity(ringAgents, 'codex')} />
          <Ring weekly={usage?.claude.weeklyUsed ?? null} session={usage?.claude.sessionUsed ?? null} label={<><ProviderLogo provider="claude" />Claude</>} stale={stale} activity={providerActivity(ringAgents, 'claude')} />
        </div>
        {stale && <div className="hint">{usage?.available ? 'Usage dáta sú zastarané' : 'Usage dáta nedostupné'}</div>}
      </section>

      <MusicCard
        media={media}
        audio={audio}
        online={online}
        sendMedia={sendMedia}
        sendVolume={sendVolume}
        sendSeek={sendSeek}
        active={active}
      />
    </div>
  );
}
