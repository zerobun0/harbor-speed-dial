/* >>> speed-dial loader v1 >>> */
(() => {
  const SRC = "https://raw.githubusercontent.com/zerobun0/harbor-speed-dial/main/speed-dial.js";
  const CACHE = "speedDial.code";
  let current = null;
  const run = (c) => { try { new Function(c)(); current = c; return true; } catch (e) { console.warn("[speed-dial]", e); return false; } };
  try { const c = localStorage.getItem(CACHE); if (c) run(c); } catch (_) {}
  let alive = true;
  const check = async () => {
    if (!alive) return;
    try {
      const r = await fetch(SRC + "?t=" + Date.now(), { cache: "no-store" });
      const code = r.ok ? await r.text() : "";
      if (/speed-dial v\d/.test(code) && code !== current && run(code)) localStorage.setItem(CACHE, code);
    } catch (_) {}
  };
  check();
  const timer = setInterval(check, 10 * 60 * 1000);
  const prev = window.__harborCustomCleanup;
  window.__harborCustomCleanup = () => {
    alive = false; clearInterval(timer);
    try { window.__speedDial && window.__speedDial.destroy(); } catch (_) {}
    if (typeof prev === "function") prev();
  };
})();
/* <<< speed-dial <<< */
