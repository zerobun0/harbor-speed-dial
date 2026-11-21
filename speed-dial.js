/* >>> speed-dial v1.0.0 >>> (managed block: install/update/remove with speed-dial.ps1) */
(() => {
  // ---- settings you can change ---------------------------------------------------
  const PRESETS = [0.75, 1, 1.25, 1.5, 1.75, 2];
  const DIAL_MIN = 0.25;        // tape dial range (typing allows 0.1 to 8)
  const DIAL_MAX = 4;
  const FINE_STEP = 0.05;       // the -/+ buttons and the keys below
  const KEY_SLOWER = ";";       // 0.05x slower (Harbor already uses [ ] for 0.25x)
  const KEY_FASTER = "'";      // 0.05x faster
  const KEY_PANEL = "k";        // open / close the speed panel
  const KEY_RESET = "\\";       // back to 1x
  const ACCENT_FALLBACK = "#d364ba";
  // ---------------------------------------------------------------------------------

  const NS = "__speedDial";
  try { window[NS] && window[NS].destroy(); } catch (_) {}

  const TYPE_MIN = 0.1, TYPE_MAX = 8;
  const PX_PER_STEP = 9;        // dial: pixels per 0.05x
  const STORE = "speedDial.v1";
  const PLAYER_SEL = "[data-harbor-player]";

  const ti = () => window.__TAURI_INTERNALS__;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const round2 = (v) => Math.round(v * 100) / 100;
  const label = (v) => String(+v.toFixed(2)) + "\u00d7";

  const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (_) { return {}; } };
  const save = (o) => { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (_) {} };
  let prefs = Object.assign({ remember: false, speed: 1 }, load());

  // ---- player bridge ---------------------------------------------------------------
  const playerRoot = () => document.querySelector(PLAYER_SEL);
  const videoEl = () => { const r = playerRoot(); return r && r.querySelector("video"); };

  async function mpvGet(name) {
    const t = ti(); if (!t || !t.invoke) return null;
    try { return await t.invoke("mpv_get_property", { name }); } catch (_) { return null; }
  }
  async function readSpeed() {
    const v = videoEl();
    if (v && Number.isFinite(v.duration) && v.duration > 0) return v.playbackRate;
    const s = Number(await mpvGet("speed"));
    return Number.isFinite(s) && s > 0 ? s : null;
  }
  async function writeSpeed(x) {
    const v = videoEl();
    if (v && Number.isFinite(v.duration) && v.duration > 0) { v.playbackRate = x; return; }
    const t = ti(); if (!t || !t.invoke) return;
    try { await t.invoke("mpv_set_property", { name: "speed", value: x }); }
    catch (_) {
      try { await t.invoke("mpv_command", { cmd: ["set", "speed", String(x)] }); } catch (_) {}
    }
  }

  // ---- UI --------------------------------------------------------------------------
  const host = document.createElement("div");
  host.id = "speed-dial-host";
  host.style.cssText = "position:fixed;inset:auto 0 0 auto;z-index:2147483000;";
  const root = host.attachShadow({ mode: "open" });

  const cssVar = (names) => {
    const cs = getComputedStyle(document.documentElement);
    for (const n of names) { const v = cs.getPropertyValue(n).trim(); if (v) return v; }
    return "";
  };
  const accent = cssVar(["--accent", "--color-accent", "--harbor-accent"]) || ACCENT_FALLBACK;

  root.innerHTML = `
<style>
  :host { all: initial; }
  * { box-sizing: border-box; }
  .wrap {
    /* every colour comes from the active Harbor theme; fallbacks are Harbor's defaults */
    --bg: var(--color-elevated, oklch(0.27 0.004 260));
    --raised: var(--color-raised, oklch(0.32 0.004 260));
    --ink: var(--color-ink, oklch(0.97 0.003 260));
    --muted: var(--color-ink-muted, oklch(0.72 0.003 260));
    --subtle: var(--color-ink-subtle, oklch(0.50 0.003 260));
    --edge: var(--color-edge-soft, oklch(0.36 0.004 260 / 0.25));
    --accent: var(--color-accent, ${accent});
    --accent-soft: var(--color-accent-soft, color-mix(in srgb, var(--accent) 18%, transparent));
    --on-accent: var(--color-canvas, #111);
    --danger: var(--color-danger, oklch(0.55 0.18 25));
    --hover: color-mix(in srgb, var(--ink) 7%, transparent);
    --r-sm: var(--radius-sm, 6px); --r-md: var(--radius-md, 10px);
    position: fixed; right: 56px; bottom: 150px;
    font-family: var(--font-sans, "Switzer", "Inter", system-ui, sans-serif);
    font-size: 14px; font-weight: 500; line-height: 1.3;
    color: var(--ink); -webkit-font-smoothing: antialiased;
    display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
    pointer-events: none;
  }
  .num { font-variant-numeric: tabular-nums; }
  button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; padding: 0; }
  button:focus-visible, input:focus-visible, .dial:focus-visible {
    outline: 2px solid var(--accent); outline-offset: 2px;
  }

  /* pill: same shape and tint as Harbor's transport buttons */
  .pill {
    pointer-events: auto;
    display: inline-flex; align-items: center; gap: 6px;
    height: 44px; min-width: 44px; padding: 0 14px 0 12px; border-radius: 999px;
    background: rgba(0, 0, 0, 0.38); color: rgba(255, 255, 255, 0.88);
    backdrop-filter: blur(10px);
    font-size: 12px; font-weight: 700; letter-spacing: 0.02em;
    opacity: 0; transform: translateY(4px);
    transition: opacity .2s ease, transform .2s ease, background-color .15s ease, color .15s ease;
  }
  .pill svg { width: 20px; height: 20px; }
  .pill:hover { background: rgba(255, 255, 255, 0.14); color: #fff; }
  .pill.changed, .wrap.open .pill { background: rgba(255, 255, 255, 0.22); color: #fff; }
  .pill.changed:hover, .wrap.open .pill:hover { background: rgba(255, 255, 255, 0.30); }
  .wrap.awake .pill, .wrap.open .pill { opacity: 1; transform: none; }
  .wrap.off .pill { display: none; }

  /* panel: Harbor's player menu surface */
  .panel {
    pointer-events: auto;
    width: 320px; max-width: calc(100vw - 32px); padding: 6px;
    border-radius: var(--r-md); background: var(--bg);
    box-shadow: 0 10px 30px -12px rgba(0, 0, 0, 0.6);
    transform-origin: bottom right;
    opacity: 0; transform: translateY(6px) scale(.98); visibility: hidden;
    transition: opacity .16s ease, transform .18s cubic-bezier(.2,.8,.2,1), visibility 0s linear .18s;
  }
  .wrap.open .panel { opacity: 1; transform: none; visibility: visible; transition-delay: 0s; }

  .head { display: flex; align-items: center; justify-content: space-between; padding: 6px 4px 0 10px; }
  .title { color: var(--muted); font-size: 12px; font-weight: 600; }
  .reset { color: var(--muted); font-size: 12px; padding: 6px 10px; border-radius: 8px; transition: background-color .12s, color .12s; }
  .reset:hover { color: var(--ink); background: var(--hover); }
  .reset[disabled] { opacity: .4; cursor: default; background: none; color: var(--muted); }

  .readout { display: flex; align-items: center; justify-content: space-between; padding: 6px 6px 2px; }
  .big { font-size: 34px; font-weight: 650; line-height: 1; letter-spacing: -0.02em; }
  .big small { font-size: 18px; font-weight: 600; color: var(--muted); margin-left: 2px; }
  .step {
    width: 40px; height: 40px; border-radius: 999px; background: var(--hover); color: var(--ink);
    display: grid; place-items: center; transition: background-color .12s ease, transform .08s ease;
  }
  .step:hover { background: color-mix(in srgb, var(--ink) 13%, transparent); }
  .step:active { transform: scale(.94); }
  .step svg { width: 18px; height: 18px; }

  .dial {
    position: relative; height: 52px; margin: 4px 0 2px; overflow: hidden; border-radius: var(--r-sm);
    cursor: ew-resize; touch-action: none; user-select: none;
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 20%, #000 80%, transparent);
            mask-image: linear-gradient(90deg, transparent, #000 20%, #000 80%, transparent);
  }
  .tape { position: absolute; top: 0; left: 50%; height: 100%; will-change: transform; }
  .tick { position: absolute; bottom: 20px; width: 1px; height: 8px; background: var(--subtle); }
  .tick.mid { height: 13px; background: var(--muted); }
  .tick.major { height: 19px; width: 2px; margin-left: -.5px; background: var(--ink); }
  .tl { position: absolute; bottom: 2px; transform: translateX(-50%); color: var(--muted); font-size: 11px; font-weight: 600; }
  .needle {
    position: absolute; left: 50%; bottom: 16px; width: 3px; height: 32px; margin-left: -1.5px;
    border-radius: 2px; background: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
    pointer-events: none;
  }
  .tape.glide { transition: transform .2s cubic-bezier(.2,.8,.2,1); }

  .chips { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; padding: 4px 0 2px; }
  .chip {
    height: 36px; border-radius: 8px; font-size: 13px; font-weight: 600; color: var(--muted);
    transition: background-color .12s ease, color .12s ease;
  }
  .chip:hover { background: var(--hover); color: var(--ink); }
  .chip.on { background: var(--accent-soft); color: var(--accent); }

  .row { display: flex; gap: 6px; padding: 6px 0 0; align-items: center; }
  .field {
    flex: 1; display: flex; align-items: center; height: 40px; padding: 0 12px; border-radius: 8px;
    background: var(--hover); border: 1px solid transparent;
    transition: border-color .12s ease, background-color .12s ease;
  }
  .field:focus-within { border-color: var(--accent); background: transparent; }
  .field input {
    all: unset; flex: 1; min-width: 0; font-size: 14px; font-weight: 500; color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .field input::placeholder { color: var(--subtle); }
  .field span { color: var(--subtle); font-size: 13px; }
  .field.bad { border-color: var(--danger); }
  .apply {
    height: 40px; padding: 0 16px; border-radius: 8px; font-weight: 600; font-size: 13px;
    background: var(--accent); color: var(--on-accent); transition: filter .12s ease;
  }
  .apply:hover { filter: brightness(1.08); }
  .hint { color: var(--subtle); font-size: 12px; padding: 4px 6px 0; min-height: 20px; }
  .hint.bad { color: var(--danger); }

  .keep {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 10px; border-radius: 8px; cursor: pointer;
    transition: background-color .12s ease;
  }
  .keep:hover { background: var(--hover); }
  .keep .t { font-size: 14px; color: var(--ink); }
  .keep .s { font-size: 12px; color: var(--subtle); margin-top: 2px; }
  .switch {
    flex: none; width: 38px; height: 22px; border-radius: 999px; background: var(--raised);
    position: relative; transition: background-color .16s ease;
  }
  .switch::after {
    content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%;
    background: var(--ink); transition: transform .18s cubic-bezier(.2,.8,.2,1);
  }
  .switch[aria-checked="true"] { background: var(--accent); }
  .switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--on-accent); }

  .keys {
    color: var(--subtle); font-size: 11.5px; line-height: 1.7;
    border-top: 1px solid var(--edge); margin-top: 2px; padding: 8px 10px 4px;
  }
  kbd {
    font: inherit; font-size: 11px; font-weight: 600; color: var(--muted); padding: 0 5px; border-radius: 5px;
    background: var(--hover);
  }

  /* on-screen feedback, like Harbor's own OSD */
  .toast {
    position: fixed; left: 50%; top: 12%; transform: translate(-50%, -4px);
    padding: 8px 16px; border-radius: 999px; background: rgba(0, 0, 0, 0.55); color: #fff;
    backdrop-filter: blur(10px); font-size: 20px; font-weight: 700;
    font-family: var(--font-sans, system-ui, sans-serif); font-variant-numeric: tabular-nums;
    opacity: 0; transition: opacity .16s ease, transform .16s ease; pointer-events: none;
  }
  .toast.show { opacity: 1; transform: translate(-50%, 0); }

  @media (max-width: 520px) {
    .wrap { right: 12px; bottom: 120px; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::after { transition: none !important; }
  }
</style>
<div class="wrap off" part="wrap">
  <div class="panel" role="dialog" aria-label="Playback speed">
    <div class="head">
      <span class="title">Playback speed</span>
      <button class="reset" type="button">Reset to 1&times;</button>
    </div>
    <div class="readout">
      <button class="step" data-d="-1" type="button" aria-label="Slower">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3.5 8h9"/></svg>
      </button>
      <div class="big num"><span class="bv">1</span><small>&times;</small></div>
      <button class="step" data-d="1" type="button" aria-label="Faster">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3.5 8h9M8 3.5v9"/></svg>
      </button>
    </div>
    <div class="dial" tabindex="0" role="slider" aria-label="Speed dial" aria-valuemin="${DIAL_MIN}" aria-valuemax="${DIAL_MAX}">
      <div class="tape"></div>
      <div class="needle"></div>
    </div>
    <div class="chips"></div>
    <div class="row">
      <label class="field"><input class="in" inputmode="decimal" placeholder="Type any speed, e.g. 1.37" aria-label="Custom speed"><span>&times;</span></label>
      <button class="apply" type="button">Set</button>
    </div>
    <div class="hint"></div>
    <div class="keep" role="presentation">
      <div><div class="t">Keep this speed for next videos</div><div class="s">Applies it whenever a new video starts</div></div>
      <button class="switch" role="switch" aria-checked="false" aria-label="Keep this speed for next videos" type="button"></button>
    </div>
    <div class="keys"><kbd>;</kbd> <kbd>'</kbd> slower / faster &middot; <kbd>&#92;</kbd> reset &middot; <kbd>K</kbd> open</div>
  </div>
  <button class="pill" type="button" aria-label="Playback speed" aria-haspopup="dialog">
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2.6 11.5a6 6 0 1 1 10.8 0"/><path d="M8 9.2l3-3.4"/></svg>
    <span class="v num">1&times;</span>
  </button>
</div>
<div class="toast num"></div>`;

  const $ = (s) => root.querySelector(s);
  const wrap = $(".wrap"), pill = $(".pill"), pillV = $(".pill .v"), bigV = $(".bv");
  const dial = $(".dial"), tape = $(".tape"), chips = $(".chips"), input = $(".in");
  const field = $(".field"), hint = $(".hint"), sw = $(".switch"), resetBtn = $(".reset"), toast = $(".toast");

  // build tape
  const steps = Math.round((DIAL_MAX - DIAL_MIN) / FINE_STEP);
  const frag = document.createDocumentFragment();
  for (let i = 0; i <= steps; i++) {
    const v = round2(DIAL_MIN + i * FINE_STEP);
    const t = document.createElement("div");
    const hundred = Math.round(v * 100);
    t.className = "tick" + (hundred % 50 === 0 ? " major" : hundred % 25 === 0 ? " mid" : "");
    t.style.left = i * PX_PER_STEP + "px";
    frag.appendChild(t);
    if (hundred % 50 === 0) {
      const l = document.createElement("div");
      l.className = "tl num"; l.textContent = String(v);
      l.style.left = i * PX_PER_STEP + "px";
      frag.appendChild(l);
    }
  }
  tape.appendChild(frag);
  PRESETS.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip num"; b.dataset.v = p; b.textContent = p + "\u00d7";
    chips.appendChild(b);
  });

  // ---- state -----------------------------------------------------------------------
  let speed = 1, dragging = false, open = false;

  function render(glide) {
    const shown = clamp(speed, DIAL_MIN, DIAL_MAX);
    const x = -((shown - DIAL_MIN) / FINE_STEP) * PX_PER_STEP;
    tape.classList.toggle("glide", !!glide);
    tape.style.transform = `translateX(${x}px)`;
    bigV.textContent = String(+speed.toFixed(2));
    pillV.textContent = label(speed);
    pill.classList.toggle("changed", Math.abs(speed - 1) > 0.001);
    dial.setAttribute("aria-valuenow", speed.toFixed(2));
    resetBtn.disabled = Math.abs(speed - 1) < 0.001;
    chips.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", Math.abs(+c.dataset.v - speed) < 0.001));
    sw.setAttribute("aria-checked", String(!!prefs.remember));
  }

  let writeTimer = 0, pendingWrite = null;
  function setSpeed(x, opts = {}) {
    x = round2(clamp(x, TYPE_MIN, TYPE_MAX));
    speed = x;
    render(opts.glide);
    if (prefs.remember) { prefs.speed = x; save(prefs); }
    pendingWrite = x;
    if (!writeTimer) {
      writeTimer = setTimeout(() => { writeTimer = 0; const w = pendingWrite; pendingWrite = null; writeSpeed(w); }, 50);
    }
    if (opts.toast) showToast();
  }

  let toastTimer = 0;
  function showToast() {
    toast.textContent = label(speed);
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 900);
  }

  function setOpen(v) {
    open = v; wrap.classList.toggle("open", v);
    pill.setAttribute("aria-expanded", String(v));
    if (v) { hint.textContent = ""; field.classList.remove("bad"); hint.classList.remove("bad"); render(false); }
    else wake();
  }

  let sleepTimer = 0;
  function wake() {
    if (!playerRoot()) return;
    wrap.classList.add("awake");
    clearTimeout(sleepTimer);
    sleepTimer = setTimeout(() => { if (!open && !pill.matches(":hover")) wrap.classList.remove("awake"); }, 2600);
  }

  // ---- interactions ----------------------------------------------------------------
  // keep clicks inside the widget from reaching the player (pause / fullscreen / menu)
  ["mousedown", "mouseup", "click", "dblclick", "contextmenu", "pointerdown", "pointerup", "wheel", "keydown", "keyup"]
    .forEach((t) => host.addEventListener(t, (e) => e.stopPropagation()));

  pill.addEventListener("click", () => setOpen(!open));
  resetBtn.addEventListener("click", () => setSpeed(1, { glide: true }));
  root.querySelectorAll(".step").forEach((b) =>
    b.addEventListener("click", () => setSpeed(speed + FINE_STEP * +b.dataset.d, { glide: true })));
  chips.addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (c) setSpeed(+c.dataset.v, { glide: true }); });

  function applyTyped() {
    const raw = input.value.replace(",", ".").replace(/[x\u00d7\s]/gi, "");
    const v = Number(raw);
    if (!raw || !Number.isFinite(v) || v < TYPE_MIN || v > TYPE_MAX) {
      field.classList.add("bad"); hint.classList.add("bad");
      hint.textContent = `Enter a number from ${TYPE_MIN} to ${TYPE_MAX}`;
      return;
    }
    field.classList.remove("bad"); hint.classList.remove("bad");
    setSpeed(v, { glide: true });
    hint.textContent = `Set to ${label(round2(v))}`;
    input.value = "";
  }
  $(".apply").addEventListener("click", applyTyped);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); applyTyped(); }
    if (e.key === "Escape") { e.preventDefault(); input.blur(); setOpen(false); }
  });
  input.addEventListener("input", () => { field.classList.remove("bad"); hint.classList.remove("bad"); hint.textContent = ""; });

  const toggleKeep = () => {
    prefs.remember = !prefs.remember;
    if (prefs.remember) prefs.speed = speed;
    save(prefs); render(false);
  };
  $(".keep").addEventListener("click", toggleKeep);

  // dial drag
  let startX = 0, startSpeed = 1;
  dial.addEventListener("pointerdown", (e) => {
    dragging = true; startX = e.clientX; startSpeed = clamp(speed, DIAL_MIN, DIAL_MAX);
    dial.classList.add("dragging"); dial.setPointerCapture(e.pointerId);
  });
  dial.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dv = -((e.clientX - startX) / PX_PER_STEP) * FINE_STEP;
    setSpeed(clamp(Math.round((startSpeed + dv) / FINE_STEP) * FINE_STEP, DIAL_MIN, DIAL_MAX));
  });
  const endDrag = () => { dragging = false; dial.classList.remove("dragging"); };
  dial.addEventListener("pointerup", endDrag);
  dial.addEventListener("pointercancel", endDrag);
  const onWheel = (e) => {
    e.preventDefault();
    const dir = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) > 0 ? -1 : 1;
    setSpeed(speed + dir * (e.shiftKey ? 0.01 : FINE_STEP), { glide: true });
  };
  dial.addEventListener("wheel", onWheel, { passive: false });
  pill.addEventListener("wheel", (e) => { onWheel(e); showToast(); }, { passive: false });
  dial.addEventListener("keydown", (e) => {
    const k = e.key;
    if (k === "ArrowLeft" || k === "ArrowDown") { e.preventDefault(); setSpeed(speed - (e.shiftKey ? 0.01 : FINE_STEP), { glide: true }); }
    if (k === "ArrowRight" || k === "ArrowUp") { e.preventDefault(); setSpeed(speed + (e.shiftKey ? 0.01 : FINE_STEP), { glide: true }); }
    if (k === "Home") { e.preventDefault(); setSpeed(1, { glide: true }); }
    if (k === "Escape") { e.preventDefault(); setOpen(false); pill.focus(); }
  });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); pill.focus(); }
  });

  // global keys (only while the player is open)
  const isTyping = (e) => {
    const n = e.composedPath ? e.composedPath()[0] : e.target;
    return n instanceof HTMLElement && (n.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName));
  };
  const onKey = (e) => {
    if (!playerRoot() || isTyping(e) || e.ctrlKey || e.altKey || e.metaKey) return;
    const k = e.key;
    let hit = true;
    if (k === KEY_SLOWER && !e.shiftKey) setSpeed(speed - FINE_STEP, { glide: true, toast: true });
    else if (k === KEY_FASTER && !e.shiftKey) setSpeed(speed + FINE_STEP, { glide: true, toast: true });
    else if (k === KEY_RESET && !e.shiftKey) setSpeed(1, { glide: true, toast: true });
    else if (k.toLowerCase() === KEY_PANEL && !e.shiftKey) { setOpen(!open); if (open) wake(); }
    else if (k === "Escape" && open) setOpen(false);
    else hit = false;
    if (hit) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }
  };
  window.addEventListener("keydown", onKey, true);

  // close when clicking elsewhere
  const onDocDown = (e) => { if (open && !e.composedPath().includes(host)) setOpen(false); };
  window.addEventListener("pointerdown", onDocDown, true);
  const onMove = () => wake();
  window.addEventListener("mousemove", onMove, true);

  // ---- lifecycle: show only in the player, stay in sync, apply kept speed ---------
  let inPlayer = false, lastPath = null, pollTimer = 0, alive = true;
  function attach() {
    const has = !!playerRoot();
    if (has === inPlayer) return;
    inPlayer = has;
    wrap.classList.toggle("off", !has);
    if (has) {
      if (!host.isConnected) document.body.appendChild(host);
      wake(); poll();
    } else {
      setOpen(false); wrap.classList.remove("awake"); lastPath = null;
      clearTimeout(pollTimer);
    }
  }
  async function poll() {
    if (!alive || !inPlayer) return;
    try {
      const path = await mpvGet("path");
      if (path && path !== lastPath) {
        const first = lastPath === null;
        lastPath = path;
        if (prefs.remember && Math.abs((prefs.speed || 1) - 1) > 0.001) {
          // let the app apply its own default first, then put the kept speed back
          setTimeout(() => { if (alive && inPlayer) setSpeed(prefs.speed); }, first ? 1200 : 700);
        }
      }
      if (!dragging && !pendingWrite) {
        const s = await readSpeed();
        if (s && Math.abs(s - speed) > 0.004) { speed = round2(s); render(true); }
      }
    } catch (_) {}
    pollTimer = setTimeout(poll, 700);
  }
  const mo = new MutationObserver(() => attach());
  mo.observe(document.body, { childList: true, subtree: true });
  document.body.appendChild(host);
  render(false);
  attach();

  // ---- cleanup (the app calls this when Custom JS is edited or cleared) -------------
  function destroy() {
    alive = false;
    mo.disconnect();
    clearTimeout(pollTimer); clearTimeout(sleepTimer); clearTimeout(toastTimer); clearTimeout(writeTimer);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("pointerdown", onDocDown, true);
    window.removeEventListener("mousemove", onMove, true);
    host.remove();
    if (window[NS] && window[NS].destroy === destroy) delete window[NS];
  }
  window[NS] = { destroy, version: "1.0.0", get speed() { return speed; }, set: (x) => setSpeed(+x, { glide: true }) };
  // chain with any other script in the same Custom JS box
  const prevCleanup = window.__harborCustomCleanup;
  window.__harborCustomCleanup = () => {
    try { destroy(); } catch (_) {}
    if (typeof prevCleanup === "function") { try { prevCleanup(); } catch (_) {} }
  };
})();
/* <<< speed-dial <<< */
