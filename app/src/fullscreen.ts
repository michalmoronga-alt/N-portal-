// Celá obrazovka (v Chrome skryje adresný riadok). Používa sa na dvoch miestach:
// dvojklik na horný pás (App.tsx) a prepínač v nastaveniach (Settings.tsx).
export function toggleFullscreen(): void {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
}
