// Formátovanie hodnôt pre detail karty agenta (režim AI, AI‑2).
// Slovenské tvary: desatinná čiarka, skratky k / M, názvy nástrojov po slovensky.

/**
 * Tokeny: < 1000 celé číslo, ďalej „3,7 k“ a od milióna „19,5 M“.
 * Nad 100 jednotiek už desatinné miesto nemá zmysel (129 k namiesto 128,5 k) – na paneli sa
 * číta z metra a kratší text sa lepšie zmestí.
 */
export function formatTokens(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const v = Math.max(0, n);
  if (v < 1000) return String(Math.round(v));
  if (v < 999_500) return `${decimal(v / 1000)} k`;
  return `${decimal(v / 1_000_000)} M`;
}

function decimal(v: number): string {
  if (v >= 100) return String(Math.round(v));
  return (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
}

/**
 * Skrátený názov modelu: `claude-fable-5-1` → „Fable 5.1“, `gpt-6-astra` → „GPT‑6 Astra“.
 * Neznámy tvar sa vypíše tak, ako prišiel (formáty sa menia, nesmieme o hodnotu prísť).
 */
export function shortModel(model: string | null | undefined): string | null {
  const raw = (model ?? '').trim();
  if (!raw) return null;
  const parts = raw.replace(/\[[^\]]*\]$/, '').split('-').filter(Boolean); // „claude-opus-5[1m]“ → bez zátvorky
  if (parts[0] === 'claude' && parts.length >= 2) {
    // čísla verzie sú krátke; dlhý číselný chvost je dátum vydania a nezobrazuje sa
    const nums = parts.slice(2).filter((p) => /^\d{1,2}$/.test(p));
    return nums.length ? `${cap(parts[1])} ${nums.join('.')}` : cap(parts[1]);
  }
  if (parts[0] === 'gpt' && parts.length >= 2) {
    const rest = parts.slice(1).map((p) => (/^\d/.test(p) ? p : cap(p)));
    return `GPT‑${rest[0]}${rest.length > 1 ? ` ${rest.slice(1).join(' ')}` : ''}`;
  }
  return raw;
}

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// Nástroje sa zlučujú do skupín, aby sa v riadku vyskytli tri zmysluplné položky.
const TOOL_GROUPS: Record<string, string> = {
  Bash: 'shell',
  PowerShell: 'shell',
  Write: 'zápis',
  Edit: 'zápis',
  Read: 'čítanie',
  Grep: 'čítanie',
  Glob: 'čítanie',
  Agent: 'agenti',
};

/** Názov skupiny nástroja; neznámy nástroj ostáva surový, len bez prefixu `mcp__`. */
export function toolLabel(name: string): string {
  if (TOOL_GROUPS[name]) return TOOL_GROUPS[name];
  if (name.startsWith('mcp__Claude_Browser__')) return 'prehliadač';
  return name.replace(/^mcp__/, '');
}

/** Tri najčastejšie skupiny nástrojov, zostupne podľa počtu volaní. */
export function topTools(tools: Record<string, number> | null | undefined, limit = 3): { name: string; count: number }[] {
  if (!tools) return [];
  const merged = new Map<string, number>();
  for (const [name, count] of Object.entries(tools)) {
    if (!Number.isFinite(count) || count <= 0) continue;
    const g = toolLabel(name);
    merged.set(g, (merged.get(g) ?? 0) + count);
  }
  return [...merged.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'sk'))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}
