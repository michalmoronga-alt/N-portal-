import { useEffect, useRef, useState } from 'react';
import { useService } from './service';
import type { AgentStatus } from './service';
import Station, { appName } from './Station';
import Skp from './Skp';
import Ai from './Ai';
import Settings from './Settings';
import { ProviderLogo } from './Logos';
import { formatDuration } from './time';
import { ledEnabled, setLedEnabled, ledTap, ledLong } from './ledPulse';

type Mode = 'station' | 'skp' | 'ai';
export type Pref = 'auto' | Mode;
const ORDER: Mode[] = ['station', 'skp', 'ai']; // poradie vrstiev pre slide prechod a ťah po lište
const PREF_KEY = 'nportal.pref';
const MOTION_KEY = 'nportal.motion';
const AUTO_DELAY_MS = 400; // ochrana proti preblikávaniu pri rýchlom Alt+Tab
const SLIDE_MS = 480;
const OFFLINE_GRACE_MS = 1500; // krátke výpadky (rýchle znovupripojenie) nezosivia panel
const TOAST_MS = 6000; // toast „agent skončil“ v Station/SKP
const EASE = 'cubic-bezier(.2,.8,.2,1)';

/** Upozornenie o agentovi v hornom páse (prechod pracuje → čaká / hotovo). */
interface Notice {
  id: string;
  kind: 'waiting' | 'done';
  project: string;
  provider: string;
  runMs: number | null;
}

