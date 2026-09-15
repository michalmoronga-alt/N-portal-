// Spätná väzba zadnými LED telefónu (IIIF150: Rhythm Lights reagujú na prehrávanie médií).
// Overené 15. 9. 2026: krátky „beat“ 45 Hz prehraný cez <audio> (mediálna relácia ako pri YouTube)
// rozsvieti LED aj pri najnižšej hlasitosti a nie je počuť; 400 ms je spoľahlivé minimum, oneskorenie 0,5–1 s.
// Web Audio (oscilátor) LED nespustí – preto WAV cez <audio>.

const LED_KEY = 'nportal.led';
const FREQ = 45;
const AMP = 0.55;

let enabled = readEnabled();
let audioEl: HTMLAudioElement | null = null;
const cache = new Map<string, string>();

function readEnabled(): boolean {
  try {
    return localStorage.getItem(LED_KEY) !== '0';
  } catch {
    return true;
  }
}

export function ledEnabled(): boolean {
  return enabled;
}

export function setLedEnabled(v: boolean) {
  enabled = v;
  try {
    localStorage.setItem(LED_KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (!v) stop();
}

/** WAV: „úder“ 45 Hz s exponenciálnym dozvukom; `beats` úderov v rovnomerných rozstupoch počas `seconds`. */
function makeWav(seconds: number, beats: number): string {
  const key = `${seconds}:${beats}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const sr = 22050;
  const n = Math.round(sr * seconds);
  const data = new Int16Array(n);
  const period = seconds / beats;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-(t % period) * 9);
    data[i] = Math.round(Math.sin(2 * Math.PI * FREQ * t) * env * AMP * 32767);
  }
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  new Int16Array(buf, 44).set(data);
  const url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  cache.set(key, url);
  return url;
}

function play(seconds: number, beats: number) {
  if (!enabled) return;
  try {
    if (!audioEl) {
      audioEl = new Audio();
      audioEl.preload = 'auto';
    }
    audioEl.pause();
    audioEl.src = makeWav(seconds, beats);
    audioEl.volume = 1;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: 'N-portal', artist: 'spätná väzba' });
    }
    void audioEl.play().catch(() => {});
  } catch {
    /* bez podpory – ticho */
  }
}

function stop() {
  audioEl?.pause();
}

/** Klepnutie na akčné tlačidlo. */
export function ledTap() {
  play(0.4, 1);
}

/** Chyba alebo odmietnutie. */
export function ledError() {
  play(0.8, 2);
}

/** Dlhšia akcia / výrazné potvrdenie. */
export function ledLong() {
  play(1.5, 3);
}
