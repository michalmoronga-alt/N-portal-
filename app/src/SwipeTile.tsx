// Dlaždica „Pohľad“: potiahnutie určuje smer pohľadu. Krátke klepnutie len ukáže smery (ochrana proti náhodnému dotyku).
import { useRef, useState, type ReactNode } from 'react';
import { swipeDirOf, type SwipeDir } from './swipe';

export type { SwipeDir };

interface Props {
  className: string;
  disabled?: boolean;
  /** zablokovaná dlaždica: bez šípok, ťah nič neodošle, dotyk len ohlási dôvod cez onTap */
  blocked?: boolean;
  onSwipe: (dir: SwipeDir) => void;
  onTap?: () => void;
  children: ReactNode;
}

export default function SwipeTile({ className, disabled, blocked, onSwipe, onTap, children }: Props) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const [live, setLive] = useState<SwipeDir | null>(null);
  const [hint, setHint] = useState(false);
  const dirOf = swipeDirOf;

  return (
    <button
      className={`${className} swipe ${!blocked && live ? 'live-' + live : ''} ${!blocked && hint ? 'hint' : ''}`}
      disabled={disabled}
      onPointerDown={(e) => {
        if (blocked) return;
        start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (blocked || !start.current || start.current.id !== e.pointerId) return;
        setLive(dirOf(e.clientX - start.current.x, e.clientY - start.current.y));
      }}
      onPointerUp={(e) => {
        if (blocked) {
          onTap?.(); // len hláška, prečo sa nedá ovládať
          return;
        }
        if (!start.current || start.current.id !== e.pointerId) return;
        const d = dirOf(e.clientX - start.current.x, e.clientY - start.current.y);
        start.current = null;
        setLive(null);
        if (d) onSwipe(d);
        else {
          onTap?.();
          setHint(true);
          window.setTimeout(() => setHint(false), 1500);
        }
      }}
      onPointerCancel={() => {
        start.current = null;
        setLive(null);
      }}
    >
      {children}
      {!blocked && (
        <span className="arrows" aria-hidden="true">
          <i className="a-up">▲<b>zhora</b></i>
          <i className="a-left">◀<b>zľava</b></i>
          <i className="a-right">▶<b>sprava</b></i>
          <i className="a-down">▼<b>spredu</b></i>
        </span>
      )}
    </button>
  );
}
