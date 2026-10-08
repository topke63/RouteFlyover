# Installing Route Flyover on Windows

A step-by-step guide for Windows 10 (version 1809 or newer) and Windows 11. No programming
experience is needed: you'll install three free programs, download Route Flyover, and start it
with one command. Plan on about 15 minutes, most of it waiting for downloads.

Route Flyover runs entirely on your own computer. Your GPX files, photos, music and videos are
never uploaded; the only network traffic is fetching public map tiles.

---

## Contents

1. [What you'll install](#1-what-youll-install)
2. [Open a terminal](#2-open-a-terminal)
3. [Install Node.js, ffmpeg and Git](#3-install-nodejs-ffmpeg-and-git)
4. [Check the installation](#4-check-the-installation)
5. [Download Route Flyover](#5-download-route-flyover)
6. [Install Route Flyover's components](#6-install-route-flyovers-components)
7. [Start Route Flyover](#7-start-route-flyover)
8. [Try the demo trip](#8-try-the-demo-trip)
9. [Start it with a double-click (optional)](#9-start-it-with-a-double-click-optional)
10. [Updating to a new version](#10-updating-to-a-new-version)
11. [Uninstalling](#11-uninstalling)
12. [Troubleshooting on Windows](#12-troubleshooting-on-windows)

---

## 1. What you'll install

| Program | Why Route Flyover needs it | Required? |
|---|---|---|
| **Node.js** (LTS version, 22.12 or newer) | runs the small local app server | yes |
| **ffmpeg** | converts rendered videos to MP4 for Instagram / WhatsApp | only for MP4 (WebM works without it) |
| **Git** | downloads Route Flyover and makes updating easy | no — you can download a ZIP instead |
| **Chrome, Edge or Firefox** | runs the app itself | you almost certainly have one already |

Hardware: any graphics card with working WebGL 2 (practically every PC from the last ten years).
An **NVIDIA** graphics card is optional and makes MP4 conversion about 2.4× faster — it's used
automatically when available.

---

## 2. Open a terminal

All commands in this guide are typed into **PowerShell** (or **Windows Terminal**, which opens
PowerShell by default).

1. Press the **Windows key**, type `powershell`, and press **Enter**.
2. A window with a prompt like `PS C:\Users\YourName>` appears. That's where you type commands.

To run a command, copy it from this guide, right-click in the PowerShell window to paste
(or press `Ctrl+V`), and press **Enter**.

> You do **not** need "Run as administrator" for anything in this guide, except where
> Windows itself asks for permission during an installation.

---

## 3. Install Node.js, ffmpeg and Git

### Option A — with winget (recommended, fastest)

`winget` is the Windows package manager and is built into Windows 10 (1809+) and 11. Paste these
three commands one at a time:

```powershell
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Gyan.FFmpeg -e
winget install --id Git.Git -e
```

- The first time, winget may ask you to accept the source agreements — type `Y` and press Enter.
- Windows may show a "Do you want to allow this app to make changes?" prompt — click **Yes**.

**Important: close the PowerShell window and open a new one** when all three are done.
Newly installed programs only become available in terminals opened *after* the installation.

If PowerShell says `winget` is not recognized, update **App Installer** from the Microsoft Store
(search for "App Installer"), or use option B.

### Option B — download installers by hand

**Node.js**
1. Go to <https://nodejs.org> and download the **LTS** version ("Windows Installer (.msi)",
   64-bit).
2. Run it and click **Next** through the wizard, keeping the defaults. Make sure
   **"Add to PATH"** stays selected.
3. On the "Tools for Native Modules" page you can leave the checkbox **unticked** — Route Flyover
   doesn't need it.

**ffmpeg**
1. Go to <https://www.gyan.dev/ffmpeg/builds/> and download **ffmpeg-release-full.7z** (or
   `ffmpeg-release-essentials.zip` if you can't open `.7z` files — both work).
2. Extract it, rename the extracted folder to `ffmpeg`, and move it to `C:\ffmpeg`. You should
   now have `C:\ffmpeg\bin\ffmpeg.exe`.
3. Add `C:\ffmpeg\bin` to your **PATH**, so programs can find ffmpeg:
   1. Press the **Windows key**, type `environment variables`, and choose
      **"Edit environment variables for your account"**.
   2. Select **Path** in the upper list and click **Edit…**.
   3. Click **New**, type `C:\ffmpeg\bin`, and click **OK** twice.

**Git** (optional — skip it if you'll use the ZIP download in step 5)
1. Download from <https://git-scm.com/download/win> and run the installer.
2. Keeping all the default choices is fine.

Then **close PowerShell and open a new window.**

---

## 4. Check the installation

In a **new** PowerShell window, run:

```powershell
node --version
npm --version
ffmpeg -version
git --version
```

You should see version numbers, for example `v22.20.0`, `10.9.3`, `ffmpeg version 8.0-full_build…`
and `git version 2.51.0`. Node.js must be **22.12 or newer** (or 20.19 or newer if you stay on
version 20; 22.0 to 22.11 don't work).

Check that ffmpeg has the encoders Route Flyover needs:

```powershell
ffmpeg -hide_banner -encoders | Select-String "libx264|aac|h264_nvenc"
```

You should see lines containing `libx264` and `aac`. With an NVIDIA card and a current driver,
`h264_nvenc` appears too.

If any command says *"is not recognized as the name of a cmdlet"*, see
[Troubleshooting](#a-command-is-not-recognized).

---

## 5. Download Route Flyover

Pick a place for it — this guide uses your **Documents** folder.

### With Git (recommended — makes updating a one-liner)

```powershell
cd $HOME\Documents
git clone https://github.com/topke63/RouteFlyover.git
cd RouteFlyover
```

### Without Git (ZIP download)

1. Open <https://github.com/topke63/RouteFlyover>, click the green **Code** button, then
   **Download ZIP**.
2. Right-click the downloaded `RouteFlyover-main.zip` → **Extract All…** and extract it into
   `Documents`.
3. Rename the extracted folder from `RouteFlyover-main` to `RouteFlyover` (optional, but the
   rest of this guide assumes that name).
4. In PowerShell:
   ```powershell
   cd $HOME\Documents\RouteFlyover
   ```

> **Tip:** avoid putting Route Flyover inside a OneDrive-synced folder if you can (on many PCs,
> `Documents` *is* synced to OneDrive). It works, but OneDrive will try to upload the thousands
> of small files in `node_modules`. A folder like `C:\RouteFlyover` avoids this:
> `cd C:\` before the `git clone`, then `cd C:\RouteFlyover`.

---

## 6. Install Route Flyover's components

Inside the `RouteFlyover` folder, run:

```powershell
npm install
```

This downloads the libraries Route Flyover is built on into a `node_modules` folder. It takes
a minute or two and only has to be done once (and again after updating). Warnings
(`npm warn …`) are normal; only lines with `npm error` mean something went wrong.

If you get *"running scripts is disabled on this system"*, see
[Troubleshooting](#running-scripts-is-disabled-on-this-system).

That's the whole installation — no API keys or accounts are needed.

---

## 7. Start Route Flyover

Every time you want to use Route Flyover:

1. Open PowerShell and go to the folder:
   ```powershell
   cd $HOME\Documents\RouteFlyover
   ```
2. Start the app:
   ```powershell
   npm run dev
   ```
3. After a few seconds it prints something like:
   ```
     VITE v8.x.x  ready in 600 ms

     ➜  Local:   http://localhost:5173/
   ```
4. Open **<http://localhost:5173>** in Chrome, Edge or Firefox (or `Ctrl+click` the link in
   the terminal).

**Keep the PowerShell window open while you use the app** — closing it stops Route Flyover.
To stop it on purpose, click into the window and press `Ctrl+C`.

To use a different port (if 5173 is taken): `npm run dev -- --port 5199`.

> **Which browser?** On Windows, Chrome and Edge are the best choice: if MP4 conversion
> through ffmpeg ever fails, they can still convert to MP4 by themselves. Firefox works fine
> too, but relies on ffmpeg for MP4.

---

## 8. Try the demo trip

1. With the app open in your browser, open the `samples` folder inside `RouteFlyover` in
   File Explorer.
2. Select all files in it (`Ctrl+A`) and drag them onto the Route Flyover page.
3. You'll see a ride over the Stelvio Pass with three photos. Click **Render video**, wait for
   the progress bar, preview the result, and click **Save video**.

The progress bar shows **(GPU)** or **(CPU)** during MP4 conversion, so you can see whether your
NVIDIA card is being used.

See the main [README](../README.md#how-to-use-it) for everything else the app can do.

---

## 9. Start it with a double-click (optional)

Instead of typing commands every time, create a small launcher:

1. Open **Notepad** and paste:
   ```bat
   @echo off
   cd /d "%~dp0"
   start "" http://localhost:5173
   npm run dev
   ```
2. **File → Save As…**, go to your `RouteFlyover` folder, set **Save as type** to
   **All files (\*.\*)**, and name it `Start Route Flyover.bat`. (If "Save as type" stays on
   *Text Documents*, Windows silently adds `.txt` and the file won't run.)
3. Double-click `Start Route Flyover.bat` to start Route Flyover. A black window opens (keep it
   open while using the app — closing it stops the app) and your browser opens the app. If the
   browser shows "can't reach this page", wait two seconds and press `F5`.

To put it on your desktop: right-click the `.bat` file → **Show more options** (Windows 11) →
**Send to → Desktop (create shortcut)**.

---

## 10. Updating to a new version

Stop Route Flyover first (`Ctrl+C` in its window), then:

**If you used Git:**
```powershell
cd $HOME\Documents\RouteFlyover
git pull
npm install
```

**If you used the ZIP:** download the new ZIP, extract it, and replace the old folder with it
(move your `Start Route Flyover.bat` across if you made one). Then run `npm install` in the new
folder.

Your settings are stored in the browser, so they survive updates.

---

## 11. Uninstalling

1. Delete the `RouteFlyover` folder.
2. If you don't need them for anything else, remove Node.js, ffmpeg and Git:
   - installed with winget:
     ```powershell
     winget uninstall --id OpenJS.NodeJS.LTS -e
     winget uninstall --id Gyan.FFmpeg -e
     winget uninstall --id Git.Git -e
     ```
   - installed by hand: **Settings → Apps → Installed apps** for Node.js and Git; for ffmpeg,
     delete `C:\ffmpeg` and remove `C:\ffmpeg\bin` from your Path (see step 3, option B).

---

## 12. Troubleshooting on Windows

### A command is "not recognized"

`'node' / 'npm' / 'ffmpeg' / 'git' is not recognized as the name of a cmdlet…`

- **Close PowerShell and open a new window.** This fixes it in most cases: a terminal that was
  open during an installation doesn't see the new program.
- Still failing? Sign out of Windows and back in (or restart).
- ffmpeg installed by hand: check that `C:\ffmpeg\bin\ffmpeg.exe` exists and that **exactly**
  `C:\ffmpeg\bin` (not `C:\ffmpeg`, and not `C:\ffmpeg\bin\ffmpeg.exe`) is in your Path.

### "Running scripts is disabled on this system"

PowerShell blocks `npm` with:
`npm.ps1 cannot be loaded because running scripts is disabled on this system.`

Allow locally installed scripts for your user account (one time, no administrator needed):

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Answer `Y`. Alternatively, type `npm.cmd` instead of `npm` (e.g. `npm.cmd install`,
`npm.cmd run dev`), or use **Command Prompt** (`cmd`) instead of PowerShell. The double-click
launcher from step 9 isn't affected by this setting.

### `npm install` fails

- `EPERM` / `EBUSY` / "operation not permitted": another program has the files open. Stop
  Route Flyover if it's running, pause OneDrive syncing (or move the folder out of OneDrive, see
  step 5), and try again. Antivirus software scanning `node_modules` can cause this too — simply
  run `npm install` again.
- `ENOTFOUND` / `ETIMEDOUT`: no internet connection, or a company proxy/firewall is blocking
  `registry.npmjs.org`.
- `EBADENGINE` / "Unsupported engine": your Node.js is too old. Install the current LTS
  (step 3) and open a new PowerShell window.
- If it still fails, delete the `node_modules` folder and `npm install` again.

### "Port 5173 is in use"

Another program (perhaps a second Route Flyover window) is using the port. Close the other
window, or start on another port: `npm run dev -- --port 5199` and open
<http://localhost:5199>.

### The browser says "This site can't be reached"

- Route Flyover's PowerShell window must stay open. Check it's still running and shows the
  `Local: http://localhost:5173/` line.
- Use `http://` — not `https://`.

### The map stays blank or grey

- Check your internet connection; map imagery is streamed while you use the app.
- Check that WebGL 2 works: in Chrome/Edge open `chrome://gpu` (or `edge://gpu`) — *WebGL2*
  should say "Hardware accelerated". In Firefox open `about:support` → *Graphics*.
- Update your graphics driver (from NVIDIA, AMD or Intel's website, or via Windows Update).
- In Chrome/Edge: **Settings → System → "Use graphics acceleration when available"** must be on.
- Laptops with two GPUs: **Settings → System → Display → Graphics**, add your browser and set it
  to **High performance**.

### "Couldn't convert to MP4" — the video was saved as WebM

- Make sure ffmpeg works in a **new** PowerShell window: `ffmpeg -version`.
- Route Flyover only sees programs that were installed **before** you started it. If you
  installed ffmpeg while it was running, stop it (`Ctrl+C`), open a new PowerShell window, and
  start it again.
- Make sure you started it with `npm run dev` (or `npm run preview`) — not by opening
  `index.html` directly.
- You can convert a saved WebM by hand:
  ```powershell
  ffmpeg -i video.webm -c:v libx264 -crf 21 -pix_fmt yuv420p -r 30 -c:a aac -movflags +faststart video.mp4
  ```

### MP4 conversion says (CPU) although I have an NVIDIA card

- Update the NVIDIA driver (GeForce Experience / NVIDIA App, or <https://www.nvidia.com/drivers>).
- Check that your ffmpeg has the GPU encoder:
  `ffmpeg -hide_banner -encoders | Select-String h264_nvenc`. The Gyan builds from step 3 do.
- Check that the card is visible: `nvidia-smi` should print a table with your GPU.
- If a game or another GPU-heavy program is using all the graphics memory, Route Flyover falls
  back to the CPU and tries the GPU again after 5 minutes.

### Windows Firewall asks about Node.js

Route Flyover only listens on your own computer (`localhost`) and doesn't need access from the
network. If Windows asks anyway, you can click **Cancel** — the app still works.

### Rendering is very slow

That's the app waiting for map imagery. A slow connection or a very long, fast flight makes it
slower; try the *high* camera or a longer flight length. Close other browser tabs and GPU-heavy
programs while rendering.

For other problems see the [Troubleshooting](../README.md#troubleshooting) section of the main
README.
