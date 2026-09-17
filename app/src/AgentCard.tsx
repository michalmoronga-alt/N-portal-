// Karta jednej relácie agenta (režim AI). Vyčlenená z Ai.tsx kvôli detailu (AI‑2).
// Ťah doľava kartu rozvinie – pod hlavným riadkom sa vysunie detail (model, tokeny, nástroje…),
// ťah doprava alebo klepnutie na rozvinutú kartu ju zavrie. Detekcia ťahu je spoločná so SKP
// (swipe.ts: 36 px, dominantná os), aby sa ťahy po celom paneli správali rovnako.
import { useMemo, useRef } from 'react';
import { ProviderLogo } from './Logos';
import type { AgentInfo } from './service';
import { formatDuration as dur, formatAgo as ago } from './time';
import { formatTokens, shortModel, topTools } from './format';
import { swipeDirOf } from './swipe';

interface Props {
  agent: AgentInfo;
  now: number;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** Klepnutie na nerozvinutú kartu – pripravené pre AI‑3 (prenesie okno relácie na PC dopredu). */
  onTap?: () => void;
}

const CHIP: Record<string, { cls: string; text: string }> = {
  busy: { cls: 'busy', text: 'pracuje' },
  waiting: { cls: 'wait', text: 'čaká na teba' },
  done: { cls: 'done', text: 'hotovo' },
  idle: { cls: 'idle', text: 'nečinný' },
};

export default function AgentCard({ agent, now, open, onOpen, onClose, onTap }: Props) {
  // Častice sa generujú raz na reláciu (useMemo podľa id), aby pri každom heartbeate „nepreskakovali“.
  const parts = useMemo(() => makeParticles(agent.id), [agent.id]);
  const chip = CHIP[agent.status] ?? { cls: 'idle', text: agent.status };
  const flows = agent.status === 'busy' || agent.status === 'waiting';
  const wait = agent.status === 'waiting';
  const cls = agent.status === 'waiting' ? 'wait' : agent.status;

  // ťah: začiatok dotyku si pamätáme, vyhodnotíme až pri pustení (bez spätnej väzby počas ťahu)
  const start = useRef<{ x: number; y: number; id: number } | null>(null);

  return (
    <div
      className={`agent ${agent.provider} ${cls} ${open ? 'open' : ''}`}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerUp={(e) => {
        if (!start.current || start.current.id !== e.pointerId) return;
        const d = swipeDirOf(e.clientX - start.current.x, e.clientY - start.current.y);
        start.current = null;
        if (d === 'left') onOpen();
        else if (d === 'right') onClose();
        else if (!d) {
          // klepnutie: rozvinutú kartu zavrie, inak zatiaľ nič (žiadna LED ani toast)
          if (open) onClose();
          else onTap?.();
        }
        // zvislý ťah necháme bez akcie (zoznam sa neposúva, ale prst môže skĺznuť)
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
    >
      {flows && (
        <div className="flow" aria-hidden="true">
          <div className="sweep" />
          {parts.map((p, i) => (
            <i
              key={i}
              className="p"
              style={{
                top: `${p.top}%`,
                left: wait ? `${p.left}%` : '-2%',
                width: `${p.size}vh`,
                height: `${p.size}vh`,
                opacity: p.op,
                animationDuration: `${wait ? p.waitDur : p.dur}s`,
                animationDelay: `-${p.delay}s`,
              }}
            />
          ))}
        </div>
      )}
      <div className="row">
        <div className="who"><ProviderLogo provider={agent.provider} /></div>
        <div className="what">
          <div className="proj">{agent.project}</div>
          {agent.title && <div className="sess">{agent.title}</div>}
        </div>
        <div className="st">
          <span className={`chip ${chip.cls}`}><i />{chip.text}</span>
          <span className="meta">{metaText(agent, now)}</span>
        </div>
      </div>
      {/* detail: výška sa animuje cez grid-template-rows 0fr → 1fr (250 ms), obsah ostáva v DOM,
          takže sa hodnoty pri každej správe `agents` prepíšu bez bliknutia */}
      <div className="det-wrap" aria-hidden={!open}>
        <div className="det-in">
          <Detail agent={agent} />
        </div>
      </div>
    </div>
  );
}

// ---------- detail karty ----------

/** Štítok v detaile: popis pred hodnotou („vstup 3,7 k“) alebo za ňou („11 ťahov“). */
interface Item { pre?: string; v: string; post?: string }

function Detail({ agent }: { agent: AgentInfo }) {
  const d = agent.detail;
  const rows: Item[][] = [];
  if (d) {
    const model = shortModel(d.model);
    const first: Item[] = [];
    if (model) first.push({ pre: 'model', v: model });
    if (d.effort) first.push({ pre: 'effort', v: d.effort });
    if (d.branch) first.push({ pre: 'vetva', v: d.branch });
    if (d.origin && agent.provider === 'codex') first.push({ pre: 'pôvod', v: `z ${d.origin}` });

    const second: Item[] = [];
    if (d.tokensIn !== null) second.push({ pre: 'vstup', v: formatTokens(d.tokensIn) });
    if (d.tokensOut !== null) second.push({ pre: 'výstup', v: formatTokens(d.tokensOut) });
    if (d.cacheRead !== null) second.push({ pre: 'cache', v: formatTokens(d.cacheRead) });
    if (d.turns !== null) second.push({ v: String(d.turns), post: turnWord(d.turns) });
    if (d.durationMs !== null) second.push({ pre: 'trvanie', v: dur(d.durationMs) });
    for (const t of topTools(d.tools)) second.push({ pre: t.name, v: String(t.count) });

    if (first.length) rows.push(first);
    if (second.length) rows.push(second);
  }

  return (
    <div className="det">
      {rows.length ? (
        rows.map((row, i) => (
          <div className="r" key={i}>
            {row.map((it, j) => (
              <span className="d" key={j}>
                {it.pre && <em>{it.pre}</em>}
                <b>{it.v}</b>
                {it.post && <em>{it.post}</em>}
              </span>
            ))}
          </div>
        ))
      ) : (
        <div className="r none">Detail ešte nie je k dispozícii</div>
      )}
    </div>
  );
}

function turnWord(n: number): string {
  return n === 1 ? 'ťah' : n >= 2 && n <= 4 ? 'ťahy' : 'ťahov';
}

function metaText(a: AgentInfo, now: number): string {
  if (a.status === 'busy') return `${dur(now - a.since)} · pred ${dur(now - a.lastActivity)}`;
  if (a.status === 'waiting') return `otázka pred ${dur(now - a.lastActivity)}`;
  if (a.status === 'done') {
    const run = a.startedAt ? ` · trvalo ${dur(a.since - a.startedAt)}` : '';
    return `${ago(now - a.since)}${run}`;
  }
  return `bez aktivity ${dur(now - a.lastActivity)}`;
}

// ---------- častice: náhodné, ale stabilné pre danú reláciu ----------

interface Particle { top: number; left: number; size: number; dur: number; waitDur: number; delay: number; op: number }

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function makeParticles(id: string): Particle[] {
  const r = rng(hash(id));
  const n = 5 + Math.floor(r() * 3); // 5–7 kusov
  return Array.from({ length: n }, () => ({
    top: 8 + r() * 78,
    left: 12 + r() * 72,
    size: 0.35 + r() * 0.35, // 0,35–0,7 vh
    dur: 6 + r() * 6, // pracuje: 6–12 s
    waitDur: 2 + r() * 2, // čaká: 2–4 s
    delay: r() * 10,
    op: 0.45 + r() * 0.45,
  }));
}
