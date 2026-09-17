// Obiehajúce body aktivity agentov na kruhoch usage.
// Správanie je 1 : 1 port schváleného mocku `app/public/mock5.html` (triedy Swarm/Dot, konštanty,
// farby, chvost). Body sa hýbu len cez `transform`/`opacity`, jeden spoločný rAF loop pre všetky
// kruhy beží len vtedy, keď niekde naozaj sú body a stránka je viditeľná (batéria starého telefónu).
import type { AgentsState } from './service';

export type Activity = 'busy' | 'waiting' | 'done' | 'none';
type Live = Exclude<Activity, 'none'>;

const COLORS: Record<Live, string> = { busy: 'var(--busyDot)', waiting: 'var(--waitDot)', done: 'var(--doneDot)' };
const GHOSTS = 4; // dĺžka chvosta: 4 slabnúce stopy
const GROW = 40; // stupne dráhy na rast
const SHRINK = 40; // stupne dráhy na zmenšenie pred zánikom
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Stav providera pre kruh: čaká > pracuje > hotovo > nič. Nečinné relácie sa nerátajú. */
export function providerActivity(agents: AgentsState | null | undefined, provider: string): Activity {
  if (!agents || !agents.available) return 'none';
  let busy = false;
  let done = false;
  for (const a of agents.agents) {
    if (a.provider !== provider) continue;
    if (a.status === 'waiting') return 'waiting';
    if (a.status === 'busy') busy = true;
    else if (a.status === 'done') done = true;
  }
  return busy ? 'busy' : done ? 'done' : 'none';
}

class Dot {
  node: HTMLElement;
  ghosts: HTMLElement[];
  status: Live;
  angle = 0;
  travel = 0;
  size = 0;
  delay = 0;
  life = 0;
  phase: 'grow' | 'run' | 'shrink' | 'dead' = 'grow';
  pulseW = rand(1.2, 2.2);
  pulseA = rand(0.08, 0.16);
  pulsePh = rand(0, 6.28);
  speed = 0;
  target = 0;
  next = 0;
  maxLife = 0;

  constructor(layer: HTMLElement, status: Live) {
    this.status = status;
    // chvost: stopy vkladáme pred bod, aby samotný bod ostal navrchu
    this.ghosts = Array.from({ length: GHOSTS }, () => {
      const g = document.createElement('i');
      g.className = 'g';
      layer.appendChild(g);
      return g;
    });
    this.node = document.createElement('i');
    layer.appendChild(this.node);
    this.setColor(status);
    this.retarget();
  }

  setColor(status: Live) {
    const c = COLORS[status];
    this.node.style.setProperty('--c', c);
    for (const g of this.ghosts) g.style.setProperty('--c', c);
  }

  remove() {
    this.node.remove();
    for (const g of this.ghosts) g.remove();
  }

  retarget() {
    if (this.status === 'waiting') {
      // zámerne „chaotické“: nový smer a rýchlosť, ku ktorým sa plynulo blíži
      const dir = Math.random() < 0.45 ? -1 : 1;
      this.target = dir * rand(18, 70);
      this.next = rand(1.5, 4);
      this.maxLife = rand(9, 14);
    } else {
      // pracuje: stála rýchlosť, jeden obeh 7–11 s; hotovo: o niečo rýchlejšie dobehnutie
      const per = this.status === 'done' ? rand(4, 6) : rand(7, 11);
      this.target = 360 / per;
      this.next = 1e9;
      this.maxLife = 1e9;
      if (this.speed === 0) this.speed = this.target;
    }
  }

  tick(dt: number, t: number, R: number, base: number, reduce: boolean) {
    if (reduce) this.delay = 0; // pri „obmedziť pohyb“ nemá čakanie na vznik zmysel, bod je hneď na mieste
    if (this.delay > 0) {
      this.delay -= dt;
      return;
    }
    this.life += dt;
    // plynulé priblíženie k cieľovej rýchlosti
    this.speed += (this.target - this.speed) * Math.min(1, dt * 1.6);
    this.next -= dt;
    if (this.next <= 0) this.retarget();
    const step = reduce ? 0 : this.speed * dt;
    this.angle += step;
    this.travel += Math.abs(step);
    // fázy života
    if (this.phase === 'grow') {
      this.size = Math.min(1, this.travel / GROW);
      if (this.size >= 1) this.phase = 'run';
    } else if (this.phase === 'run') {
      const back = this.travel >= 360 - SHRINK && Math.abs(((this.angle % 360) + 360) % 360) <= SHRINK + 5; // blíži sa hore
      const old = this.life > this.maxLife;
      if ((this.status !== 'waiting' && this.travel >= 360 - SHRINK) || (this.status === 'waiting' && (old || (this.travel >= 360 && back)))) this.phase = 'shrink';
    } else if (this.phase === 'shrink') {
      this.size = reduce ? 0 : this.size - dt / 0.9; // pri „obmedziť pohyb“ bod zmizne hneď, nezmenšuje sa
      if (this.size <= 0) {
        this.phase = 'dead';
        return;
      }
    }
    if (reduce) this.size = 1; // body stoja v plnej veľkosti, mení sa len farba
    const pulse = reduce ? 1 : 1 + this.pulseA * Math.sin(t * this.pulseW + this.pulsePh);
    const a = (this.angle - 90) * Math.PI / 180;
    const x = Math.cos(a) * R;
    const y = Math.sin(a) * R;
    this.node.style.transform = `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) scale(${(base * this.size * pulse).toFixed(2)})`;
    if (reduce) {
      // pri „obmedziť pohyb“ body stoja a chvost nemá čo kresliť
      for (const g of this.ghosts) g.style.opacity = '0';
      return;
    }
    // chvost: stopy o 0,045 s späť po dráhe (dĺžka rastie s rýchlosťou, pri otočení sa preklopí)
    const lag = this.speed * 0.045;
    this.ghosts.forEach((g, k) => {
      const ga = (this.angle - lag * (k + 1) - 90) * Math.PI / 180;
      const gs = base * this.size * (0.8 - k * 0.16);
      g.style.opacity = (0.55 - k * 0.12).toFixed(2);
      g.style.transform = `translate(calc(-50% + ${(Math.cos(ga) * R).toFixed(1)}px), calc(-50% + ${(Math.sin(ga) * R).toFixed(1)}px)) scale(${gs.toFixed(2)})`;
    });
  }
}

