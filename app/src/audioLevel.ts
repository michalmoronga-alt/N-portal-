// Úroveň zvuku z PC pre equalizer v hudobnej karte.
// Služba ju posiela ~20× za sekundu a len počas prehrávania (správa `audio`, level/peak 0–1);
// pri pauze pošle poslednú s nulou a potom nič. Zámerne to nie je React stav – 20 prekreslení
// celého stromu za sekundu by starý telefón nezvládol. Je to jeden meniaci sa objekt v `useRef`,
// ktorý si equalizer číta vo svojom rAF loope.
export interface AudioLevel {
  level: number; // 0–1, posledná nameraná úroveň
  peak: number; // 0–1, špička (zatiaľ len pre budúce použitie)
  at: number; // epoch ms poslednej správy; 0 = ešte nič neprišlo
  /** Equalizer si sem dá svoje prebudenie: kým je ticho, jeho loop stojí (batéria). */
  wake?: () => void;
}

export function createAudioLevel(): AudioLevel {
  return { level: 0, peak: 0, at: 0 };
}

/** Chybné dáta (nečíslo, mimo rozsahu) berieme ako ticho – panel nesmie spadnúť na cudzom vstupe. */
function clamp01(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

/** Equalizer si takto prihlási (alebo odhlási) svoje prebudenie. */
export function setAudioWake(a: AudioLevel, wake: (() => void) | null): void {
  if (wake) a.wake = wake;
  else delete a.wake;
}

/** Zapíše novú úroveň; ak hudba zase hrá, prebudí zastavený loop equalizera. */
export function pushAudioLevel(a: AudioLevel, level: unknown, peak: unknown = level): void {
  const lv = clamp01(level);
  a.level = lv;
  a.peak = clamp01(peak);
  a.at = Date.now();
  if (lv > 0) a.wake?.();
}
