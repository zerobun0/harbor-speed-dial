# Speed Dial for Harbor

A playback speed panel for the Harbor player (Harborofficial/Harbor v1.0.3+). Pick any speed from 0.1x to 8x.

- Small speed button bottom-right of the player, fades with the controls
- Panel: -/+ buttons, a drag-able dial (scroll works too), presets, a box to type any speed, reset
- "Keep this speed for next videos" switch
- Follows your Harbor theme colours and font automatically
- Stays in sync with Harbor's own `[` / `]` speed keys

## Keys (in the player)

| Key | Does |
| --- | --- |
| `;` / `'` | 0.05x slower / faster |
| `\` | back to 1x |
| `K` | open / close the panel |
| `[` / `]` | Harbor's own 0.25x steps (unchanged) |

## Install, update, remove

Easiest (Harbor closed):

```powershell
.\speed-dial.ps1 install      # or: update / remove / status
.\speed-dial.ps1 install -CloseHarbor   # closes Harbor, installs, reopens it
```

It only touches the `customJs` setting, keeps any other custom JS you have, and saves a backup
(`settings.json.bak-<date>`) next to Harbor's settings first.

Manual: Harbor Settings > Player > Custom code > Custom JS, paste the whole `speed-dial.js`. No restart needed.
To remove manually, delete everything from `/* >>> speed-dial` to `/* <<< speed-dial <<< */`.

## Change things

Edit the settings block at the top of `speed-dial.js` (presets, dial range, step size, keys), then run `update`.
