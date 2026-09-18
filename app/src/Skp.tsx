import { useEffect, useRef, useState } from 'react';
import SideStrip from './SideStrip';
import type { Ack, AgentsState, MediaState, SketchUpState, UsageState } from './service';
import { useClock } from './time';
import { ledTap, ledError } from './ledPulse';
import SwipeTile, { type SwipeDir } from './SwipeTile';

type Flash = { kind: 'ok' | 'error' | 'warn'; text: string; until: number } | null;
const REPLY_TIMEOUT_MS = 3000;

interface Props {
  online: boolean;
  sketchup: SketchUpState | null;
  /** SketchUp je aktívnym oknom vo Windows: true/false, null = sledovanie okna nebeží (neblokuje sa) */
  sketchupActive: boolean | null;
  usage: UsageState | null;
  media: MediaState | null;
  /** stav agentov – len na obiehajúce body na mini kruhoch v páse */
  agents: AgentsState | null;
  lastAck: Ack | null;
  sendCommand: (action: string) => string | null;
  sendMedia: (a: 'play' | 'pause' | 'toggle' | 'next' | 'prev') => void;
  /** obrazovka je viditeľná (len pre plynulý priebeh skladby v páse) */
  active: boolean;
}

interface Tile { action: string; name: string; sub: string; icon: React.ReactNode; enabled: boolean; swipe?: boolean; primary?: boolean }
const SWIPE_ACTION: Record<SwipeDir, string> = { up: 'view_top', down: 'view_front', left: 'view_left', right: 'view_right' };

// Dlaždice: stále pozície. Názov a popis sa mení podľa skutočného stavu v SketchUpe.
function buildTiles(s: SketchUpState | null): Tile[] {
  const iso = !!s?.isolationActive;
  const hidden = !!s?.hiddenObjectsShown;
  const xray = !!s?.xrayOn;
  return [
    { action: 'focus_selection', name: 'Zamerať výber', sub: '', enabled: true, primary: true, icon: <IconFocus /> },
    { action: 'view', name: 'Pohľad', sub: 'potiahni', enabled: true, swipe: true, icon: <IconView /> },
    { action: 'view_iso', name: 'ISO', sub: '', enabled: true, icon: <IconIso /> },
    { action: 'xray_toggle', name: 'X‑Ray', sub: xray ? 'zapnutý' : 'vypnutý', enabled: true, icon: <IconXray /> },
    { action: 'view_previous', name: 'Predošlý pohľad', sub: '', enabled: true, icon: <IconUndo /> },
    { action: 'view_all', name: 'Celý model', sub: '', enabled: true, icon: <IconAll /> },
    { action: 'isolate_toggle', name: iso ? 'Obnoviť' : 'Izolovať', sub: iso ? `skrytých ${s!.isolationCount}` : 'výber', enabled: true, icon: iso ? <IconEyeOff /> : <IconEye /> },
    { action: 'hidden_objects_toggle', name: 'Skryté objekty', sub: hidden ? 'zobrazené' : 'skryté', enabled: true, icon: <IconGhost /> },
  ];
}

