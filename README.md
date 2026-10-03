# RouteFly

**Turn a GPX track, your photos and your music into a 3D fly-over video of your trip.**

RouteFly is a personal web app that runs on your own computer. Drop in a GPX file from your
ride, hike or drive, add the photos you took along the way and a few songs, and it flies a
camera along your route over satellite imagery and real 3D terrain. It stops at every photo,
shows live distance / time / climb, ends with a zoom-out to the curve of the Earth and a
statistics card, and records the whole thing as a video ready for Instagram, WhatsApp or
your phone.

Nothing is uploaded anywhere: your GPX, photos, music and the finished video stay on your
machine. The only network traffic is fetching public map tiles.

---

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Running RouteFly](#running-routefly)
- [How to use it](#how-to-use-it)
- [Settings reference](#settings-reference)
- [How things work](#how-things-work)
- [Supported files](#supported-files)
- [Tips for good videos](#tips-for-good-videos)
- [Troubleshooting](#troubleshooting)
- [Project structure](#project-structure)
- [Map data, fonts and attribution](#map-data-fonts-and-attribution)
- [License](#license)

---

## Features

**Route and map**
- 3D satellite map with real terrain (adjustable exaggeration) and a globe with atmosphere.
- Reads GPX tracks or routes with elevation and timestamps; computes distance, total and
  moving time, average and max speed, climb, descent, highest and lowest point.
- Town and village names along your route, taken from OpenStreetMap (only places near the
  route are labelled, like a travel log).
- Elevation profile you can click to jump anywhere along the route.

**The video**
- Vertical 9:16 (1080×1920, for phones and Reels) or landscape 16:9 (1920×1080).
- Intro card with a route mini-map, headline stats, title and subtitle, then the camera
  dives in.
- High chase camera that follows the route smoothly, with the ridden part of the trail drawn
  behind a rider marker: a dot, a motorcycle (GS-style adventure bike), two motorcycles, a car
  or a bicycle — always facing the direction of travel.
- Photo pins along the route; at each one the flight pauses and the photo is shown as a print
  with time and distance.
- Bottom card with your profile picture, live distance / time / climb and the elevation profile.
- Closing zoom-out to the whole route and a summary card with the trip statistics.
- Background music: several songs played in order with crossfades, cut to the video length
  with a smooth fade-out — always at normal speed.
- Saves MP4 (H.264 + AAC, constant 30 fps — what Instagram and WhatsApp want) or WebM.

**Photos**
- JPEG, PNG, WebP and iPhone HEIC/HEIF.
- Placed on the route by their GPS position, or by the time they were taken.
- Copies of the same photo (`IMG_1234.HEIC`, `IMG_1234.jpg`, …) are merged automatically.
- A list shows how every photo was placed or why it couldn't be.

---

## Requirements

| What | Version | Why |
|---|---|---|
| **Node.js** | 20.19+ or 22.12+ (tested with 26) | runs the local app server (Vite) |
| **npm** | comes with Node.js | installs dependencies |
| **ffmpeg** with `libx264` and `aac` | any recent version (tested with 9.0) | converts recordings to MP4 — only needed for the MP4 option |
| **Browser** | current Firefox or Chrome/Chromium | runs the app; needs WebGL 2 |
| **Graphics** | any GPU with working WebGL 2 | 3D map rendering |
| **Internet** | while using the app | satellite imagery, terrain and place names are streamed |

Check what you have:

```bash
node --version
npm --version
ffmpeg -hide_banner -encoders | grep -E "libx264|aac"
```

### Installing the requirements

**Arch / CachyOS / Manjaro**
```bash
sudo pacman -S nodejs npm ffmpeg
```

**Debian / Ubuntu**
```bash
sudo apt install ffmpeg
# Distribution Node.js is often too old; install a current one, e.g. via NodeSource or nvm:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
nvm install --lts
```

**Fedora**
```bash
sudo dnf install nodejs npm ffmpeg   # ffmpeg with x264 comes from RPM Fusion
```

**macOS** (with [Homebrew](https://brew.sh))
```bash
brew install node ffmpeg
```

**Windows**
Install Node.js LTS from <https://nodejs.org> and ffmpeg (e.g. `winget install Gyan.FFmpeg`),
and make sure `ffmpeg` is on your `PATH`.

---

## Installation

```bash
git clone https://github.com/topke63/RouteFly.git
cd RouteFly
npm install
```

That's all — no API keys or accounts are needed.

---

## Running RouteFly

### For everyday use

```bash
npm run dev
```

Then open **<http://localhost:5173>** in Firefox or Chrome. Keep the terminal open while you
use the app; stop it with `Ctrl+C`.

To use a different port: `npm run dev -- --port 5199`.

### Optimized build

```bash
npm run build      # creates dist/
npm run preview    # serves dist/ on http://localhost:4173, including MP4 conversion
```

> **MP4 conversion needs the RouteFly server** (`npm run dev` or `npm run preview`), because it
> uses your system's ffmpeg. If you host the contents of `dist/` on a plain web server instead,
> everything else works, and MP4 conversion falls back to the browser — which works in
> Chrome but not in Firefox on Linux (Firefox can't encode H.264/AAC there). WebM always works.

---

## How to use it

1. **Add your trip.** Drag a `.gpx` file onto the page (or click the drop area). The route
   appears on the map with its distance, climb and duration.
2. **Add photos.** Drag them in with the GPX or later. Pins appear on the route; the *Photos*
   list says how each one was placed (GPS or time) or why not.
3. **Add music** (optional). Drag songs in, or use *+ Add music*. The list shows each song and
   whether the music will be cut to fit or repeated.
4. **Set it up** in the sidebar: format, title, activity, subtitle, rider marker, profile
   photo, flight length, camera height and so on (see below).
5. **Preview** with **▶ Play**. Pause any time; click the elevation profile in the frame to
   jump. Music plays along in the preview.
6. **Record** with **● Record video**. Keep the tab visible and the window open until the
   *Saved …* message appears; the video is then downloaded like any other file.

A recording takes longer than the video it produces, because RouteFly waits whenever map
imagery is still loading so that every frame is sharp — the waiting never shows up in the
video. Expect roughly 1.5–2× the video length, plus a short MP4 conversion at the end.

A small sample route is included in `samples/` to try things out.

---

## Settings reference

| Setting | What it does |
|---|---|
| **Save as** | *MP4* (H.264/AAC, for Instagram, WhatsApp, phones) or *WebM* (no conversion, faster). |
| **Video format** | *Vertical 9:16* (1080×1920) or *Landscape 16:9* (1920×1080). The preview frame matches. |
| **Title** | Big headline in the intro and on the summary card. Defaults to the GPX track name. |
| **Activity** | Used in the default subtitle and to pick a matching rider marker. |
| **Rider marker** | Dot, motorcycle (GS-style adventure bike), two motorcycles, car or bicycle. |
| **Subtitle** | Line under the title. Defaults to *activity · date*. |
| **Profile photo** | Picture in the round avatar. Defaults to your first placed photo. |
| **Flight length** | How long the flight along the route takes (1–15 min). Set automatically from the route length; photo stops, intro and ending come on top. |
| **Camera** | Low, medium or high chase camera. Higher shows more landscape and loads faster. |
| **Terrain exaggeration** | Makes hills and mountains taller (1×–2.5×). |
| **Photo duration** | How long each photo is shown. |
| **Camera clock offset** | For photos without GPS: hours your camera's clock was ahead of the real local time (e.g. a camera still on another time zone). |
| **Music volume** | Loudness of the music in the preview and the video. |

The **estimated video length** is shown in the Music section: intro (~7 s) + flight length +
one photo duration per photo + zoom-out (5 s) + summary (7 s).

---

## How things work

### Photo placement
1. If the photo has a GPS position within 2 km of the route, it's pinned to the nearest point.
2. Otherwise, if it has a capture time inside the recording's time span (± 30 min), it's
   placed where you were at that time. Time zones are taken from the photo when the camera
   stored them; otherwise use the *camera clock offset* setting.
3. Converted copies (screenshots, re-saved JPEG/PNG) usually lost their GPS and time. Keep the
   originals — if both are dropped in, RouteFly uses the metadata of whichever copy has it.

### Music
- Songs play in the order you added them, at normal speed, with 2-second crossfades.
- If the music is longer than the video, it's cut and faded out over the last ~4 seconds.
- If it's shorter, the playlist starts again from the first song.
- The recording itself is made silently; once it's finished and its exact length is known,
  the soundtrack is rendered to exactly that length and added to the file (the video is copied,
  not re-compressed). This keeps music and picture perfectly in sync.

### MP4 export
The browser records WebM (Firefox) or MP4 (Chrome). With *Save as MP4*, the finished file is
sent to the local RouteFly server, which runs:

```
ffmpeg -i input -c:v libx264 -preset medium -crf 21 -maxrate 12M -bufsize 24M \
       -profile:v high -pix_fmt yuv420p -r 30 -fps_mode cfr \
       -c:a aac -b:a 192k -ar 48000 -movflags +faststart output.mp4
```

and returns the MP4. The data only travels between your browser and your own computer.

### Map loading
Satellite imagery and terrain are streamed while you fly. To keep frames sharp, RouteFly
limits detail to what the camera can show, spreads requests over two server hostnames,
prefetches the stretch of route ahead of the camera, and pauses the recording while tiles are
still loading.

### Statistics
- *Climb/descent* ignore elevation changes under 3 m (GPS noise).
- *Moving time* counts only segments faster than ~3 km/h.
- *Max speed* is averaged over 15 seconds to ignore GPS spikes.
- Time-based numbers need timestamps in the GPX. Route planners often write *estimated*
  times; then speeds and moving time reflect the plan, not the actual ride.

---

## Supported files

| Type | Formats |
|---|---|
| Track | GPX 1.0/1.1 — tracks (`<trk>`) or routes (`<rte>`); multiple segments are joined |
| Photos | JPEG, PNG, WebP, HEIC/HEIF (decoded in the browser) |
| Music | MP3, M4A/AAC, OGG/Opus, WAV, FLAC — whatever your browser can decode |
| Output | MP4 (H.264 High + AAC) or WebM (VP8/VP9 + Opus) |

Videos from your phone (`.MP4`, `.MOV`) aren't used yet and are listed as such.

---

## Tips for good videos

- **Use a recorded track** (from your GPS device, phone app or bike computer), not just a
  planned route, if you want real times and speeds.
- **Longer flights look better.** Around 0.6 s per km is a good start; very fast flights give
  the map less time to load.
- **Higher camera = smoother, sharper video**, especially on long routes.
- **Close other heavy tabs** while recording, and keep the RouteFly tab visible — browsers slow
  down hidden tabs.
- **Instagram Reels:** vertical format, MP4.

---

## Troubleshooting

**The map stays blank or grey.** Check your internet connection. The page needs WebGL 2:
in Firefox see `about:support` → *Graphics*; in Chrome `chrome://gpu`.

**"Graphics context lost — reload the page."** The GPU ran out of memory or reset. Reload the
page; if it happens during recordings, close other GPU-heavy apps or use the *high* camera.

**A photo says "No GPS or date in the file".** It's probably a converted copy. Use the
original from your phone or camera.

**Photos land in the wrong place.** If they have no GPS, the camera clock may have been off —
adjust *Camera clock offset*.

**"Couldn't convert to MP4 (…)".** The video was saved as WebM instead. Make sure you started
RouteFly with `npm run dev` / `npm run preview` and that `ffmpeg` with `libx264` is installed
(see [Requirements](#requirements)). Convert an existing WebM by hand with:
```bash
ffmpeg -i video.webm -c:v libx264 -crf 21 -pix_fmt yuv420p -r 30 -c:a aac -movflags +faststart video.mp4
```

**HEIC photos fail to load.** Very unusual HEIC variants may not decode; export them as JPEG
from your phone or photo app (keeping location data).

**Recording takes very long.** That's the app waiting for map imagery. A slow connection or a
very long, fast flight makes it slower; try the *high* camera or a longer flight length.

---

## Project structure

```
RouteFly/
├── index.html          page layout: sidebar controls and the video stage
├── vite.config.js      dev/preview server, including the local ffmpeg MP4 endpoint
├── public/
│   ├── logo.svg        RouteFly logo
│   └── riders/         rider marker drawings (motorcycle, two motorcycles, car, bicycle)
├── samples/            small demo route and photos
└── src/
    ├── main.js         app: map, loading, camera, animation timeline, recording flow
    ├── overlay.js      everything drawn over the map (intro, HUD, pins, photos, summary)
    ├── gpx.js          GPX parsing and position/elevation along the route
    ├── photos.js       photo reading (EXIF, HEIC) and placement on the route
    ├── music.js        playlist preview, offline soundtrack rendering and muxing
    ├── recorder.js     canvas + overlay → video recording
    ├── export.js       MP4 conversion (local ffmpeg, in-browser fallback)
    ├── prefetch.js     map tile prefetching ahead of the camera
    ├── minimap.js      route mini-map for the intro card
    ├── stats.js        trip statistics
    ├── geo.js          small geodesy helpers
    └── style.css       sidebar and stage styling
```

Built with [MapLibre GL JS](https://maplibre.org), [Vite](https://vite.dev),
[Mediabunny](https://mediabunny.dev), [exifr](https://github.com/MikeKovarik/exifr),
[heic-to](https://github.com/hoppergee/heic-to) and
[fix-webm-duration](https://github.com/yusitnikov/fix-webm-duration).

---

## Map data, fonts and attribution

RouteFly uses free public map services. They're credited in every video frame; please keep
those credits and respect each provider's terms, especially before publishing videos
commercially.

| Data | Source |
|---|---|
| Satellite imagery, intro mini-map | © Esri, Maxar, Earthstar Geographics and the GIS user community — [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9), [World Street Map](https://www.arcgis.com/home/item.html?id=3b93337983e9436f8db950e38a8629af) |
| Terrain | [Terrain Tiles on AWS](https://registry.opendata.aws/terrain-tiles/) (Mapzen; SRTM, GMTED, ETOPO1 and others) |
| Place names | © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, served by [OpenFreeMap](https://openfreemap.org) |
| Font | [Montserrat](https://github.com/JulietaUla/Montserrat), SIL Open Font License 1.1 |

The motorcycle marker is a generic adventure-bike drawing in the style of a BMW R 1200 GS; it
carries no manufacturer logo. BMW and GS are trademarks of their respective owner.

---

## License

Copyright © 2026 topke

RouteFly is free software: you can redistribute it and/or modify it under the terms of the
**GNU General Public License** as published by the Free Software Foundation, either
**version 3** of the License, or (at your option) any later version.

RouteFly is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without
even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
[LICENSE](LICENSE) file for the full text.

Third-party libraries keep their own licenses (MapLibre GL JS: BSD-3-Clause; Mediabunny:
MPL-2.0; @mediabunny/aac-encoder: MPL-2.0, bundling an FFmpeg build under the LGPL; heic-to:
LGPL-3.0, based on libheif;
exifr and fix-webm-duration: MIT; Montserrat: OFL-1.1), all compatible with GPL-3.0.
