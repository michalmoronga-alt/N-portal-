import { useEffect, useRef, useState } from 'react';
import Ring from './Ring';
import type { Ack, MediaState, SketchUpState, UsageState } from './service';
import { useClock, formatDateShort } from './time';

type Flash = { kind: 'ok' | 'error' | 'warn'; text: string; until: number } | null;
const REPLY_TIMEOUT_MS = 3000;

interface Props {
  online: boolean;
  sketchup: SketchUpState | null;
  usage: UsageState | null;
  media: MediaState | null;
  lastAck: Ack | null;
  sendCommand: (action: string) => string | null;
  sendMedia: (a: 'play' | 'pause' | 'toggle' | 'next' | 'prev') => void;
}

// Dlaždice: stále pozície. Názov a popis dlaždíc E3 sa mení podľa skutočného stavu v SketchUpe.
interface Tile { action: string; name: string; sub: string; icon: React.ReactNode; enabled: boolean }
function buildTiles(s: SketchUpState | null): Tile[] {
  const iso = !!s?.isolationActive;
  const hidden = !!s?.hiddenObjectsShown;
  return [
    { action: 'focus_selection', name: 'Zamerať výber', sub: '', enabled: true, icon: <IconFocus /> },
    { action: 'view_top', name: 'Zhora', sub: '', enabled: true, icon: <IconTop /> },
    { action: 'view_front', name: 'Spredu', sub: '', enabled: true, icon: <IconBox /> },
    { action: 'view_left', name: 'Zľava', sub: '', enabled: true, icon: <IconBoxLeft /> },
    { action: 'view_previous', name: 'Predošlý pohľad', sub: '', enabled: true, icon: <IconUndo /> },
    { action: 'view_all', name: 'Celý model', sub: '', enabled: true, icon: <IconAll /> },
    {
      action: 'isolate_toggle',
      name: iso ? 'Obnoviť' : 'Izolovať',
      sub: iso ? `skrytých ${s!.isolationCount}` : 'výber',
      enabled: true,
      icon: iso ? <IconEyeOff /> : <IconEye />,
    },
    {
      action: 'hidden_objects_toggle',
      name: 'Skryté objekty',
      sub: hidden ? 'zobrazené' : 'skryté',
      enabled: true,
      icon: <IconGhost />,
    },
  ];
}

export default function Skp({ online, sketchup, usage, media, lastAck, sendCommand, sendMedia }: Props) {
  const now = useClock();
  const [flash, setFlash] = useState<Flash>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null); // dlaždica, ktorej patrí stav odoslané/výsledok
  const pendingSince = useRef(0);
  const seenLastId = useRef<string | null>(null);
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setTick(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);

  // potvrdenie od služby
  useEffect(() => {
    if (!lastAck) return;
    if (lastAck.ok && lastAck.id) {
      setPendingId(lastAck.id);
      pendingSince.current = Date.now();
    } else {
      setPendingId(null);
      setFlash({ kind: 'warn', text: lastAck.error ?? 'Povel odmietnutý.', until: Date.now() + 3000 });
    }
  }, [lastAck]);

  // výsledok z prijímača
  useEffect(() => {
    const last = sketchup?.last;
    if (!last || last.id === seenLastId.current) return;
    if (seenLastId.current === null && !pendingId) {
      seenLastId.current = last.id; // starý výsledok, nezobrazovať
      return;
    }
    seenLastId.current = last.id;
    if (pendingId && last.id !== pendingId) return;
    setPendingId(null);
    const kind = last.status === 'ok' ? 'ok' : last.status === 'error' ? 'error' : 'warn';
    setFlash({ kind, text: last.message, until: Date.now() + (kind === 'ok' ? 2000 : 3500) });
  }, [sketchup?.last, pendingId]);

  // bez odpovede
  useEffect(() => {
    if (pendingId && tick - pendingSince.current > REPLY_TIMEOUT_MS) {
      setPendingId(null);
      setFlash({ kind: 'warn', text: 'Bez odpovede zo SketchUpu.', until: Date.now() + 3000 });
    }
  }, [tick, pendingId]);

  const ready = online && !!sketchup?.available;
  const activeFlash = flash && flash.until > tick ? flash : null;

  const press = (action: string) => {
    if (!ready) {
      setFlash({ kind: 'warn', text: online ? 'SketchUp je nedostupný.' : 'Nie je spojenie so službou na PC.', until: Date.now() + 2500 });
      return;
    }
    if (pendingId) return;
    const id = sendCommand(action);
    if (id) {
      pendingSince.current = Date.now();
      setPendingId('pending');
      setActiveAction(action);
      setFlash(null);
    }
  };

  const stale = !usage || !usage.available || usage.stale;
  const playing = media?.status === 'Playing';
  const status = activeFlash?.text ?? (pendingId ? 'Odoslané…' : ready ? `Model: ${sketchup!.model ?? '?'} · výber: ${sketchup!.selectionCount ?? '?'}` : 'SketchUp nedostupný');

  return (
    <div className="skp">
      <aside className="card strip">
        <div className="strip-time">
          <div className="t">{String(now.getHours()).padStart(2, '0')}<br />{String(now.getMinutes()).padStart(2, '0')}</div>
          <div className="d">{formatDateShort(now)}</div>
        </div>
        <div className="rings">
          <Ring size="mini" weekly={usage?.codex.weeklyUsed ?? null} label="Codex" stale={stale} />
          <Ring size="mini" weekly={usage?.claude.weeklyUsed ?? null} session={usage?.claude.sessionUsed ?? null} label="Claude" stale={stale} />
        </div>
        <div className="mus">
          <button onClick={() => sendMedia('prev')} disabled={!media?.available} aria-label="Predošlá">⏮</button>
          <button onClick={() => sendMedia('toggle')} disabled={!media?.available} aria-label="Prehrať / pauza">{playing ? '⏸' : '▶'}</button>
          <button onClick={() => sendMedia('next')} disabled={!media?.available} aria-label="Ďalšia">⏭</button>
        </div>
      </aside>

      <div className="skp-main">
        <div className="grid">
          {buildTiles(sketchup).map((t) => {
            let cls = 'tile';
            if (!t.enabled) cls += ' off';
            else if (t.action === activeAction && activeFlash) cls += ` ${activeFlash.kind}`;
            else if (t.action === activeAction && pendingId) cls += ' sent';
            else if (ready) cls += ' on';
            else cls += ' idle';
            if (t.action === 'isolate_toggle' && sketchup?.isolationActive && !activeFlash) cls += ' active';
            return (
              <button key={t.action} className={cls} onClick={() => t.enabled && press(t.action)} disabled={!t.enabled}>
                <span className="ic">{t.icon}</span>
                <span className="nm">{t.name}</span>
                <span className="et">{t.sub}</span>
              </button>
            );
          })}
        </div>
        <div className={`skp-status ${activeFlash?.kind ?? ''}`}>{status}</div>
      </div>
    </div>
  );
}

