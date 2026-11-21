/* >>> speed-dial v1.2.0 >>> https://github.com/zerobun0/harbor-speed-dial */
(() => {
  // ---- settings you can change ---------------------------------------------------
  const DIAL_MIN = 0.25;        // dial range (typing allows 0.1 to 8)
  const DIAL_MAX = 4;
  const FINE_STEP = 0.05;       // -/+ buttons, dial ticks and the keys below
  const KEY_SLOWER = ";";       // 0.05x slower (Harbor already uses [ ] for 0.25x)
  const KEY_FASTER = "'";       // 0.05x faster
  const KEY_MENU = "k";         // open Harbor's Speed & sleep menu
  const KEY_RESET = "\\";       // back to 1x
  // ---------------------------------------------------------------------------------

  const NS = "__speedDial";
  try { window[NS] && window[NS].destroy(); } catch (_) {}

  const TYPE_MIN = 0.1, TYPE_MAX = 8;
  const PX_PER_STEP = 9;
  const STORE = "speedDial.v1";
  const PLAYER_SEL = "[data-harbor-player]";

  const ti = () => window.__TAURI_INTERNALS__;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const round2 = (v) => Math.round(v * 100) / 100;
  const num = (v) => String(+v.toFixed(2));
  const label = (v) => num(v) + "\u00d7";

  const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (_) { return {}; } };
  const save = (o) => { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (_) {} };
  const prefs = Object.assign({ remember: false, speed: 1, shows: {} }, load());
  if (!prefs.shows || typeof prefs.shows !== "object") prefs.shows = {};

  // ---- player bridge ---------------------------------------------------------------
  const playerRoot = () => document.querySelector(PLAYER_SEL);
  const videoEl = () => { const r = playerRoot(); return r && r.querySelector("video"); };
  const html5 = () => { const v = videoEl(); return v && Number.isFinite(v.duration) && v.duration > 0 ? v : null; };

  async function mpvGet(name) {
    const t = ti(); if (!t || !t.invoke) return null;
    try { return await t.invoke("mpv_get_property", { name }); } catch (_) { return null; }
  }
  async function readSpeed() {
    const v = html5(); if (v) return v.playbackRate;
    const s = Number(await mpvGet("speed"));
    return Number.isFinite(s) && s > 0 ? s : null;
  }
  async function writeSpeed(x) {
    const v = html5(); if (v) { v.playbackRate = x; return; }
    const t = ti(); if (!t || !t.invoke) return;
    try { await t.invoke("mpv_set_property", { name: "speed", value: x }); }
    catch (_) { try { await t.invoke("mpv_command", { cmd: ["set", "speed", String(x)] }); } catch (_) {} }
  }
  // Harbor names the media "Show \u00b7 S1E2 \u00b7 Episode", or just the movie name
  async function readShow() {
    let t = "";
    for (const name of ["force-media-title", "media-title"]) {
      const v = await mpvGet(name);
      if (typeof v === "string" && v.trim()) { t = v.trim(); break; }
    }
    if (!t) { try { t = (navigator.mediaSession.metadata || {}).title || ""; } catch (_) {} }
    if (!t || /^https?:|\.(mkv|mp4|avi|webm|m3u8|ts)$/i.test(t)) return null;
    const parts = t.split(" \u00b7 ");
    return (parts.length > 1 && /^S\d+E\d+/i.test(parts[1]) ? parts[0] : t).trim() || null;
  }

  // Harbor's own Speed & sleep button and its open menu
  function nativeSpeedBtn() {
    const r = playerRoot(); if (!r) return null;
    const byLabel = r.querySelector('button[aria-label="Speed and sleep timer"]');
    if (byLabel) return byLabel;
    const gauge = r.querySelector("button svg.lucide-gauge");
    return gauge ? gauge.closest("button") : null;
  }
  function nativeMenu() {
    const btn = nativeSpeedBtn(); if (!btn) return null;
    const wrapEl = btn.closest("div.relative"); if (!wrapEl) return null;
    for (const c of wrapEl.children) if (c.classList.contains("fixed")) return c;
    return null;
  }

  // ---- the "Custom speed" section ----------------------------------------------------
  const host = document.createElement("div");
  host.id = "speed-dial";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
<style>
  :host { all: initial; display: block; }
  * { box-sizing: border-box; }
  .sd {
    --bg: var(--color-elevated, oklch(0.27 0.004 260));
    --raised: var(--color-raised, oklch(0.32 0.004 260));
    --ink: var(--color-ink, oklch(0.97 0.003 260));
    --muted: var(--color-ink-muted, oklch(0.72 0.003 260));
    --subtle: var(--color-ink-subtle, oklch(0.50 0.003 260));
    --edge: var(--color-edge-soft, oklch(0.36 0.004 260 / 0.25));
    --edge-strong: var(--color-edge, oklch(0.36 0.004 260 / 0.55));
    --accent: var(--color-accent, oklch(0.78 0.13 60));
    --accent-soft: var(--color-accent-soft, color-mix(in srgb, var(--accent) 18%, transparent));
    --on-accent: var(--color-canvas, #111);
    --danger: var(--color-danger, oklch(0.55 0.18 25));
    --hover: color-mix(in srgb, var(--color-canvas, #000) 55%, transparent);
    font-family: var(--font-sans, "Switzer", "Inter", system-ui, sans-serif);
    font-size: 14px; font-weight: 400; line-height: 1.3; color: var(--ink);
    -webkit-font-smoothing: antialiased;
    padding: 8px; border-bottom: 1px solid var(--edge);
  }
  /* fallback when Harbor's speed button is hidden: a menu of our own */
  .sd.floating {
    position: fixed; right: 56px; bottom: 150px; z-index: 2147483000;
    width: 360px; max-width: calc(100vw - 32px); border: 0; border-radius: var(--radius-md, 10px);
    background: var(--bg); box-shadow: 0 10px 30px -12px rgba(0, 0, 0, 0.6);
  }
  .num { font-variant-numeric: tabular-nums; }
  button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; padding: 0; }
  button:focus-visible, input:focus-visible, .dial:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

  /* same section heading as Harbor's "Playback speed" / "Sleep timer" */
  .head { display: flex; align-items: center; justify-content: space-between; padding: 4px 12px 6px; }
  .title { font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.18em; color: var(--subtle); }
  .reset { font-size: 12px; font-weight: 500; color: var(--subtle); padding: 3px 8px; margin: -3px -8px; border-radius: 8px; transition: background-color .12s, color .12s; }
  .reset:hover { background: var(--hover); color: var(--ink); }
  .reset[disabled] { visibility: hidden; }

  .top { display: flex; align-items: center; gap: 6px; padding: 0 4px; }
  .step {
    flex: none; width: 36px; height: 36px; border-radius: 8px; color: var(--muted);
    display: grid; place-items: center; transition: background-color .12s, color .12s, transform .08s;
  }
  .step:hover { background: var(--hover); color: var(--ink); }
  .step:active { transform: scale(.94); }
  .step svg { width: 16px; height: 16px; }
  .dial {
    position: relative; flex: 1; height: 46px; overflow: hidden; border-radius: 8px;
    cursor: ew-resize; touch-action: none; user-select: none;
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent);
            mask-image: linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent);
  }
  .tape { position: absolute; top: 0; left: 50%; height: 100%; will-change: transform; }
  .tape.glide { transition: transform .2s cubic-bezier(.2,.8,.2,1); }
  .tick { position: absolute; bottom: 17px; width: 1px; height: 7px; background: var(--subtle); }
  .tick.mid { height: 11px; background: var(--muted); }
  .tick.major { height: 16px; width: 2px; margin-left: -.5px; background: var(--ink); }
  .tl { position: absolute; bottom: 1px; transform: translateX(-50%); color: var(--subtle); font-size: 10.5px; font-weight: 600; }
  .needle {
    position: absolute; left: 50%; bottom: 13px; width: 3px; height: 28px; margin-left: -1.5px;
    border-radius: 2px; background: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); pointer-events: none;
  }
  .val {
    flex: none; min-width: 64px; text-align: end; padding-inline-end: 4px;
    font-size: 20px; font-weight: 600; letter-spacing: -0.01em;
  }

  .row { display: flex; gap: 6px; padding: 6px 4px 0; }
  .field {
    flex: 1; display: flex; align-items: center; height: 40px; padding: 0 12px; border-radius: 8px;
    background: var(--hover); border: 1px solid transparent; transition: border-color .12s;
  }
  .field:focus-within { border-color: var(--edge-strong); }
  .field.bad { border-color: var(--danger); }
  .field input {
    all: unset; flex: 1; min-width: 0; font-size: 14px; color: var(--ink); font-variant-numeric: tabular-nums;
  }
  .field input::placeholder { color: var(--subtle); }
  .field span { color: var(--subtle); font-size: 13px; }
  .apply {
    height: 40px; padding: 0 16px; border-radius: 8px; font-size: 14px; font-weight: 500;
    background: var(--accent); color: var(--on-accent); transition: filter .12s;
  }
  .apply:hover { filter: brightness(1.08); }
  .hint { font-size: 12px; color: var(--danger); padding: 4px 8px 0; }
  .hint:empty { display: none; }

  /* switch rows, shaped like Harbor's menu rows */
  .opts { display: flex; flex-direction: column; gap: 2px; padding-top: 6px; }
  .opt {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    min-height: 40px; padding: 6px 12px; border-radius: 8px; text-align: start; width: 100%;
    color: var(--muted); transition: background-color .12s, color .12s;
  }
  .opt:hover { background: var(--hover); color: var(--ink); }
  .opt[hidden] { display: none; }
  .opt .txt { min-width: 0; }
  .opt .s { display: block; font-size: 12px; color: var(--subtle); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sw {
    flex: none; width: 34px; height: 20px; border-radius: 999px; background: var(--raised);
    position: relative; transition: background-color .16s;
  }
  .sw::after {
    content: ""; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%;
    background: var(--muted); transition: transform .18s cubic-bezier(.2,.8,.2,1), background-color .16s;
  }
  .opt[aria-checked="true"] { color: var(--ink); }
  .opt[aria-checked="true"] .sw { background: var(--accent); }
  .opt[aria-checked="true"] .sw::after { transform: translateX(14px); background: var(--on-accent); }

  .keys { font-size: 11.5px; color: var(--subtle); padding: 6px 12px 2px; }
  kbd { font: inherit; font-size: 11px; font-weight: 600; color: var(--muted); padding: 0 5px; border-radius: 5px; background: var(--hover); }

  @media (prefers-reduced-motion: reduce) { *, *::after { transition: none !important; } }
</style>
<div class="sd">
  <div class="head">
    <span class="title">Custom speed</span>
    <button class="reset" type="button">Reset to 1&times;</button>
  </div>
  <div class="top">
    <button class="step" data-d="-1" type="button" aria-label="Slower">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3.5 8h9"/></svg>
    </button>
    <div class="dial" tabindex="0" role="slider" aria-label="Playback speed" aria-valuemin="${DIAL_MIN}" aria-valuemax="${DIAL_MAX}">
      <div class="tape"></div><div class="needle"></div>
    </div>
    <button class="step" data-d="1" type="button" aria-label="Faster">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3.5 8h9M8 3.5v9"/></svg>
    </button>
    <span class="val num">1&times;</span>
  </div>
  <div class="row">
    <label class="field"><input class="in" inputmode="decimal" placeholder="Type any speed, e.g. 1.37" aria-label="Type a speed"><span>&times;</span></label>
    <button class="apply" type="button">Set</button>
  </div>
  <div class="hint"></div>
  <div class="opts">
    <button class="opt show-opt" type="button" role="switch" aria-checked="false" hidden>
      <span class="txt"><span>Remember for this show</span><span class="s show-name"></span></span><span class="sw"></span>
    </button>
    <button class="opt all-opt" type="button" role="switch" aria-checked="false">
      <span class="txt"><span>Use for all videos</span><span class="s">Shows with their own speed keep theirs</span></span><span class="sw"></span>
    </button>
  </div>
  <div class="keys"><kbd>;</kbd> <kbd>'</kbd> slower / faster &middot; <kbd>&#92;</kbd> reset &middot; <kbd>K</kbd> this menu</div>
</div>`;

  const $ = (s) => root.querySelector(s);
  const sd = $(".sd"), dial = $(".dial"), tape = $(".tape"), valEl = $(".val"), input = $(".in");
  const field = $(".field"), hint = $(".hint"), resetBtn = $(".reset");
  const showOpt = $(".show-opt"), showName = $(".show-name"), allOpt = $(".all-opt");

  const steps = Math.round((DIAL_MAX - DIAL_MIN) / FINE_STEP);
  const frag = document.createDocumentFragment();
  for (let i = 0; i <= steps; i++) {
    const v = round2(DIAL_MIN + i * FINE_STEP), h = Math.round(v * 100);
    const t = document.createElement("div");
    t.className = "tick" + (h % 50 === 0 ? " major" : h % 25 === 0 ? " mid" : "");
    t.style.left = i * PX_PER_STEP + "px";
    frag.appendChild(t);
    if (h % 50 === 0) {
      const l = document.createElement("div");
      l.className = "tl num"; l.textContent = String(v); l.style.left = i * PX_PER_STEP + "px";
      frag.appendChild(l);
    }
  }
  tape.appendChild(frag);

  // small on-screen readout for keyboard changes (only while the player is open)
  const toastHost = document.createElement("div");
  const toastRoot = toastHost.attachShadow({ mode: "open" });
  toastRoot.innerHTML = `<style>
    .t { position: fixed; left: 50%; top: 12%; z-index: 2147483000; transform: translate(-50%, -4px);
      padding: 8px 16px; border-radius: 999px; background: rgba(0,0,0,.6); color: #fff; backdrop-filter: blur(10px);
      font: 700 20px/1.2 var(--font-sans, system-ui, sans-serif); font-variant-numeric: tabular-nums;
      opacity: 0; transition: opacity .16s, transform .16s; pointer-events: none; }
    .t.show { opacity: 1; transform: translate(-50%, 0); }
    @media (prefers-reduced-motion: reduce) { .t { transition: none; } }
  </style><div class="t"></div>`;
  const toastEl = toastRoot.querySelector(".t");

  // ---- state -----------------------------------------------------------------------
  let speed = 1, dragging = false, currentShow = null, floatingOpen = false;
  const hasShowSpeed = () => !!currentShow && prefs.shows[currentShow] != null;

  function render(glide) {
    const x = -((clamp(speed, DIAL_MIN, DIAL_MAX) - DIAL_MIN) / FINE_STEP) * PX_PER_STEP;
    tape.classList.toggle("glide", !!glide);
    tape.style.transform = `translateX(${x}px)`;
    valEl.textContent = label(speed);
    dial.setAttribute("aria-valuenow", num(speed));
    resetBtn.disabled = Math.abs(speed - 1) < 0.001;
    showOpt.hidden = !currentShow;
    showName.textContent = currentShow || "";
    showOpt.title = currentShow || "";
    showOpt.setAttribute("aria-checked", String(hasShowSpeed()));
    allOpt.setAttribute("aria-checked", String(!!prefs.remember));
  }

  let writeTimer = 0, pendingWrite = null;
  function setSpeed(x, opts = {}) {
    x = round2(clamp(x, TYPE_MIN, TYPE_MAX));
    speed = x;
    render(opts.glide);
    if (!opts.noSave) {
      if (hasShowSpeed()) { prefs.shows[currentShow] = x; save(prefs); }
      else if (prefs.remember) { prefs.speed = x; save(prefs); }
    }
    pendingWrite = x;
    if (!writeTimer) writeTimer = setTimeout(() => { writeTimer = 0; const w = pendingWrite; pendingWrite = null; writeSpeed(w); }, 50);
    if (opts.toast) showToast();
  }

  let toastTimer = 0;
  function showToast() {
    if (!playerRoot()) return;
    if (!toastHost.isConnected) document.body.appendChild(toastHost);
    toastEl.textContent = label(speed);
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 900);
  }

  // ---- interactions ----------------------------------------------------------------
  // keep clicks and keys inside the section away from the player (pause, hotkeys...)
  ["mousedown", "mouseup", "click", "dblclick", "contextmenu", "pointerdown", "pointerup", "keydown", "keyup"]
    .forEach((t) => host.addEventListener(t, (e) => e.stopPropagation()));

  resetBtn.addEventListener("click", () => setSpeed(1, { glide: true }));
  root.querySelectorAll(".step").forEach((b) =>
    b.addEventListener("click", () => setSpeed(speed + FINE_STEP * +b.dataset.d, { glide: true })));

  function applyTyped() {
    const raw = input.value.replace(",", ".").replace(/[x\u00d7\s]/gi, "");
    const v = Number(raw);
    if (!raw || !Number.isFinite(v) || v < TYPE_MIN || v > TYPE_MAX) {
      field.classList.add("bad");
      hint.textContent = `Enter a number from ${TYPE_MIN} to ${TYPE_MAX}`;
      return;
    }
    field.classList.remove("bad"); hint.textContent = "";
    setSpeed(v, { glide: true });
    input.value = "";
  }
  root.querySelector(".apply").addEventListener("click", applyTyped);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); applyTyped(); }
    if (e.key === "Escape") { input.blur(); }
  });
  input.addEventListener("input", () => { field.classList.remove("bad"); hint.textContent = ""; });

  allOpt.addEventListener("click", () => {
    prefs.remember = !prefs.remember;
    if (prefs.remember) prefs.speed = speed;
    save(prefs); render(false);
  });
  showOpt.addEventListener("click", () => {
    if (!currentShow) return;
    if (hasShowSpeed()) delete prefs.shows[currentShow]; else prefs.shows[currentShow] = speed;
    save(prefs); render(false);
  });

  let startX = 0, startSpeed = 1;
  dial.addEventListener("pointerdown", (e) => {
    dragging = true; startX = e.clientX; startSpeed = clamp(speed, DIAL_MIN, DIAL_MAX);
    dial.setPointerCapture(e.pointerId);
  });
  dial.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dv = -((e.clientX - startX) / PX_PER_STEP) * FINE_STEP;
    setSpeed(clamp(Math.round((startSpeed + dv) / FINE_STEP) * FINE_STEP, DIAL_MIN, DIAL_MAX));
  });
  const endDrag = () => { dragging = false; };
  dial.addEventListener("pointerup", endDrag);
  dial.addEventListener("pointercancel", endDrag);
  dial.addEventListener("wheel", (e) => {
    e.preventDefault(); e.stopPropagation();
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    setSpeed(speed + (d > 0 ? -1 : 1) * FINE_STEP, { glide: true });
  }, { passive: false });
  dial.addEventListener("keydown", (e) => {
    const k = e.key;
    if (k === "ArrowLeft" || k === "ArrowDown") { e.preventDefault(); setSpeed(speed - FINE_STEP, { glide: true }); }
    if (k === "ArrowRight" || k === "ArrowUp") { e.preventDefault(); setSpeed(speed + FINE_STEP, { glide: true }); }
    if (k === "Home") { e.preventDefault(); setSpeed(1, { glide: true }); }
  });

  // ---- placement: inside Harbor's menu, or our own menu if that button is hidden ----
  function placeInMenu() {
    const menu = nativeMenu();
    if (menu) {
      if (host.parentNode !== menu || menu.firstChild !== host) menu.insertBefore(host, menu.firstChild);
      sd.classList.remove("floating");
      floatingOpen = false;
      render(false);
      return true;
    }
    if (!floatingOpen && host.isConnected) host.remove();
    return false;
  }
  function toggleMenu() {
    const btn = nativeSpeedBtn();
    if (btn) { btn.click(); return; }
    floatingOpen = !floatingOpen;
    if (floatingOpen) { sd.classList.add("floating"); document.body.appendChild(host); render(false); }
    else host.remove();
  }

  const isTyping = (e) => {
    const n = e.composedPath ? e.composedPath()[0] : e.target;
    return n instanceof HTMLElement && (n.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName));
  };
  const onKey = (e) => {
    if (!playerRoot() || isTyping(e) || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    const k = e.key;
    let hit = true;
    if (k === KEY_SLOWER) setSpeed(speed - FINE_STEP, { glide: true, toast: true });
    else if (k === KEY_FASTER) setSpeed(speed + FINE_STEP, { glide: true, toast: true });
    else if (k === KEY_RESET) setSpeed(1, { glide: true, toast: true });
    else if (k.toLowerCase() === KEY_MENU) toggleMenu();
    else if (k === "Escape" && floatingOpen) toggleMenu();
    else hit = false;
    if (hit) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }
  };
  window.addEventListener("keydown", onKey, true);
  const onDocDown = (e) => { if (floatingOpen && !e.composedPath().includes(host)) toggleMenu(); };
  window.addEventListener("pointerdown", onDocDown, true);

  // ---- lifecycle: follow the player, stay in sync, apply saved speeds --------------
  let inPlayer = false, lastPath = null, pollTimer = 0, alive = true;

  async function onNewVideo(first) {
    let show = null;
    for (let i = 0; i < 8 && alive && inPlayer && !show; i++) {
      show = await readShow();
      if (!show) await new Promise((r) => setTimeout(r, 400));
    }
    if (!alive || !inPlayer) return;
    currentShow = show;
    render(false);
    const target = hasShowSpeed() ? prefs.shows[currentShow] : prefs.remember ? prefs.speed : null;
    if (target == null) return;
    // let Harbor apply its own default speed first, then put ours back
    setTimeout(async () => {
      if (!alive || !inPlayer) return;
      const now = await readSpeed();
      if (now == null || Math.abs(now - target) > 0.001) setSpeed(target, { glide: true, toast: true, noSave: true });
    }, first ? 900 : 500);
  }

  async function poll() {
    if (!alive || !inPlayer) return;
    try {
      const path = await mpvGet("path");
      if (path && path !== lastPath) { const first = lastPath === null; lastPath = path; onNewVideo(first); }
      if (!dragging && pendingWrite == null) {
        const s = await readSpeed();
        if (s && Math.abs(s - speed) > 0.004) { speed = round2(s); render(true); }
      }
    } catch (_) {}
    pollTimer = setTimeout(poll, 700);
  }

  function sync() {
    const has = !!playerRoot();
    if (has !== inPlayer) {
      inPlayer = has;
      if (has) poll();
      else {
        clearTimeout(pollTimer); lastPath = null; currentShow = null;
        floatingOpen = false; host.remove(); toastHost.remove();
      }
    }
    if (inPlayer) placeInMenu();
  }
  let queued = false;
  const mo = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; if (alive) sync(); });
  });
  mo.observe(document.body, { childList: true, subtree: true });
  render(false);
  sync();

  // ---- cleanup (Harbor calls this when Custom JS is edited or cleared) --------------
  function destroy() {
    alive = false;
    mo.disconnect();
    clearTimeout(pollTimer); clearTimeout(toastTimer); clearTimeout(writeTimer);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("pointerdown", onDocDown, true);
    host.remove(); toastHost.remove();
    if (window[NS] && window[NS].destroy === destroy) delete window[NS];
  }
  window[NS] = { destroy, version: "1.2.0", get speed() { return speed; }, set: (x) => setSpeed(+x, { glide: true }) };
  const prevCleanup = window.__harborCustomCleanup;
  window.__harborCustomCleanup = () => {
    try { destroy(); } catch (_) {}
    if (typeof prevCleanup === "function") { try { prevCleanup(); } catch (_) {} }
  };
})();
/* <<< speed-dial <<< */
