// Kontrolný skript: pripojí sa na bežiacu službu cez WebSocket a vypíše správy témy `audio`
// (úroveň zvuku pre equalizer: level/peak, odstup medzi správami, počet správ za sekundu).
// Použitie:  node scripts/probe-audio.mjs [port] [sekúnd] [--quiet] [--pause]
//   --quiet: bez riadka za každú správu, len súhrn po sekundách
//   --pause: v polovici merania pošle povel `pause` (má prísť posledná nula a ticho), na konci `play`
// Token číta z %USERPROFILE%\.n-portal\service\config.json (rovnako ako služba).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const quiet = process.argv.includes('--quiet');
const doPause = process.argv.includes('--pause');
const port = Number(args[0]) || 8790;
const secs = Number(args[1]) || 5;
const cfgFile = path.join(process.env.NPORTAL_DATA_DIR ?? path.join(os.homedir(), '.n-portal'), 'service', 'config.json');
const { token } = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));

const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?t=${token}`);
const t0 = Date.now();
let seen = 0;
let prev = 0;
let gapMin = Infinity;
let gapMax = 0;
let levelMax = 0;
let rawMax = 0;
const perSecond = new Map(); // celá sekunda od štartu → počet správ

const bar = (v) => '#'.repeat(Math.round(v * 40)).padEnd(40, '·');

ws.on('open', () => console.log(`pripojené na ws://127.0.0.1:${port}/ws – počúvam ${secs} s`));
ws.on('error', (e) => {
  console.error('chyba:', e.message);
  process.exit(1);
});
ws.on('message', (raw) => {
  let m;
  try {
    m = JSON.parse(raw.toString());
  } catch {
    return;
  }
  if (m.type === 'media' && !quiet) {
    console.log(`· media: ${m.data.status ?? '–'} ${m.data.title ?? ''}`);
    return;
  }
  if (m.type !== 'audio') return;
  seen += 1;
  const now = Date.now();
  if (prev) {
    const g = now - prev;
    if (g < gapMin) gapMin = g;
    if (g > gapMax) gapMax = g;
  }
  prev = now;
  const sec = Math.floor((now - t0) / 1000);
  perSecond.set(sec, (perSecond.get(sec) ?? 0) + 1);
  const d = m.data;
  if (d.level > levelMax) levelMax = d.level;
  if ((d.raw ?? 0) > rawMax) rawMax = d.raw;
  if (!quiet) {
    console.log(
      `#${String(seen).padStart(3)} ${String(now - t0).padStart(6)} ms  level=${d.level.toFixed(3)} peak=${d.peak.toFixed(3)} raw=${(d.raw ?? 0).toFixed(3)}  ${bar(d.level)}`
    );
  }
});

if (doPause) {
  setTimeout(() => {
    console.log(`→ ${Date.now() - t0} ms: posielam pause`);
    ws.send(JSON.stringify({ type: 'media', action: 'pause' }));
  }, Math.round((secs * 1000) / 2));
  setTimeout(() => {
    console.log(`→ ${Date.now() - t0} ms: posielam play (vraciam pôvodný stav)`);
    ws.send(JSON.stringify({ type: 'media', action: 'play' }));
  }, secs * 1000 - 300);
}

setTimeout(() => {
  console.log('');
  console.log(`správ: ${seen} za ${secs} s = ${(seen / secs).toFixed(1)}/s`);
  console.log(`odstup: min ${gapMin === Infinity ? '–' : gapMin + ' ms'}, max ${gapMax} ms; najvyšší level ${levelMax.toFixed(3)}, najvyšší raw ${rawMax.toFixed(3)}`);
  const rows = [...perSecond.entries()].sort((a, b) => a[0] - b[0]);
  for (const [s, n] of rows) console.log(`  sekunda ${s}: ${n} správ`);
  ws.close();
  process.exit(0);
}, secs * 1000);