export class RingSwarm {
  private el: HTMLElement;
  private layer: HTMLElement;
  private mini: boolean;
  private dots: Dot[] = [];
  private status: Activity = 'none';
  private want = 2 + Math.floor(Math.random() * 3); // náhodne 2–4

  constructor(el: HTMLElement, layer: HTMLElement) {
    this.el = el;
    this.layer = layer;
    this.mini = el.classList.contains('mini');
    register(this);
  }

  get count(): number {
    return this.dots.length;
  }

  set(status: Activity) {
    const changed = status !== this.status;
    this.status = status;
    this.el.classList.toggle('glow', status === 'waiting');
    if (status === 'none') {
      for (const d of this.dots) d.phase = 'shrink';
      wake();
      return;
    }
    if (changed) {
      for (const d of this.dots) {
        d.status = status;
        d.setColor(status);
        d.retarget();
      }
    }
    while (this.dots.length < this.want) this.spawn(this.dots.length * 0.9);
    while (this.dots.length > this.want) this.dots.pop()!.remove();
    wake();
  }

  private spawn(delay = 0) {
    const status = this.status;
    if (status === 'none') return;
    const d = new Dot(this.layer, status);
    d.delay = delay;
    // pri „obmedziť pohyb“ sa body nehýbu – rozložíme ich po obvode, nech neležia na sebe hore
    if (reduceOn()) d.angle = (this.dots.length * 360) / Math.max(2, this.want) + rand(-12, 12);
    this.dots.push(d);
  }

  tick(dt: number, t: number, reduce: boolean) {
    const w = this.el.clientWidth;
    const R = (w / 2) * 0.88; // polomer vonkajšej dráhy (r=44 zo 50)
    const base = w * (this.mini ? 0.075 : 0.042); // priemer bodu
    for (let i = this.dots.length - 1; i >= 0; i--) {
      const d = this.dots[i];
      d.tick(dt, t, R, base, reduce);
      if (d.phase === 'dead') {
        d.remove();
        this.dots.splice(i, 1);
        if (this.status === 'busy' || this.status === 'waiting') {
          this.want = 2 + Math.floor(Math.random() * 3); // počet sa priebežne mení 2–4
          while (this.dots.length < this.want) this.spawn(rand(0.3, 1.5)); // „hotovo“ sa neobnovuje
        }
      }
    }
  }

  destroy() {
    for (const d of this.dots) d.remove();
    this.dots = [];
    this.el.classList.remove('glow');
    unregister(this);
  }
}

// ---------- spoločný rAF loop ----------
// Beží len keď má aspoň jeden roj body a stránka je viditeľná. Pri „obmedziť pohyb“ sa po
// jednom prekreslení zastaví (body aj tak stoja) a prebudí ho až zmena stavu alebo prepnutie.

const swarms = new Set<RingSwarm>();
let rafId = 0;
let last = 0;
let settled = false; // v režime „obmedziť pohyb“ je už všetko dokreslené
let lastReduce = false;
let hooked = false;

const reduceOn = () => document.documentElement.classList.contains('reduce');

function needsLoop(): boolean {
  if (typeof document === 'undefined' || document.visibilityState !== 'visible') return false;
  if (reduceOn() && settled) return false;
  for (const s of swarms) if (s.count > 0) return true;
  return false;
}

function wake() {
  settled = false;
  ensureLoop();
}

function ensureLoop() {
  if (rafId || !needsLoop()) return;
  last = performance.now();
  rafId = requestAnimationFrame(frame);
  if (import.meta.env.DEV) console.info('[n-portal] aktivita kruhov: loop štart');
}

function frame(now: number) {
  rafId = 0;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  const reduce = reduceOn();
  if (reduce !== lastReduce) {
    lastReduce = reduce;
    settled = false;
  }
  for (const s of swarms) s.tick(dt, t, reduce);
  if (reduce) settled = true;
  if (needsLoop()) rafId = requestAnimationFrame(frame);
  else if (import.meta.env.DEV) console.info('[n-portal] aktivita kruhov: loop stop');
}

function register(s: RingSwarm) {
  swarms.add(s);
  if (hooked || typeof document === 'undefined') return;
  hooked = true;
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('resize', wake);
  // prepnutie „obmedziť pohyb“ mení triedu na <html>; loop môže práve stáť, tak ho prebudíme
  new MutationObserver(wake).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}

function unregister(s: RingSwarm) {
  swarms.delete(s);
}

/** Počet bodov vo všetkých rojoch a či beží loop – na overenie v konzole. */
export function ringActivityStats() {
  let dots = 0;
  for (const s of swarms) dots += s.count;
  return { swarms: swarms.size, dots, running: rafId !== 0 };
}
