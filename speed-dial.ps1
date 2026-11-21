<#
  NOT RECOMMENDED: Harbor keeps settings in its own storage and rewrites settings.json
  on startup, so changes made here are lost. Paste loader.js into Settings > Player >
  Custom code > Custom JS instead. Kept only for reference.

  Speed Dial for Harbor: install, update, remove or check.

    .\speed-dial.ps1 install    # add the auto-updating loader to Harbor's Custom JS
    .\speed-dial.ps1 update     # same as install
    .\speed-dial.ps1 remove     # take it out, keep any other custom code
    .\speed-dial.ps1 status     # show what's installed

  Default install is a small loader that pulls the newest speed-dial.js from GitHub
  (cached for offline use, rechecked every 10 minutes). Add -Offline to embed the
  full local speed-dial.js instead (no auto-update).

  Harbor must be closed (it rewrites settings.json while running).
  A backup of settings.json is saved next to it before every change.
#>
param(
  [Parameter(Position = 0)][ValidateSet("install", "update", "remove", "status")][string]$Action = "status",
  [string]$Settings = (Join-Path $env:APPDATA "app.harbor\settings.json"),
  [switch]$CloseHarbor,
  [switch]$Offline
)
$ErrorActionPreference = "Stop"
$Start = "/* >>> speed-dial"
$End = "/* <<< speed-dial <<< */"
$ScriptFile = Join-Path $PSScriptRoot $(if ($Offline) { "speed-dial.js" } else { "loader.js" })

if (-not (Test-Path $Settings)) { throw "Harbor settings not found at $Settings" }

$raw = [IO.File]::ReadAllText($Settings, [Text.UTF8Encoding]::new($false))
$current = ($raw | ConvertFrom-Json).customJs
if ($null -eq $current) { $current = "" }

# strip our managed block, keep everything else the user has
$pattern = [regex]::Escape($Start) + "[\s\S]*?" + [regex]::Escape($End) + "\r?\n?"
$installed = [regex]::Match($current, "speed-dial (loader )?v[\d.]+")
$others = ([regex]::Replace($current, $pattern, "")).Trim()

if ($Action -eq "status") {
  if ($installed.Success) { "Speed Dial is installed: $($installed.Value)" } else { "Speed Dial is not installed." }
  if ($others) { "Other custom JS is also present ($($others.Length) chars), it is left alone." }
  return
}

$running = if ($Settings -like "*\app.harbor\*") { Get-Process harbor -ErrorAction SilentlyContinue }
if ($running) {
  if ($CloseHarbor) { $running | Stop-Process -Force; Start-Sleep -Seconds 2 }
  else { throw "Harbor is running. Close it first, or add -CloseHarbor to close it for you." }
}

if ($Action -in "install", "update") {
  if (-not (Test-Path $ScriptFile)) { throw "$(Split-Path $ScriptFile -Leaf) not found next to this script." }
  $block = ([IO.File]::ReadAllText($ScriptFile, [Text.UTF8Encoding]::new($false))).Trim()
  $new = if ($others) { "$others`n`n$block`n" } else { "$block`n" }
} else {
  $new = if ($others) { "$others`n" } else { "" }
}

# replace only the customJs value in the file, so nothing else in settings changes
$field = [regex]'"customJs"\s*:\s*"(?:[^"\\]|\\.)*"'
if (-not $field.IsMatch($raw)) { throw "Could not find the customJs field in settings.json" }
$encoded = ConvertTo-Json -InputObject $new -Compress
$updated = $field.Replace($raw, { param($m) '"customJs": ' + $encoded }, 1)

# sanity check before writing
if ((($updated | ConvertFrom-Json).customJs) -ne $new) { throw "Self-check failed, nothing was changed." }

$backup = "$Settings.bak-" + (Get-Date -Format "yyyyMMdd-HHmmss")
Copy-Item $Settings $backup
[IO.File]::WriteAllText($Settings, $updated, [Text.UTF8Encoding]::new($false))

switch ($Action) {
  "remove" { "Speed Dial removed. Backup: $backup" }
  default {
    $what = [regex]::Match($new, "speed-dial (loader )?v[\d.]+").Value
    if ($installed.Success) { "Replaced '$($installed.Value)' with '$what'. Backup: $backup" }
    else { "Installed '$what'. Backup: $backup" }
  }
}
if ($CloseHarbor) { Start-Process (Join-Path $env:LOCALAPPDATA "Harbor\harbor.exe"); "Harbor restarted." }
