import { useEffect, useState } from 'react';
import { useService } from './service';
import Station from './Station';
import Skp from './Skp';

type Mode = 'station' | 'skp';
const MODE_KEY = 'nportal.mode';

export default function App() {
  const { connection, sketchup, usage, media, lastAck, sendCommand, sendMedia, hasToken } = useService();
  const [mode, setMode] = useState<Mode>(() => {
    try {
      return (localStorage.getItem(MODE_KEY) as Mode) || 'station';
    } catch {
      return 'station';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  useEffect(() => {
    requestWakeLock();
  }, []);

  const online = connection === 'open';
  const skpReady = online && !!sketchup?.available;

  let headline: string;
  if (!hasToken) headline = 'Chýba párovací kód – otvor adresu z konzoly služby (…?t=kód).';
  else if (!online) headline = connection === 'connecting' ? 'Pripájam sa k službe na PC…' : 'Služba na PC neodpovedá, skúšam znova…';
  else if (!sketchup?.available) headline = sketchup?.receiverStatus === 'standby' ? 'SketchUp: iná relácia má prednosť' : 'SketchUp: nedostupný';
  else headline = `SketchUp: ${sketchup.model ?? '?'} · výber: ${sketchup.selectionCount ?? '?'}`;

  return (
    <div className="screen" onPointerDown={requestWakeLock}>
      <header className="bar">
        <div className="tabs" role="tablist">
          <button role="tab" className={`tab ${mode === 'station' ? 'on' : ''}`} onClick={() => setMode('station')}>Station</button>
          <button role="tab" className={`tab ${mode === 'skp' ? 'on' : ''}`} onClick={() => setMode('skp')}>SKP</button>
        </div>
        <span className={`dot ${!online ? 'red' : skpReady ? 'green' : 'grey'}`} />
        <span className="state">{headline}</span>
        <span className="brand">NOXUN</span>
        <button className="tiny" onClick={toggleFullscreen} aria-label="Celá obrazovka">⛶</button>
      </header>

      {mode === 'station' ? (
        <Station usage={usage} media={media} sendMedia={sendMedia} />
      ) : (
        <Skp online={online} sketchup={sketchup} usage={usage} media={media} lastAck={lastAck} sendCommand={sendCommand} sendMedia={sendMedia} />
      )}
    </div>
  );
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
