/* >>> speed-dial v1.4.0 >>> https://github.com/zerobun0/harbor-speed-dial */
(() => {
  const VERSION = "1.4.0";
  // newest first; shown in the update notice and under "What's new"
  const CHANGELOG = [
    { v: "1.4.0", items: [
      "Faster updates: new versions arrive within a few minutes, or seconds after restarting Harbor",
      "If Custom speed can't find Harbor's Speed & sleep menu, it tries a second way and tells you instead of failing silently",
    ] },
    { v: "1.3.1", items: [
      "Fixed: Custom speed (dial, Remember for this show, Use for all videos, Saved shows) didn't appear in Harbor's Speed & sleep menu",
    ] },
    { v: "1.3.0", items: [
      "Saved shows: see every show's speed and remove any of them",
      "This update notice, plus the version and What's new in the menu",
    ] },
    { v: "1.2.0", items: [
      "Lives inside Harbor's Speed & sleep menu, no extra buttons on screen",
      "Remember a speed per show; it beats \"Use for all videos\"",
      "Fixed: next episode sometimes didn't get its saved speed",
    ] },
    { v: "1.0.0", items: [
      "First release: dial, any speed from 0.1x to 8x, keyboard steps, follows your theme",
    ] },
  ];

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
  const verNum = (v) => String(v || "0").split(".").reduce((n, p) => n * 1000 + (Number(p) || 0), 0);
  // never let an older copy (e.g. a stale cached file) replace a newer one that's already running
  if (window[NS] && verNum(window[NS].version) > verNum(VERSION)) return;
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

  const newer = (a, b) => {   // is version a newer than b?
    const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    return false;
  };
  function changelogNodes(entries) {
    const f = document.createDocumentFragment();
    for (const e of entries) {
      const h = document.createElement("h4"); h.textContent = "v" + e.v; f.appendChild(h);
      const ul = document.createElement("ul");
      for (const it of e.items) { const li = document.createElement("li"); li.textContent = it; ul.appendChild(li); }
      f.appendChild(ul);
    }
    return f;
  }

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
    // The menu is a "fixed" sibling somewhere up the button's wrappers (Harbor puts the
    // button inside a Tooltip div first), so walk up a few levels and look at each one's children.
    const btn = nativeSpeedBtn(); if (!btn) return null;
    let el = btn.parentElement;
    for (let i = 0; el && i < 6; i++, el = el.parentElement) {
      for (const c of el.children) {
        if (c !== btn && c.classList.contains("fixed") && !c.contains(btn) &&
            (c.classList.contains("bg-elevated") || /speed/i.test(c.textContent || ""))) return c;
      }
      if (el.matches(PLAYER_SEL)) break;
    }
    // second way: any floating panel in the player that has a "Playback speed" heading
    const r = playerRoot();
    if (r) {
      for (const c of r.querySelectorAll(".fixed")) {
        if (c.contains(btn) || c.id === "speed-dial") continue;
        if (/playback speed/i.test(c.textContent || "") && c.querySelector("button")) return c;
      }
    }
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

  /* saved shows */
  .chev { flex: none; width: 16px; height: 16px; color: var(--subtle); transition: transform .18s ease; }
  .saved-opt[aria-expanded="true"] .chev { transform: rotate(180deg); }
  .saved-opt .count { font-variant-numeric: tabular-nums; color: var(--subtle); margin-inline-start: 6px; }
  .saved { display: flex; flex-direction: column; gap: 2px; padding: 0 0 4px; max-height: 176px; overflow-y: auto; }
  .saved[hidden] { display: none; }
  .srow { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 4px 0 24px; border-radius: 8px; color: var(--muted); }
  .srow:hover { background: var(--hover); color: var(--ink); }
  .srow.now { color: var(--ink); }
  .srow .n { flex: 1; min-width: 0; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .srow .v { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .srow .x {
    flex: none; width: 28px; height: 28px; border-radius: 6px; display: grid; place-items: center;
    color: var(--subtle); opacity: .7; transition: background-color .12s, color .12s, opacity .12s;
  }
  .srow:hover .x { opacity: 1; }
  .srow .x:hover { background: var(--hover); color: var(--danger); }
  .srow .x svg { width: 14px; height: 14px; }

  /* footer: keys + version */
  .foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 12px 2px; }
  .ver { flex: none; font-size: 11.5px; color: var(--subtle); padding: 2px 6px; margin: -2px -6px; border-radius: 6px; transition: background-color .12s, color .12s; }
  .ver:hover { background: var(--hover); color: var(--ink); }
  .news { margin: 6px 4px 2px; padding: 10px 12px; border-radius: 8px; background: var(--hover); font-size: 12.5px; color: var(--muted); }
  .news[hidden] { display: none; }
  .news h4 { margin: 0 0 4px; font-size: 12.5px; font-weight: 600; color: var(--ink); }
  .news h4:not(:first-child) { margin-top: 10px; }
  .news ul { margin: 0; padding-inline-start: 16px; }
  .news li { margin: 2px 0; }

  .keys { font-size: 11.5px; color: var(--subtle); }
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
    <button class="opt saved-opt" type="button" aria-expanded="false" hidden>
      <span class="txt"><span>Saved shows</span><span class="count"></span></span>
      <svg class="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>
    </button>
    <div class="saved" hidden></div>
  </div>
  <div class="news" hidden></div>
  <div class="foot">
    <span class="keys"><kbd>;</kbd> <kbd>'</kbd> slower / faster &middot; <kbd>&#92;</kbd> reset &middot; <kbd>K</kbd> menu</span>
    <button class="ver" type="button" aria-expanded="false">v${VERSION} &middot; What's new</button>
  </div>
</div>`;

  const $ = (s) => root.querySelector(s);
  const sd = $(".sd"), dial = $(".dial"), tape = $(".tape"), valEl = $(".val"), input = $(".in");
  const field = $(".field"), hint = $(".hint"), resetBtn = $(".reset");
  const showOpt = $(".show-opt"), showName = $(".show-name"), allOpt = $(".all-opt");
  const savedOpt = $(".saved-opt"), savedCount = $(".saved-opt .count"), savedList = $(".saved");
  const verBtn = $(".ver"), news = $(".news");
  news.appendChild(changelogNodes(CHANGELOG));

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
    .t.msg { font-size: 13px; font-weight: 500; line-height: 1.4; border-radius: 12px; padding: 10px 14px;
      width: max-content; max-width: min(460px, calc(100vw - 32px)); text-align: center; }
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
    renderSaved();
  }

  const X_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
  let savedKey = "";
  function renderSaved() {
    const names = Object.keys(prefs.shows).sort((a, b) => a.localeCompare(b));
    savedOpt.hidden = names.length === 0;
    savedCount.textContent = String(names.length);
    if (!names.length) { savedList.hidden = true; savedOpt.setAttribute("aria-expanded", "false"); }
    const key = JSON.stringify([names.map((n) => [n, prefs.shows[n]]), currentShow]);
    if (key === savedKey) return;           // nothing changed, keep the DOM (and hover) as is
    savedKey = key;
    savedList.textContent = "";
    for (const n of names) {
      const row = document.createElement("div");
      row.className = "srow" + (n === currentShow ? " now" : "");
      const nm = document.createElement("span"); nm.className = "n"; nm.textContent = n; nm.title = n;
      const v = document.createElement("span"); v.className = "v"; v.textContent = label(prefs.shows[n]);
      const x = document.createElement("button");
      x.type = "button"; x.className = "x"; x.innerHTML = X_ICON;
      x.setAttribute("aria-label", "Forget the speed for " + n); x.title = "Forget";
      x.addEventListener("click", () => { delete prefs.shows[n]; save(prefs); render(false); });
      row.append(nm, v, x);
      savedList.appendChild(row);
    }
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
    toastEl.classList.remove("msg");
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 900);
  }
  function showMessage(text, ms) {
    if (!toastHost.isConnected) document.body.appendChild(toastHost);
    toastEl.textContent = text;
    toastEl.classList.add("msg", "show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms || 6000);
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
  savedOpt.addEventListener("click", () => {
    const open = savedList.hidden;
    savedList.hidden = !open;
    savedOpt.setAttribute("aria-expanded", String(open));
  });
  verBtn.addEventListener("click", () => {
    const open = news.hidden;
    news.hidden = !open;
    verBtn.setAttribute("aria-expanded", String(open));
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
  var noteCloser = null;  // set by the update notice; var so it exists before that code runs
  function placeInMenu() {
    const menu = nativeMenu();
    if (menu) {
      if (noteCloser) { noteCloser(); noteCloser = null; }   // opening the menu dismisses the notice
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

  // If Harbor's menu opens but Custom speed couldn't attach (e.g. a Harbor update changed it),
  // say so once instead of failing silently, and offer the K menu as a way round it.
  let warned = false;
  const onNativeClick = (e) => {
    const btn = nativeSpeedBtn();
    if (warned || !btn || !e.composedPath().includes(btn)) return;
    const wasAttached = host.isConnected;
    setTimeout(() => {
      if (!alive || warned || wasAttached || host.isConnected || nativeMenu()) return;
      // a menu-looking panel opened that we can't use?
      const r = playerRoot();
      const opened = r && [...r.querySelectorAll("div")].some((d) =>
        getComputedStyle(d).position === "fixed" && !d.contains(btn) && d.querySelector("button") && d.offsetHeight > 120);
      if (!opened) return;
      warned = true;
      showMessage(`Speed Dial v${VERSION} couldn't add Custom speed to this menu. Press K for its own menu, ` +
        "and it should be fixed in an update soon.", 8000);
    }, 600);
  };
  window.addEventListener("click", onNativeClick, true);

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

  // ---- "updated" notice: once per new version, anywhere in Harbor -------------------
  const SEEN = "speedDial.seen";
  const noteHost = document.createElement("div");
  let noteTimer = 0;
  (function updateNotice() {
    let seen = null;
    try { seen = localStorage.getItem(SEEN); localStorage.setItem(SEEN, VERSION); } catch (_) { return; }
    if (seen === VERSION) return;
    // older versions didn't record what was seen: if Speed Dial already ran here, this is an update
    const hadOlder = !seen && (localStorage.getItem(STORE) != null || localStorage.getItem("speedDial.code") != null);
    if (seen && !newer(VERSION, seen)) return;
    const entries = seen ? CHANGELOG.filter((e) => newer(e.v, seen)) : hadOlder ? CHANGELOG.filter((e) => newer(e.v, "1.2.0")) : [];
    const nr = noteHost.attachShadow({ mode: "open" });
    nr.innerHTML = `<style>
      :host { all: initial; }
      .n {
        position: fixed; left: 50%; top: 20px; z-index: 2147483001; width: 340px; max-width: calc(100vw - 32px);
        padding: 14px 14px 12px 16px; border-radius: var(--radius-md, 10px);
        background: var(--color-elevated, #34373f); color: var(--color-ink, #f6f6f8);
        box-shadow: 0 10px 30px -12px rgba(0,0,0,.6), 0 0 0 1px var(--color-edge-soft, transparent);
        font: 400 13px/1.4 var(--font-sans, system-ui, sans-serif); -webkit-font-smoothing: antialiased;
        opacity: 0; transform: translate(-50%, -8px); transition: opacity .2s ease, transform .25s cubic-bezier(.2,.8,.2,1);
      }
      .n.show { opacity: 1; transform: translate(-50%, 0); }
      .top { display: flex; align-items: flex-start; gap: 10px; }
      .dot { flex: none; width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; background: var(--color-accent, #d364ba);
        box-shadow: 0 0 0 4px var(--color-accent-soft, transparent); }
      .t { flex: 1; font-size: 14px; font-weight: 600; }
      .s { color: var(--color-ink-subtle, #6e7079); font-size: 12px; font-weight: 400; margin-top: 1px; }
      .x { all: unset; cursor: pointer; flex: none; width: 26px; height: 26px; margin: -4px -4px 0 0; border-radius: 6px;
        display: grid; place-items: center; color: var(--color-ink-subtle, #6e7079); }
      .x:hover { background: color-mix(in srgb, var(--color-canvas, #000) 55%, transparent); color: var(--color-ink, #fff); }
      .x:focus-visible { outline: 2px solid var(--color-accent, #d364ba); }
      .x svg { width: 14px; height: 14px; }
      .body { margin: 8px 0 0 18px; color: var(--color-ink-muted, #aaadb6); }
      h4 { margin: 8px 0 2px; font-size: 12px; font-weight: 600; color: var(--color-ink-subtle, #6e7079); }
      h4:first-child { display: none; }
      ul { margin: 0; padding-inline-start: 16px; } li { margin: 2px 0; }
      @media (prefers-reduced-motion: reduce) { .n { transition: none; } }
    </style>
    <div class="n" role="status">
      <div class="top"><span class="dot"></span>
        <div class="t">Speed Dial ${entries.length ? "updated to" : "installed:"} v${VERSION}
          <div class="s">${entries.length ? "What's new:" : "Open Speed &amp; sleep in the player, or press K"}</div></div>
        <button class="x" type="button" aria-label="Close">${X_ICON}</button></div>
      <div class="body"></div>
    </div>`;
    const card = nr.querySelector(".n");
    if (entries.length) nr.querySelector(".body").appendChild(changelogNodes(entries));
    else nr.querySelector(".body").remove();
    const close = () => { noteCloser = null; card.classList.remove("show"); clearTimeout(noteTimer); setTimeout(() => noteHost.remove(), 300); };
    noteCloser = close;
    nr.querySelector(".x").addEventListener("click", close);
    card.addEventListener("mouseenter", () => clearTimeout(noteTimer));
    card.addEventListener("mouseleave", () => { noteTimer = setTimeout(close, 6000); });
    document.body.appendChild(noteHost);
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add("show")));
    noteTimer = setTimeout(close, 15000);
  })();

  // ---- fast self-update ----------------------------------------------------------------
  // Asks GitHub for the newest commit (not cached), loads that exact file, and switches to it
  // if it's newer. Also keeps the loader's offline copy on the newest version.
  const REPO = "zerobun0/harbor-speed-dial";
  const CODE_KEY = "speedDial.code";
  const CHECK_MS = 3 * 60 * 1000;
  const codeVersion = (c) => (String(c || "").match(/speed-dial v([\d.]+)/) || [])[1] || "0";
  let updTimer = 0, lastSha = null, lastCode = null;
  async function selfUpdate() {
    if (!alive) return;
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/commits/main`,
        { headers: { Accept: "application/vnd.github.sha" }, cache: "no-store" });
      const sha = r.ok ? (await r.text()).trim() : "";
      if (/^[0-9a-f]{40}$/.test(sha) && sha !== lastSha) {
        const c = await fetch(`https://raw.githubusercontent.com/${REPO}/${sha}/speed-dial.js`, { cache: "no-store" });
        const code = c.ok ? await c.text() : "";
        if (/speed-dial v\d/.test(code)) { lastSha = sha; lastCode = code; }
      }
      if (lastCode) {
        let cached = null;
        try { cached = localStorage.getItem(CODE_KEY); } catch (_) {}
        if (verNum(codeVersion(lastCode)) > verNum(codeVersion(cached))) {
          try { localStorage.setItem(CODE_KEY, lastCode); } catch (_) {}
        }
        if (verNum(codeVersion(lastCode)) > verNum(VERSION)) {
          console.info("[speed-dial] updating", VERSION, "->", codeVersion(lastCode));
          new Function(lastCode)();   // the new version replaces this one
          return;
        }
      }
    } catch (_) { /* offline or rate-limited: try again later */ }
    if (alive) updTimer = setTimeout(selfUpdate, CHECK_MS);
  }
  updTimer = setTimeout(selfUpdate, 1500);

  // ---- cleanup (Harbor calls this when Custom JS is edited or cleared) --------------
  function destroy() {
    alive = false;
    mo.disconnect();
    clearTimeout(pollTimer); clearTimeout(toastTimer); clearTimeout(writeTimer); clearTimeout(noteTimer);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("pointerdown", onDocDown, true);
    window.removeEventListener("click", onNativeClick, true);
    clearTimeout(updTimer);
    host.remove(); toastHost.remove(); noteHost.remove();
    if (window[NS] && window[NS].destroy === destroy) delete window[NS];
  }
  window[NS] = { destroy, version: VERSION, get speed() { return speed; }, set: (x) => setSpeed(+x, { glide: true }) };
  const prevCleanup = window.__harborCustomCleanup;
  window.__harborCustomCleanup = () => {
    try { destroy(); } catch (_) {}
    if (typeof prevCleanup === "function") { try { prevCleanup(); } catch (_) {} }
  };
})();
/* <<< speed-dial <<< */