// ---------- ikony (jednoduché, čiarové) ----------
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
function IconFocus() {
  return <svg viewBox="0 0 48 48" {...P}><circle cx="24" cy="24" r="13" /><circle cx="24" cy="24" r="3" fill="currentColor" /><path d="M24 4v8M24 36v8M4 24h8M36 24h8" /></svg>;
}
function IconTop() {
  return <svg viewBox="0 0 48 48" {...P}><rect x="10" y="10" width="28" height="28" rx="3" /><path d="M24 4v6M18 7l6-3 6 3" /></svg>;
}
function IconBox() {
  return <svg viewBox="0 0 48 48" {...P}><path d="M8 16l16-8 16 8v16l-16 8-16-8z" /><path d="M8 16l16 8 16-8M24 24v16" /></svg>;
}
function IconBoxLeft() {
  return <svg viewBox="0 0 48 48" {...P}><path d="M10 16l16-8 16 8v16l-16 8-16-8z" /><path d="M10 16l16 8 16-8M26 24v16" /><path d="M2 24h6M5 21l-3 3 3 3" /></svg>;
}
function IconUndo() {
  return <svg viewBox="0 0 48 48" {...P}><path d="M14 20a12 12 0 1 1 3 10" /><path d="M8 18l6 2 2-6" /></svg>;
}
function IconAll() {
  return <svg viewBox="0 0 48 48" {...P}><path d="M6 14V6h8M34 6h8v8M42 34v8h-8M14 42H6v-8" /><rect x="16" y="16" width="16" height="16" rx="2" /></svg>;
}
function IconEye() {
  return <svg viewBox="0 0 48 48" {...P}><path d="M4 24s7-12 20-12 20 12 20 12-7 12-20 12S4 24 4 24z" /><circle cx="24" cy="24" r="5" /></svg>;
}
function IconEyeOff() {
  return <svg viewBox="0 0 48 48" {...P}><path d="M4 24s7-12 20-12c3 0 5.6.6 8 1.6M44 24s-7 12-20 12c-3 0-5.6-.6-8-1.6" /><path d="M8 40L40 8" /><path d="M19.5 28.5a6 6 0 0 1 9-9" /></svg>;
}
function IconGhost() {
  return <svg viewBox="0 0 48 48" {...P}><path d="M10 42V22a14 14 0 0 1 28 0v20l-5-4-4.5 4-4.5-4-4.5 4-4.5-4z" strokeDasharray="4 3" /><circle cx="19" cy="22" r="2" fill="currentColor" /><circle cx="29" cy="22" r="2" fill="currentColor" /></svg>;
}
