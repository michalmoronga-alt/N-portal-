// Detail počasia (W‑2) – obsah overlayu po klepnutí na hodiny (v Station aj v páse SKP/AI).
// Rozloženie 1 : 1 podľa schváleného mocku `app/public/mock8.html` (v2):
//   hore: veľká ikona + teplota, popis a čísla vľavo, miesto a vek dát vpravo,
//   v strede: krivka teploty na 24 hodín (každá 3. hodina = bod),
//   dole: sedem dní z dennej predpovede, dnešok zvýraznený.
import type { WeatherDay, WeatherState } from './service';
import WeatherIcon, { weatherLabel } from './WeatherIcon';
import { useClock, formatDayShort, formatDayLong } from './time';

interface Props {
  weather: WeatherState | null;
}

const W = 1000; // šírka súradnicovej sústavy krivky (SVG sa roztiahne cez preserveAspectRatio="none")
const H = 100;
const PAD = 3; // °C nad a pod krivkou, nech sa nedotýka okrajov
const STEP = 3; // bod každú tretiu hodinu
const POINTS = 9; // 9 bodov = 24 hodín vrátane „teraz“

export default function WeatherDetail({ weather }: Props) {
  const now = useClock();
  const wx = weather?.available && weather.current ? weather : null;
  if (!wx || !wx.current) {
    return <div className="ov-empty">Počasie nie je dostupné.</div>;
  }
  const cur = wx.current;
  const ageMin = wx.updatedAt ? Math.max(0, Math.round((now.getTime() - wx.updatedAt) / 60000)) : null;

  // ---------- krivka teploty ----------
  const hrs = wx.hourly ?? [];
  const picked = hrs.length
    ? Array.from({ length: POINTS }, (_, i) => hrs[Math.min(i * STEP, hrs.length - 1)]).filter(Boolean)
    : [];
  const temps = picked.map((h) => h.temp);
  const mn = temps.length ? Math.min(...temps) - PAD : 0;
  const mx = temps.length ? Math.max(...temps) + PAD : 1;
  const span = mx - mn || 1;
  const pts = picked.map((h, i) => ({
    x: (i / Math.max(1, picked.length - 1)) * W,
    y: H - ((h.temp - mn) / span) * H,
    temp: h.temp,
    hour: hourOf(h.time),
  }));
  let d = pts.length ? `M${pts[0].x},${pts[0].y}` : '';
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = (a.x + b.x) / 2;
    d += ` C${c},${a.y} ${c},${b.y} ${b.x},${b.y}`;
  }

  const days = (wx.daily ?? []).slice(0, 7);

  return (
    <>
      <div className="wnow">
        <div className="big">
          <WeatherIcon code={cur.code} isDay={cur.isDay} />
          <div className="tmp">{Math.round(cur.temp)}<small>°C</small></div>
        </div>
        <div>
          <div className="desc">{cap(weatherLabel(cur.code))}</div>
          <div className="wmeta">
            Zrážky {Math.round(cur.precipProb)} % · Vlhkosť {Math.round(cur.humidity)} %<br />
            Vietor {Math.round(cur.wind)} km/h
          </div>
        </div>
        <div className="place">
          <div className="p">{wx.place}</div>
          <div className="s">
            {formatDayLong(now)} {hhmm(now)} · Open‑Meteo{ageMin === null ? '' : ` · pred ${ageMin} min`}
            {wx.stale ? ' · staré údaje' : ''}
          </div>
        </div>
      </div>

      <div className="curve">
        {pts.length > 1 && (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="wx-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#e6b34a" stopOpacity=".35" />
                  <stop offset="1" stopColor="#e6b34a" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={`${d} L${W},${H} L0,${H} Z`} fill="url(#wx-grad)" />
              <path d={d} fill="none" stroke="#e6b34a" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="lab">
              {pts.map((p, i) => (
                <span key={i} style={{ left: `${(p.x / W) * 100}%`, top: `calc(${(p.y / H) * 100}% - 3.2vh)` }}>{Math.round(p.temp)}°</span>
              ))}
            </div>
            <div className="hrs">{pts.map((p, i) => <span key={i}>{p.hour}</span>)}</div>
          </>
        )}
      </div>

      <div className="days">
        {days.map((day, i) => (
          <div key={day.date} className={`d ${i === 0 ? 'now' : ''}`}>
            <span className="n">{i === 0 ? 'dnes' : formatDayShort(dateOf(day))}</span>
            <WeatherIcon code={day.code} isDay />
            <div className="t"><b>{Math.round(day.tmax)}°</b> <span>{Math.round(day.tmin)}°</span></div>
            <span className="pp">{day.precipProb > 0 ? `${Math.round(day.precipProb)} %` : ''}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/** „2026-09-19T15:00“ → „15:00“ (bez vedúcej nuly, ako v mocku). */
function hourOf(time: string): string {
  const h = Number(time.slice(11, 13));
  return Number.isFinite(h) ? `${h}:00` : '';
}

/** „2026-09-19“ → Date v miestnom čase (bez posunu zóny, aký robí Date.parse pre samotný dátum). */
function dateOf(day: WeatherDay): Date {
  const [y, m, d] = day.date.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
