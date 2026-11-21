# TODO: Speed Dial for Harbor

Legend: ✅ done · 🔄 in progress · ⬜ not started · ⛔ blocked · ⏸️ on hold

## Open

- ⛔ H5: Install into the real Harbor and try it on a real video
  - How: close Harbor, run `.\speed-dial.ps1 install` (or `-CloseHarbor`), play something, press K
  - Done: panel shows in the player, speed changes are heard, theme colours match
  - Waits on: user (Harbor was open; not closed without asking)
  - Estimate: ~5 min

## Done

- ✅ H1: Found Harbor's Custom JS hook (`settings.customJs`, cleanup via `window.__harborCustomCleanup`), mpv speed via `mpv_set_property`. Repo: github.com/Harborofficial/Harbor (v1.0.3)
- ✅ H2: speed-dial.js panel: dial, presets, typed speed, reset, keep-speed switch, keys `;` `'` `\` `K`; theme-aware via `--color-*` vars, `--font-sans`
- ✅ H3: speed-dial.ps1 install/update/remove/status, edits only customJs, backs up settings
- ✅ H4: Tested in a mock Harbor player (keys, drag snap, typing validation, sync with external speed change, cleanup), screenshots at 1366px and 400px, 4 themes

## Gotchas

- Harbor already binds `[` `]` (speed 0.25), `Shift+{` `Shift+}` (subtitle size). Don't reuse.
- Harbor rewrites settings.json while running: installer refuses unless Harbor is closed.
- Keep speed-dial.js ASCII-only (`×` / `&times;` for the x sign).
