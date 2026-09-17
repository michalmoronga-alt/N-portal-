// Nastavenia (ozubené koliesko vpravo hore): režim, LED spätná väzba, celá obrazovka, obmedzený pohyb.
import type { Pref } from './App';

interface Props {
  open: boolean;
  onClose: () => void;
  pref: Pref;
  setPref: (p: Pref) => void;
  led: boolean;
  toggleLed: () => void;
  reduceMotion: boolean;
  setReduceMotion: (v: boolean) => void;
  info: string; // stav spojenia / cieľová relácia
}

export default function Settings({ open, onClose, pref, setPref, led, toggleLed, reduceMotion, setReduceMotion, info }: Props) {
  return (
    <>
      <div className={`scrim ${open ? 'show' : ''}`} onClick={onClose} />
      <aside className={`drawer glass ${open ? 'open' : ''}`} aria-hidden={!open}>
        <h2>Nastavenia</h2>

        <label>Režim panela</label>
        <div className="seg" role="tablist">
          {(['auto', 'station', 'skp', 'ai'] as Pref[]).map((p) => (
            <button key={p} role="tab" className={pref === p ? 'on' : ''} onClick={() => setPref(p)}>
              {p === 'auto' ? 'AUTO' : p === 'station' ? 'Station' : p === 'skp' ? 'SKP' : 'AI'}
            </button>
          ))}
        </div>
        <p className="note">AUTO prepína podľa aktívneho okna na PC (SketchUp → SKP, Claude/Codex → AI). Rýchle prepnutie: potiahni prstom po hornej lište.</p>

        <label>Spätná väzba zadnými LED</label>
        <div className="seg">
          <button className={led ? 'on' : ''} onClick={() => !led && toggleLed()}>Zapnutá</button>
          <button className={!led ? 'on' : ''} onClick={() => led && toggleLed()}>Vypnutá</button>
        </div>

        <label>Pohyb</label>
        <div className="seg">
          <button className={!reduceMotion ? 'on' : ''} onClick={() => setReduceMotion(false)}>Plné animácie</button>
          <button className={reduceMotion ? 'on' : ''} onClick={() => setReduceMotion(true)}>Obmedziť</button>
        </div>

        <button className="demo" onClick={toggleFullscreen}>⛶ Celá obrazovka zapnúť / vypnúť</button>

        <p className="note">{info}</p>
        <button className="demo" onClick={onClose}>Zavrieť</button>
      </aside>
    </>
  );
}

export function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
}