export default function App() {
  const { connection, offlineSince, sketchup, usage, media, foreground, agents, lastAck, sendCommand, sendMedia, sendVolume, hasToken } = useService();
  const [pref, setPref] = useState<Pref>(() => {
    try {
      const v = localStorage.getItem(PREF_KEY);
      return v === 'auto' || v === 'station' || v === 'skp' || v === 'ai' ? v : 'auto';
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

  // celoplošný stav výpadku: po krátkej tolerancii zosivie panel a hore je pruh; späť s prechodom
  const [offlineShown, setOfflineShown] = useState(false);
  const [, offlineTick] = useState(0);
  useEffect(() => {
    if (online) {
      setOfflineShown(false);
      document.documentElement.classList.remove('offline');
      return;
    }
    const t = window.setTimeout(() => {
      setOfflineShown(true);
      document.documentElement.classList.add('offline');
    }, OFFLINE_GRACE_MS);
    return () => window.clearTimeout(t);
  }, [online]);
  useEffect(() => {
    if (!offlineShown) return;
    const t = window.setInterval(() => offlineTick((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, [offlineShown]);
  const offlineSec = offlineSince ? Math.max(0, Math.round((Date.now() - offlineSince) / 1000)) : 0;
  const offlineText = !hasToken
    ? 'Chýba párovací kód'
    : connection === 'connecting' && offlineSec < 5
      ? 'Pripájam sa k PC…'
      : `PC neodpovedá · skúšam znova${offlineSec >= 5 ? ` · ${offlineSec < 90 ? `${offlineSec} s` : `${Math.round(offlineSec / 60)} min`}` : ''}`;

  // AUTO: aktívny Claude/Codex → AI, aktívny SketchUp s pripraveným prijímačom → SKP, inak Station.
  // S oneskorením a nie počas dotyku.
  const desiredAuto: Mode = foreground?.kind === 'ai' ? 'ai' : foreground?.kind === 'sketchup' && skpReady ? 'skp' : 'station';
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

  // ---------- upozornenie na agenta naprieč režimami ----------
  const [notices, setNotices] = useState<Notice[]>([]);
  const [toast, setToast] = useState<{ text: string; provider: string } | null>(null);
  const prevStatus = useRef<Map<string, AgentStatus> | null>(null);
  const modeRef = useRef<Mode>(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (!agents) return;
    const cur = new Map<string, AgentStatus>();
    for (const a of agents.agents) cur.set(a.id, a.status);
    const prev = prevStatus.current;
    prevStatus.current = cur;
    if (!prev) return; // prvé načítanie: len si zapamätaj stav, štítok pre už čakajúcich nezobrazuj

    const fresh: Notice[] = [];
    for (const a of agents.agents) {
      if (prev.get(a.id) === 'busy' && (a.status === 'waiting' || a.status === 'done')) {
        fresh.push({ id: a.id, kind: a.status, project: a.project, provider: a.provider, runMs: a.startedAt ? a.since - a.startedAt : null });
      }
    }
    setNotices((old) => {
      // štítok drž len kým je agent stále v hlásenom stave
      const kept = old.filter((n) => cur.get(n.id) === n.kind && !fresh.some((f) => f.id === n.id));
      return kept.length === old.length && !fresh.length ? old : [...kept, ...fresh];
    });
    if (!fresh.length) return;
    ledLong();
    if (modeRef.current !== 'ai') {
      const n = fresh[fresh.length - 1];
      setToast({
        provider: n.provider,
        text: n.kind === 'done' ? `${n.project} skončil${n.runMs ? ` (${formatDuration(n.runMs)})` : ''}` : `${n.project} čaká na teba`,
      });
    }
  }, [agents]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [toast]);

  const notice = notices.length ? notices[notices.length - 1] : null;
  const noticeExtra = notices.length - 1;

  // ---------- slide prechod (Station – SKP – AI; do vyššieho indexu vrstva odchádza doľava) ----------
  const stationRef = useRef<HTMLDivElement>(null);
  const skpRef = useRef<HTMLDivElement>(null);
  const aiRef = useRef<HTMLDivElement>(null);
  const layerRefs = useRef({ station: stationRef, skp: skpRef, ai: aiRef });
  const shownMode = useRef<Mode>(mode);
  const [, force] = useState(0);
  useEffect(() => {
    const prev = shownMode.current;
    if (prev === mode) return;
    const hide = layerRefs.current[prev].current;
    const show = layerRefs.current[mode].current;
    const html = document.documentElement;
    html.classList.toggle('station-mode', mode === 'station');
    html.classList.toggle('skp-mode', mode === 'skp');
    html.classList.toggle('ai-mode', mode === 'ai');
    if (!hide || !show) {
      shownMode.current = mode;
      force((x) => x + 1);
      return;
    }
    const D = reduceMotion ? 120 : SLIDE_MS;
    const dir = ORDER.indexOf(mode) > ORDER.indexOf(prev) ? -1 : 1; // vyšší index: stará vrstva odchádza doľava
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
    document.documentElement.classList.add(`${mode}-mode`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // rýchle ručné prepnutie: potiahnutie po hornej lište (doľava = ďalší režim, doprava = predošlý)
  const barSwipe = useRef<number | null>(null);
  const stepMode = (delta: number) => {
    const i = ORDER.indexOf(mode);
    setPref(ORDER[(i + delta + ORDER.length) % ORDER.length]);
  };

  const fgLabel = foreground?.available && foreground.app ? cap(appName(foreground.app)) : null;
  let headline: string;
  if (!hasToken) headline = 'Chýba párovací kód – otvor adresu z konzoly služby (…?t=kód).';
  else if (!online) headline = connection === 'connecting' ? 'Pripájam sa k službe na PC…' : 'Služba na PC neodpovedá, skúšam znova…';
  else if (mode === 'ai') {
    const n = agents?.available ? agents.agents.length : 0;
    headline = `Aktívne okno: ${fgLabel ?? '?'}${n ? ` · ${n} ${n === 1 ? 'relácia' : n <= 4 ? 'relácie' : 'relácií'}` : ''}`;
  } else if (sketchup?.targetReason === 'ambiguous') headline = `SketchUp: ${sketchup.instances.length} relácie – klikni do tej, ktorú chceš ovládať`;
  else if (!sketchup?.available) headline = 'SketchUp: nedostupný';
  else {
    const extra = sketchup.instances.length > 1 ? ` (${sketchup.instances.length} relácie)` : '';
    headline = `SketchUp: ${sketchup.model ?? '?'} · výber: ${sketchup.selectionCount ?? '?'}${extra}`;
  }
  const modeName = mode === 'skp' ? 'SKP' : mode === 'ai' ? 'AI' : 'Station';
  const modeLabel = pref === 'auto' ? `AUTO · ${modeName}` : modeName;

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
          if (dx > 50) stepMode(-1);
          else if (dx < -50) stepMode(1);
        }}
      >
        <span className={`dot ${!online ? 'red' : skpReady ? 'green' : 'grey'}`} />
        <span className="state">{headline}</span>
        {notice && (
          <button
            className={`badge ${notice.kind === 'done' ? 'done' : 'wait'}`}
            onClick={() => setNotices([])}
            aria-label="Skryť upozornenie"
          >
            <ProviderLogo provider={notice.provider} colored />
            <span className="bt">{notice.project} {notice.kind === 'done' ? 'hotovo' : 'čaká na teba'}</span>
            {noticeExtra > 0 && <span className="more">+{noticeExtra}</span>}
          </button>
        )}
        <span className="mode">{modeLabel}</span>
        <button className="tiny glass" onClick={() => setSettingsOpen(true)} aria-label="Nastavenia">⚙</button>
      </header>

      <div className={`offline-bar glass ${offlineShown ? 'show' : ''}`} role="status" aria-live="polite">
        <span className="dot red" />
        <span>{offlineText}</span>
      </div>

      <main className="main">
        <div ref={stationRef} className={`layer ${shownMode.current === 'station' ? '' : 'hidden'}`}>
          <Station usage={usage} media={media} online={online} sendMedia={sendMedia} sendVolume={sendVolume} bigPlayer={bigPlayer} active={mode === 'station'} />
        </div>
        <div ref={skpRef} className={`layer ${shownMode.current === 'skp' ? '' : 'hidden'}`}>
          <Skp online={online} sketchup={sketchup} usage={usage} media={media} lastAck={lastAck} sendCommand={sendCommand} sendMedia={sendMedia} />
        </div>
        <div ref={aiRef} className={`layer ${shownMode.current === 'ai' ? '' : 'hidden'}`}>
          <Ai agents={agents} usage={usage} media={media} online={online} sendMedia={sendMedia} />
        </div>

        {/* toast o agentovi – len v Station/SKP, v režime AI je stav vidno na kartách */}
        <div className={`toast glass agent-toast ${toast && mode !== 'ai' ? 'show' : ''}`} aria-live="polite">
          {toast && <ProviderLogo provider={toast.provider} colored />}
          <span>{toast?.text ?? ''}</span>
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

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
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
