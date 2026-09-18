// Obal skladby vo vysokom rozlíšení pre hudbu z YouTube v Chrome.
//
// Prečo: Chrome hlási Windows Media Session obrázok len 150 × 83 px, na karte prehrávača
// je zväčšený a kockatý. Rozšírenie `chrome-ext/` (Manifest V3) hlási na `POST /api/artwork`,
// ktoré video je otvorené a či hrá. Keď sa názov hlásenia zhoduje s tým, čo Windows hlási
// ako práve hranú skladbu z Chrome, stiahneme obrázok priamo z YouTube
// (`i.ytimg.com/vi/<id>/maxresdefault.jpg`, náhrada `hqdefault.jpg`), uložíme ho do
// `~/.n-portal/artwork` a PWA ho dostane ako cestu `/art/<id>.jpg` v poli `art`.
//
// Mimo tento počítač neodchádza nič okrem samotného stiahnutia obrázka z YouTube.
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DATA_ROOT } from './config.js';
import type { MediaState } from './media.js';

export const ARTWORK_DIR = path.join(DATA_ROOT, 'artwork');

const ID_RE = /^[A-Za-z0-9_-]{6,20}$/;
const MAX_REPORTS = 20; // pamätáme si posledných 20 videí, staršie vypadnú
const FRESH_MS = 15000; // hlásenie bez `playing` platí 15 s
const MIN_BYTES = 5000; // menší súbor = zástupný obrázok 120 × 90, skús hqdefault
const FETCH_TIMEOUT_MS = 5000;
const RETRY_FAIL_MS = 10 * 60 * 1000; // neúspešné sťahovanie skúsime najskôr o 10 minút
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // pri štarte zmažeme obrázky staršie než 30 dní
const MAX_BODY = 4096;

export interface ArtworkReport {
  videoId: string;
  title: string;
  playing: boolean;
  ts: number; // čas služby, kedy hlásenie prišlo
}

type Listener = () => void;

/** Názov na porovnanie: malé písmená, zlúčené medzery, orezané okraje. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Zhoda názvov: 3 = presná, 2 = jeden je začiatkom druhého, 1 = jeden obsahuje druhý, 0 = nič. */
function score(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 3;
  const min = Math.min(a.length, b.length);
  if (min >= 8 && (a.startsWith(b) || b.startsWith(a))) return 2;
  if (min >= 12 && (a.includes(b) || b.includes(a))) return 1;
  return 0;
}

function isLocal(addr: string | undefined | null): boolean {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Max-Age': '86400',
};

export class ArtworkBridge {
  /** posledné hlásenia z rozšírenia, kľúč = videoId */
  private reports = new Map<string, ArtworkReport>();
  private cached = new Set<string>(); // videá, ktorých obrázok máme na disku
  private inflight = new Set<string>(); // práve sťahované – to isté nikdy dvakrát naraz
  private failed = new Map<string, number>(); // videoId → čas posledného neúspechu
  private listeners: Listener[] = [];
  private log: (m: string) => void;

  constructor(log: (m: string) => void) {
    this.log = log;
  }

