<#
.SYNOPSIS
    Installs and starts Route Flyover on Windows 10 (1809+) and 11.

.DESCRIPTION
    Automates docs/INSTALL-WINDOWS.md:
      1. installs Node.js LTS and ffmpeg with winget (skipped when a suitable
         version is already installed),
      2. gets Route Flyover (uses the folder this script is in, or clones it with
         Git, or downloads the ZIP when Git isn't installed),
      3. runs npm install (skipped when node_modules is up to date),
      4. creates "Start Route Flyover.bat" for starting it with a double-click,
      5. starts Route Flyover and opens it in the browser.

    It is safe to run again: finished steps are skipped. On a Git checkout a rerun
    also updates Route Flyover to the newest version.

    Easiest way to run it: double-click install-windows.bat. From PowerShell:
        powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
    Without downloading anything first:
        irm https://raw.githubusercontent.com/topke63/RouteFlyover/main/install-windows.ps1 | iex

.PARAMETER InstallDir
    Where to put Route Flyover when the script isn't run from inside a Route Flyover
    folder. Default: %USERPROFILE%\RouteFlyover (outside OneDrive on most PCs).

.PARAMETER SkipFfmpeg
    Don't install ffmpeg. Videos are then saved as WebM, or converted to MP4 by
    Chrome/Edge themselves.

.PARAMETER NoLaunch
    Install only; don't start Route Flyover at the end.
#>
param(
    [string]$InstallDir = (Join-Path $env:USERPROFILE 'RouteFlyover'),
    [switch]$SkipFfmpeg,
    [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # makes Invoke-WebRequest much faster on PowerShell 5.1
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$RepoUrl = 'https://github.com/topke63/RouteFlyover.git'
$ZipUrl  = 'https://github.com/topke63/RouteFlyover/archive/refs/heads/main.zip'
$Guide   = 'https://github.com/topke63/RouteFlyover/blob/main/docs/INSTALL-WINDOWS.md'

function Write-Step($text) { Write-Host ''; Write-Host "==> $text" -ForegroundColor Cyan }
function Write-Ok($text)   { Write-Host "    OK: $text" -ForegroundColor Green }
function Write-Note($text) { Write-Host "    $text" }
function Write-Warn($text) { Write-Host "    WARNING: $text" -ForegroundColor Yellow }

function Stop-Install($text) {
    Write-Host ''
    Write-Host "ERROR: $text" -ForegroundColor Red
    Write-Host "See the step-by-step guide: $Guide"
    # exit would close the window when the script runs through "irm ... | iex"
    if ($PSCommandPath) { exit 1 } else { throw 'Installation stopped.' }
}

function Test-Command($name) { [bool](Get-Command $name -ErrorAction SilentlyContinue) }

# Programs installed by winget only show up in new terminals; pick them up in this one too.
function Update-SessionPath {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [Environment]::GetEnvironmentVariable('Path', 'User')
}

# Route Flyover needs Node.js ^20.19.0 || >=22.12.0 (package.json "engines").
function Get-NodeVersion {
    if (-not (Test-Command 'node')) { return $null }
    try { [version](& node -p 'process.versions.node' 2>$null) } catch { $null }
}

function Test-NodeOk($v) {
    if (-not $v) { return $false }
    ($v.Major -eq 20 -and $v.Minor -ge 19) -or
    ($v.Major -eq 22 -and $v.Minor -ge 12) -or
    ($v.Major -ge 23)
}

function Invoke-Winget([string[]]$wingetArgs) {
    & winget @wingetArgs --accept-source-agreements --accept-package-agreements
    Update-SessionPath
}

function Test-RouteFlyoverDir($dir) {
    if (-not $dir) { return $false }
    $pkg = Join-Path $dir 'package.json'
    (Test-Path $pkg) -and ((Get-Content $pkg -Raw) -match '"name"\s*:\s*"route-flyover"')
}

Write-Host 'Route Flyover installer for Windows' -ForegroundColor White

# --- winget ------------------------------------------------------------------
Write-Step 'Checking for winget'
Update-SessionPath
$nodeVersion = Get-NodeVersion
$needNode    = -not (Test-NodeOk $nodeVersion)
$needFfmpeg  = (-not $SkipFfmpeg) -and (-not (Test-Command 'ffmpeg'))
$haveWinget  = Test-Command 'winget'
if ($haveWinget) {
    Write-Ok 'winget is available'
} elseif ($needNode) {
    Stop-Install ("winget isn't available, so Node.js can't be installed automatically.`n" +
        'Update "App Installer" from the Microsoft Store and run this script again, or install ' +
        'Node.js by hand (guide step 3, option B).')
} else {
    Write-Note "winget isn't available; that's fine because Node.js is already installed."
}

# --- Node.js -----------------------------------------------------------------
Write-Step 'Node.js (22.12 or newer, or 20.19 or newer)'
if (-not $needNode) {
    Write-Ok "Node.js $nodeVersion is already installed"
} else {
    if ($nodeVersion) {
        Write-Note "Node.js $nodeVersion is too old (22.0 to 22.11 don't work). Updating to the current LTS..."
        Invoke-Winget @('upgrade', '--id', 'OpenJS.NodeJS.LTS', '-e')
        if (-not (Test-NodeOk (Get-NodeVersion))) {
            Invoke-Winget @('install', '--id', 'OpenJS.NodeJS.LTS', '-e', '--force')
        }
    } else {
        Write-Note 'Installing Node.js LTS (Windows may ask for permission; click Yes)...'
        Invoke-Winget @('install', '--id', 'OpenJS.NodeJS.LTS', '-e')
    }
    $nodeVersion = Get-NodeVersion
    if (-not $nodeVersion) {
        Stop-Install ("Node.js was installed but isn't found yet. Close this window, open a new one " +
            'and run the installer again. If that doesn''t help, sign out of Windows and back in.')
    }
    if (-not (Test-NodeOk $nodeVersion)) {
        Stop-Install ("Node.js $nodeVersion is still the one in use. Uninstall the old Node.js " +
            '(Settings > Apps > Installed apps, or nvm if you use it) and run the installer again.')
    }
    Write-Ok "Node.js $nodeVersion installed"
}

# --- ffmpeg ------------------------------------------------------------------
Write-Step 'ffmpeg (for MP4 videos)'
if ($SkipFfmpeg) {
    Write-Note 'Skipped (-SkipFfmpeg). Videos are saved as WebM, or converted to MP4 by Chrome/Edge.'
} elseif (-not $needFfmpeg) {
    Write-Ok 'ffmpeg is already installed'
} elseif (-not $haveWinget) {
    Write-Warn ("ffmpeg isn't installed and winget isn't available. Route Flyover works without it " +
        '(videos are saved as WebM); to get MP4 install ffmpeg by hand (guide step 3, option B).')
} else {
    Write-Note 'Installing ffmpeg...'
    Invoke-Winget @('install', '--id', 'Gyan.FFmpeg', '-e')
    if (Test-Command 'ffmpeg') {
        Write-Ok 'ffmpeg installed'
    } else {
        Write-Warn ("ffmpeg didn't install. Route Flyover still works (videos are saved as WebM); " +
            'you can install ffmpeg later and run this script again.')
    }
}
if ((-not $SkipFfmpeg) -and (Test-Command 'ffmpeg')) {
    try { $encoders = (& ffmpeg -hide_banner -encoders 2>$null) -join "`n" } catch { $encoders = '' }
    if ($encoders -notmatch 'libx264') {
        Write-Warn 'This ffmpeg has no libx264 encoder, so MP4 conversion will fail. Install the Gyan build: winget install --id Gyan.FFmpeg -e'
    } elseif ($encoders -match 'h264_nvenc') {
        Write-Note 'NVIDIA encoder (h264_nvenc) found: MP4 conversion will use the GPU when possible.'
    }
}

# --- Route Flyover itself ----------------------------------------------------
Write-Step 'Getting Route Flyover'
if (Test-RouteFlyoverDir $PSScriptRoot) {
    $AppDir = $PSScriptRoot
    Write-Ok "Using this folder: $AppDir"
} elseif (Test-RouteFlyoverDir $InstallDir) {
    $AppDir = $InstallDir
    Write-Ok "Already downloaded: $AppDir"
} elseif (Test-Path $InstallDir) {
    Stop-Install ("$InstallDir already exists but isn't a Route Flyover folder. Move it out of the " +
        'way, or choose another folder: install-windows.bat -InstallDir C:\RouteFlyover')
} elseif (Test-Command 'git') {
    Write-Note "Downloading with Git to $InstallDir..."
    & git clone $RepoUrl $InstallDir
    if ($LASTEXITCODE -ne 0) { Stop-Install 'git clone failed. Check your internet connection and try again.' }
    $AppDir = $InstallDir
    Write-Ok "Downloaded to $AppDir"
} else {
    Write-Note "Git isn't installed, downloading the ZIP to $InstallDir..."
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ('RouteFlyover-' + [guid]::NewGuid())
    New-Item -ItemType Directory -Path $tmp | Out-Null
    try {
        $zip = Join-Path $tmp 'RouteFlyover.zip'
        Invoke-WebRequest -Uri $ZipUrl -OutFile $zip -UseBasicParsing
        Expand-Archive -Path $zip -DestinationPath $tmp
        $parent = Split-Path $InstallDir -Parent
        if ($parent -and -not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
        Move-Item -Path (Join-Path $tmp 'RouteFlyover-main') -Destination $InstallDir
    } catch {
        Stop-Install "Downloading the ZIP failed: $($_.Exception.Message)"
    } finally {
        Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
    }
    $AppDir = $InstallDir
    Write-Ok "Downloaded to $AppDir"
}
Set-Location $AppDir

if ((Test-Path (Join-Path $AppDir '.git')) -and (Test-Command 'git')) {
    Write-Note 'Checking for updates...'
    & git -C $AppDir pull --ff-only
    if ($LASTEXITCODE -ne 0) { Write-Warn 'Updating with git pull failed; continuing with the version you have.' }
}
if ($AppDir -match 'OneDrive') {
    Write-Note 'Tip: this folder is synced by OneDrive, which will upload thousands of small files in node_modules. A folder like C:\RouteFlyover avoids that.'
}

# --- npm install -------------------------------------------------------------
# npm.cmd instead of npm: npm.ps1 is blocked when PowerShell scripts are disabled.
Write-Step "Installing Route Flyover's components (npm install)"
$lockFile      = Join-Path $AppDir 'package-lock.json'
$installedLock = Join-Path $AppDir 'node_modules\.package-lock.json'
$upToDate = (Test-Path $installedLock) -and (Test-Path (Join-Path $AppDir 'node_modules\vite')) -and
            ((Get-Item -Force $installedLock).LastWriteTime -ge (Get-Item $lockFile).LastWriteTime)
if ($upToDate) {
    Write-Ok 'Components are already installed'
} else {
    Write-Note 'This takes a minute or two. Warnings (npm warn ...) are normal.'
    & npm.cmd install
    if ($LASTEXITCODE -ne 0) {
        Stop-Install ("npm install failed. Common causes: no internet connection, OneDrive or antivirus " +
            'holding files open (pause it and run the installer again), or a company proxy.')
    }
    Write-Ok 'Components installed'
}

# --- Double-click launcher ---------------------------------------------------
Write-Step 'Creating the double-click launcher'
$launcher = Join-Path $AppDir 'Start Route Flyover.bat'
if (Test-Path $launcher) {
    Write-Ok "Already there: $launcher"
} else {
    Set-Content -Path $launcher -Encoding ASCII -Value @(
        '@echo off'
        'cd /d "%~dp0"'
        'call npm run dev -- --open'
        'pause'
    )
    Write-Ok "Created $launcher"
}

# --- Done ----------------------------------------------------------------------
Write-Host ''
Write-Host 'Route Flyover is installed.' -ForegroundColor Green
Write-Note "Folder:   $AppDir"
Write-Note 'Start it: double-click "Start Route Flyover.bat" in that folder.'
Write-Note "Demo:     drag all files from $(Join-Path $AppDir 'samples') onto the app page."

if ($NoLaunch) { return }

Write-Step 'Starting Route Flyover'
Write-Note 'Your browser opens http://localhost:5173 in a few seconds.'
Write-Note 'Keep this window open while you use the app; press Ctrl+C to stop it.'
& npm.cmd run dev -- --open
