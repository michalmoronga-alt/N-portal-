import { useEffect, useRef, useState } from 'react';
import { useService } from './service';
import Station from './Station';
import Skp from './Skp';
import { ledEnabled, setLedEnabled, ledTap } from './ledPulse';

type Mode = 'station' | 'skp';
type Pref = 'auto' | Mode;
const PREF_KEY = 'nportal.pref';
const AUTO_DELAY_MS = 400; // ochrana proti preblikávaniu pri rýchlom Alt+Tab

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
  const toggleLed = () => {
    const v = !led;
    setLed(v);
    setLedEnabled(v);
    if (v) ledTap();
  };
  const touching = useRef(false); // počas dotyku neprepínať rozloženie
  const pendingAuto = useRef<Mode | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, pref);
    } catch {
      /* ignore */
    }
  }, [pref]);

  useEffect(() => {
    requestWakeLock();
  }, []);

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

  let headline: string;
  if (!hasToken) headline = 'Chýba párovací kód – otvor adresu z konzoly služby (…?t=kód).';
  else if (!online) headline = connection === 'connecting' ? 'Pripájam sa k službe na PC…' : 'Služba na PC neodpovedá, skúšam znova…';
  else if (sketchup?.targetReason === 'ambiguous') headline = `SketchUp: ${sketchup.instances.length} relácie – klikni do tej, ktorú chceš ovládať`;
  else if (!sketchup?.available) headline = 'SketchUp: nedostupný';
  else {
    const extra = sketchup.instances.length > 1 ? ` (${sketchup.instances.length} relácie)` : '';
    headline = `SketchUp: ${sketchup.model ?? '?'} · výber: ${sketchup.selectionCount ?? '?'}${extra}`;
  }

  const fgLabel = foreground?.available ? fgName(foreground.app) : '';

  return (
    <div className="screen" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <header className="bar">
        <div className="tabs" role="tablist">
          <button role="tab" className={`tab ${pref === 'auto' ? 'on' : ''}`} onClick={() => setPref('auto')}>AUTO</button>
          <button role="tab" className={`tab ${pref === 'station' ? 'on' : pref === 'auto' && mode === 'station' ? 'auto' : ''}`} onClick={() => setPref('station')}>Station</button>
          <button role="tab" className={`tab ${pref === 'skp' ? 'on' : pref === 'auto' && mode === 'skp' ? 'auto' : ''}`} onClick={() => setPref('skp')}>SKP</button>
        </div>
        <span className={`dot ${!online ? 'red' : skpReady ? 'green' : 'grey'}`} />
        <span className="state">{headline}</span>
        {fgLabel && <span className="fg" title="Aktívne okno na PC">{fgLabel}</span>}
        <span className="brand">NOXUN</span>
        <button className={`tiny led ${led ? 'led-on' : ''}`} onClick={toggleLed} aria-label="Spätná väzba LED" title="Zadné LED pri klepnutí">💡</button>
        <button className="tiny" onClick={toggleFullscreen} aria-label="Celá obrazovka">⛶</button>
      </header>

      {mode === 'station' ? (
        <Station usage={usage} media={media} sendMedia={sendMedia} sendVolume={sendVolume} bigPlayer={bigPlayer} />
      ) : (
        <Skp online={online} sketchup={sketchup} usage={usage} media={media} lastAck={lastAck} sendCommand={sendCommand} sendMedia={sendMedia} />
      )}
    </div>
  );
}

function fgName(app: string | null): string {
  const a = (app ?? '').toLowerCase();
  if (a === 'sketchup') return 'SketchUp';
  if (a === 'chrome') return 'Chrome';
  if (a === 'explorer') return 'Plocha';
  if (a === 'msedge') return 'Edge';
  if (a === 'firefox') return 'Firefox';
  return app ?? '';
}

// ---------- displej a celá obrazovka ----------

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

function toggleFullscreen() {
  requestWakeLock();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
}
