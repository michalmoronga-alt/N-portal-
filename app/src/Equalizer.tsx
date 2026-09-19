// Equalizer – tvar A „polárna žiara“. Dva varianty:
//   `card` = hudobná karta v Station (34 stĺpcov, mock `app/public/mock6.html`),
//   `wide` = ambientný režim cez celú šírku (56 stĺpcov, širší profil – mock `app/public/mock7.html`).
// Kreslenie je 1 : 1 port mockov (funkcia `drawA`): mäkké stĺpce s náhodným semenom a rýchlosťou,
// v strede vyššie, biele jadro a antracitový tieň vedľa.
// Sila a rozmazanie sú v styles.css (`.music .eq` a `.amb-music .eq` – schválené Michalom).
//
// Batéria starého telefónu: úroveň zvuku chodí zo služby ~20× za sekundu do jedného objektu
// v `useRef` (žiadny React stav), loop beží len keď je Station viditeľný, stránka na obrazovke
// a hudba naozaj hrá. Po sekunde ticha stĺpce dopadnú na nulu a loop sa zastaví; prvá správa
// s úrovňou > 0 ho cez `audio.current.wake` prebudí.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { setAudioWake, type AudioLevel } from './audioLevel';

export type EqVariant = 'card' | 'wide';

interface Props {
  /** živá úroveň zvuku z PC (mimo React stavu) */
  audio: RefObject<AudioLevel>;
  /** obrazovka s equalizerom je viditeľná */
  active: boolean;
  /** 'card' = hudobná karta v Station (predvolené), 'wide' = ambient cez celú šírku */
  variant?: EqVariant;
}

const BARS: Record<EqVariant, number> = { card: 34, wide: 56 }; // počet stĺpcov (ako v mockoch)
// koľko výšky má krajný stĺpec; zvyšok dopĺňa stred (card 0,35 + 0,65 × stred, wide 0,25 + 0,75 × stred)
const EDGE: Record<EqVariant, number> = { card: 0.35, wide: 0.25 };
const QUIET_MS = 1000; // ticho dlhšie než sekunda = pauza → dokresliť a zastaviť
const STALE_MS = 1500; // bez novej správy toľko času berieme ako ticho (služba pri pauze mlčí)
const EPS = 0.004; // pod touto úrovňou už nie je čo kresliť

interface Bar {
  v: number;
  seed: number;
  spd: number;
}

const newBars = (n: number): Bar[] => Array.from({ length: n }, () => ({ v: 0, seed: Math.random() * 6.28, spd: 0.7 + Math.random() * 1.1 }));

/** Jedna snímka „polárnej žiary“; vracia najvyšší stĺpec, aby loop vedel, kedy je už dokreslené. */
function drawA(ctx: CanvasRenderingContext2D, bars: Bar[], t: number, lv: number, W: number, H: number, edge: number): number {
  const N = bars.length;
  const gap = W / N;
  const bw = gap * 0.62;
  let max = 0;
  for (let i = 0; i < N; i++) {
    const b = bars[i];
    const center = 1 - Math.abs(i - (N - 1) / 2) / ((N - 1) / 2); // v strede vyššie
    const noise = 0.55 + 0.45 * Math.sin(t * b.spd + b.seed) * Math.sin(t * 0.37 + b.seed * 2);
    const target = lv * (edge + (1 - edge) * center) * noise;
    b.v += (target - b.v) * 0.18; // vyhladenie medzi správami zo služby
    if (b.v > max) max = b.v;
    const h = Math.max(2, b.v * H * 0.95);
    const x = i * gap + (gap - bw) / 2;
    // antracitový tieň mierne vpravo a nižšie (hĺbka)
    let g = ctx.createLinearGradient(0, H - h, 0, H);
    g.addColorStop(0, 'rgba(30,34,40,0)');
    g.addColorStop(0.5, 'rgba(30,34,40,.55)');
    g.addColorStop(1, 'rgba(30,34,40,.75)');
    ctx.fillStyle = g;
    ctx.fillRect(x + bw * 0.35, H - h * 0.92, bw, h * 0.92);
    // biele jadro
    g = ctx.createLinearGradient(0, H - h, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.35, 'rgba(255,255,255,.55)');
    g.addColorStop(1, 'rgba(255,255,255,.9)');
    ctx.fillStyle = g;
    ctx.fillRect(x, H - h, bw, h);
  }
  return max;
}

