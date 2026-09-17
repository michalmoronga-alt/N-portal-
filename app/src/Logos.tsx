// Mini logá poskytovateľov AI: vlastné jednofarebné SVG prevzaté zo schváleného mocku
// (app/public/mock4.html, <symbol id="lg-claude"> a <symbol id="lg-codex">).
// Veľkosť 1em, farba sa dedí z textu (currentColor) – použiteľné v kruhoch usage, na kartách aj v štítku.
import type { CSSProperties } from 'react';

interface LogoProps {
  className?: string;
  style?: CSSProperties;
}

const BASE = { width: '1em', height: '1em', viewBox: '0 0 24 24', 'aria-hidden': true as const, focusable: 'false' as const };

/** Claude – lúčová hviezda. */
export function LogoClaude({ className = 'logo', style }: LogoProps) {
  return (
    <svg {...BASE} className={className} style={style}>
      <g stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" fill="none">
        <line x1="12" y1="2.5" x2="12" y2="8.5" />
        <line x1="12" y1="15.5" x2="12" y2="21.5" />
        <line x1="2.5" y1="12" x2="8.5" y2="12" />
        <line x1="15.5" y1="12" x2="21.5" y2="12" />
        <line x1="5.3" y1="5.3" x2="9.2" y2="9.2" />
        <line x1="14.8" y1="14.8" x2="18.7" y2="18.7" />
        <line x1="18.7" y1="5.3" x2="14.8" y2="9.2" />
        <line x1="9.2" y1="14.8" x2="5.3" y2="18.7" />
        <line x1="8.3" y1="3.2" x2="10.2" y2="7.8" opacity=".55" />
        <line x1="13.8" y1="16.2" x2="15.7" y2="20.8" opacity=".55" />
        <line x1="20.8" y1="8.3" x2="16.2" y2="10.2" opacity=".55" />
        <line x1="7.8" y1="13.8" x2="3.2" y2="15.7" opacity=".55" />
        <line x1="15.7" y1="3.2" x2="13.8" y2="7.8" opacity=".55" />
        <line x1="10.2" y1="16.2" x2="8.3" y2="20.8" opacity=".55" />
        <line x1="20.8" y1="15.7" x2="16.2" y2="13.8" opacity=".55" />
        <line x1="7.8" y1="10.2" x2="3.2" y2="8.3" opacity=".55" />
      </g>
    </svg>
  );
}

/** Codex – šesťlupeňový uzol. */
export function LogoCodex({ className = 'logo', style }: LogoProps) {
  return (
    <svg {...BASE} className={className} style={style}>
      <g fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinejoin="round">
        <rect x="9.6" y="2.4" width="4.8" height="11" rx="2.4" />
        <rect x="9.6" y="2.4" width="4.8" height="11" rx="2.4" transform="rotate(60 12 12)" />
        <rect x="9.6" y="2.4" width="4.8" height="11" rx="2.4" transform="rotate(120 12 12)" />
        <rect x="9.6" y="2.4" width="4.8" height="11" rx="2.4" transform="rotate(180 12 12)" />
        <rect x="9.6" y="2.4" width="4.8" height="11" rx="2.4" transform="rotate(240 12 12)" />
        <rect x="9.6" y="2.4" width="4.8" height="11" rx="2.4" transform="rotate(300 12 12)" />
      </g>
    </svg>
  );
}

/**
 * Logo podľa poskytovateľa; neznámy poskytovateľ → nič (nezhodí sa).
 * `colored` doplní triedu s farbou poskytovateľa (`--claude` / `--codex`); inak logo dedí farbu textu.
 */
export function ProviderLogo({ provider, className = 'logo', colored, style }: { provider: string; colored?: boolean } & LogoProps) {
  const cls = colored ? `${className} ${provider}` : className;
  if (provider === 'codex') return <LogoCodex className={cls} style={style} />;
  if (provider === 'claude') return <LogoClaude className={cls} style={style} />;
  return null;
}
