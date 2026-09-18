// Beží na stránkach YouTube a YouTube Music.
// Sleduje, ktoré video je otvorené a či práve hrá, a hlási to service workeru rozšírenia
// (ten údaj pošle lokálnej N-portal službe). Nič sa neposiela mimo tento počítač.
//
// YouTube je jednostránková aplikácia: adresa sa mení bez načítania stránky, preto
// počúvame `yt-navigate-finish` a pre istotu kontrolujeme aj každé 2 s.
(() => {
  const POLL_MS = 2000;
  const ID_RE = /^[A-Za-z0-9_-]{6,20}$/;

  let lastSent = '';
  let hooked = null; // <video>, na ktorom máme navesené play/pause

  function videoId() {
    let u;
    try {
      u = new URL(location.href);
    } catch {
      return null;
    }
    const v = u.searchParams.get('v');
    if (v && ID_RE.test(v)) return v;
    // music.youtube.com používa tiež /watch?v=…, ale nájdu sa aj adresy typu /watch/<id>
    const m = u.pathname.match(/^\/watch\/([A-Za-z0-9_-]{6,20})$/);
    return m ? m[1] : null;
  }

  function title() {
    let t = (document.title || '').trim();
    t = t.replace(/^\(\d+\)\s*/, ''); // „(3) Názov – YouTube“ pri upozorneniach
    t = t.replace(/\s*[-–—]\s*YouTube Music\s*$/, '').replace(/\s*[-–—]\s*YouTube\s*$/, '').trim();
    if (!t) {
      const h1 = document.querySelector('h1.ytd-watch-metadata, #title h1, .ytmusic-player-bar .title');
      t = h1 && h1.textContent ? h1.textContent.trim() : '';
    }
    return t.slice(0, 300);
  }

  function playingNow(v) {
    return !!v && !v.paused && !v.ended && v.readyState > 0;
  }

  function send(force) {
    const id = videoId();
    if (!id) return;
    const v = document.querySelector('video');
    const msg = { videoId: id, title: title(), playing: playingNow(v), ts: Date.now() };
    const key = `${msg.videoId}|${msg.title}|${msg.playing}`;
    if (!force && key === lastSent) return;
    lastSent = key;
    try {
      if (chrome.runtime && chrome.runtime.id) chrome.runtime.sendMessage(msg, () => void chrome.runtime.lastError);
    } catch {
      /* rozšírenie sa práve znovu načítalo – ohlásime pri ďalšom kole */
    }
  }

  function hookVideo() {
    const v = document.querySelector('video');
    if (!v || v === hooked) return;
    hooked = v;
    for (const ev of ['play', 'pause', 'ended', 'loadedmetadata']) v.addEventListener(ev, () => send(false));
  }

  function tick() {
    hookVideo();
    send(false);
  }

  document.addEventListener('yt-navigate-finish', () => {
    lastSent = '';
    hooked = null;
    setTimeout(tick, 300); // názov stránky sa dopĺňa s malým oneskorením
  });
  setInterval(tick, POLL_MS);
  tick();
})();
