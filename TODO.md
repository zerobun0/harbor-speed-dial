# TODO: Speed Dial for Harbor

Legend: ✅ done · 🔄 in progress · ⬜ not started · ⛔ blocked · ⏸️ on hold

Repo: https://github.com/zerobun0/harbor-speed-dial (public). Harbor upstream: github.com/Harborofficial/Harbor (v1.0.3).

## Open

- ⛔ H5: Loader pasted into the user's Harbor (Settings > Player > Custom code > Custom JS)
  - Waits on: user pasting (loader.js was put on their clipboard 2026-11-21)
  - Done: dial button shows in the control bar on v1.0.0
- ⬜ H10: Push v1.1.0 (control-bar button + per-show memory, uncommitted in speed-dial.js) AFTER H5, so the user sees the auto-update
  - How: `git add speed-dial.js && git commit && git push`; Harbor picks it up within 10 min or on restart
  - Done: user sees the new button next to Harbor's speed button and the "Remember for this show" switch
- ⬜ H11: Ask user whether to delete speed-dial.ps1 (doesn't work, see gotchas)

## Done

- ✅ H1: Found Custom JS hook (`settings.customJs`, cleanup `window.__harborCustomCleanup`), mpv speed via `mpv_set_property`
- ✅ H2: speed-dial.js v1.0.0 panel, theme-aware (`--color-*`, `--font-sans`, `--radius-*`) (507f827)
- ✅ H4: Mock-tested at 1366px and 400px, 4 themes
- ✅ H6: Auto-update loader (loader.js): fetches raw GitHub main, caches in localStorage `speedDial.code`, rechecks every 10 min (8a91f17, d85f5c3)
- ✅ H7: Public repo with README, screenshots (docs/), MIT licence (d85f5c3, 652055b)
- ✅ H8: Control-bar button next to Harbor's "Speed and sleep timer" button, copies its classes; floats if that button is hidden (in working tree, v1.1.0)
- ✅ H9: Per-show speed via mpv `force-media-title` ("Show · S1E2 · Ep"), priority show > all-videos > Harbor default (in working tree, v1.1.0, mock-tested)

## Gotchas

- Harbor keeps settings in webview localStorage and REWRITES settings.json on startup: editing the file does nothing. Install only by pasting in Settings.
- Harbor binds `[` `]` (speed 0.25), `Shift+{` `Shift+}` (subtitle size). Don't reuse.
- Keep speed-dial.js ASCII-only: run scratch ascii.js converter (escapes non-ASCII to \uXXXX). Shell sed/python one-liners mangle `\u` escapes.
- New-video speed restore must compare against the REAL mpv speed (readSpeed), not cached state (race fixed in v1.1).
