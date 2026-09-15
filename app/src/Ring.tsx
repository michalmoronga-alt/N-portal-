// Kruh usage: vonkajší = týždenný limit, voliteľný vnútorný = 5h okno. Percentá = spotrebované.
interface Props {
  weekly: number | null;
  session?: number | null; // null/undefined = bez vnútorného prstenca (Codex)
  label: string;
  sub?: string;
  size?: 'big' | 'mini';
  stale?: boolean;
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

export default function Ring({ weekly, session, label, sub, size = 'big', stale }: Props) {
  const w = weekly === null ? 0 : Math.max(0, Math.min(100, weekly));
  const hasInner = session !== null && session !== undefined;
  const s = hasInner ? Math.max(0, Math.min(100, session!)) : 0;
  return (
    <div className={`ring ${size} ${stale ? 'stale' : ''}`}>
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
    </div>
  );
}
