// Ambientný režim: celoobrazovková vrstva nad celým panelom (aj nad horným pásom), ktorá sa zapne
// po dlhšej nečinnosti v Station. Vzhľad je 1 : 1 port schváleného mocku `app/public/mock7.html`:
// stmavené video pozadie s vinetou, veľké hodiny v strede, kruhy usage vľavo dole, riadok skladby
// s equalizerom cez celú šírku dole a štítok „čaká na teba“ hore.
//
// Batéria a starý telefón: okrem videa (len prvých 30 minút relácie), hodín (raz za minútu),
// bodov na kruhoch a equalizera pri hudbe tu nebeží nič. Pri skrytí stránky sa video pauzuje.
// Spustenie, ukončenie aj obsah štítku riadi `App.tsx` – táto vrstva len zobrazuje a hlási dotyk.
import { useEffect, useRef, useState, type RefObject } from 'react';
import Ring from './Ring';
import Equalizer from './Equalizer';
import { ProviderLogo } from './Logos';
import { providerActivity } from './ringActivity';
import { formatDateAmbient } from './time';
import type { AudioLevel } from './audioLevel';
import type { AgentsState, MediaState, UsageState } from './service';

/** Štítok o agentovi – rovnaký obsah aj farby ako v hornom páse (logika je v App.tsx). */
interface AmbNotice {
  kind: 'waiting' | 'done';
  project: string;
  provider: string;
}

interface Props {
  /** true = ambient beží (prechod dnu 1,5 s), false = končí (von do 200 ms) */
  visible: boolean;
  usage: UsageState | null;
  /** stav agentov pre body na kruhoch (null = bez spojenia) */
  agents: AgentsState | null;
  media: MediaState | null;
  /** živá úroveň zvuku z PC pre equalizer (mimo React stavu) */
  audio: RefObject<AudioLevel>;
  notice: AmbNotice | null;
  /** dotyk na vrstvu: ambient končí a dotyk sa ďalej nešíri (Station pod ním nedostane klik) */
  onExit: () => void;
  /** demo `?demo=ambient&night=1`: vynútený nočný jas */
  demoNight?: boolean;
  /** demo `?demo=ambient&photo=1`: stav po 30 minútach (video pauznuté na statickej snímke) */
  demoPhoto?: boolean;
}

