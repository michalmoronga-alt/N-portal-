// Nastavenia (ozubené koliesko vpravo hore): režim, ambient po nečinnosti, LED spätná väzba,
// celá obrazovka, obmedzený pohyb.
import type { Pref } from './App';
import { toggleFullscreen } from './fullscreen';

interface Props {
  open: boolean;
  onClose: () => void;
  pref: Pref;
  setPref: (p: Pref) => void;
  led: boolean;
  toggleLed: () => void;
  reduceMotion: boolean;
  setReduceMotion: (v: boolean) => void;
  /** ambient po nečinnosti v Station: 0 = vypnuté, inak minúty */
  ambientMin: number;
  setAmbientMin: (v: number) => void;
  info: string; // stav spojenia / cieľová relácia
}

const AMBIENT_CHOICES = [0, 2, 5, 10];

export default function Settings({ open, onClose, pref, setPref, led, toggleLed, reduceMotion, setReduceMotion, ambientMin, setAmbientMin, info }: Props) {
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

        <label>Ambient po nečinnosti</label>
        <div className="seg">
          {AMBIENT_CHOICES.map((v) => (
            <button key={v} className={ambientMin === v ? 'on' : ''} onClick={() => setAmbientMin(v)}>
              {v === 0 ? 'Vypnuté' : `${v} min`}
            </button>
          ))}
        </div>
        <p className="note">V Station sa po tomto čase bez dotyku zapnú veľké hodiny cez celú obrazovku. Dotyk ich zruší; v SKP a AI sa nezapnú.</p>

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
        <p className="note">(alebo dvojklik na horný pás)</p>

        <p className="note">{info}</p>
        <button className="demo" onClick={onClose}>Zavrieť</button>
      </aside>
    </>
  );
}
