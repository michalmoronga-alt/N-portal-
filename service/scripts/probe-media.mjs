// Kontrolný skript: pripojí sa na bežiacu službu cez WebSocket a vypíše správy témy `media`
// (dôraz na priebeh skladby: position/duration/rate/canSeek a odstup medzi správami).
// Použitie:  node scripts/probe-media.mjs [port] [počet správ] [seekMs]
//   seekMs (voliteľné): po 3. správe pošle {type:'media',action:'seek',value:<seekMs>}
// Token číta z %USERPROFILE%\.n-portal\service\config.json (rovnako ako služba).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

const port = Number(process.argv[2]) || 8790;
const want = Number(process.argv[3]) || 10;
const seekMs = process.argv[4] !== undefined ? Number(process.argv[4]) : null;
const cfgFile = path.join(process.env.NPORTAL_DATA_DIR ?? path.join(os.homedir(), '.n-portal'), 'service', 'config.json');
const { token } = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));

const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?t=${token}`);
let seen = 0;
let prev = 0;
let seekSent = false;

const t = (ms) => (ms === null || ms === undefined ? '–' : `${(ms / 1000).toFixed(1)} s`);

ws.on('open', () => console.log(`pripojené na ws://127.0.0.1:${port}/ws`));
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
  if (m.type !== 'media') return;
  seen += 1;
  const now = Date.now();
  const gap = prev ? `+${now - prev} ms` : 'prvá';
  prev = now;
  const d = m.data;
  console.log(
    `#${String(seen).padStart(2)} ${gap.padStart(9)} ${String(d.status ?? '–').padEnd(7)} ` +
      `pos=${t(d.position).padStart(7)} / dur=${t(d.duration).padStart(7)} rate=${d.rate} canSeek=${d.canSeek} ` +
      `thumb=${d.thumb ? 'áno' : 'nie'} art=${d.art ?? 'nie'} · ${d.title ?? '(bez názvu)'}`
  );
  if (seekMs !== null && !seekSent && seen >= 3) {
    seekSent = true;
    console.log(`→ posielam seek na ${t(seekMs)}`);
    ws.send(JSON.stringify({ type: 'media', action: 'seek', value: seekMs }));
  }
  if (seen >= want) {
    ws.close();
    process.exit(0);
  }
});
setTimeout(() => {
  console.error(`časový limit: prišlo ${seen} správ`);
  process.exit(2);
}, 30000);