const reduceOn = () => typeof document !== 'undefined' && document.documentElement.classList.contains('reduce');

let loopRunning = false;
let framesDrawn = 0;

/** Beží loop equalizera a koľko snímok už nakreslil – na overenie v konzole. */
export function eqStats() {
  return { running: loopRunning, frames: framesDrawn };
}

export default function Equalizer({ audio, active, variant = 'card' }: Props) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const barsRef = useRef<Bar[] | null>(null);
  // „obmedziť pohyb“ sa prepína v nastaveniach za behu (trieda na <html>) – equalizer vtedy zmizne
  const [reduce, setReduce] = useState(reduceOn);
  useEffect(() => {
    const obs = new MutationObserver(() => setReduce(reduceOn()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (reduce || !active) return;
    const cv = cvRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    if (!barsRef.current || barsRef.current.length !== BARS[variant]) barsRef.current = newBars(BARS[variant]);
    const bars = barsRef.current;
    const edge = EDGE[variant];
    const a = audio.current;
    let raf = 0;
    let quietSince = 0;
    let dead = false;

    // Rozmer podľa skutočnej veľkosti karty; devicePixelRatio zámerne 1 (starý telefón, blur to
    // zakryje). Karta mení šírku aj bez zmeny okna (väčší prehrávač, otvorený detail usage),
    // preto ju sledujeme cez ResizeObserver; drobné zmeny počas prechodu ignorujeme.
    const resize = () => {
      const r = cv.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      if (Math.abs(w - cv.width) < 2 && Math.abs(h - cv.height) < 2) return;
      cv.width = w;
      cv.height = h;
    };
    resize();

    const stop = (why: string) => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (!loopRunning) return;
      loopRunning = false;
      if (import.meta.env.DEV) console.info(`[n-portal] equalizer: loop stop (${why})`);
    };

    const frame = (now: number) => {
      raf = 0;
      framesDrawn++;
      const fresh = a.at > 0 && Date.now() - a.at < STALE_MS;
      const lv = fresh ? a.level : 0; // služba pri pauze prestane posielať → ticho
      const W = cv.width;
      const H = cv.height;
      ctx.clearRect(0, 0, W, H);
      const max = drawA(ctx, bars, now / 1000, lv, W, H, edge);
      if (lv > EPS) quietSince = 0;
      else if (!quietSince) quietSince = now;
      // pauza alebo ticho: nechaj stĺpce dopadnúť na nulu a potom loop zastav
      if (quietSince && now - quietSince > QUIET_MS && max < EPS) {
        ctx.clearRect(0, 0, W, H);
        stop('ticho');
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      if (dead || raf || document.visibilityState !== 'visible') return;
      quietSince = 0;
      loopRunning = true;
      if (import.meta.env.DEV) console.info('[n-portal] equalizer: loop štart');
      raf = requestAnimationFrame(frame);
    };

    /** hrá práve teraz hudba? (čerstvá správa s úrovňou nad nulou) */
    const playing = () => a.at > 0 && Date.now() - a.at < STALE_MS && a.level > 0;

    setAudioWake(a, wake);
    const onResize = () => {
      resize();
      if (playing()) wake();
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') stop('stránka v pozadí');
      else if (playing()) wake();
    };
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisible);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize);
    ro?.observe(cv);
    if (playing()) wake(); // hudba už hrá

    return () => {
      dead = true;
      stop('karta nie je vidieť');
      ro?.disconnect();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisible);
      if (a.wake === wake) setAudioWake(a, null);
    };
  }, [audio, active, reduce, variant]);

  if (reduce) return null; // „obmedziť pohyb“: equalizer sa nekreslí vôbec
  return <canvas className="eq" ref={cvRef} aria-hidden="true" />;
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as Window & { eqStats?: typeof eqStats }).eqStats = eqStats;
}
