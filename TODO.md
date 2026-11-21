# TODO: Speed Dial for Harbor

Legend: ✅ done · 🔄 in progress · ⬜ not started · ⛔ blocked · ⏸️ on hold

Repo: https://github.com/zerobun0/harbor-speed-dial (public). Harbor upstream: github.com/Harborofficial/Harbor (v1.0.3).

## Open

- ⬜ H15: User restarts Harbor and checks v1.4.0: "Speed Dial updated to v1.4.0" card, Custom speed shows in Speed & sleep
  - Done: section shows, speed changes heard, per-show works on next episode

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

- ✅ H20/H21: v1.3.1 fixes the section never attaching in real Harbor (button sits inside Tooltip `div.group/tip.relative`; menu is a sibling one level up). Mock now has the tooltip wrapper.

- ✅ H11: Deleted speed-dial.ps1 and docs/control-bar.png (v1.4.0 commit)
- ✅ H22: Second way to find the menu (any .fixed panel in the player with a Playback speed heading) + clear message if a menu opens and it still cannot attach (v1.4.0, mock-tested)
- ✅ H23: Self-update: asks api.github.com for the main commit sha (uncached), loads raw/<sha>/speed-dial.js, switches if newer; 1.5 s after start then every 3 min; older copies never replace newer ones (v1.4.0, mock-tested). Harbor CSP allows connect-src https: and unsafe-eval.
- ✅ H24: Install guide says Settings > System > Custom code (Advanced on older Harbor; Settings search as fallback)
- ✅ H25: Investigated "1.85 carried to Black Clover": not a bug. Harbor defaultPlaybackSpeed was pinned to 1.85 (settings.json). README now explains the pin.
- ✅ H26-H28: Install walkthrough video edited with HyperFrames (3 scenes: README copy, Settings > System > Custom code, paste into Custom JS; punch-ins, step captions, 12.8 s). docs/install.gif (inline in README Install) + docs/install.mp4

## Gotchas

- The install video's README footage still shows the old "Settings > Player" line; caption 2 says the right path. Re-record if that bugs anyone. HyperFrames project lived in the session scratchpad (not kept).

- Official Harborofficial/Harbor repo is 404 now (2026-11-21). Newest public source copy: JinxAgain/harbor or canonrebel04/harbor (v0.9.132, older than the user's 1.0.3).
- Harbor picks a new video's speed as: that title's saved rate, else settings.defaultPlaybackSpeed (the pin in its speed list).
- Mock tests: page.goto to the same URL with only a new #hash does NOT reload; add ?r=N.

- Harbor keeps settings in webview localStorage and REWRITES settings.json on startup: editing the file does nothing. Install only by pasting in Settings.
- Harbor binds `[` `]` (speed 0.25), `Shift+{` `Shift+}` (subtitle size). Don't reuse.
- Keep speed-dial.js ASCII-only: run scratch ascii.js converter (escapes non-ASCII to \uXXXX). Shell sed/python one-liners mangle `\u` escapes.
- Harbor's speed button is wrapped in a Tooltip `div.relative`: find the menu by walking up ancestors, never `closest("div.relative")`.
- New-video speed restore must compare against the REAL mpv speed (readSpeed), not cached state (race fixed in v1.1).
