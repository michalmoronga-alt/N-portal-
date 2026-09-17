// Konfigurácia služby: %LOCALAPPDATA%\N-portal\service\config.json
// Pri prvom spustení sa vytvorí s náhodným párovacím tokenom.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export interface Config {
  port: number;
  token: string;
}

// Dátový priečinok je mimo AppData: balíčkové aplikácie (napr. Claude desktop) majú AppData presmerované
// do súkromnej kópie a ich zápisy by SketchUp nevidel. Rovnaká cesta je v sketchup/nportal_e0/main.rb.
export const DATA_ROOT = process.env.NPORTAL_DATA_DIR ?? path.join(os.homedir(), '.n-portal');
export const SERVICE_DIR = path.join(DATA_ROOT, 'service');
export const E0_DIR = path.join(DATA_ROOT, 'e0');
const CONFIG_FILE = path.join(SERVICE_DIR, 'config.json');

const DEFAULTS: Config = { port: 8790, token: '' };

export function loadConfig(): Config {
  fs.mkdirSync(SERVICE_DIR, { recursive: true });
  let cfg: Config = { ...DEFAULTS };
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      cfg = { ...cfg, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    } catch {
      console.warn('[config] config.json je nečitateľný, použijem predvolené hodnoty');
    }
  }
  if (!cfg.token || cfg.token.length < 6) {
    cfg.token = crypto.randomBytes(4).toString('hex'); // 8 znakov, stačí pre domácu sieť
  }
  if (!Number.isInteger(cfg.port) || cfg.port < 1024 || cfg.port > 65535) cfg.port = DEFAULTS.port;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  // Port z prostredia (NPORTAL_PORT) má prednosť pred config.json, ale do súboru sa nezapisuje:
  // slúži na dočasný beh druhej kópie (test) popri službe z Plánovača úloh.
  const envPort = Number(process.env.NPORTAL_PORT);
  if (Number.isInteger(envPort) && envPort >= 1024 && envPort <= 65535) return { ...cfg, port: envPort };
  return cfg;
}
