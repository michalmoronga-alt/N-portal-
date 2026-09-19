// Detail usage (W‑2) – obsah overlayu po klepnutí na kruhy (v Station aj v páse SKP/AI).
// Rozloženie 1 : 1 podľa schváleného mocku `app/public/mock8.html` (v2): dva vodorovné pásy
// oddelené linkou, v každom veľký kruh a vedľa neho hlavička s logom a riadky s hodnotami.
// Pásy sa pri otvorení vysunú zľava (druhý s malým oneskorením) – animácia je v styles.css.
import Ring from './Ring';
import { ProviderLogo } from './Logos';
import type { UsageProvider, UsageState } from './service';
import { useClock, formatCountdown, formatResetLong } from './time';

interface Props {
  usage: UsageState | null;
}

export default function UsageDetail({ usage }: Props) {
  const now = useClock();
  const t = now.getTime();
  const stale = !usage || !usage.available || usage.stale;
  const cx = usage?.codex;
  const cl = usage?.claude;
  const ageMin = usage?.ageSec === null || usage?.ageSec === undefined ? null : Math.round(usage.ageSec / 60);
  const mode = usage?.mode ? usage.mode.toUpperCase() : null;

  return (
    <div className="ubands">
      <div className="uband">
        <Ring weekly={cx?.weeklyUsed ?? null} label="Codex" stale={stale} />
        <div className="ud">
          <div className="h"><ProviderLogo provider="codex" colored />Codex · týždeň</div>
          <span className="k">Spotrebované</span>
          <span className={`v ${full(cx) ? 'warn' : ''}`}>{pct(cx?.weeklyUsed)}{full(cx) ? ' · vyčerpané' : ''}</span>
          <span className="k">Reset týždňa</span>
          <span className="v">{reset(cx?.weeklyResetAt, t)}</span>
          <span className="k">Stav účtu</span>
          <span className={`v ${cx?.status && cx.status !== 'ok' ? 'warn' : ''}`}>{statusText(cx?.status)}</span>
        </div>
      </div>

      <div className="udiv" />

      <div className="uband">
        <Ring weekly={cl?.weeklyUsed ?? null} session={cl?.sessionUsed ?? null} label="Claude" stale={stale} />
        <div className="ud">
          <div className="h"><ProviderLogo provider="claude" colored />Claude · týždeň a 5h okno</div>
          <span className="k">Týždeň</span>
          <span className={`v ${full(cl) ? 'warn' : ''}`}>{pct(cl?.weeklyUsed)}{cl?.weeklyResetAt ? ` · reset ${formatResetLong(cl.weeklyResetAt)}` : ''}</span>
          <span className="k">5h okno</span>
          <span className="v">{pct(cl?.sessionUsed)}{cl?.sessionResetAt ? ` · reset ${formatCountdown(cl.sessionResetAt, t)}` : ''}</span>
          <span className="k">Stav účtu</span>
          <span className={`v ${cl?.status && cl.status !== 'ok' ? 'warn' : ''}`}>
            {statusText(cl?.status)}
            {ageMin === null ? '' : ` · dáta pred ${ageMin} min`}
            {mode ? ` · ${mode}` : ''}
            {usage?.stale ? ' · ZASTARANÉ' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

function full(p: UsageProvider | undefined): boolean {
  return p?.weeklyUsed !== null && p?.weeklyUsed !== undefined && p.weeklyUsed >= 100;
}

function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${Math.round(v)} %`;
}

/** „sobota 10:25 · o 13 h 21 min“ */
function reset(epochSec: number | null | undefined, now: number): string {
  if (!epochSec) return '—';
  return `${formatResetLong(epochSec)} · ${formatCountdown(epochSec, now)}`;
}

function statusText(s: string | null | undefined): string {
  return s === 'ok' ? 'ok' : s === 'rate_limit' ? 'rate limit' : (s ?? '—');
}
