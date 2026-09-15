// N-portal – lokálna služba na PC.
// HTTP: servuje zostavenú PWA z ../app/dist a /api/health.
// WebSocket /ws?t=<token>: posiela stav (SketchUp) a prijíma povely z PWA.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { loadConfig, SERVICE_DIR } from './config.js';
import { readState, sendCommand, ALLOWED_ACTIONS, type SketchUpState } from './sketchup.js';

const VERSION = '0.1.0';
const STATE_POLL_MS = 250;
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

// ---------- HTTP ----------

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, version: VERSION, time: Date.now(), sketchup: readState() }));
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

const wss = new WebSocketServer({ noServer: true });

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
  | { type: 'ping' };

function stateMessage(st: SketchUpState) {
  return JSON.stringify({ type: 'state', ts: Date.now(), sketchup: st });
}

wss.on('connection', (ws, req) => {
  log(`PWA pripojená z ${req.socket.remoteAddress}`);
  ws.send(stateMessage(lastState));

  ws.on('message', (data) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      return;
    }
    if (msg.type === 'command') {
      if (!ALLOWED_ACTIONS.has(msg.action)) {
        ws.send(JSON.stringify({ type: 'ack', clientId: msg.id, ok: false, error: `Nepovolená akcia: ${msg.action}` }));
        return;
      }
      if (!lastState.available) {
        ws.send(JSON.stringify({ type: 'ack', clientId: msg.id, ok: false, error: 'SketchUp je nedostupný, povel sa neposiela.' }));
        return;
      }
      try {
        const { id } = sendCommand(msg.action, msg.id);
        log(`povel ${msg.action} → ${id}`);
        ws.send(JSON.stringify({ type: 'ack', clientId: msg.id, ok: true, id }));
      } catch (e) {
        ws.send(JSON.stringify({ type: 'ack', clientId: msg.id, ok: false, error: (e as Error).message }));
      }
    }
  });

  ws.on('close', () => log('PWA odpojená'));
});

// ---------- sledovanie stavu SketchUpu ----------

let lastState: SketchUpState = readState();
let lastSerialized = JSON.stringify(lastState);
let lastPush = 0;

setInterval(() => {
  const st = readState();
  const ser = JSON.stringify(st);
  const now = Date.now();
  if (ser !== lastSerialized || now - lastPush >= HEARTBEAT_PUSH_MS) {
    if (st.available !== lastState.available) log(`SketchUp ${st.available ? 'dostupný' : 'nedostupný'} (${st.receiverStatus})`);
    lastState = st;
    lastSerialized = ser;
    lastPush = now;
    const payload = stateMessage(st);
    for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(payload);
  }
}, STATE_POLL_MS);

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

server.listen(cfg.port, '0.0.0.0', () => {
  console.log('');
  console.log(`N-portal služba v${VERSION}  (konfigurácia: ${SERVICE_DIR})`);
  console.log(`PWA:      ${fs.existsSync(APP_DIST) ? APP_DIST : 'NIE JE ZOSTAVENÁ – npm run build v app/'}`);
  for (const ip of lanAddresses()) console.log(`Mobil:    http://${ip}:${cfg.port}/?t=${cfg.token}`);
  console.log(`Lokálne:  http://localhost:${cfg.port}/?t=${cfg.token}`);
  console.log('');
});
