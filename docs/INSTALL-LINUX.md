# Installing Route Flyover on Linux

A step-by-step guide for desktop Linux, with commands for **Debian / Ubuntu / Linux Mint / Pop!_OS**,
**Fedora** and **Arch / Manjaro / CachyOS**. No programming experience is needed: you'll install
three free programs, download Route Flyover, and start it with one command. Plan on about
15 minutes, most of it waiting for downloads.

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
9. [Start it from the app menu (optional)](#9-start-it-from-the-app-menu-optional)
10. [Updating to a new version](#10-updating-to-a-new-version)
11. [Uninstalling](#11-uninstalling)
12. [Troubleshooting on Linux](#12-troubleshooting-on-linux)

---

## 1. What you'll install

| Program | Why Route Flyover needs it | Required? |
|---|---|---|
| **Node.js** (22.12 or newer, or 20.19 or newer) | runs the small local app server | yes |
| **ffmpeg** with `libx264` and `aac` | converts rendered videos to MP4 for Instagram / WhatsApp | only for MP4 (WebM works without it) |
| **Git** | downloads Route Flyover and makes updating easy | no — you can download a ZIP instead |
| **Chrome, Chromium or Firefox** | runs the app itself | you almost certainly have one already |

Hardware: any graphics card with working WebGL 2 (practically every PC from the last ten years)
and a working graphics driver. An **NVIDIA** graphics card with the proprietary NVIDIA driver is
optional and makes MP4 conversion about 2.4× faster — it's used automatically when available.

---

## 2. Open a terminal

All commands in this guide are typed into a **terminal**.

- **Ubuntu, Fedora (GNOME) and most others:** press `Ctrl+Alt+T`, or open the app menu and
  search for `terminal`.
- **KDE Plasma (Kubuntu, Fedora KDE, many Arch setups):** open the app menu and search for
  `Konsole`.

A window with a prompt like `you@computer:~$` appears. That's where you type commands.

To run a command, copy it from this guide, paste it into the terminal with
**`Ctrl+Shift+V`** (plain `Ctrl+V` doesn't work in most terminals), and press **Enter**.

> Commands starting with `sudo` install software for the whole system and ask for **your own
> password**. Nothing is shown while you type it — that's normal; type it and press Enter.
> Everything else in this guide runs **without** `sudo`. In particular, never run `npm` with
> `sudo`.

---

## 3. Install Node.js, ffmpeg and Git

Pick the section for your distribution. If you're not sure which one you have, run
`cat /etc/os-release` and look at the `NAME=` line. Linux Mint, Pop!_OS, elementary OS and
Zorin OS are based on Ubuntu, so use the Debian / Ubuntu section.

### Debian / Ubuntu / Linux Mint / Pop!_OS

**ffmpeg, Git and curl** come from the normal package sources:

```bash
sudo apt update
sudo apt install ffmpeg git curl
```

**Node.js:** the version in Ubuntu's and Debian's package sources is often too old for Route
Flyover (Ubuntu 24.04 and Debian 12 ship Node.js 18). Install a current one with **nvm**, a small
tool that installs Node.js into your home folder, without `sudo`:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

**Close the terminal and open a new one**, then:

```bash
nvm install --lts
```

<details>
<summary>Alternative: a system-wide Node.js from NodeSource</summary>

If you prefer Node.js installed through `apt` (for example because several users share the
computer), use the NodeSource packages instead of nvm:

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install nodejs
```

This replaces the distribution's `nodejs` package; `npm` is included.
</details>

### Fedora

Fedora's own ffmpeg (`ffmpeg-free`) **can't create MP4 videos the way Route Flyover needs**
(it has no `libx264`). The full ffmpeg comes from **RPM Fusion**. Enable it and swap ffmpeg:

```bash
sudo dnf install https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm
sudo dnf swap ffmpeg-free ffmpeg --allowerasing
```

(If the second command says `ffmpeg-free` isn't installed, run `sudo dnf install ffmpeg`
instead.)

Then install Node.js and Git, which Fedora ships in a current version:

```bash
sudo dnf install nodejs npm git
```

### Arch / Manjaro / CachyOS / EndeavourOS

Arch ships current versions of everything, including an ffmpeg with `libx264` and NVIDIA
support:

```bash
sudo pacman -S --needed nodejs npm ffmpeg git
```

### Other distributions

Install **Git** and **ffmpeg** from your package manager, then check in step 4 that your ffmpeg
lists `libx264` (on openSUSE, for example, the full ffmpeg comes from the Packman repository).
If your distribution's Node.js is older than 20.19, install Node.js with **nvm** as shown in the
Debian / Ubuntu section above.

---

## 4. Check the installation

In a **new** terminal window, run:

```bash
node --version
npm --version
ffmpeg -version
git --version
```

You should see version numbers, for example `v22.20.0`, `10.9.3`, `ffmpeg version 7.1…` and
`git version 2.51.0`. Node.js must be **22.12 or newer** (or 20.19 or newer if you stay on
version 20; 22.0 to 22.11 don't work).

Check that ffmpeg has the encoders Route Flyover needs:

```bash
ffmpeg -hide_banner -encoders | grep -E "libx264|aac|h264_nvenc"
```

You should see lines containing `libx264` and `aac`. With an NVIDIA card, the proprietary
NVIDIA driver and an ffmpeg built with NVIDIA support, `h264_nvenc` appears too.

If any command says *"command not found"*, see
[Troubleshooting](#command-not-found).

---

## 5. Download Route Flyover

Pick a place for it — this guide uses your **home folder**, so Route Flyover ends up in
`~/RouteFlyover`.

### With Git (recommended — makes updating a one-liner)

```bash
cd ~
git clone https://github.com/topke63/RouteFlyover.git
cd RouteFlyover
```

### Without Git (ZIP download)

1. Open <https://github.com/topke63/RouteFlyover>, click the green **Code** button, then
   **Download ZIP**.
2. Open your **Downloads** folder in the file manager, right-click `RouteFlyover-main.zip` →
   **Extract Here** (or **Extract**), and move the extracted folder into your home folder.
3. Rename the folder from `RouteFlyover-main` to `RouteFlyover` (optional, but the rest of this
   guide assumes that name).
4. In the terminal:
   ```bash
   cd ~/RouteFlyover
   ```

---

## 6. Install Route Flyover's components

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

## 7. Start Route Flyover

Every time you want to use Route Flyover:

1. Open a terminal and go to the folder:
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
4. Open **<http://localhost:5173>** in Chrome, Chromium or Firefox (or `Ctrl+click` the link in
   the terminal).

**Keep the terminal window open while you use the app** — closing it stops Route Flyover.
To stop it on purpose, click into the window and press `Ctrl+C`.

To use a different port (if 5173 is taken): `npm run dev -- --port 5199`.

> **Which browser?** Both work. Chrome or Chromium has one advantage on Linux: if MP4
> conversion through ffmpeg ever fails, Chrome can still convert to MP4 by itself. Firefox on
> Linux can't encode MP4, so it relies on ffmpeg.

---

## 8. Try the demo trip

1. With the app open in your browser, open the `samples` folder inside `RouteFlyover` in your
   file manager.
2. Select all files in it (`Ctrl+A`) and drag them onto the Route Flyover page.
3. You'll see a ride over the Stelvio Pass with three photos. Click **Render video**, wait for
   the progress bar, preview the result, and click **Save video**.

The progress bar shows **(GPU)** or **(CPU)** during MP4 conversion, so you can see whether your
NVIDIA card is being used.

See the main [README](../README.md#how-to-use-it) for everything else the app can do.

---

## 9. Start it from the app menu (optional)

Instead of typing commands every time, create a launcher that shows up in your app menu like any
other program.

1. Create a start script. Paste this whole block into a terminal at once and press Enter:
   ```bash
   cat > ~/RouteFlyover/start-route-flyover.sh <<'EOF'
   #!/usr/bin/env bash
   # Makes Node.js installed with nvm available outside an interactive terminal
   export NVM_DIR="$HOME/.nvm"
   [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
   cd "$(dirname "$0")"
   (sleep 3 && xdg-open http://localhost:5173) &
   npm run dev
   EOF
   chmod +x ~/RouteFlyover/start-route-flyover.sh
   ```
2. Add it to the app menu:
   ```bash
   mkdir -p ~/.local/share/applications
   cat > ~/.local/share/applications/route-flyover.desktop <<EOF
   [Desktop Entry]
   Type=Application
   Name=Route Flyover
   Comment=Turn a GPX track, photos and music into a 3D fly-over video
   Exec=$HOME/RouteFlyover/start-route-flyover.sh
   Icon=$HOME/RouteFlyover/public/logo.svg
   Terminal=true
   Categories=Graphics;Video;
   EOF
   ```
3. Open your app menu and search for **Route Flyover** (it can take a few seconds to appear, or
   until you log out and back in). Starting it opens a terminal window (keep it open while using
   the app — closing it stops the app) and your browser opens the app. If the browser shows
   "Unable to connect", wait two seconds and press `F5`.

You can also run `~/RouteFlyover/start-route-flyover.sh` directly from a terminal. If you put
`RouteFlyover` somewhere other than your home folder, adjust the paths in step 2.

---

## 10. Updating to a new version

Stop Route Flyover first (`Ctrl+C` in its window), then:

**If you used Git:**
```bash
cd ~/RouteFlyover
git pull
npm install
```

**If you used the ZIP:** download the new ZIP, extract it, and replace the old folder with it
(move your `start-route-flyover.sh` across if you made one). Then run `npm install` in the new
folder.

Your settings are stored in the browser, so they survive updates.

---

## 11. Uninstalling

1. Delete the `RouteFlyover` folder and the menu entry, if you made one:
   ```bash
   rm -rf ~/RouteFlyover
   rm -f ~/.local/share/applications/route-flyover.desktop
   ```
2. If you don't need them for anything else, remove Node.js, ffmpeg and Git:
   - **Node.js installed with nvm:** `rm -rf ~/.nvm`, then delete the lines mentioning `NVM_DIR`
     at the end of `~/.bashrc` (or `~/.zshrc`).
   - **Debian / Ubuntu:** `sudo apt remove ffmpeg git` (add `nodejs` if you used NodeSource).
   - **Fedora:** `sudo dnf remove nodejs npm ffmpeg git`
   - **Arch:** `sudo pacman -Rs nodejs npm ffmpeg git`

   Other programs may depend on ffmpeg and Git; your package manager lists what it would remove
   before asking you to confirm.

---

## 12. Troubleshooting on Linux

### "command not found"

`node: command not found` / `npm: command not found` / `ffmpeg: command not found`

- **Close the terminal and open a new one.** A terminal that was open during an installation
  (especially of nvm) doesn't see the new program.
- Node.js installed with nvm: run `nvm install --lts` again in a new terminal. If `nvm` itself
  is "not found", run `source ~/.bashrc` (or `source ~/.zshrc` if you use zsh) and try again.
- Check that the package really got installed: run the install command from step 3 again and
  read its output for errors.

### `npm install` fails

- `EACCES` / "permission denied": usually the result of an earlier `npm` run with `sudo`. Give
  the files back to your user and try again without `sudo`:
  ```bash
  sudo chown -R "$USER": ~/RouteFlyover ~/.npm
  ```
- `ENOTFOUND` / `ETIMEDOUT`: no internet connection, or a company proxy/firewall is blocking
  `registry.npmjs.org`.
- `EBADENGINE` / "Unsupported engine": your Node.js is too old. Install a current one (step 3,
  nvm) and open a new terminal.
- If it still fails, delete the `node_modules` folder (`rm -rf node_modules`) and run
  `npm install` again.

### "System limit for number of file watchers reached" (`ENOSPC`)

`npm run dev` watches the project files, and some systems allow very few watchers. Raise the
limit:

```bash
echo fs.inotify.max_user_watches=524288 | sudo tee /etc/sysctl.d/40-max-user-watches.conf
sudo sysctl --system
```

Then start Route Flyover again.

### "Port 5173 is in use"

Another program (perhaps a second Route Flyover window) is using the port. Close the other
window, or start on another port: `npm run dev -- --port 5199` and open
<http://localhost:5199>.

### The browser says "Unable to connect" / "This site can't be reached"

- Route Flyover's terminal window must stay open. Check it's still running and shows the
  `Local: http://localhost:5173/` line.
- Use `http://` — not `https://`.

### The map stays blank or grey

- Check your internet connection; map imagery is streamed while you use the app.
- Check that WebGL 2 works: in Chrome/Chromium open `chrome://gpu` — *WebGL2* should say
  "Hardware accelerated". In Firefox open `about:support` → *Graphics* → *WebGL 2 Driver
  Renderer*; it should name your graphics card, not `llvmpipe`.
- If you see `llvmpipe` or "software only", your graphics driver isn't working properly. With an
  NVIDIA card, install the proprietary driver (Ubuntu: **Software & Updates → Additional
  Drivers**; Fedora: `akmod-nvidia` from RPM Fusion; Arch: the `nvidia` or `nvidia-open`
  package) and restart.
- In Chrome/Chromium: **Settings → System → "Use graphics acceleration when available"** must
  be on.
- Laptops with two GPUs usually work fine on the integrated one. If the map stutters, you can
  start the browser on the dedicated GPU — in GNOME and KDE, right-click the browser in the app
  menu → **Launch using Dedicated Graphics Card**.

### "Couldn't convert to MP4" — the video was saved as WebM

- Make sure ffmpeg works in a **new** terminal: `ffmpeg -version`.
- Make sure your ffmpeg has `libx264` (step 4). On **Fedora**, the error often says
  `Unknown encoder 'libx264'` — you still have `ffmpeg-free`; swap it for the RPM Fusion ffmpeg
  as shown in step 3.
- Route Flyover only sees programs that were installed **before** you started it. If you
  installed ffmpeg while it was running, stop it (`Ctrl+C`) and start it again.
- Make sure you started it with `npm run dev` (or `npm run preview`) — not by opening
  `index.html` directly.
- You can convert a saved WebM by hand:
  ```bash
  ffmpeg -i video.webm -c:v libx264 -crf 21 -pix_fmt yuv420p -r 30 -c:a aac -movflags +faststart video.mp4
  ```

### MP4 conversion says (CPU) although I have an NVIDIA card

- The NVIDIA GPU encoder needs the **proprietary NVIDIA driver**; the open-source `nouveau`
  driver can't do it. Check that the card is visible: `nvidia-smi` should print a table with
  your GPU. If the command isn't found, install the driver (see
  [The map stays blank or grey](#the-map-stays-blank-or-grey)).
- Check that your ffmpeg has the GPU encoder:
  `ffmpeg -hide_banner -encoders | grep h264_nvenc`. The Arch and RPM Fusion builds include it;
  if yours doesn't, Route Flyover simply uses the CPU.
- If a game or another GPU-heavy program (for example a local AI model) is using all the
  graphics memory, Route Flyover falls back to the CPU and tries the GPU again after 5 minutes.

### Dragging files onto the page does nothing

Browsers installed as **Snap** or **Flatpak** can only see some folders. If dropping the sample
files doesn't work, copy them to your `Downloads` folder first, or use the file picker on the
page instead of drag and drop.

### Rendering is very slow

That's the app waiting for map imagery. A slow connection or a very long, fast flight makes it
slower; try the *high* camera or a longer flight length. Close other browser tabs and GPU-heavy
programs while rendering.

For other problems see the [Troubleshooting](../README.md#troubleshooting) section of the main
README.
