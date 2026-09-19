import { useEffect, useState } from 'react';

const DAYS = ['Nedeľa', 'Pondelok', 'Utorok', 'Streda', 'Štvrtok', 'Piatok', 'Sobota'];
const DAYS_SHORT = ['ne', 'po', 'ut', 'st', 'št', 'pi', 'so'];
const MONTHS = ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 'júl', 'august', 'september', 'október', 'november', 'december'];
// druhý pád (ambientný režim: „sobota 19. septembra“)
const MONTHS_GEN = ['januára', 'februára', 'marca', 'apríla', 'mája', 'júna', 'júla', 'augusta', 'septembra', 'októbra', 'novembra', 'decembra'];

/** Aktuálny čas, obnovovaný raz za sekundu (na hranici minúty sa zmení zobrazenie). */
export function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

export function formatDateLong(d: Date): string {
  return `${DAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** „Utorok 15. september“ – bez roka, do úzkeho pásu. */
export function formatDateDayMonth(d: Date): string {
  return `${DAYS[d.getDay()]} ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

/** „sobota 19. septembra“ – ambientný režim (deň malým písmenom, mesiac v druhom páde). */
export function formatDateAmbient(d: Date): string {
  return `${DAYS[d.getDay()].toLowerCase()} ${d.getDate()}. ${MONTHS_GEN[d.getMonth()]}`;
}

/** Zvyšok do času resetu: „o 1 h 12 min“, „o 8 min“, „teraz“. */
export function formatCountdown(epochSec: number, now = Date.now()): string {
  const s = Math.max(0, Math.round(epochSec - now / 1000));
  if (s < 60) return 'teraz';
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  if (h === 0) return `o ${m} min`;
  if (h >= 24) return `o ${Math.floor(h / 24)} d ${h % 24} h`;
  return `o ${h} h ${m} min`;
}

/** Dĺžka trvania: „12 s“, „4 min“, „2 h 10 min“. */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

/** Poloha v skladbe: „1:23“, nad hodinu „1:02:03“. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** „pred 6 s“, „pred 4 min“. */
export function formatAgo(ms: number): string {
  return `pred ${formatDuration(ms)}`;
}

export function formatDateShort(d: Date): string {
  return `${DAYS_SHORT[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`;
}

/** Čas resetu: „dnes 18:32“, „zajtra 08:59“, inak „št 18:32“. */
export function formatReset(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  const now = new Date();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const dayDiff = Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
  if (dayDiff === 0) return `dnes ${hm}`;
  if (dayDiff === 1) return `zajtra ${hm}`;
  return `${DAYS_SHORT[d.getDay()]} ${hm}`;
}

/** Skratka dňa v týždni („ne“, „po“ …) – dni v detaile počasia. */
export function formatDayShort(d: Date): string {
  return DAYS_SHORT[d.getDay()];
}

/** Celý názov dňa malým písmenom („sobota“) – hlavička detailu počasia. */
export function formatDayLong(d: Date): string {
  return DAYS[d.getDay()].toLowerCase();
}

/** Čas resetu celým názvom dňa: „sobota 10:25“ (detail usage). */
export function formatResetLong(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  return `${DAYS[d.getDay()].toLowerCase()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
