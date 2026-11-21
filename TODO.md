# TODO: Speed Dial for Harbor

Legend: ✅ done · 🔄 in progress · ⬜ not started · ⛔ blocked · ⏸️ on hold

Repo: https://github.com/zerobun0/harbor-speed-dial (public). Harbor upstream: github.com/Harborofficial/Harbor (v1.0.3).

## Open

- ⬜ H15: User checks v1.3 in real Harbor (should see 'Speed Dial updated to v1.3.0' card) (open Speed & sleep or press K; floating pill from v1.0 should be gone)
  - Done: section shows inside the menu, speed changes heard, per-show works on next episode
- ⬜ H11: Ask user whether to delete speed-dial.ps1 (doesn't work) and docs/control-bar.png (no longer used)

## Done

- ✅ H1: Found Custom JS hook (`settings.customJs`, cleanup `window.__harborCustomCleanup`), mpv speed via `mpv_set_property`
- ✅ H2: speed-dial.js v1.0.0 panel, theme-aware (`--color-*`, `--font-sans`, `--radius-*`) (507f827)
- ✅ H4: Mock-tested at 1366px and 400px, 4 themes
- ✅ H6: Auto-update loader (loader.js): fetches raw GitHub main, caches in localStorage `speedDial.code`, rechecks every 10 min (8a91f17, d85f5c3)
- ✅ H7: Public repo with README, screenshots (docs/), MIT licence (d85f5c3, 652055b)
- ✅ H8: Control-bar button next to Harbor's "Speed and sleep timer" button, copies its classes; floats if that button is hidden (in working tree, v1.1.0)
- ✅ H9: Per-show speed via mpv `force-media-title` ("Show · S1E2 · Ep"), priority show > all-videos > Harbor default (in working tree, v1.1.0, mock-tested)

- ✅ H5: Loader pasted into user's Harbor by the user (2026-11-21), v1.0 ran (floating pill seen in their screenshots)
- ✅ H13: Nothing on screen until the menu opens (fixes pill over Skip Intro / during loading) (v1.2.0)
- ✅ H14: "Custom speed" section injected at top of Harbor's Speed & sleep popover (div.fixed inside the button's div.relative); K clicks the native button; floating fallback if button hidden (v1.2.0). Replaces the v1.1 control-bar button, which never shipped.
- ✅ H10: v1.2.0 pushed to main for auto-update

- ✅ H16: Saved shows list (expand, remove per show) (v1.3.0)
- ✅ H17: Update notice card once per new version (localStorage `speedDial.seen`; older installs detected via `speedDial.v1`/`speedDial.code`), top-centre, closes when menu opens; version + What's new in footer (v1.3.0)
- ✅ H18: CHANGELOG.md; keep it and the CHANGELOG array at the top of speed-dial.js in sync on every release
- ✅ H19: v1.3.0 pushed

## Gotchas

- Harbor keeps settings in webview localStorage and REWRITES settings.json on startup: editing the file does nothing. Install only by pasting in Settings.
- Harbor binds `[` `]` (speed 0.25), `Shift+{` `Shift+}` (subtitle size). Don't reuse.
- Keep speed-dial.js ASCII-only: run scratch ascii.js converter (escapes non-ASCII to \uXXXX). Shell sed/python one-liners mangle `\u` escapes.
- New-video speed restore must compare against the REAL mpv speed (readSpeed), not cached state (race fixed in v1.1).