export default function Skp({ online, sketchup, sketchupActive, usage, media, agents, lastAck, sendCommand, sendMedia, active }: Props) {
  const now = useClock();
  const [flash, setFlash] = useState<Flash>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
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
      ledError();
      setFlash({ kind: 'warn', text: lastAck.error ?? 'Povel odmietnutý.', until: Date.now() + 3500 });
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
    if (kind !== 'ok') ledError();
    setFlash({ kind, text: last.message, until: Date.now() + (kind === 'ok' ? 1800 : 3500) });
  }, [sketchup?.last, pendingId]);

  // bez odpovede
  useEffect(() => {
    if (pendingId && tick - pendingSince.current > REPLY_TIMEOUT_MS) {
      setPendingId(null);
      setFlash({ kind: 'warn', text: 'Bez odpovede zo SketchUpu.', until: Date.now() + 3000 });
    }
  }, [tick, pendingId]);

  const ready = online && !!sketchup?.available;
  // Povely majú zmysel len keď je SketchUp naozaj v popredí. Blokujeme iba vtedy, keď sledovanie
  // okna preukázateľne beží a hlási inú aplikáciu; pri jeho výpadku (null) sa nič nemení.
  const passive = ready && sketchupActive === false;
  const usable = ready && !passive;
  const activeFlash = flash && flash.until > tick ? flash : null;

  const press = (action: string) => {
    if (!usable) {
      ledError();
      const text = !online ? 'Nie je spojenie so službou na PC.' : !ready ? 'SketchUp je nedostupný.' : 'SketchUp nie je aktívne okno';
      setFlash({ kind: 'warn', text, until: Date.now() + 2500 });
      return;
    }
    if (pendingId) return;
    ledTap();
    const id = sendCommand(action);
    if (id) {
      pendingSince.current = Date.now();
      setPendingId('pending');
      setActiveAction(action);
      setFlash(null);
    }
  };

  return (
    <div className="skp">
      {/* zúžený Station: bez rámčeka, priamo na pozadí – zdieľaný s režimom AI */}
      <SideStrip usage={usage} media={media} agents={online ? agents : null} sendMedia={sendMedia} now={now} active={active} />

      <div className="skp-main">
        <div className="grid">
          {buildTiles(sketchup).map((t) => {
            let cls = 'tile glass';
            const mine = t.swipe ? Object.values(SWIPE_ACTION).includes(activeAction ?? '') : t.action === activeAction;
            if (!t.enabled) cls += ' off';
            else if (mine && activeFlash) cls += ` ${activeFlash.kind}`;
            else if (mine && pendingId) cls += ' sent';
            else if (!usable) cls += ' idle';
            if (t.primary) cls += ' primary';
            if (t.action === 'isolate_toggle' && sketchup?.isolationActive && !activeFlash) cls += ' active';
            if (t.action === 'xray_toggle' && sketchup?.xrayOn && !activeFlash) cls += ' active';
            const body = (
              <>
                <span className="ic">{t.icon}</span>
                <span className="nm">{t.name}</span>
                <span className="et">{t.sub}</span>
              </>
            );
            if (t.swipe) {
              return (
                <SwipeTile
                  key={t.action}
                  className={cls}
                  disabled={!t.enabled}
                  blocked={!usable}
                  onSwipe={(d) => press(SWIPE_ACTION[d])}
                  onTap={!usable ? () => press(t.action) : undefined}
                >
                  {body}
                </SwipeTile>
              );
            }
            return (
              <button key={t.action} className={cls} onClick={() => t.enabled && press(t.action)} disabled={!t.enabled}>
                {body}
              </button>
            );
          })}
        </div>
        {/* toast: výsledok povelu, sám zmizne */}
        <div className={`toast glass ${activeFlash ? `show ${activeFlash.kind}` : pendingId ? 'show sent' : ''}`} aria-live="polite">
          {activeFlash ? (activeFlash.kind === 'ok' ? '✓ ' : '⚠ ') + activeFlash.text : pendingId ? 'Odoslané…' : ''}
        </div>
      </div>
    </div>
  );
}

// ---------- ikony (jednoduché, čiarové) ----------
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
function IconFocus() {
  return <svg viewBox="0 0 48 48" {...P}><circle cx="24" cy="24" r="13" /><circle cx="24" cy="24" r="3" fill="currentColor" /><path d="M24 4v8M24 36v8M4 24h8M36 24h8" /></svg>;
}
function IconView() {
  return <svg viewBox="0 0 48 48" {...P}><path d="M14 20l10-6 10 6v10l-10 6-10-6z" /><path d="M14 20l10 6 10-6M24 26v10" /><path d="M24 2v6M2 24h6M46 24h-6M24 46v-6" /><path d="M21 5l3-3 3 3M5 21l-3 3 3 3M43 21l3 3-3 3M21 43l3 3 3-3" /></svg>;
}
function IconIso() {
  return <svg viewBox="0 0 48 48" {...P}><path d="M8 16l16-8 16 8v16l-16 8-16-8z" /><path d="M8 16l16 8 16-8M24 24v16" /><path d="M24 24l8-4" strokeDasharray="2 3" /></svg>;
}
function IconXray() {
  return <svg viewBox="0 0 48 48" {...P}><path d="M8 16l16-8 16 8v16l-16 8-16-8z" strokeDasharray="3 3" /><path d="M8 16l16 8 16-8M24 24v16" strokeDasharray="3 3" /><path d="M24 8v16M8 32l16-8 16 8" strokeDasharray="3 3" /></svg>;
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
