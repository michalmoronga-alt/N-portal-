// Kruh usage: vonkajší = týždenný limit, voliteľný vnútorný = 5h okno. Percentá = spotrebované.
// S propom `activity` navyše po dráhe vonkajšieho kruhu obiehajú body – aktivita agentov daného
// providera (logika v `ringActivity.ts`). Bez neho vyzerá a správa sa kruh presne ako predtým.
import { useEffect, useRef, type ReactNode } from 'react';
import { RingSwarm, type Activity } from './ringActivity';

interface Props {
  weekly: number | null;
  session?: number | null; // null/undefined = bez vnútorného prstenca (Codex)
  label: ReactNode; // text alebo mini logo + text
  sub?: string;
  size?: 'big' | 'mini';
  stale?: boolean;
  activity?: Activity; // undefined = kruh bez bodov aktivity
}

const R_OUT = 44;
const R_IN = 33;
const C_OUT = 2 * Math.PI * R_OUT;
const C_IN = 2 * Math.PI * R_IN;

function tone(p: number | null): string {
  if (p === null) return 'none';
  if (p >= 90) return 'hot';
  if (p >= 70) return 'warn';
  return 'ok';
}

export default function Ring({ weekly, session, label, sub, size = 'big', stale, activity }: Props) {
  const w = weekly === null ? 0 : Math.max(0, Math.min(100, weekly));
  const hasInner = session !== null && session !== undefined;
  const s = hasInner ? Math.max(0, Math.min(100, session!)) : 0;
  const hasActivity = activity !== undefined;

  const ringRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<HTMLDivElement>(null);
  const swarmRef = useRef<RingSwarm | null>(null);
  const actRef = useRef<Activity>('none');
  // efekt hore: pri pripojení roja nižšie je v `actRef` už aktuálny stav
  useEffect(() => {
    actRef.current = activity ?? 'none';
  }, [activity]);

  // pripojenie roja: pri odpojení (odchod z režimu) sa body odstránia a roj odhlási z loopu
  useEffect(() => {
    if (!hasActivity || !ringRef.current || !orbitRef.current) return;
    const swarm = new RingSwarm(ringRef.current, orbitRef.current);
    swarmRef.current = swarm;
    swarm.set(actRef.current);
    return () => {
      swarm.destroy();
      swarmRef.current = null;
    };
  }, [hasActivity, size]);

  useEffect(() => {
    if (activity) swarmRef.current?.set(activity);
  }, [activity]);

  return (
    <div ref={ringRef} className={`ring ${size} ${stale ? 'stale' : ''} ${!stale && weekly !== null && w >= 100 ? 'full' : ''}`}>
      <svg viewBox="0 0 100 100">
        <circle className="track" cx="50" cy="50" r={R_OUT} strokeWidth={hasInner ? 8 : 9} />
        <circle
          className={`fill outer ${tone(weekly)}`}
          cx="50" cy="50" r={R_OUT} strokeWidth={hasInner ? 8 : 9}
          strokeDasharray={C_OUT} strokeDashoffset={C_OUT * (1 - w / 100)}
        />
        {hasInner && (
          <>
            <circle className="track" cx="50" cy="50" r={R_IN} strokeWidth={6} />
            <circle
              className={`fill inner ${tone(session!)}`}
              cx="50" cy="50" r={R_IN} strokeWidth={6}
              strokeDasharray={C_IN} strokeDashoffset={C_IN * (1 - s / 100)}
            />
          </>
        )}
      </svg>
      <div className="lbl">
        <div className="pct">{weekly === null ? '–' : `${Math.round(w)}%`}</div>
        <div className="name">{label}</div>
        {sub && <div className="reset">{sub}</div>}
      </div>
      {hasActivity && <div className="orbit" ref={orbitRef} aria-hidden="true" />}
    </div>
  );
}
