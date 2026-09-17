// Detekcia ťahu prstom – spoločná pre dlaždice pohľadu v SKP (SwipeTile) aj karty agentov v AI (AgentCard),
// aby sa ťah po celom paneli správal rovnako.

export type SwipeDir = 'up' | 'down' | 'left' | 'right';

const MIN_DIST = 36; // px
const RATIO = 1.4; // dominantná os musí byť aspoň takto výraznejšia

/** Smer ťahu z posunu prsta; null = krátky dotyk (klepnutie) alebo šikmý ťah. */
export function swipeDirOf(dx: number, dy: number): SwipeDir | null {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) < MIN_DIST) return null;
  if (ax > ay * RATIO) return dx > 0 ? 'right' : 'left';
  if (ay > ax * RATIO) return dy > 0 ? 'down' : 'up';
  return null;
}
