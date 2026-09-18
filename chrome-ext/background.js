// Service worker rozšírenia: správu z karty YouTube prepošle lokálnej N-portal službe.
// Chyby ticho ignoruje – služba nemusí bežať a rozšírenie to nemá riešiť.

// Port lokálnej N-portal služby. Musí sedieť s `port` v %USERPROFILE%\.n-portal\service\config.json
// (predvolene 8790). Pri zmene uprav aj `host_permissions` v manifest.json.
const PORT = 8790;
const ENDPOINT = `http://127.0.0.1:${PORT}/api/artwork`;

chrome.runtime.onMessage.addListener((m) => {
  if (!m || typeof m.videoId !== 'string') return;
  const body = JSON.stringify({
    videoId: m.videoId,
    title: typeof m.title === 'string' ? m.title.slice(0, 300) : '',
    playing: m.playing === true,
    ts: Number(m.ts) || Date.now(),
  });
  fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body }).catch(() => {});
});
