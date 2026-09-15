// Čisté vektorové ikony prehrávača (namiesto emoji, ktoré Android vykresľuje farebne).
const P = { width: '1em', height: '1em', fill: 'currentColor', viewBox: '0 0 24 24', 'aria-hidden': true as const };
export const IconPrev = () => <svg {...P}><path d="M6 5h2v14H6zM20 5v14L9 12z" /></svg>;
export const IconNext = () => <svg {...P}><path d="M16 5h2v14h-2zM4 5v14l11-7z" /></svg>;
export const IconPause = () => <svg {...P}><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>;
export const IconPlay = () => <svg {...P}><path d="M7 4v16l13-8z" /></svg>;
