// Detail cez celú obrazovku (W‑2) – spoločný mechanizmus pre všetky tri detaily
// (počasie, usage, prehrávač). Vzhľad je 1 : 1 port schváleného mocku `app/public/mock8.html` (v2):
// tmavé sklo cez celý `.main` (teda pod horným pásom), vpravo stály pás „› zavrieť“ (18 % šírky)
// a hore tenká linka, ktorá odpočítava 10 sekúnd.
//
// Pravidlá (dohodnuté s Michalom):
//   • naraz je otvorený najviac jeden detail – ktorý, rozhoduje `App.tsx`,
//   • dotyk v obsahu odpočet predĺži, klepnutie na pás vpravo detail zavrie,
//   • zatvára aj prepnutie režimu, ambient a výpadok spojenia (to všetko rieši `App.tsx`),
//   • klepnutie v detaile sa nesmie preniesť na prvky pod ním – vrstva preto chytá dotyk ešte
//     počas prelínania von (trieda `closing`), takže ani zatváracie klepnutie nikam neprejde.
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ledTap } from './ledPulse';

export type DetailKind = 'weather' | 'usage' | 'player';

interface Props {
  /** ktorý detail je otvorený; null = zavretý (vrstva ešte chvíľu dohasína) */
  kind: DetailKind | null;
  onClose: () => void;
  /** obsah detailu; kreslí sa aj počas zatvárania, aby text nezmizol skôr než vrstva */
  render: (kind: DetailKind) => ReactNode;
}

const IDLE_MS = 10000; // 10 s bez dotyku = zavrieť (rovnako ako linka hore v mocku)
const CLOSE_MS = 350; // prelínanie von; dovtedy vrstva stále chytá dotyk

export default function Overlay({ kind, onClose, render }: Props) {
  // `content` drží posledný obsah aj počas zatvárania; `arm` reštartuje 10 s odpočet
  const [content, setContent] = useState<DetailKind | null>(kind);
  const [arm, setArm] = useState(0);

  useEffect(() => {
    if (kind) {
      setContent(kind);
      setArm((a) => a + 1);
      return;
    }
    const t = window.setTimeout(() => setContent(null), CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [kind]);

  useEffect(() => {
    if (!kind) return;
    const t = window.setTimeout(onClose, IDLE_MS);
    return () => window.clearTimeout(t);
  }, [kind, arm, onClose]);

  if (!content) return null;

  return (
    <div className={`ov ${content === 'player' ? 'player' : ''} ${kind ? 'open' : 'closing'}`} role="dialog" aria-modal="true">
      {/* linka odpočítavajúca 10 s; `key` reštartuje animáciu pri každom dotyku v obsahu */}
      <i className="timer" key={arm} aria-hidden="true" />
      <div className="ov-body" onPointerDown={() => kind && setArm((a) => a + 1)}>
        {render(content)}
      </div>
      <div
        className="ov-close"
        role="button"
        aria-label="Zavrieť detail"
        onPointerDown={(e) => {
          e.stopPropagation();
          ledTap();
          onClose();
        }}
      >
        <b>›</b>
        <span>zavrieť</span>
      </div>
    </div>
  );
}

const TAP_MOVE_PX = 10; // väčší pohyb už nie je klepnutie (rovnaká hranica ako v hornom páse)

/**
 * Klepnutie na prvok, ktoré otvorí detail. Ťah sa neráta (v páse sa ním prepínajú režimy)
 * a klepnutie na tlačidlo tiež nie (tlačidlá prehrávača v páse musia ďalej fungovať).
 */
export function useTapOpen(onTap: () => void) {
  const st = useRef<{ x: number; y: number; id: number } | null>(null);
  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    st.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  }, []);
  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const s = st.current;
      st.current = null;
      if (!s || s.id !== e.pointerId) return;
      if (Math.abs(e.clientX - s.x) > TAP_MOVE_PX || Math.abs(e.clientY - s.y) > TAP_MOVE_PX) return;
      if ((e.target as HTMLElement | null)?.closest?.('button')) return;
      ledTap();
      onTap();
    },
    [onTap],
  );
  const onPointerCancel = useCallback(() => {
    st.current = null;
  }, []);
  return { onPointerDown, onPointerUp, onPointerCancel };
}
