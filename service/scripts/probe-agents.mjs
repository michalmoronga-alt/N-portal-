// Kontrolný skript: pripojí sa na bežiacu službu cez WebSocket a vypíše prvé správy témy `agents`.
// Použitie:  node scripts/probe-agents.mjs [port] [počet správ]
// Token číta z %USERPROFILE%\.n-portal\service\config.json (rovnako ako služba).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

const port = Number(process.argv[2]) || 8790;
const want = Number(process.argv[3]) || 3;
const cfgFile = path.join(process.env.NPORTAL_DATA_DIR ?? path.join(os.homedir(), '.n-portal'), 'service', 'config.json');
const { token } = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));

const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?t=${token}`);
let seen = 0;
let prev = 0;

const fmt = (ms) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

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
  if (m.type !== 'agents') return;
  seen += 1;
  const now = Date.now();
  const gap = prev ? ` (+${fmt(now - prev)} od predchádzajúcej)` : '';
  prev = now;
  const d = m.data;
  console.log(`\n--- agents #${seen}${gap} ---`);
  console.log(`available=${d.available} reason=${d.reason ?? '–'} agentov=${d.agents.length}`);
  for (const a of d.agents) {
    const det = a.detail ? ` model=${a.detail.model} effort=${a.detail.effort} ťahy=${a.detail.turns} out=${a.detail.tokensOut}` : ' detail=–';
    console.log(`  ${a.id} ${a.status.padEnd(7)} ${a.project} · ${a.title ?? '(bez názvu)'}${det}`);
  }
  console.log(`  dnes: ${d.today.projects} projekty · ${d.today.turns} ťahov · aktívne ${fmt(d.today.activeMs)} · claudeOut ${d.today.claudeOut} · codexOut ${d.today.codexOut}`);
  if (seen >= want) {
    ws.close();
    process.exit(0);
  }
});
setTimeout(() => {
  console.error(`časový limit: prišlo ${seen} správ`);
  process.exit(2);
}, 30000);
