import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useService, DEMO } from './service';
import type { AgentStatus } from './service';
import Station from './Station';
import { appName } from './MusicCard';
import Skp from './Skp';
import Ai from './Ai';
import Settings from './Settings';
import Ambient from './Ambient';
import Overlay, { type DetailKind } from './Overlay';
import WeatherDetail from './WeatherDetail';
import UsageDetail from './UsageDetail';
import MusicCard from './MusicCard';
import { ProviderLogo } from './Logos';
import { formatDuration } from './time';
import { ledEnabled, setLedEnabled, ledTap, ledLong } from './ledPulse';
import { toggleFullscreen } from './fullscreen';

type Mode = 'station' | 'skp' | 'ai';
export type Pref = 'auto' | Mode;
const ORDER: Mode[] = ['station', 'skp', 'ai']; // poradie vrstiev pre slide prechod a ťah po lište
const PREF_KEY = 'nportal.pref';
const MOTION_KEY = 'nportal.motion';
const AMBIENT_KEY = 'nportal.ambient';
const AMBIENT_DEFAULT_MIN = 5; // ambient po nečinnosti v Station (0 = vypnuté)
const AMBIENT_DEMO_MS = 5000; // `?demo=ambient`: nečakáme minúty, ambient sa zapne po 5 s
const AMBIENT_OUT_MS = 200; // ukončenie: vrstva sa odpojí až po krátkom prelínaní von
const AUTO_DELAY_MS = 400; // ochrana proti preblikávaniu pri rýchlom Alt+Tab
const SLIDE_MS = 480;
const OFFLINE_GRACE_MS = 1500; // krátke výpadky (rýchle znovupripojenie) nezosivia panel
const TOAST_MS = 6000; // toast „agent skončil“ v Station/SKP
const BAR_SWIPE_PX = 50; // ťah po páse = prepnutie režimu
const DOUBLE_TAP_MS = 350; // dve klepnutia do tohto času = celá obrazovka
const TAP_MOVE_PX = 10; // väčší pohyb už nie je klepnutie
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
  const { connection, offlineSince, sketchup, usage, media, foreground, agents, weather, audio, lastAck, sendCommand, sendMedia, sendVolume, sendSeek, hasToken } = useService();
  const [pref, setPref] = useState<Pref>(() => {
    if (DEMO.mode) return DEMO.mode; // `?demo=…&mode=skp` – ukážkový štart v danom režime
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
  const [ambientMin, setAmbientMinState] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(AMBIENT_KEY);
      const v = raw === null ? AMBIENT_DEFAULT_MIN : Number(raw);
      return v === 0 || v === 2 || v === 5 || v === 10 ? v : AMBIENT_DEFAULT_MIN;
    } catch {
      return AMBIENT_DEFAULT_MIN;
    }
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  // ambientný režim: `ambient` = beží, `ambientMounted` drží vrstvu ešte chvíľu kvôli prelínaniu von
  const [ambient, setAmbient] = useState(false);
  const [ambientMounted, setAmbientMounted] = useState(false);
  const idleMs = useRef(0); // 0 = počítadlo nečinnosti nebeží (iný režim, výpadok, nastavenia…)
  const idleTimer = useRef(0);
  const touching = useRef(false);
  const pendingAuto = useRef<Mode | null>(null);

  /** Znovu rozbehne počítadlo nečinnosti (dotyk, koniec ambientu, zmena podmienok). */
  const restartIdle = useCallback(() => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = 0;
    if (idleMs.current > 0) idleTimer.current = window.setTimeout(() => setAmbient(true), idleMs.current);
  }, []);

  const setAmbientMin = (v: number) => {
    setAmbientMinState(v);
    try {
      localStorage.setItem(AMBIENT_KEY, String(v));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (DEMO.mode) return; // ukážkový režim nech neprepíše nastavenie na telefóne
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
  // Je SketchUp aktívnym oknom vo Windows? true = áno, false = v popredí je iná aplikácia,
  // null = sledovanie okna nebeží (vtedy sa podľa aktívneho okna nič neblokuje).
  const sketchupActive: boolean | null = foreground?.available ? foreground.kind === 'sketchup' : null;

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
    restartIdle(); // každý dotyk odkladá ambient
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
  const [toast, setToast] = useState<{ text: string; provider: string; kind: 'waiting' | 'done' } | null>(null);
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
    setAmbient(false); // agent niečo chce – ambient končí, nech je vidieť celý panel
    if (modeRef.current !== 'ai') {
      const n = fresh[fresh.length - 1];
      setToast({
        provider: n.provider,
        kind: n.kind,
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

  // ---------- ambientný režim (veľké hodiny cez celú obrazovku po nečinnosti) ----------
  // Beží len v Station (AUTO aj ručne), so spojením a so zavretými nastaveniami. Keď ktorákoľvek
  // z podmienok padne, ambient hneď končí a počítadlo nečinnosti sa spustí odznova.
  const ambientOk = ambientMin > 0 && mode === 'station' && online && !settingsOpen;
  useEffect(() => {
    if (!ambientOk && ambient) setAmbient(false);
  }, [ambientOk, ambient]);
  useEffect(() => {
    idleMs.current = ambientOk && !ambient ? (DEMO.ambient ? AMBIENT_DEMO_MS : ambientMin * 60000) : 0;
    restartIdle();
  }, [ambientOk, ambient, ambientMin, restartIdle]);
  useEffect(() => {
    if (ambient) {
      setAmbientMounted(true);
      return;
    }
    if (!ambientMounted) return;
    const t = window.setTimeout(() => setAmbientMounted(false), AMBIENT_OUT_MS);
    return () => window.clearTimeout(t);
  }, [ambient, ambientMounted]);

  // ---------- detail cez celú obrazovku (W‑2) ----------
  // Naraz je otvorený najviac jeden detail a vrstva je spoločná pre všetky režimy (Overlay.tsx).
  // Zatvára ho: pás „zavrieť“, 10 s bez dotyku (to rieši Overlay), prepnutie režimu, spustenie
  // ambientu, výpadok spojenia a otvorenie nastavení.
  const [detail, setDetail] = useState<DetailKind | null>(null);
  const closeDetail = useCallback(() => setDetail(null), []);
  const openDetail = useCallback(
    (k: DetailKind) => {
      // hodiny bez dát počasia detail nemajú – klepnutie vtedy nič nemení
      if (k === 'weather' && !(weather?.available && weather.current)) return;
      setDetail(k);
    },
    [weather],
  );
  useEffect(() => {
    setDetail(null); // prepnutie režimu (aj automatické) detail zavrie
  }, [mode]);
  useEffect(() => {
    if (ambient || !online || settingsOpen) setDetail(null);
  }, [ambient, online, settingsOpen]);

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
  const barSwipe = useRef<{ x: number; y: number } | null>(null);
  const barLastTap = useRef(0); // kedy bolo predošlé klepnutie po páse (dvojklik = celá obrazovka)
  const stepMode = (delta: number) => {
    const i = ORDER.indexOf(mode);
    setPref(ORDER[(i + delta + ORDER.length) % ORDER.length]);
  };

  // Dvojklik na horný pás prepne celú obrazovku. Ťah po páse (prepnutie režimu) má prednosť:
  // dvojklik sa počíta len vtedy, keď ani jedno z klepnutí nebolo ťah. Tlačidlá v páse (⚙, štítok)
  // majú vlastné správanie, tie sa do dvojkliku nerátajú.
  const barPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    const st = barSwipe.current;
    barSwipe.current = null;
    if (!st) return;
    const dx = e.clientX - st.x;
    if (dx > BAR_SWIPE_PX || dx < -BAR_SWIPE_PX) {
      barLastTap.current = 0;
      stepMode(dx > 0 ? -1 : 1);
      return;
    }
    const onButton = !!(e.target as HTMLElement | null)?.closest?.('button');
    if (onButton || Math.abs(dx) > TAP_MOVE_PX || Math.abs(e.clientY - st.y) > TAP_MOVE_PX) {
      barLastTap.current = 0; // pohyb medzi klepnutím a ťahom (alebo tlačidlo) dvojklik ruší
      return;
    }
    const now = Date.now();
    if (now - barLastTap.current < DOUBLE_TAP_MS) {
      barLastTap.current = 0;
      ledTap();
      toggleFullscreen();
    } else barLastTap.current = now;
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
    // dostupný, ale v popredí je iná aplikácia – povely v SKP sú zablokované
    const passive = sketchupActive === false ? ' · nie je aktívne okno' : '';
    headline = `SketchUp: ${sketchup.model ?? '?'} · výber: ${sketchup.selectionCount ?? '?'}${extra}${passive}`;
  }
  const modeName = mode === 'skp' ? 'SKP' : mode === 'ai' ? 'AI' : 'Station';
  const modeLabel = pref === 'auto' ? `AUTO · ${modeName}` : modeName;

  return (
    <div className="screen" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <div className="bg" aria-hidden="true"><img src="/bg.jpg?v=3" alt="" /></div>

      <header
        className="bar"
        onPointerDown={(e) => (barSwipe.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={barPointerUp}
        onPointerCancel={() => {
          barSwipe.current = null;
          barLastTap.current = 0;
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
          {/* počas ambientu je Station schovaný pod vrstvou – equalizer ani priebeh skladby netreba kresliť */}
          <Station usage={usage} media={media} agents={agents} weather={weather} audio={audio} online={online} sendMedia={sendMedia} sendVolume={sendVolume} sendSeek={sendSeek} bigPlayer={bigPlayer} active={mode === 'station' && !ambient} onDetail={openDetail} />
        </div>
        <div ref={skpRef} className={`layer ${shownMode.current === 'skp' ? '' : 'hidden'}`}>
          <Skp online={online} sketchup={sketchup} sketchupActive={sketchupActive} usage={usage} media={media} agents={agents} weather={weather} lastAck={lastAck} sendCommand={sendCommand} sendMedia={sendMedia} active={mode === 'skp'} onDetail={openDetail} />
        </div>
        <div ref={aiRef} className={`layer ${shownMode.current === 'ai' ? '' : 'hidden'}`}>
          <Ai agents={agents} online={online} usage={usage} media={media} weather={weather} sendMedia={sendMedia} active={mode === 'ai'} onDetail={openDetail} />
        </div>

        {/* detail cez celú obrazovku: počasie, usage, prehrávač (len z pásu SKP/AI) */}
        <Overlay
          kind={detail}
          onClose={closeDetail}
          render={(k) =>
            k === 'weather' ? (
              <WeatherDetail weather={weather} />
            ) : k === 'usage' ? (
              <UsageDetail usage={usage} />
            ) : (
              <MusicCard
                media={media}
                audio={audio}
                online={online}
                sendMedia={sendMedia}
                sendVolume={sendVolume}
                sendSeek={sendSeek}
                active
                className="card music"
              />
            )
          }
        />

        {/* toast o agentovi – len v Station/SKP, v režime AI je stav vidno na kartách, v ambiente stačí štítok */}
        <div className={`toast glass agent-toast ${toast ? toast.kind : ''} ${toast && mode !== 'ai' && !ambient ? 'show' : ''}`} aria-live="polite">
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
        ambientMin={ambientMin}
        setAmbientMin={setAmbientMin}
        info={`${headline}${foreground?.available ? ` · aktívne okno: ${foreground.app ?? '?'}` : ''}`}
      />

      {ambientMounted && (
        <Ambient
          visible={ambient}
          usage={usage}
          agents={online ? agents : null}
          media={media}
          audio={audio}
          weather={weather}
          notice={notice}
          onExit={() => {
            setAmbient(false);
            requestWakeLock();
          }}
          demoNight={DEMO.night}
          demoPhoto={DEMO.photo}
        />
      )}
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
