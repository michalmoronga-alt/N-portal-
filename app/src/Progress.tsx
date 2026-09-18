// Priebeh skladby. Služba hlási pozíciu ~1× za sekundu, panel ju medzi hláseniami dopočítava
// z `positionAt`, aby sa prúžok hýbal plynulo. Ten istý komponent používa hudobná karta v Station
// (hrubší prúžok, časy, posun ťahom) aj bočný pás SKP/AI (len tenká linka).
//
// Pravidlá: pri neznámej dĺžke alebo bez hlásenej pozície je prúžok skrytý, ale miesto ostáva
// rezervované (karta pri prepnutí skladby neposkočí). Posun sa odošle až po pustení prsta – jeden
// povel – a náhľad sa drží, kým ho PC nepotvrdí, aby hodnota neskákala tam a späť.
import { useEffect, useRef, useState } from 'react';
import type { MediaState } from './service';
import { formatClock } from './time';

interface Props {
  media: MediaState | null;
  /** obrazovka je viditeľná – inak sa neprekresľuje */
  active: boolean;
  /** 'card' = hudobná karta v Station, 'mini' = bočný pás SKP/AI (len linka, bez posunu) */
  variant: 'card' | 'mini';
  /** posun v skladbe; bez neho (alebo pri `canSeek === false`) prúžok len zobrazuje */
  onSeek?: (ms: number) => void;
}

const TICK_MS = 250; // prekresľovanie počas prehrávania
const SETTLE_MS = 1000; // menší rozdiel oproti službe počkáme, väčší skočí
const PENDING_MS = 3000; // ako dlho držať náhľad po posune, kým ho PC potvrdí
const PENDING_NEAR_MS = 1500; // pozícia takto blízko cieľu = PC posun vykonal

export default function Progress({ media, active, variant, onSeek }: Props) {
  const duration = media?.duration ?? null;
  const position = media?.position ?? null;
  const positionAt = media?.positionAt ?? null;
  const rate = media?.rate || 1;
  const playing = media?.status === 'Playing';
  const ready = !!media?.available && duration !== null && duration > 0 && position !== null;
  const canSeek = ready && !!media?.canSeek && !!onSeek;
  const track = `${media?.app ?? ''}|${media?.title ?? ''}`;

  // ---------- plynulá pozícia ----------
  const [live, setLive] = useState<number | null>(null);
  const shown = useRef<number | null>(null); // naposledy zobrazená hodnota (kvôli vyrovnaniu)
  const trackRef = useRef('');

  useEffect(() => {
    if (trackRef.current !== track) {
      trackRef.current = track;
      shown.current = null; // iná skladba: vyrovnávať nie je čo
    }
    if (!ready || duration === null || position === null) {
      shown.current = null;
      setLive(null);
      return;
    }
    const compute = () => {
      const elapsed = playing && positionAt ? (Date.now() - positionAt) * rate : 0;
      let v = Math.max(0, Math.min(duration, position + elapsed));
      const prev = shown.current;
      // nová správa zo služby nesmie prúžok trhnúť dozadu o pár pixelov – malý rozdiel počkáme
      if (prev !== null && v < prev && prev - v < SETTLE_MS) v = Math.min(prev, duration);
      shown.current = v;
      setLive(v);
    };
    compute();
    if (!playing || !active) return;
    const t = window.setInterval(compute, TICK_MS);
    return () => window.clearInterval(t);
  }, [ready, playing, active, position, positionAt, rate, duration, track]);

  // ---------- posun ťahom ----------
  const drag = useRef<{ id: number; left: number; width: number } | null>(null);
  const [preview, setPreview] = useState<number | null>(null); // počas ťahu
  const [pending, setPending] = useState<number | null>(null); // po pustení, kým to PC nepotvrdí
  const pendingUntil = useRef(0);

  useEffect(() => {
    if (pending === null) return;
    if (position !== null && Math.abs(position - pending) < PENDING_NEAR_MS) {
      setPending(null);
      return;
    }
    const left = pendingUntil.current - Date.now();
    if (left <= 0) {
      setPending(null);
      return;
    }
    const t = window.setTimeout(() => setPending(null), left);
    return () => window.clearTimeout(t);
  }, [pending, position, positionAt]);

  // náhľad stratí zmysel, keď prehrávač prestane hlásiť pozíciu alebo sa zmení skladba
  useEffect(() => {
    if (ready) return;
    drag.current = null;
    setPreview(null);
    setPending(null);
  }, [ready, track]);

  const msAt = (clientX: number, left: number, width: number) =>
    duration === null ? 0 : Math.max(0, Math.min(duration, ((clientX - left) / (width || 1)) * duration));

  const view = preview ?? pending ?? live;
  const pct = ready && view !== null && duration ? Math.max(0, Math.min(100, (view / duration) * 100)) : 0;
  const dragging = preview !== null;

  if (variant === 'mini') {
    return (
      <div className={`prog-wrap mini ${ready ? 'on' : ''}`} aria-hidden="true">
        <div className="prog"><b style={{ width: `${pct}%` }} /></div>
      </div>
    );
  }

  return (
    <div className={`prog-wrap card ${ready ? 'on' : ''} ${dragging ? 'seeking' : ''}`}>
      <div
        className="prog-hit"
        role="slider"
        aria-label="Priebeh skladby"
        aria-valuemin={0}
        aria-valuemax={duration ?? 0}
        aria-valuenow={Math.round(view ?? 0)}
        tabIndex={-1}
        onPointerDown={(e) => {
          if (!canSeek) return;
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          drag.current = { id: e.pointerId, left: r.left, width: r.width };
          try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          } catch {
            /* prst už nie je aktívny – ťah funguje aj bez zachytenia */
          }
          setPreview(msAt(e.clientX, r.left, r.width));
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          setPreview(msAt(e.clientX, d.left, d.width));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          drag.current = null;
          const ms = Math.round(msAt(e.clientX, d.left, d.width));
          setPreview(null);
          pendingUntil.current = Date.now() + PENDING_MS;
          setPending(ms);
          onSeek?.(ms);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setPreview(null);
        }}
      >
        <div className="prog"><b style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="prog-times">
        <span>{view === null ? '' : formatClock(view)}</span>
        <span>{duration === null ? '' : formatClock(duration)}</span>
      </div>
      {dragging && view !== null && (
        <div className="prog-bubble" style={{ left: `${Math.min(92, Math.max(8, pct))}%` }}>{formatClock(view)}</div>
      )}
    </div>
  );
}