const VIDEO_MS = 30 * 60 * 1000; // video hrá len prvých 30 minút ambientnej relácie
const NIGHT_FROM = 22; // 22:00–7:00 = nočný jas pozadia a chladnejšia farba hodín
const NIGHT_TO = 7;
const JITTER_X = 12; // posun hodín každú minútu (ochrana displeja)
const JITTER_Y = 8;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export default function Ambient({ visible, usage, agents, media, audio, notice, onExit, demoNight, demoPhoto }: Props) {
  // „obmedziť pohyb“ sa mení len v nastaveniach a tie ambient ukončia – stačí prečítať pri vzniku
  const [reduce] = useState(() => document.documentElement.classList.contains('reduce'));
  const [videoFail, setVideoFail] = useState(false);
  const useVideo = !reduce && !videoFail;
  const videoRef = useRef<HTMLVideoElement>(null);
  const startRef = useRef(0); // začiatok ambientnej relácie (vrstva vzniká s ňou), nastaví sa v efekte
  const doneRef = useRef(false); // 30 minút vypršalo → video sa už nerozbieha

  // ---------- prechod dnu (1,5 s) / von (do 200 ms) ----------
  // Trieda sa nasadí až v ďalšej snímke, aby prehliadač mal z čoho prechádzať; pri ukončení sa
  // odoberie a kratší prechod zoberie hodnotu tam, kde práve je (dotyk počas nábehu neblikne).
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!visible) {
      setShown(false);
      return;
    }
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [visible]);

  // ---------- hodiny: raz za minútu nový čas a nový drobný posun ----------
  const [clock, setClock] = useState(() => ({ now: new Date(), dx: 0, dy: 0 }));
  useEffect(() => {
    let t = 0;
    const plan = () => {
      const d = new Date();
      const toMinute = 60000 - (d.getSeconds() * 1000 + d.getMilliseconds());
      t = window.setTimeout(() => {
        setClock({ now: new Date(), dx: Math.round(rand(-JITTER_X, JITTER_X)), dy: Math.round(rand(-JITTER_Y, JITTER_Y)) });
        plan();
      }, toMinute + 30);
    };
    plan();
    return () => window.clearTimeout(t);
  }, []);

  const hours = clock.now.getHours();
  const night = !!demoNight || hours >= NIGHT_FROM || hours < NIGHT_TO;

  // ---------- video: 30 minút, potom pauza na statickej snímke ----------
  useEffect(() => {
    if (!startRef.current) startRef.current = Date.now();
    const v = videoRef.current;
    if (!useVideo || !v) return;
    v.muted = true; // istota aj tam, kde atribút z Reactu nestačí (autoplay bez zvuku)
    let t = 0;
    const pause = () => {
      doneRef.current = true;
      try {
        v.pause();
      } catch {
        /* ignore */
      }
    };
    if (demoPhoto) {
      // demo: rovno stav po 30 minútach – počkáme na prvú snímku a zastavíme
      doneRef.current = true;
      if (v.readyState >= 2) pause();
      else v.addEventListener('loadeddata', pause, { once: true });
    } else {
      v.play().catch(() => {
        /* autoplay zamietnutý – ostane statická prvá snímka */
      });
      t = window.setTimeout(pause, Math.max(0, VIDEO_MS - (Date.now() - startRef.current)));
    }
    // stránka v pozadí: video pauznúť; po návrate pokračovať, ak ešte platí 30 min okno
    const onVisible = () => {
      if (document.visibilityState !== 'visible') {
        try {
          v.pause();
        } catch {
          /* ignore */
        }
      } else if (!doneRef.current) {
        v.play().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [useVideo, demoPhoto]);

  const stale = !usage || !usage.available || usage.stale;
  const playing = media?.status === 'Playing';
  const artist = media?.artist?.trim() || '';
  const title = media?.title?.trim() || '';

  return (
    <div
      className={`ambient ${shown ? 'on' : 'off'} ${night ? 'night' : ''}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onExit();
      }}
    >
      <div className="amb-bg">
        {useVideo ? (
          <video ref={videoRef} src="/ambient.mp4" autoPlay muted loop playsInline onError={() => setVideoFail(true)} />
        ) : (
          <img src="/bg.jpg?v=3" alt="" />
        )}
      </div>

      <div className="amb-in">
        {notice && (
          <div className={`badge amb-badge ${notice.kind === 'done' ? 'done' : 'wait'}`}>
            <ProviderLogo provider={notice.provider} colored />
            <span className="bt">{notice.project} {notice.kind === 'done' ? 'hotovo' : 'čaká na teba'}</span>
          </div>
        )}

        <div className="amb-clock" style={{ ['--dx' as string]: `${clock.dx}px`, ['--dy' as string]: `${clock.dy}px` }}>
          <div className="t">{String(hours).padStart(2, '0')}:{String(clock.now.getMinutes()).padStart(2, '0')}</div>
          <div className="d">{formatDateAmbient(clock.now)}</div>
        </div>

        <div className="amb-rings">
          <div className="rw">
            <Ring size="mini" weekly={usage?.codex.weeklyUsed ?? null} label="" stale={stale} activity={providerActivity(agents, 'codex')} />
            <div className="name">Codex</div>
          </div>
          <div className="rw">
            <Ring size="mini" weekly={usage?.claude.weeklyUsed ?? null} session={usage?.claude.sessionUsed ?? null} label="" stale={stale} activity={providerActivity(agents, 'claude')} />
            <div className="name">Claude</div>
          </div>
        </div>

        {/* hudba: bez prehrávania sa časť skryje (prelínanie 1 s), equalizer vtedy nekreslí */}
        <div className={`amb-music ${playing ? 'on' : ''}`}>
          <Equalizer audio={audio} active={visible && !!playing} variant="wide" />
          <div className="np">{artist ? <><b>{artist}</b> – {title}</> : <b>{title}</b>}</div>
        </div>
      </div>
    </div>
  );
}
