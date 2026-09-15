import { useEffect, useRef, useState } from 'react';
import { useService } from './service';
import Station from './Station';
import Skp from './Skp';
import Settings from './Settings';
import { ledEnabled, setLedEnabled, ledTap } from './ledPulse';

type Mode = 'station' | 'skp';
export type Pref = 'auto' | Mode;
const PREF_KEY = 'nportal.pref';
const MOTION_KEY = 'nportal.motion';
const AUTO_DELAY_MS = 400; // ochrana proti preblikávaniu pri rýchlom Alt+Tab
const SLIDE_MS = 480;
const EASE = 'cubic-bezier(.2,.8,.2,1)';

export default function App() {
  const { connection, sketchup, usage, media, foreground, lastAck, sendCommand, sendMedia, sendVolume, hasToken } = useService();
  const [pref, setPref] = useState<Pref>(() => {
    try {
      const v = localStorage.getItem(PREF_KEY);
      return v === 'auto' || v === 'station' || v === 'skp' ? v : 'auto';
    } catch {
      return 'auto';
    }
  });
  const [autoMode, setAutoMode] = useState<Mode>('station');
  const [led, setLed] = useState(ledEnabled());
  const [reduceMotion, setReduceMotionState] = useState(() => {
    try {
      return localStorage.getItem(MOTION_KEY) === 'reduce';
    } catch {
      return false;
    }
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const touching = useRef(false);
  const pendingAuto = useRef<Mode | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, pref);
    } catch {
      /* ignore */
    }
  }, [pref]);

  const setReduceMotion = (v: boolean) => {
    setReduceMotionState(v);
    document.documentElement.classList.toggle('reduce', v);
    try {
      localStorage.setItem(MOTION_KEY, v ? 'reduce' : 'full');
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    document.documentElement.classList.toggle('reduce', reduceMotion);
    requestWakeLock();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleLed = () => {
    const v = !led;
    setLed(v);
    setLedEnabled(v);
    if (v) ledTap();
  };

  const online = connection === 'open';
  const skpReady = online && !!sketchup?.available;

  // AUTO: aktívny SketchUp s pripraveným prijímačom → SKP, inak Station. S oneskorením a nie počas dotyku.
  const desiredAuto: Mode = foreground?.kind === 'sketchup' && skpReady ? 'skp' : 'station';
  useEffect(() => {
    if (desiredAuto === autoMode) {
      pendingAuto.current = null;
      return;
    }
    pendingAuto.current = desiredAuto;
    const t = window.setTimeout(() => {
      if (pendingAuto.current === desiredAuto && !touching.current) {
        setAutoMode(desiredAuto);
        pendingAuto.current = null;
      }
    }, AUTO_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [desiredAuto, autoMode]);

  const onPointerDown = () => {
    touching.current = true;
    requestWakeLock();
  };
  const onPointerUp = () => {
    touching.current = false;
    if (pendingAuto.current && pendingAuto.current !== autoMode) {
      const m = pendingAuto.current;
      window.setTimeout(() => {
        if (pendingAuto.current === m && !touching.current) setAutoMode(m);
      }, 150);
    }
  };

  const mode: Mode = pref === 'auto' ? autoMode : pref;
  const bigPlayer = pref === 'auto' && foreground?.kind === 'chrome';

  // ---------- slide prechod (Station vpravo, SKP vľavo; pozadie sa posunie s ním) ----------
  const stationRef = useRef<HTMLDivElement>(null);
  const skpRef = useRef<HTMLDivElement>(null);
  const shownMode = useRef<Mode>(mode);
  const [, force] = useState(0);
  useEffect(() => {
    const prev = shownMode.current;
    if (prev === mode) return;
    const hide = prev === 'station' ? stationRef.current : skpRef.current;
    const show = mode === 'station' ? stationRef.current : skpRef.current;
    const html = document.documentElement;
    html.classList.toggle('station-mode', mode === 'station');
    html.classList.toggle('skp-mode', mode === 'skp');
    if (!hide || !show) {
      shownMode.current = mode;
      force((x) => x + 1);
      return;
    }
    const D = reduceMotion ? 120 : SLIDE_MS;
    const dir = mode === 'skp' ? 1 : -1;
    html.classList.add('moving');
    show.classList.remove('hidden');
    const a1 = hide.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${dir * 100}%)`, opacity: 0.6 }], { duration: D, easing: EASE, fill: 'forwards' });
    const a2 = show.animate([{ transform: `translateX(${-dir * 100}%)`, opacity: 0.6 }, { transform: 'none', opacity: 1 }], { duration: D, easing: EASE });
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        a1.cancel();
        a2.cancel();
      } catch {
        /* ignore */
      }
      hide.classList.add('hidden');
      html.classList.remove('moving');
      shownMode.current = mode;
      force((x) => x + 1);
    };
    Promise.all([a1.finished, a2.finished].map((p) => p.catch(() => {}))).then(finish);
    const guard = window.setTimeout(finish, D + 200);
    return () => window.clearTimeout(guard);
  }, [mode, reduceMotion]);
  useEffect(() => {
    document.documentElement.classList.add(mode === 'station' ? 'station-mode' : 'skp-mode');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // rýchle ručné prepnutie: potiahnutie po hornej lište
  const barSwipe = useRef<number | null>(null);

  let headline: string;
  if (!hasToken) headline = 'Chýba párovací kód – otvor adresu z konzoly služby (…?t=kód).';
  else if (!online) headline = connection === 'connecting' ? 'Pripájam sa k službe na PC…' : 'Služba na PC neodpovedá, skúšam znova…';
  else if (sketchup?.targetReason === 'ambiguous') headline = `SketchUp: ${sketchup.instances.length} relácie – klikni do tej, ktorú chceš ovládať`;
  else if (!sketchup?.available) headline = 'SketchUp: nedostupný';
  else {
    const extra = sketchup.instances.length > 1 ? ` (${sketchup.instances.length} relácie)` : '';
    headline = `SketchUp: ${sketchup.model ?? '?'} · výber: ${sketchup.selectionCount ?? '?'}${extra}`;
  }
  const modeLabel = pref === 'auto' ? `AUTO · ${mode === 'skp' ? 'SKP' : 'Station'}` : mode === 'skp' ? 'SKP' : 'Station';

  return (
    <div className="screen" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <div className="bg" aria-hidden="true"><img src="/bg.jpg?v=3" alt="" /></div>

      <header
        className="bar"
        onPointerDown={(e) => (barSwipe.current = e.clientX)}
        onPointerUp={(e) => {
          if (barSwipe.current === null) return;
          const dx = e.clientX - barSwipe.current;
          barSwipe.current = null;
          if (dx > 50) setPref('station'); // Station je vpravo → ťah doprava
          else if (dx < -50) setPref('skp');
        }}
      >
        <span className={`dot ${!online ? 'red' : skpReady ? 'green' : 'grey'}`} />
        <span className="state">{headline}</span>
        <span className="mode">{modeLabel}</span>
        <button className="tiny glass" onClick={() => setSettingsOpen(true)} aria-label="Nastavenia">⚙</button>
      </header>

      <main className="main">
        <div ref={stationRef} className={`layer ${shownMode.current === 'station' ? '' : 'hidden'}`}>
          <Station usage={usage} media={media} sendMedia={sendMedia} sendVolume={sendVolume} bigPlayer={bigPlayer} active={mode === 'station'} />
        </div>
        <div ref={skpRef} className={`layer ${shownMode.current === 'skp' ? '' : 'hidden'}`}>
          <Skp online={online} sketchup={sketchup} usage={usage} media={media} lastAck={lastAck} sendCommand={sendCommand} sendMedia={sendMedia} />
        </div>
      </main>

      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        pref={pref}
        setPref={(p) => { setPref(p); setSettingsOpen(false); }}
        led={led}
        toggleLed={toggleLed}
        reduceMotion={reduceMotion}
        setReduceMotion={setReduceMotion}
        info={`${headline}${foreground?.available ? ` · aktívne okno: ${foreground.app ?? '?'}` : ''}`}
      />
    </div>
  );
}

// ---------- displej ----------

let wakeLock: WakeLockSentinel | null = null;
async function requestWakeLock() {
  try {
    if (!('wakeLock' in navigator) || wakeLock) return;
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => (wakeLock = null));
  } catch {
    /* bez bezpečného kontextu alebo bez podpory */
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') requestWakeLock();
});
