import { useEffect, useState } from 'react';

const DAYS = ['Nedeľa', 'Pondelok', 'Utorok', 'Streda', 'Štvrtok', 'Piatok', 'Sobota'];
const DAYS_SHORT = ['ne', 'po', 'ut', 'st', 'št', 'pi', 'so'];
const MONTHS = ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 'júl', 'august', 'september', 'október', 'november', 'december'];

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

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
