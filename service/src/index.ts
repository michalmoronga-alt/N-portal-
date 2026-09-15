// N-portal – lokálna služba na PC.
// HTTP: servuje zostavenú PWA z ../app/dist a /api/health.
// WebSocket /ws?t=<token>: posiela stav po témach (sketchup, usage, media, foreground) a prijíma povely z PWA.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { loadConfig, SERVICE_DIR } from './config.js';
import { readInstances, buildState, sendCommand, ALLOWED_ACTIONS, type SketchUpState } from './sketchup.js';
import { readUsage, USAGE_FILE, type UsageState } from './usage.js';
import { MediaBridge, MEDIA_ACTIONS } from './media.js';
import { ForegroundBridge } from './foreground.js';

const VERSION = '0.4.0';
const SKETCHUP_POLL_MS = 250;
const USAGE_POLL_MS = 5000;
const HEARTBEAT_PUSH_MS = 2000;

const here = path.dirname(fileURLToPath(import.meta.url));
const APP_DIST = path.resolve(here, '..', '..', 'app', 'dist');
const cfg = loadConfig();

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function log(msg: string) {
  console.log(`${new Date().toLocaleTimeString('sk-SK')} ${msg}`);
}

// ---------- stav po témach ----------

const media = new MediaBridge(log);
const foreground = new ForegroundBridge(log);
let lastSketchupFgPid: number | null = null; // relácia SketchUpu, ktorej okno bolo naposledy v popredí
let sketchup: SketchUpState = buildState(readInstances(), lastSketchupFgPid);
let usage: UsageState = readUsage();

const wss = new WebSocketServer({ noServer: true });

function broadcast(payload: string) {
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(payload);
}
const msg = (type: string, data: unknown) => JSON.stringify({ type, ts: Date.now(), data });

// ---------- HTTP ----------

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    res.end(
      JSON.stringify({
        ok: true, version: VERSION, time: Date.now(),
        sketchup, usage, foreground: foreground.state,
        media: { ...media.state, thumb: media.state.thumb ? '(obrázok)' : null },
      }),
    );
    return;
  }

  // statická PWA (bez tokenu – samotná aplikácia nie je tajomstvo, dáta idú cez WS)
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html';
  const file = path.normalize(path.join(APP_DIST, rel));
  if (!file.startsWith(APP_DIST) || !fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(fs.existsSync(APP_DIST) ? 'Nenájdené' : 'PWA nie je zostavená: spusti `npm run build` v priečinku app.');
    return;
  }
  const ext = path.extname(file);
  const noCache = ext === '.html' || file.endsWith('sw.js') || ext === '.webmanifest';
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': noCache ? 'no-store' : 'public, max-age=31536000, immutable',
  });
  fs.createReadStream(file).pipe(res);
});

// ---------- WebSocket ----------

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname !== '/ws' || url.searchParams.get('t') !== cfg.token) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    log(`WS odmietnuté (${req.socket.remoteAddress}): zlý token alebo cesta`);
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

type ClientMsg =
  | { type: 'command'; action: string; id?: string }
  | { type: 'media'; action: string }
  | { type: 'ping' };

