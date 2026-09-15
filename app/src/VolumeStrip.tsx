// Neviditeľný pás hlasitosti na hornom okraji hudobnej karty (len Station).
// Potiahnutie doľava = tichšie, doprava = hlasnejšie; počas ťahu a 2 s po ňom sa ukážu percentá.
import { useEffect, useRef, useState } from 'react';

interface Props {
  volume: number | null; // aktuálna hlasitosť PC
  onChange: (pct: number) => void;
}

const FULL_WIDTH_PCT = 100; // ťah cez celú šírku karty = 100 bodov
const SEND_EVERY_MS = 80;
const SHOW_MS = 2000;

export default function VolumeStrip({ volume, onChange }: Props) {
  const start = useRef<{ x: number; base: number; width: number; id: number } | null>(null);
  const lastSent = useRef(0);
  const [live, setLive] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null); // hodnota po pustení, kým ju PC nepotvrdí
  const [shownUntil, setShownUntil] = useState(0);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!shownUntil) return;
    const t = window.setTimeout(() => setTick((x) => x + 1), shownUntil - Date.now() + 20);
    return () => window.clearTimeout(t);
  }, [shownUntil]);

  // PC potvrdil nastavenú hodnotu (alebo uplynul limit) → prestať držať optimistickú hodnotu
  useEffect(() => {
    if (pending === null) return;
    if (volume === pending) {
      setPending(null);
      return;
    }
    const t = window.setTimeout(() => setPending(null), 3000);
    return () => window.clearTimeout(t);
  }, [pending, volume]);

  const visible = live !== null || Date.now() < shownUntil;
  const shown = live ?? pending ?? volume;

  return (
    <>
      <div
        className={`vol-strip ${start.current ? 'dragging' : ''}`}
        onPointerDown={(e) => {
          if (volume === null) return;
          const w = (e.currentTarget as HTMLElement).getBoundingClientRect().width || 1;
          start.current = { x: e.clientX, base: volume, width: w, id: e.pointerId };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setLive(volume);
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s || s.id !== e.pointerId) return;
          const v = Math.max(0, Math.min(100, Math.round(s.base + ((e.clientX - s.x) / s.width) * FULL_WIDTH_PCT)));
          setLive(v);
          const now = Date.now();
          if (now - lastSent.current >= SEND_EVERY_MS) {
            lastSent.current = now;
            onChange(v);
          }
        }}
        onPointerUp={(e) => {
          const s = start.current;
          if (!s || s.id !== e.pointerId) return;
          start.current = null;
          if (live !== null) {
            onChange(live);
            setPending(live);
          }
          setLive(null);
          setShownUntil(Date.now() + SHOW_MS);
        }}
        onPointerCancel={() => {
          start.current = null;
          setLive(null);
          setShownUntil(Date.now() + SHOW_MS);
        }}
        aria-label="Hlasitosť PC – potiahni doľava alebo doprava"
      />
      <div className={`vol-badge ${visible ? 'show' : ''}`} aria-live="polite">
        <span className="vol-icon">{shown === 0 ? '🔇' : (shown ?? 0) < 40 ? '🔈' : (shown ?? 0) < 75 ? '🔉' : '🔊'}</span>
        <span className="vol-pct">{shown ?? '–'} %</span>
        <i className="vol-bar"><b style={{ width: `${shown ?? 0}%` }} /></i>
      </div>
    </>
  );
}
