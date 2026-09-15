import { useEffect, useRef, useState } from 'react';
import { useService } from './service';

type Flash = { kind: 'ok' | 'error' | 'warn' | 'sent'; text: string; until: number } | null;

const REPLY_TIMEOUT_MS = 3000;

export default function App() {
  const { connection, sketchup, lastAck, sendCommand, hasToken } = useService();
  const [flash, setFlash] = useState<Flash>(null);
  const [pendingId, setPendingId] = useState<string | null>(null); // ID povelu podľa služby
  const pendingSince = useRef(0);
  const seenLastId = useRef<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);

  // potvrdenie od služby (povel zapísaný / odmietnutý)
  useEffect(() => {
    if (!lastAck) return;
    if (lastAck.ok && lastAck.id) {
      setPendingId(lastAck.id);
      pendingSince.current = Date.now();
    } else {
      setPendingId(null);
      setFlash({ kind: 'warn', text: lastAck.error ?? 'Povel odmietnutý.', until: Date.now() + 3000 });
    }
  }, [lastAck]);

  // výsledok z prijímača (cez state.last)
  useEffect(() => {
    const last = sketchup?.last;
    if (!last || last.id === seenLastId.current) return;
    if (seenLastId.current === null && !pendingId) {
      seenLastId.current = last.id; // starý výsledok z minulosti, nezobrazovať
      return;
    }
    seenLastId.current = last.id;
    if (pendingId && last.id !== pendingId) return; // výsledok iného povelu
    setPendingId(null);
    const kind = last.status === 'ok' ? 'ok' : last.status === 'error' ? 'error' : 'warn';
    setFlash({ kind, text: last.message, until: Date.now() + (kind === 'ok' ? 2000 : 3500) });
  }, [sketchup?.last, pendingId]);

  // povel bez odpovede
  useEffect(() => {
    if (pendingId && now - pendingSince.current > REPLY_TIMEOUT_MS) {
      setPendingId(null);
      setFlash({ kind: 'warn', text: 'Bez odpovede zo SketchUpu.', until: Date.now() + 3000 });
    }
  }, [now, pendingId]);

  const online = connection === 'open';
  const ready = online && !!sketchup?.available;
  const activeFlash = flash && flash.until > now ? flash : null;

  const press = () => {
    requestWakeLock();
    if (!ready) {
      setFlash({ kind: 'warn', text: online ? 'SketchUp je nedostupný (prijímač nebeží alebo nie je otvorený model).' : 'Nie je spojenie so službou na PC.', until: Date.now() + 2500 });
      return;
    }
    if (pendingId) return; // ochrana pred rýchlym opakovaním
    const id = sendCommand('focus_selection');
    if (id) {
      setFlash({ kind: 'sent', text: 'Odoslané…', until: Date.now() + REPLY_TIMEOUT_MS + 500 });
      pendingSince.current = Date.now();
      setPendingId('pending'); // dočasné, kým nepríde ack s ID
    }
  };

  const buttonClass = activeFlash ? `btn ${activeFlash.kind}` : pendingId ? 'btn sent' : ready ? 'btn ready' : 'btn off';

  let headline: string;
  if (!hasToken) headline = 'Chýba párovací kód – otvor adresu z konzoly služby (…?t=kód).';
  else if (!online) headline = connection === 'connecting' ? 'Pripájam sa k službe na PC…' : 'Služba na PC neodpovedá, skúšam znova…';
  else if (!sketchup?.available) headline = sketchup?.receiverStatus === 'standby' ? 'SketchUp: iná relácia má prednosť' : 'SketchUp: nedostupný';
  else headline = `Model: ${sketchup.model ?? '?'} · výber: ${sketchup.selectionCount ?? '?'}`;

  const status = activeFlash?.text ?? (ready ? 'Pripravené. Vyber objekt v SketchUpe a stlač tlačidlo.' : '');

  return (
    <div className="screen">
      <header className="top">
        <span className={`dot ${online ? (ready ? 'green' : 'grey') : 'red'}`} />
        <span className="title">N-portal E0</span>
        <span className="target">{headline}</span>
        <button className="tiny" onClick={toggleFullscreen} aria-label="Celá obrazovka">⛶</button>
      </header>

      <main className="center">
        <button className={buttonClass} onClick={press}>
          <FocusIcon />
          <span>Zamerať výber</span>
        </button>
        <p className={`status ${activeFlash?.kind ?? ''}`}>{status}</p>
      </main>
    </div>
  );
}

function FocusIcon() {
  return (
    <svg viewBox="0 0 48 48" width="1em" height="1em" aria-hidden="true">
      <circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" strokeWidth="4" />
      <circle cx="24" cy="24" r="4" fill="currentColor" />
      <path d="M24 2v10M24 36v10M2 24h10M36 24h10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
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