  onChange(fn: Listener) {
    this.listeners.push(fn);
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  /** Načíta, čo už je v cache, a zmaže obrázky staršie než 30 dní. */
  start() {
    try {
      fs.mkdirSync(ARTWORK_DIR, { recursive: true });
      const now = Date.now();
      let removed = 0;
      for (const name of fs.readdirSync(ARTWORK_DIR)) {
        const file = path.join(ARTWORK_DIR, name);
        const id = name.endsWith('.jpg') ? name.slice(0, -4) : null;
        try {
          const st = fs.statSync(file);
          if (!id || !ID_RE.test(id) || now - st.mtimeMs > MAX_AGE_MS) {
            fs.unlinkSync(file);
            removed += 1;
            continue;
          }
          this.cached.add(id);
        } catch {
          /* súbor medzitým zmizol – nevadí */
        }
      }
      this.log(`artwork: cache ${ARTWORK_DIR} – ${this.cached.size} obrázkov${removed ? `, zmazaných ${removed}` : ''}`);
    } catch (e) {
      this.log(`artwork: cache sa nedá pripraviť: ${(e as Error).message}`);
    }
  }

  // ---------- hlásenia z rozšírenia ----------

  /** Uloží hlásenie z rozšírenia. Vracia false, ak je neplatné. */
  report(r: { videoId?: unknown; title?: unknown; playing?: unknown; ts?: unknown }): boolean {
    const id = typeof r.videoId === 'string' ? r.videoId : '';
    if (!ID_RE.test(id)) return false;
    const title = typeof r.title === 'string' ? r.title : '';
    if (title.length > 300) return false;
    const rec: ArtworkReport = { videoId: id, title, playing: r.playing === true, ts: Date.now() };
    this.reports.delete(id); // vloženie nakoniec = najnovšie, staré vypadávajú spredu
    this.reports.set(id, rec);
    while (this.reports.size > MAX_REPORTS) {
      const first = this.reports.keys().next();
      if (first.done) break;
      this.reports.delete(first.value);
    }
    this.emit();
    return true;
  }

  /** Cesta k väčšiemu obrázku pre práve hranú skladbu, alebo null (vtedy ostáva `thumb` z Windows). */
  artFor(media: MediaState): string | null {
    const id = this.matchVideo(media);
    if (!id) return null;
    if (this.cached.has(id)) return `/art/${id}.jpg`;
    this.download(id);
    return null;
  }

  /** Nájde hlásenie, ktoré patrí k práve hranej skladbe z Chrome. */
  private matchVideo(media: MediaState): string | null {
    if (!media.available || !media.title) return null;
    if (!(media.app ?? '').toLowerCase().includes('chrome')) return null;
    const want = norm(media.title);
    if (!want) return null;
    const now = Date.now();
    let best: { s: number; r: ArtworkReport } | null = null;
    for (const r of this.reports.values()) {
      if (!r.playing && now - r.ts > FRESH_MS) continue;
      const s = score(want, norm(r.title));
      if (s === 0) continue;
      if (!best || s > best.s || (s === best.s && r.ts > best.r.ts)) best = { s, r };
    }
    return best ? best.r.videoId : null;
  }

  // ---------- sťahovanie ----------

  private download(id: string) {
    if (this.inflight.has(id) || this.cached.has(id)) return;
    const failedAt = this.failed.get(id);
    if (failedAt !== undefined && Date.now() - failedAt < RETRY_FAIL_MS) return;
    this.inflight.add(id);
    const url = (name: string) => `https://i.ytimg.com/vi/${id}/${name}.jpg`;
    fetchImage(url('maxresdefault'))
      .then((buf) => (buf && buf.length >= MIN_BYTES ? buf : fetchImage(url('hqdefault'))))
      .then((buf) => {
        this.inflight.delete(id);
        if (!buf || buf.length < 1000) {
          this.failed.set(id, Date.now());
          this.log(`artwork: ${id} – obrázok sa nenašiel (YouTube nevrátil použiteľný súbor)`);
          return;
        }
        fs.mkdirSync(ARTWORK_DIR, { recursive: true });
        const file = path.join(ARTWORK_DIR, `${id}.jpg`);
        const tmp = `${file}.tmp`;
        fs.writeFileSync(tmp, buf);
        fs.renameSync(tmp, file);
        this.cached.add(id);
        this.failed.delete(id);
        this.log(`artwork: ${id} uložený (${Math.round(buf.length / 1024)} kB)`);
        this.emit();
      })
      .catch((e) => {
        this.inflight.delete(id);
        this.failed.set(id, Date.now());
        this.log(`artwork: ${id} sa nepodarilo stiahnuť: ${(e as Error).message}`);
      });
  }

  // ---------- HTTP ----------

  /** Obslúži `/api/artwork` a `/art/<id>.jpg`. Vracia true, ak požiadavku prevzala. */
  handleRequest(req: IncomingMessage, res: ServerResponse, url: URL): boolean {
    if (url.pathname === '/api/artwork') {
      this.handlePost(req, res);
      return true;
    }
    if (url.pathname.startsWith('/art/')) {
      this.serveImage(res, url.pathname);
      return true;
    }
    return false;
  }

  private handlePost(req: IncomingMessage, res: ServerResponse) {
    // Hlásenia berieme len z tohto počítača; volá ich rozšírenie v Chrome.
    if (!isLocal(req.socket.remoteAddress)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Len z tohto počítača');
      return;
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { ...CORS, Allow: 'POST, OPTIONS' });
      res.end();
      return;
    }
    let body = '';
    let tooBig = false;
    req.setEncoding('utf8');
    req.on('data', (c: string) => {
      if (tooBig) return;
      body += c;
      if (body.length > MAX_BODY) {
        tooBig = true;
        res.writeHead(413, CORS);
        res.end();
        req.destroy();
      }
    });
    req.on('end', () => {
      if (tooBig) return;
      let data: unknown;
      try {
        data = JSON.parse(body);
      } catch {
        res.writeHead(400, { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Neplatný JSON');
        return;
      }
      if (!data || typeof data !== 'object' || !this.report(data as Record<string, unknown>)) {
        res.writeHead(400, { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Neplatné hlásenie');
        return;
      }
      res.writeHead(204, CORS);
      res.end();
    });
    req.on('error', () => {
      /* prerušené spojenie – nič neriešime */
    });
  }

  private serveImage(res: ServerResponse, pathname: string) {
    const name = pathname.slice('/art/'.length);
    const id = name.endsWith('.jpg') ? name.slice(0, -4) : '';
    // len súbory z nášho priečinka a len podľa tvaru identifikátora (žiadne „..“)
    if (!ID_RE.test(id)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Nenájdené');
      return;
    }
    const file = path.join(ARTWORK_DIR, `${id}.jpg`);
    if (!file.startsWith(ARTWORK_DIR) || !fs.existsSync(file)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Nenájdené');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' });
    fs.createReadStream(file).pipe(res);
  }

  /** Prehľad pre /api/health. */
  health() {
    const last = [...this.reports.values()].sort((a, b) => b.ts - a.ts)[0] ?? null;
    return {
      reports: this.reports.size,
      cached: this.cached.size,
      dir: ARTWORK_DIR,
      last: last ? { videoId: last.videoId, title: last.title, playing: last.playing, ageSec: Math.round((Date.now() - last.ts) / 1000) } : null,
    };
  }
}

/** Stiahne obrázok. Vráti null, keď server odpovie inak než 200 alebo to trvá dlhšie než 5 s. */
function fetchImage(url: string, redirects = 2): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'N-portal/1.0' } }, (res) => {
      const code = res.statusCode ?? 0;
      if (code >= 300 && code < 400 && res.headers.location && redirects > 0) {
        res.resume();
        fetchImage(new URL(res.headers.location, url).toString(), redirects - 1).then(resolve, reject);
        return;
      }
      if (code !== 200) {
        res.resume();
        resolve(null);
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.setTimeout(FETCH_TIMEOUT_MS, () => req.destroy(new Error('časový limit 5 s')));
    req.on('error', reject);
  });
}
