// Hudobná karta: obal skladby s prelínaním, gestá na obale (ťah = ďalšia/predošlá, klepnutie = pauza),
// neviditeľný pás hlasitosti na hornom okraji, názov/interpret/zdroj, priebeh s posunom, tlačidlá
// a equalizer v pozadí.
//
// Tú istú kartu používa Station (`card glass music`) aj detail prehrávača v páse SKP/AI (`card music`
// v overlayi). Je vyčlenená sem naschvál: keby sa karta kreslila na dvoch miestach zvlášť, správanie
// by sa časom rozišlo.
import { useEffect, useRef, useState, type RefObject } from 'react';
import Equalizer from './Equalizer';
import type { AudioLevel } from './audioLevel';
import type { MediaState } from './service';
import { ledTap } from './ledPulse';
import VolumeStrip from './VolumeStrip';
import Progress from './Progress';
import { swipeDirOf } from './swipe';
import { IconPrev, IconNext, IconPlay, IconPause } from './MediaIcons';

interface Props {
  media: MediaState | null;
  /** živá úroveň zvuku z PC pre equalizer (zámerne mimo React stavu, chodí 20× za s) */
  audio: RefObject<AudioLevel>;
  online: boolean; // bez spojenia sú tlačidlá zablokované, obsah ostáva
  sendMedia: (a: 'play' | 'pause' | 'toggle' | 'next' | 'prev') => void;
  sendVolume: (pct: number) => void;
  /** posun v skladbe (ms od začiatku) – odošle sa až po pustení prsta */
  sendSeek: (ms: number) => void;
  /** karta je viditeľná (inak sa equalizer ani priebeh neprekresľujú) */
  active: boolean;
  /** triedy karty: v Station `card glass music`, v detaile prehrávača `card music` */
  className?: string;
}

const TAP_PX = 36; // kratší pohyb než ťah (rovnaká hranica ako v swipe.ts) = klepnutie
const NUDGE_MS = 260; // ohlas ťahu na obale
const TAP_MS = 180; // ohlas klepnutia na obale
const COVER_FADE_MS = 450; // prelínanie obalu (musí sedieť s animáciou `cover-in` v styles.css)

export default function MusicCard({ media, audio, online, sendMedia, sendVolume, sendSeek, active, className = 'card glass music' }: Props) {
  const canPlay = online && !!media?.available;
  const playing = media?.status === 'Playing';

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

  return (
    <section className={className}>
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
      {/* equalizer: nad obrázkom aj nad tmavým prechodom, pod textom a ovládaním (z-index v styles.css) */}
      <Equalizer audio={audio} active={active} />
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
  );
}

/** Čitateľný názov aplikácie z názvu procesu („chrome.exe“ → „Chrome“). */
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
