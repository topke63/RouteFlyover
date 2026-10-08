# Installing Route Flyover on macOS

A step-by-step guide for macOS 13 (Ventura) or newer, on **Apple Silicon** (M1, M2, M3, M4 …)
and **Intel** Macs. No programming experience is needed: you'll install three free programs,
download Route Flyover, and start it with one command. Plan on about 15 minutes, most of it
waiting for downloads.

Route Flyover runs entirely on your own computer. Your GPX files, photos, music and videos are
never uploaded; the only network traffic is fetching public map tiles.

---

## Contents

1. [What you'll install](#1-what-youll-install)
2. [Open Terminal](#2-open-terminal)
3. [Install Homebrew](#3-install-homebrew)
4. [Install Node.js, ffmpeg and Git](#4-install-nodejs-ffmpeg-and-git)
5. [Check the installation](#5-check-the-installation)
6. [Download Route Flyover](#6-download-route-flyover)
7. [Install Route Flyover's components](#7-install-route-flyovers-components)
8. [Start Route Flyover](#8-start-route-flyover)
9. [Try the demo trip](#9-try-the-demo-trip)
10. [Start it with a double-click (optional)](#10-start-it-with-a-double-click-optional)
11. [Updating to a new version](#11-updating-to-a-new-version)
12. [Uninstalling](#12-uninstalling)
13. [Troubleshooting on macOS](#13-troubleshooting-on-macos)

---

## 1. What you'll install

| Program | Why Route Flyover needs it | Required? |
|---|---|---|
| **Homebrew** | the standard tool for installing the programs below on a Mac | recommended |
| **Node.js** (22.12 or newer, or 20.19 or newer) | runs the small local app server | yes |
| **ffmpeg** with `libx264` and `aac` | converts rendered videos to MP4 for Instagram / WhatsApp | only for MP4 (WebM works without it) |
| **Git** | downloads Route Flyover and makes updating easy | no — you can download a ZIP instead |
| **Chrome or Firefox** | runs the app itself | Chrome recommended (see step 8) |

Hardware: any Mac that runs macOS 13 or newer has a graphics chip with working WebGL 2, both
Apple Silicon and Intel. MP4 conversion always runs on the processor on a Mac (the faster GPU
encoder Route Flyover can use needs an NVIDIA card, which Macs don't have); Apple Silicon Macs
are fast at it anyway.

---

## 2. Open Terminal

All commands in this guide are typed into the **Terminal** app.

1. Press **`⌘ Command` + `Space`** to open Spotlight, type `terminal`, and press **Return**.
   (Or open **Finder → Applications → Utilities → Terminal**.)
2. A window with a prompt like `you@MacBook ~ %` appears. That's where you type commands.

To run a command, copy it from this guide, paste it into Terminal with **`⌘ Command` + `V`**,
and press **Return**.

> Some steps ask for **your Mac login password**. Nothing is shown while you type it — that's
> normal; type it and press Return. Never put `sudo` in front of the `npm` or `brew` commands in
> this guide.

---

## 3. Install Homebrew

[Homebrew](https://brew.sh) installs Node.js, ffmpeg and Git with one command each and keeps
them up to date. If you already have it (`brew --version` prints a version number), skip to
step 4.

1. Paste this into Terminal and press Return:
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
2. Enter your Mac password when asked, and press **Return** again when it says
   *"Press RETURN to continue"*.
3. If a window pops up asking to install the **Command Line Developer Tools**, click
   **Install** and wait for it to finish. (Homebrew needs them; they also include Git.)
4. When the installer finishes, it shows **"Next steps"**. On an **Apple Silicon** Mac you must
   run the commands listed there, otherwise Terminal won't find `brew`. They are:
   ```bash
   echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
   eval "$(/opt/homebrew/bin/brew shellenv)"
   ```
   On an **Intel** Mac this step isn't needed.

   Not sure which Mac you have? Click the **Apple menu (top-left corner) → About This Mac**: *Chip: Apple M…*
   means Apple Silicon, *Processor: … Intel …* means Intel.

**Close Terminal (`⌘ Command` + `Q`) and open it again** before continuing.

---

## 4. Install Node.js, ffmpeg and Git

```bash
brew install node ffmpeg git
```

This takes a few minutes. Homebrew's ffmpeg already includes `libx264` and `aac`, and its
Node.js is a current version, so nothing else is needed.

<details>
<summary>Alternative: Node.js without Homebrew</summary>

You can also install Node.js with the official installer: open <https://nodejs.org>, download
the **LTS** version for macOS (the `.pkg` file), and double-click it. It works on both Apple
Silicon and Intel Macs. ffmpeg has no official Mac installer, so Homebrew is still the easiest
way to get it; without ffmpeg, Route Flyover saves videos as WebM, or Chrome converts them to
MP4 by itself (see step 8).
</details>

---

## 5. Check the installation

In a **new** Terminal window, run:

```bash
node --version
npm --version
ffmpeg -version
git --version
```

You should see version numbers, for example `v24.9.0`, `11.6.0`, `ffmpeg version 8.0…` and
`git version 2.51.0`. Node.js must be **22.12 or newer** (or 20.19 or newer if you stay on
version 20; 22.0 to 22.11 don't work).

Check that ffmpeg has the encoders Route Flyover needs:

```bash
ffmpeg -hide_banner -encoders | grep -E "libx264|aac"
```

You should see lines containing `libx264` and `aac`.

If any command says *"command not found"*, see
[Troubleshooting](#command-not-found).

---

## 6. Download Route Flyover

Pick a place for it — this guide uses your **home folder**, so Route Flyover ends up in
`~/RouteFlyover` (in Finder: **Go → Home**, or `⌘ Command` + `Shift` + `H`).

### With Git (recommended — makes updating a one-liner)

```bash
cd ~
git clone https://github.com/topke63/RouteFlyover.git
cd RouteFlyover
```

### Without Git (ZIP download)

1. Open <https://github.com/topke63/RouteFlyover>, click the green **Code** button, then
   **Download ZIP**.
2. Open your **Downloads** folder in Finder. Safari unpacks the ZIP automatically; with another
   browser, double-click `RouteFlyover-main.zip` to unpack it.
3. Rename the folder from `RouteFlyover-main` to `RouteFlyover` (optional, but the rest of this
   guide assumes that name) and move it into your home folder.
4. In Terminal:
   ```bash
   cd ~/RouteFlyover
   ```

---

## 7. Install Route Flyover's components

Inside the `RouteFlyover` folder, run:

```bash
npm install
```

This downloads the libraries Route Flyover is built on into a `node_modules` folder. It takes
a minute or two and only has to be done once (and again after updating). Warnings
(`npm warn …`) are normal; only lines with `npm error` mean something went wrong.

**Don't** put `sudo` in front of it — if it fails with a permission error, see
[Troubleshooting](#npm-install-fails).

That's the whole installation — no API keys or accounts are needed.

---

## 8. Start Route Flyover

Every time you want to use Route Flyover:

1. Open Terminal and go to the folder:
   ```bash
   cd ~/RouteFlyover
   ```
2. Start the app:
   ```bash
   npm run dev
   ```
3. After a few seconds it prints something like:
   ```
     VITE v8.x.x  ready in 600 ms

     ➜  Local:   http://localhost:5173/
   ```
4. Open **<http://localhost:5173>** in Chrome or Firefox (or `⌘ Command`+click the link in
   Terminal).

**Keep the Terminal window open while you use the app** — closing it stops Route Flyover.
To stop it on purpose, click into the window and press **`Control` + `C`** (Control, not
Command).

To use a different port (if 5173 is taken): `npm run dev -- --port 5199`.

> **Which browser?** Chrome is recommended on a Mac: if MP4 conversion through ffmpeg ever
> fails, Chrome can still convert to MP4 by itself. Firefox works too. Safari isn't one of the
> browsers Route Flyover is tested with.

---

## 9. Try the demo trip

1. With the app open in your browser, open the `samples` folder inside `RouteFlyover` in Finder.
2. Select all files in it (`⌘ Command` + `A`) and drag them onto the Route Flyover page.
3. You'll see a ride over the Stelvio Pass with three photos. Click **Render video**, wait for
   the progress bar, preview the result, and click **Save video**.

The progress bar shows **(CPU)** during MP4 conversion — that's expected on a Mac.

See the main [README](../README.md#how-to-use-it) for everything else the app can do.

---

## 10. Start it with a double-click (optional)

Instead of typing commands every time, create a launcher you can double-click in Finder or put
in the Dock.

1. Create it by pasting this whole block into Terminal at once and pressing Return:
   ```bash
   cat > ~/RouteFlyover/"Start Route Flyover.command" <<'EOF'
   #!/bin/zsh
   # Makes Homebrew's programs available when started from Finder
   [ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
   [ -x /usr/local/bin/brew ] && eval "$(/usr/local/bin/brew shellenv)"
   cd "$(dirname "$0")"
   (sleep 3 && open http://localhost:5173) &
   npm run dev
   EOF
   chmod +x ~/RouteFlyover/"Start Route Flyover.command"
   ```
2. In Finder, open the `RouteFlyover` folder and double-click **Start Route Flyover.command**.
   A Terminal window opens (keep it open while using the app — closing it stops the app) and
   your default browser opens the app. If the browser shows "can't connect", wait two seconds
   and reload the page (`⌘ Command` + `R`).
3. To keep it handy, drag the file into the right-hand side of the **Dock** (next to the Trash),
   or right-click it → **Make Alias** and move the alias to your Desktop.

The launcher opens your **default** browser. If that's Safari, either open the address in Chrome
yourself, or replace `open http://localhost:5173` with
`open -a "Google Chrome" http://localhost:5173` in the file.

---

## 11. Updating to a new version

Stop Route Flyover first (`Control` + `C` in its window), then:

**If you used Git:**
```bash
cd ~/RouteFlyover
git pull
npm install
```

**If you used the ZIP:** download the new ZIP, unpack it, and replace the old folder with it
(move your `Start Route Flyover.command` across if you made one). Then run `npm install` in the
new folder.

To update Node.js and ffmpeg as well, run `brew upgrade` from time to time.

Your settings are stored in the browser, so they survive updates.

---

## 12. Uninstalling

1. Delete the `RouteFlyover` folder (drag it to the Trash, or run `rm -rf ~/RouteFlyover`).
2. If you don't need them for anything else, remove Node.js and ffmpeg:
   ```bash
   brew uninstall node ffmpeg git
   brew autoremove
   ```
   (If you installed Node.js with the `.pkg` installer instead, see
   [nodejs.org](https://nodejs.org) for how to remove it.)
3. To remove Homebrew itself, see the
   [Homebrew uninstall instructions](https://github.com/homebrew/install#uninstall-homebrew).

---

## 13. Troubleshooting on macOS

### "command not found"

`zsh: command not found: brew` / `node` / `npm` / `ffmpeg`

- **Quit Terminal (`⌘ Command` + `Q`) and open it again.** A window that was open during an
  installation doesn't see the new program.
- `brew` not found on an **Apple Silicon** Mac: the "Next steps" from step 3 weren't run. Run
  them now:
  ```bash
  echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
  eval "$(/opt/homebrew/bin/brew shellenv)"
  ```
- `node`, `npm` or `ffmpeg` not found: run `brew install node ffmpeg git` again and read its
  output for errors.

### A window asks to install "command line developer tools"

That's macOS offering the tools Homebrew and Git need. Click **Install**, wait until it's done,
then run the command that triggered it again. If it reports an error, run
`xcode-select --install` yourself.

### `npm install` fails

- `EACCES` / "permission denied": usually the result of an earlier `npm` run with `sudo`. Give
  the files back to your user and try again without `sudo`:
  ```bash
  sudo chown -R "$USER": ~/RouteFlyover ~/.npm
  ```
- `ENOTFOUND` / `ETIMEDOUT`: no internet connection, or a company proxy/firewall is blocking
  `registry.npmjs.org`.
- `EBADENGINE` / "Unsupported engine": your Node.js is too old. Run `brew upgrade node` (or
  install the current LTS from nodejs.org) and open a new Terminal window.
- If it still fails, delete the `node_modules` folder (`rm -rf node_modules`) and run
  `npm install` again.

### "Port 5173 is in use"

Another program (perhaps a second Route Flyover window) is using the port. Close the other
window, or start on another port: `npm run dev -- --port 5199` and open
<http://localhost:5199>.

### The browser says "can't connect" / "This site can't be reached"

- Route Flyover's Terminal window must stay open. Check it's still running and shows the
  `Local: http://localhost:5173/` line.
- Use `http://` — not `https://`.
- If macOS asks whether **node** may accept incoming network connections, you can click
  **Deny**: Route Flyover only talks to your own browser on the same Mac.

### The map stays blank or grey

- Check your internet connection; map imagery is streamed while you use the app.
- Check that WebGL 2 works: in Chrome open `chrome://gpu` — *WebGL2* should say
  "Hardware accelerated". In Firefox open `about:support` → *Graphics* → *WebGL 2 Driver
  Renderer*; it should name your Mac's graphics chip.
- In Chrome: **Settings → System → "Use graphics acceleration when available"** must be on.
- Update macOS and your browser (**System Settings → General → Software Update**).

### "Couldn't convert to MP4" — the video was saved as WebM

- Make sure ffmpeg works in a **new** Terminal window: `ffmpeg -version`.
- Make sure your ffmpeg has `libx264` (step 5). Homebrew's ffmpeg does; if you got ffmpeg
  somewhere else, replace it with `brew install ffmpeg`.
- Route Flyover only sees programs that were installed **before** you started it. If you
  installed ffmpeg while it was running, stop it (`Control` + `C`) and start it again.
- If you start Route Flyover with the double-click launcher and conversion fails only there,
  check that the two `brew shellenv` lines are in `Start Route Flyover.command` (step 10).
- Make sure you started it with `npm run dev` (or `npm run preview`) — not by opening
  `index.html` directly.
- You can convert a saved WebM by hand:
  ```bash
  ffmpeg -i video.webm -c:v libx264 -crf 21 -pix_fmt yuv420p -r 30 -c:a aac -movflags +faststart video.mp4
  ```

### Double-clicking `Start Route Flyover.command` does nothing or shows an error

- *"…could not be executed because you do not have appropriate access privileges"*: the file
  isn't marked as runnable. Run `chmod +x ~/RouteFlyover/"Start Route Flyover.command"`.
- *"…cannot be opened because it is from an unidentified developer"*: right-click the file →
  **Open**, then click **Open** in the dialog. macOS remembers the choice.

### Rendering is very slow

That's the app waiting for map imagery. A slow connection or a very long, fast flight makes it
slower; try the *high* camera or a longer flight length. Close other browser tabs while
rendering, and keep a MacBook plugged in: in **Low Power Mode** macOS slows down the graphics
chip.

For other problems see the [Troubleshooting](../README.md#troubleshooting) section of the main
README.
