// Ikony počasia (W‑1): vlastné jednofarebné SVG v rovnakom duchu ako Logos.tsx –
// veľkosť 1em, farba sa dedí z textu (currentColor), žiadne emoji (Android ich kreslí farebne).
// Vyberajú sa podľa WMO kódu z Open‑Meteo a podľa toho, či je deň alebo noc.
import type { CSSProperties } from 'react';

interface Props {
  code: number;
  isDay?: boolean;
  className?: string;
  style?: CSSProperties;
}

const BASE = { width: '1em', height: '1em', viewBox: '0 0 24 24', 'aria-hidden': true as const, focusable: 'false' as const };
const LINE = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

// veľký oblak (zamračené) a menší oblak posunutý hore, pod ktorý sa kreslia zrážky
const CLOUD_BIG = 'M6.6 18h9.9a3.7 3.7 0 0 0 .4-7.3 5.6 5.6 0 0 0-10.6-1.2A3.8 3.8 0 0 0 6.6 18z';
const CLOUD_TOP = 'M7 15.4h9.1a3.3 3.3 0 0 0 .3-6.5 5 5 0 0 0-9.4-1.1A3.4 3.4 0 0 0 7 15.4z';
// oblak vpravo dole, keď je vľavo hore slnko alebo mesiac
const CLOUD_SIDE = 'M9.4 18.8h6.9a3.3 3.3 0 0 0 .3-6.6 5 5 0 0 0-9.4-1.1 3.4 3.4 0 0 0 2.2 7.7z';

const SUN_RAYS: [number, number, number, number][] = [
  [12, 2.2, 12, 4.2], [12, 19.8, 12, 21.8], [2.2, 12, 4.2, 12], [19.8, 12, 21.8, 12],
  [5.1, 5.1, 6.6, 6.6], [17.4, 17.4, 18.9, 18.9], [18.9, 5.1, 17.4, 6.6], [6.6, 17.4, 5.1, 18.9],
];
// kratšie lúče malého slnka, ktoré vykúka spoza oblaku
const SUN_RAYS_SMALL: [number, number, number, number][] = [
  [8.2, 1.6, 8.2, 3.2], [2.1, 7.7, 3.7, 7.7], [3.9, 3.4, 5, 4.5], [12.5, 3.4, 11.4, 4.5], [3.9, 12, 5, 10.9],
];

/** Kvapky (dážď / mrholenie / prehánky): `short` = mrholenie. */
function Drops({ xs, short }: { xs: number[]; short?: boolean }) {
  return (
    <>
      {xs.map((x) => (
        <line key={x} x1={x} y1={16.8} x2={x - (short ? 0.6 : 1.1)} y2={short ? 18.9 : 20.6} />
      ))}
    </>
  );
}

/** Vločky: jednoduché hviezdičky z troch čiar. */
function Flakes({ xs }: { xs: number[] }) {
  return (
    <>
      {xs.map((x) => (
        <g key={x} strokeWidth={1.3}>
          <line x1={x} y1={17.2} x2={x} y2={21} />
          <line x1={x - 1.6} y1={18.1} x2={x + 1.6} y2={20.1} />
          <line x1={x - 1.6} y1={20.1} x2={x + 1.6} y2={18.1} />
        </g>
      ))}
    </>
  );
}

type Kind =
  | 'clear' | 'partly' | 'overcast' | 'fog' | 'drizzle' | 'rain'
  | 'snow' | 'showers' | 'snowShowers' | 'thunder';

/** Skupina počasia podľa WMO kódu (Open‑Meteo). Neznámy kód spadne do „oblačno“. */
export function weatherKind(code: number): Kind {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly';
  if (code === 3) return 'overcast';
  if (code >= 45 && code <= 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code >= 61 && code <= 67) return 'rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return 'showers';
  if (code === 85 || code === 86) return 'snowShowers';
  if (code >= 95 && code <= 99) return 'thunder';
  return 'overcast';
}

const LABELS: Record<Kind, string> = {
  clear: 'jasno',
  partly: 'polooblačno',
  overcast: 'zamračené',
  fog: 'hmla',
  drizzle: 'mrholenie',
  rain: 'dážď',
  snow: 'sneh',
  showers: 'prehánky',
  snowShowers: 'snehové prehánky',
  thunder: 'búrka',
};

/** Slovenský popis počasia pre WMO kód („polooblačno“, „dážď“ …). */
export function weatherLabel(code: number): string {
  return LABELS[weatherKind(code)];
}

export default function WeatherIcon({ code, isDay = true, className = 'wx-ico', style }: Props) {
  const kind = weatherKind(code);
  // slnko / mesiac vľavo hore pre „polooblačno“ a prehánky
  const smallLight = isDay ? (
    <>
      <circle cx="8.2" cy="7.7" r="3.1" />
      {SUN_RAYS_SMALL.map((r) => <line key={r.join()} x1={r[0]} y1={r[1]} x2={r[2]} y2={r[3]} />)}
    </>
  ) : (
    <path d="M13.6 11.6A5.6 5.6 0 0 1 7.3 3.9a5 5 0 1 0 6.3 7.7z" />
  );

  return (
    <svg {...BASE} className={className} style={style}>
      <g {...LINE}>
        {kind === 'clear' && (isDay ? (
          <>
            <circle cx="12" cy="12" r="4.2" />
            {SUN_RAYS.map((r) => <line key={r.join()} x1={r[0]} y1={r[1]} x2={r[2]} y2={r[3]} />)}
          </>
        ) : (
          <path d="M20.4 15A8.4 8.4 0 0 1 9 3.6a7.6 7.6 0 1 0 11.4 11.4z" />
        ))}

        {kind === 'partly' && (<>{smallLight}<path d={CLOUD_SIDE} /></>)}
        {kind === 'overcast' && <path d={CLOUD_BIG} />}

        {kind === 'fog' && (
          <>
            <path d="M7 13.6h9.1a3.3 3.3 0 0 0 .3-6.5 5 5 0 0 0-9.4-1.1A3.4 3.4 0 0 0 7 13.6z" />
            <line x1="4.6" y1="17" x2="19.4" y2="17" />
            <line x1="6.8" y1="20" x2="17.2" y2="20" />
          </>
        )}

        {kind === 'drizzle' && (<><path d={CLOUD_TOP} /><Drops xs={[9.4, 12.6, 15.8]} short /></>)}
        {kind === 'rain' && (<><path d={CLOUD_TOP} /><Drops xs={[9.4, 12.6, 15.8]} /></>)}
        {kind === 'snow' && (<><path d={CLOUD_TOP} /><Flakes xs={[9.2, 15.4]} /></>)}

        {kind === 'showers' && (
          <>
            {smallLight}
            <path d="M9.6 15.8h6.7a3.3 3.3 0 0 0 .3-6.6 5 5 0 0 0-9.4-1.1 3.4 3.4 0 0 0 2.4 7.7z" />
            <Drops xs={[11, 15]} />
          </>
        )}

        {kind === 'snowShowers' && (
          <>
            {smallLight}
            <path d="M9.6 15.8h6.7a3.3 3.3 0 0 0 .3-6.6 5 5 0 0 0-9.4-1.1 3.4 3.4 0 0 0 2.4 7.7z" />
            <Flakes xs={[11.2, 16]} />
          </>
        )}

        {kind === 'thunder' && (
          <>
            <path d={CLOUD_TOP} />
            <path d="M13.4 16.4 10 20.6h2.7l-.9 3 3.9-4.8h-2.7z" fill="currentColor" strokeWidth={1.1} />
          </>
        )}
      </g>
    </svg>
  );
}