wss.on('connection', (ws, req) => {
  log(`PWA pripojená z ${req.socket.remoteAddress}`);
  ws.send(msg('sketchup', sketchup));
  ws.send(msg('usage', usage));
  ws.send(msg('media', media.state));
  ws.send(msg('foreground', foreground.state));

  ws.on('message', (data) => {
    let m: ClientMsg;
    try {
      m = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (m.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      return;
    }
    if (m.type === 'media') {
      const ok = MEDIA_ACTIONS.has(m.action) && media.send(m.action);
      if (!ok) log(`media povel odmietnutý: ${m.action}`);
      return;
    }
    if (m.type === 'command') {
      if (!ALLOWED_ACTIONS.has(m.action)) {
        ws.send(JSON.stringify({ type: 'ack', clientId: m.id, ok: false, error: `Nepovolená akcia: ${m.action}` }));
        return;
      }
      if (!sketchup.available || sketchup.pid === null) {
        const why = sketchup.targetReason === 'ambiguous'
          ? 'Beží viac SketchUpov – klikni do toho, ktorý chceš ovládať.'
          : 'SketchUp je nedostupný, povel sa neposiela.';
        ws.send(JSON.stringify({ type: 'ack', clientId: m.id, ok: false, error: why }));
        return;
      }
      try {
        const { id } = sendCommand(sketchup.pid, m.action, m.id);
        log(`povel ${m.action} → pid ${sketchup.pid} (${sketchup.model ?? '?'}) ${id}`);
        ws.send(JSON.stringify({ type: 'ack', clientId: m.id, ok: true, id }));
      } catch (e) {
        ws.send(JSON.stringify({ type: 'ack', clientId: m.id, ok: false, error: (e as Error).message }));
      }
    }
  });

  ws.on('close', () => log('PWA odpojená'));
});

// ---------- sledovanie zdrojov ----------

let lastSketchup = JSON.stringify(sketchup);
let lastSketchupPush = 0;
function refreshSketchup(force = false) {
  const st = buildState(readInstances(), lastSketchupFgPid);
  const ser = JSON.stringify(st);
  const now = Date.now();
  if (force || ser !== lastSketchup || now - lastSketchupPush >= HEARTBEAT_PUSH_MS) {
    if (st.available !== sketchup.available || st.pid !== sketchup.pid) {
      log(`SketchUp cieľ: ${st.available ? `pid ${st.pid} (${st.model ?? '?'}, ${st.targetReason})` : `nedostupný (${st.receiverStatus})`}; relácií: ${st.instances.length}`);
    }
    sketchup = st;
    lastSketchup = ser;
    lastSketchupPush = now;
    broadcast(msg('sketchup', st));
  }
}
setInterval(() => refreshSketchup(), SKETCHUP_POLL_MS);

let lastUsage = JSON.stringify(usage);
setInterval(() => {
  const u = readUsage();
  const ser = JSON.stringify(u);
  if (ser !== lastUsage) {
    usage = u;
    lastUsage = ser;
    broadcast(msg('usage', u));
  }
}, USAGE_POLL_MS);

media.onChange((s) => broadcast(msg('media', s)));
media.start();

foreground.onChange((s) => {
  if (s.kind === 'sketchup' && s.pid && s.pid !== lastSketchupFgPid) {
    lastSketchupFgPid = s.pid;
    refreshSketchup(true);
  }
  broadcast(msg('foreground', s));
});
foreground.start();

// ---------- štart ----------

function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.') && !a.address.startsWith('100.')) out.push(a.address);
    }
  }
  return out;
}

// Ak už služba beží (napr. spustená ručne a zároveň Plánovačom), druhá kópia sa ticho ukončí.
server.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') {
    log(`port ${cfg.port} už používa iná kópia služby – končím`);
    media.stop();
    foreground.stop();
    process.exit(0);
  }
  log(`server chyba: ${e.message}`);
  process.exit(1);
});

server.listen(cfg.port, '0.0.0.0', () => {
  console.log('');
  console.log(`N-portal služba v${VERSION}  (konfigurácia: ${SERVICE_DIR})`);
  console.log(`PWA:      ${fs.existsSync(APP_DIST) ? APP_DIST : 'NIE JE ZOSTAVENÁ – npm run build v app/'}`);
  console.log(`Usage:    ${fs.existsSync(USAGE_FILE) ? USAGE_FILE : 'súbor usage sa nenašiel – ' + USAGE_FILE}`);
  for (const ip of lanAddresses()) console.log(`Mobil:    http://${ip}:${cfg.port}/?t=${cfg.token}`);
  console.log(`Lokálne:  http://localhost:${cfg.port}/?t=${cfg.token}`);
  console.log('');
});

process.on('SIGINT', () => {
  media.stop();
  foreground.stop();
  process.exit(0);
});
