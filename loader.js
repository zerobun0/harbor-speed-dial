/* >>> speed-dial loader v1 >>> (managed block: install/update/remove with speed-dial.ps1) */
(() => {
  // Loads the newest Speed Dial from GitHub, keeps a copy for offline use,
  // and checks for a new version every 10 minutes while Harbor is open.
  const SRC = "https://raw.githubusercontent.com/zerobun0/harbor-speed-dial/main/speed-dial.js";
  const CACHE = "speedDial.code";
  const EVERY_MS = 10 * 60 * 1000;

  let current = null;
  const read = () => { try { return localStorage.getItem(CACHE); } catch (_) { return null; } };
  const keep = (c) => { try { localStorage.setItem(CACHE, c); } catch (_) {} };
  const run = (code) => {
    try { new Function(code)(); current = code; return true; }
    catch (err) { console.warn("[speed-dial] failed to start:", err); return false; }
  };

  const cached = read();
  if (cached) run(cached);

  let alive = true;
  async function check() {
    if (!alive) return;
    try {
      const res = await fetch(SRC + "?t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) return;
      const code = await res.text();
      if (!/speed-dial v\d/.test(code) || code === current) return;
      if (run(code)) {
        keep(code);
        console.info("[speed-dial] updated to", (code.match(/speed-dial v([\d.]+)/) || [])[1]);
      }
    } catch (_) { /* offline: keep using the cached copy */ }
  }
  check();
  const timer = setInterval(check, EVERY_MS);

  const prev = window.__harborCustomCleanup;
  window.__harborCustomCleanup = () => {
    alive = false; clearInterval(timer);
    try { window.__speedDial && window.__speedDial.destroy(); } catch (_) {}
    if (typeof prev === "function") { try { prev(); } catch (_) {} }
  };
})();
/* <<< speed-dial <<< */
