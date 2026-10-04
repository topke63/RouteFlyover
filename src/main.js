import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre locates its worker relative to its own module, which breaks once Vite
// bundles it; hand it an explicitly bundled worker instead.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import './style.css';
// Bundled rather than fetched from a font CDN, so recordings never depend on the network.
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/montserrat/800.css';
import '@fontsource/montserrat/800-italic.css';
import { parseGpx, pointAt } from './gpx.js';
import { readPhotos, placePhotos, photoKey } from './photos.js';
import { tripStats, fmtKm, fmtDuration } from './stats.js';
import { bearing, destination, haversine, lerpAngle } from './geo.js';
import { Recorder, FPS } from './recorder.js';
import { initUsage, reportRender } from './usage.js';
import { TilePrefetcher } from './prefetch.js';
import { drawOverlay, profileRect, pinHeads, ACCENT, km, hm } from './overlay.js';
import { renderMinimap } from './minimap.js';
import { Music, AUDIO_FILE, addSoundtrack } from './music.js';
import { VehicleRenderer } from './vehicles.js';
import { toMp4 } from './export.js';

maplibregl.setWorkerUrl(workerUrl);

// High chase camera: distance behind the rider and height above it, in meters.
const CAMERAS = {
  low: { dist: 4800, height: 2900 },
  medium: { dist: 8000, height: 4800 },
  high: { dist: 13000, height: 7800 },
};
// Preview size in CSS px and recorded size in px.
const FORMATS = {
  vertical: { aspect: 9 / 16, out: [1080, 1920] },
  landscape: { aspect: 16 / 9, out: [1920, 1080] },
};
const INTRO_CARD_MS = 3500;  // title card before the camera dives in
const DIVE_MS = 3200;
const OUTRO_MS = 5000;       // zoom out to the whole route
const SUMMARY_MS = 7000;     // closing statistics
const PHOTO_FADE_MS = 400;
const MUSIC_FADE = { delay: 2.5, duration: 4.2 }; // s into the summary; silent just before the video ends
const SPOT_RADIUS = 150;     // m along the route; photos closer than this share a pin
const LABEL_DISTANCE = { town: 4000, village: 1200 }; // m from the route

// Public tile servers speak HTTP/1.1 (6 connections per host), so those sources list two
// hostnames for the same data to double throughput. Max zooms are kept low on
// purpose: the camera never needs more, and higher zooms multiply requests.
// With an ArcGIS API key (VITE_ARCGIS_KEY, see README "Hosting it online") the imagery comes
// from Esri's key-based service (HTTP/2, one host is enough), as Esri requires for public
// sites; without one, from the public servers, which are fine for personal use.
const ARCGIS_KEY = import.meta.env.VITE_ARCGIS_KEY;
const SAT_TILES = ARCGIS_KEY
  ? [`https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${encodeURIComponent(ARCGIS_KEY)}`]
  : [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ];
const DEM_TILES = [
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png',
];
const SAT_MAXZOOM = 16;
const DEM_MAXZOOM = 12;
const PREFETCH_AHEAD = [2, 9]; // seconds of flight ahead of the camera to warm up
const RECORD_TILE_WAIT = 1000;  // ms the recording may hold for tiles before moving on
const START_TILE_WAIT = 6000;   // ms to let the first view load before recording starts
const JUMP_TILE_WAIT = 4000;    // ms to hold after jumping along the profile
const LIVE_SLOW_PACE = 0.5;     // live playback speed factor while tiles are loading

const $ = (id) => document.getElementById(id);
const ui = {
  files: $('files'), play: $('play'), stop: $('stop'), render: $('render'),
  len: $('len'), cam: $('cam'), exag: $('exag'), photoLen: $('photo-len'), offset: $('offset'),
  format: $('format'), title: $('title'), subtitle: $('subtitle'), activity: $('activity'), avatar: $('avatar'),
  status: $('status'), stage: $('stage'), overlay: $('overlay'),
  musicFiles: $('music-files'), musicVol: $('music-vol'), saveAs: $('save-as'), rider: $('rider'),
};
// 3D vehicle shown at the rider's position (unless the plain dot is chosen).
const vehicles = new VehicleRenderer();
const VEHICLE_SIZE = 240; // design units (the frame's short side is 1080)
const ACTIVITY_RIDER = { 'Motorcycle ride': 'moto-gs', 'Bike ride': 'bicycle', 'Car trip': 'car' };
const music = new Music();
const octx = ui.overlay.getContext('2d');

const map = new maplibregl.Map({
  container: 'map',
  center: [20.46, 44.81],
  zoom: 5,
  maxPitch: 85,
  attributionControl: false, // credits are painted into the frame instead (see overlay)
  canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
  style: {
    version: 8,
    projection: { type: 'globe' },
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      satellite: { type: 'raster', tiles: SAT_TILES, tileSize: 256, maxzoom: SAT_MAXZOOM },
      terrain: { type: 'raster-dem', tiles: DEM_TILES, encoding: 'terrarium', tileSize: 256, maxzoom: DEM_MAXZOOM },
      places: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    },
    layers: [
      // Shows through while tiles are still loading; haze-colored so gaps read as distance, not holes.
      { id: 'background', type: 'background', paint: { 'background-color': '#b9c7d3' } },
      { id: 'satellite', type: 'raster', source: 'satellite' },
    ],
    terrain: { source: 'terrain', exaggeration: 1.3 },
    sky: {
      'sky-color': '#6ea8e6',
      'horizon-color': '#d6e6f5',
      'fog-color': '#dfe9f3',
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.5,
      'fog-ground-blend': 0.9,
      // Space and the atmosphere's glow only show when zoomed far out.
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 7, 1, 10, 0],
    },
  },
});
// Handy for console debugging and browser tests.
if (import.meta.env.DEV) Object.assign(window, { map, debug: { get track() { return track; }, get spots() { return spots; }, get anim() { return anim; } } });

let track = null;
let allPhotos = [];    // everything that decoded
let skippedFiles = []; // { name, reason } for files that couldn't be used
let photos = [];       // the subset placed on the track, sorted by distance
let spots = [];        // photos grouped by place: { d, lngLat, photos }
let minimap = null;
let avatarImg = null;  // chosen profile picture; falls back to the first photo
let anim = null;
let viewer = null;     // photo opened by clicking a pin while idle: { spot, index }
let mapReady = false;
const prefetcher = new TilePrefetcher([
  { urls: SAT_TILES, levels: [[11, 2], [12, 1], [13, 1], [14, 1]] },
  { urls: DEM_TILES, levels: [[10, 1], [11, 1], [12, 1]] },
]);

// The GPU can drop the WebGL context (e.g. out of memory); the map can't render after that.
map.on('webglcontextlost', async () => {
  const recording = !!anim?.recorder;
  if (anim) await endAnimation();
  setStatus(`Graphics context lost — reload the page.${recording ? ' The video rendered so far is below.' : ''}`);
});

map.on('load', () => {
  mapReady = true;
  // The ridden trail is real geometry, not a gradient over the whole route (whose
  // resolution is too coarse on long routes): a "done" part refreshed now and then plus a
  // short "head" refreshed every frame, so it always ends exactly at the rider.
  map.addSource('trail', { type: 'geojson', data: emptyLine() });
  map.addSource('trail-head', { type: 'geojson', data: emptyLine() });
  const line = { 'line-join': 'round', 'line-cap': 'round' };
  for (const src of ['trail', 'trail-head']) {
    map.addLayer({ id: `${src}-casing`, type: 'line', source: src, layout: line, paint: { 'line-color': '#fff', 'line-opacity': 0.9 } });
  }
  for (const src of ['trail', 'trail-head']) {
    map.addLayer({ id: `${src}-line`, type: 'line', source: src, layout: line, paint: { 'line-color': ACCENT } });
  }
  addLabelLayers();
  fitStage();
  if (track) showTrack();
});
map.on('render', () => { if (!anim) renderOverlay(performance.now()); });

function emptyLine() {
  return { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} };
}

// ---------- Place labels ----------

// Pill-shaped tag images the labels stretch to fit their text, with a small accent dot.
function labelImage(fill) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 48;
  const ctx = c.getContext('2d');
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(2, 2, 60, 44, 22);
  ctx.fill();
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(17, 24, 5, 0, Math.PI * 2);
  ctx.fill();
  return ctx.getImageData(0, 0, 64, 48);
}

function addLabelLayers() {
  // Only the straight middle stretches, so the round ends and the dot keep their shape.
  const fit = { pixelRatio: 2, stretchX: [[30, 40]], stretchY: [[22, 26]], content: [28, 8, 50, 40] };
  map.addImage('tag-navy', labelImage('rgba(13,21,36,0.88)'), fit);
  map.addImage('tag-white', labelImage('#ffffff'), fit);
  const common = {
    type: 'symbol', source: 'places', 'source-layer': 'place',
    filter: ['boolean', false], // set once a route is loaded
  };
  const layout = (image, size) => ({
    'text-field': ['coalesce', ['get', 'name:sr-Latn'], ['get', 'name:latin'], ['get', 'name']],
    'text-font': ['Noto Sans Bold'],
    'text-size': size,
    'icon-image': image,
    'icon-text-fit': 'both',
    'icon-text-fit-padding': [2, 9, 2, 6],
    'text-padding': 6,
  });
  map.addLayer({ ...common, id: 'village-labels', minzoom: 10, layout: layout('tag-white', 10), paint: { 'text-color': '#0d1524' } });
  map.addLayer({ ...common, id: 'town-labels', layout: layout('tag-navy', 12), paint: { 'text-color': '#fff' } });
}

// Only label places along the route, like a travel log, not the whole map.
function updateLabelFilters() {
  const coords = [];
  let next = 0;
  track.cum.forEach((d, i) => { if (d >= next) { coords.push(track.coords[i]); next = d + 300; } });
  coords.push(track.coords.at(-1));
  const line = { type: 'LineString', coordinates: coords };
  const near = (classes, m) => ['all', ['match', ['get', 'class'], classes, true, false], ['<', ['distance', line], m]];
  map.setFilter('town-labels', near(['city', 'town'], LABEL_DISTANCE.town));
  map.setFilter('village-labels', near(['village'], LABEL_DISTANCE.village));
}

// ---------- Stage (the video frame) ----------

// Size the preview to the chosen aspect ratio inside the available space. Map line widths
// and label sizes scale with it so the preview and the recording look the same.
function fitStage() {
  const fmt = FORMATS[ui.format.value];
  const box = ui.stage.parentElement.getBoundingClientRect();
  const availW = box.width - 32, availH = box.height - 32;
  const w = Math.floor(Math.min(availW, availH * fmt.aspect));
  const h = Math.floor(w / fmt.aspect);
  ui.stage.style.width = `${w}px`;
  ui.stage.style.height = `${h}px`;
  map.resize();
  if (mapReady) {
    const k = Math.min(w, h) / 540;
    for (const src of ['trail', 'trail-head']) {
      map.setPaintProperty(`${src}-line`, 'line-width', 3.2 * k);
      map.setPaintProperty(`${src}-casing`, 'line-width', 6 * k);
    }
    map.setLayoutProperty('town-labels', 'text-size', 12.5 * k);
    map.setLayoutProperty('village-labels', 'text-size', 10.5 * k);
  }
  syncOverlay();
}

function syncOverlay() {
  const c = map.getCanvas();
  if (ui.overlay.width !== c.width || ui.overlay.height !== c.height) {
    ui.overlay.width = c.width;
    ui.overlay.height = c.height;
  }
  renderOverlay(performance.now());
}

// Recordings render at the output resolution; the preview at screen resolution.
function setRecordingResolution(on) {
  const fmt = FORMATS[ui.format.value];
  const css = Math.min(ui.stage.clientWidth, ui.stage.clientHeight);
  map.setPixelRatio(on ? Math.min(...fmt.out) / css : window.devicePixelRatio);
  syncOverlay();
}

// ---------- Loading ----------

async function loadFiles(fileList) {
  const files = [...fileList];
  const gpx = files.find((f) => /\.gpx$/i.test(f.name));
  const audio = files.filter(isAudio);
  // Everything else goes to the photo reader, which reports what it can't use.
  const media = files.filter((f) => f !== gpx && !/\.gpx$/i.test(f.name) && !isAudio(f));
  stopAnimation();

  try {
    if (audio.length) await addMusic(audio);
    if (gpx) {
      track = parseGpx(await gpx.text());
      ui.len.value = suggestedLength(track);
      ui.len.dispatchEvent(new Event('input'));
      if (!ui.title.dataset.edited) ui.title.value = track.name;
      updateSubtitle();
      if (mapReady) showTrack();
      minimap = null;
      const forTrack = track; // ignore the result if the session moved on meanwhile
      renderMinimap(forTrack).then((c) => { if (track === forTrack) minimap = c; });
    }
    if (media.length) {
      const known = new Set(allPhotos.map((p) => p.key));
      const fresh = media.filter((f) => !known.has(photoKey(f.name)));
      const { photos: read, skipped } = await readPhotos(fresh, (i, n) => setStatus(`Reading photo ${i} of ${n}…`));
      allPhotos.push(...read);
      skippedFiles.push(...skipped);
      setStatus('');
    }
    if (track) refreshPhotos();
    else if (media.length) {
      renderPhotoList();
      setStatus('Photos loaded — now add a GPX file.');
    }
  } catch (err) {
    setStatus(err.message);
  }
}

function showTrack() {
  setProgress(track.total);
  updateLabelFilters();
  map.fitBounds(track.bounds, { padding: 60, pitch: 45, duration: 1500 });

  $('info').hidden = false;
  $('route-name').textContent = track.name;
  $('stat-dist').textContent = fmtKm(track.total);
  $('stat-gain').textContent = `${Math.round(track.gain)} m`;
  $('stat-time').textContent = track.duration ? fmtDuration(track.duration) : '—';
  for (const b of [ui.play, ui.stop, ui.render]) b.disabled = false;
}

// Start over: drop this trip's route, photos, music, texts and any unsaved video.
// Preferences (format, camera, rider, profile photo, flight settings, volume) stay.
function newSession() {
  const rendering = render || anim?.recorder;
  if (rendering && !confirm('A video is being rendered. Stop it and start a new session?')) return;
  if (!rendering && result && !confirm("Your rendered video hasn't been saved. Discard it and start a new session?")) return;
  stopAnimation();
  cancelRender();
  clearResult();
  viewer = null;
  for (const p of allPhotos) URL.revokeObjectURL(p.url);
  track = null;
  allPhotos = [];
  skippedFiles = [];
  photos = [];
  spots = [];
  minimap = null;
  music.stop();
  music.songs.length = 0;
  for (const input of [ui.title, ui.subtitle]) {
    input.value = '';
    delete input.dataset.edited;
  }
  ui.offset.value = 0;
  ui.files.value = '';
  $('info').hidden = true;
  $('stat-photos').textContent = '0';
  renderPhotoList();
  renderMusic();
  for (const b of [ui.play, ui.stop, ui.render]) b.disabled = true;
  if (mapReady) {
    for (const src of ['trail', 'trail-head']) map.getSource(src).setData(emptyLine());
    trailDone = -1;
    for (const layer of ['town-labels', 'village-labels']) map.setFilter(layer, ['boolean', false]);
    map.flyTo({ center: [20.46, 44.81], zoom: 5, pitch: 0, bearing: 0, duration: 1200 });
  }
  setStatus('');
  renderOverlay(performance.now());
}

function refreshPhotos() {
  photos = placePhotos(allPhotos, track, parseFloat(ui.offset.value) || 0);
  spots = [];
  for (const p of photos) {
    const last = spots[spots.length - 1];
    if (last && p.d - last.d < SPOT_RADIUS) last.photos.push(p);
    else spots.push({ d: p.d, lngLat: pointAt(track, p.d).lngLat, photos: [p] });
  }
  $('stat-photos').textContent = photos.length;
  renderPhotoList();
  renderMusic();
  renderOverlay(performance.now());
}

// Sidebar list: every photo and file with how it was placed, or why it wasn't.
function renderPhotoList() {
  const list = $('photo-list');
  list.replaceChildren();
  const rows = [
    ...allPhotos.map((p) => ({
      thumb: p.url, name: p.name, ok: p.d !== null,
      text: p.how === 'gps' ? 'Placed by GPS' : p.how === 'time' ? 'Placed by time' : p.note || 'Waiting for a GPX file',
    })),
    ...skippedFiles.map((f) => ({ thumb: null, name: f.name, ok: false, text: f.reason })),
  ];
  for (const r of rows) {
    const li = document.createElement('li');
    li.className = r.ok ? 'ok' : 'bad';
    const thumb = document.createElement('span');
    thumb.className = 'thumb';
    if (r.thumb) thumb.style.backgroundImage = `url(${r.thumb})`;
    const label = document.createElement('span');
    label.innerHTML = '<b></b><small></small>';
    label.querySelector('b').textContent = r.name;
    label.querySelector('small').textContent = r.text;
    li.append(thumb, label);
    list.append(li);
  }
  $('photos-section').hidden = rows.length === 0;
}

function isAudio(f) {
  return f.type.startsWith('audio/') || AUDIO_FILE.test(f.name);
}

async function addMusic(files) {
  setStatus(`Reading ${files.length} music file(s)…`);
  const failed = await music.add(files);
  setStatus(failed.length ? `Couldn't read: ${failed.join(', ')}` : '');
  renderMusic();
}

// What the video will be: intro + flight + photo stops + zoom-out + summary.
function videoSeconds() {
  return (INTRO_CARD_MS + DIVE_MS + OUTRO_MS + SUMMARY_MS) / 1000
    + Number(ui.len.value) + photos.length * parseFloat(ui.photoLen.value);
}

const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

function renderMusic() {
  const list = $('music-list');
  list.replaceChildren();
  music.songs.forEach((song, i) => {
    const li = document.createElement('li');
    li.innerHTML = '<span><b></b><small></small></span><button type="button" title="Remove">✕</button>';
    li.querySelector('b').textContent = song.name;
    li.querySelector('small').textContent = mmss(song.buffer.duration);
    li.querySelector('button').addEventListener('click', () => { music.remove(i); renderMusic(); });
    list.append(li);
  });
  const note = $('music-note');
  if (!music.songs.length) {
    note.textContent = 'Add MP3, M4A, OGG, WAV or FLAC files. They play in order with crossfades.';
    return;
  }
  const video = videoSeconds(), total = music.duration;
  note.textContent = total > video
    ? `Music ${mmss(total)}, video ≈ ${mmss(video)}: the music is cut to fit and fades out at the end.`
    : `Music ${mmss(total)}, video ≈ ${mmss(video)}: the playlist repeats, then fades out at the end.`;
}

// Long routes get longer flights so the camera doesn't race past everything.
function suggestedLength(t) {
  const sec = Math.round((t.total / 1000) * 0.6 / 10) * 10; // ~0.6 s per km
  return Math.min(600, Math.max(180, sec));
}

function updateSubtitle() {
  if (ui.subtitle.dataset.edited) return;
  const date = track?.hasTime
    ? new Date(track.time[0]).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  ui.subtitle.value = [ui.activity.value, date].filter(Boolean).join(' · ');
}

// ---------- Animation ----------

// Canvas text silently falls back to another font if the face isn't loaded yet.
const fontsLoaded = Promise.all(['600', '700', '800', 'italic 800'].map((w) => document.fonts.load(`${w} 20px Montserrat`)))
  .then(() => renderOverlay(performance.now()));

async function startAnimation({ record = false } = {}) {
  if (!track) return;
  stopAnimation();
  viewer = null;
  await fontsLoaded;
  const brg = routeBearing(0);

  anim = {
    phase: 'intro', phaseStart: 0, clock: 0, last: 0,
    d: 0, brg, heading: travelHeading(0), cam: CAMERAS[ui.cam.value], camAlt: null, pace: 1,
    nextPhoto: 0, photo: null, wait: null, paused: false,
    speed: track.total / parseFloat(ui.len.value),
    photoMs: parseFloat(ui.photoLen.value) * 1000,
    recorder: null,
  };
  // Length of the whole timeline on the animation clock; drives the render progress bar.
  anim.totalMs = INTRO_CARD_MS + DIVE_MS + (track.total / anim.speed) * 1000
    + photos.length * anim.photoMs + OUTRO_MS + SUMMARY_MS;
  setProgress(0);
  prefetcher.clear();
  prefetcher.around(track, 0, anim.speed * PREFETCH_AHEAD[1]);
  anim.prefetchedTo = anim.speed * PREFETCH_AHEAD[1];
  // The closing zoom-out sees the whole region at low detail; fetch it early (a few dozen tiles).
  const region = paddedBounds(track.bounds, 1.5);
  prefetcher.area(region, [6, 7, 8, 9], SAT_TILES);
  prefetcher.area(region, [6, 7, 8], DEM_TILES);
  ui.play.textContent = '❚❚ Pause';

  // Title card over a gently tilted view of the start.
  anim.introCam = { center: pointAt(track, 0).lngLat, zoom: 11.3, pitch: 35, bearing: brg };
  map.jumpTo(anim.introCam);

  const run = anim;
  if (record) {
    // Frame by frame at a fixed time step, as fast as tiles and the encoder allow.
    setRecordingResolution(true);
    anim.recorder = new Recorder(map.getCanvas(), ui.overlay);
    await anim.recorder.start();
    holdFor(START_TILE_WAIT);
    setStatus('Keep this tab visible while rendering.');
    renderFrames(run);
  } else {
    // Live preview in real time; the music plays along.
    music.start();
    requestAnimationFrame(function loop(now) {
      if (anim !== run) return;
      tick(now);
      if (anim === run) requestAnimationFrame(loop);
    });
  }
}

function paddedBounds([[w, s], [e, n]], factor) {
  const dx = ((e - w) * (factor - 1)) / 2, dy = ((n - s) * (factor - 1)) / 2;
  return [[w - dx, s - dy], [e + dx, n + dy]];
}

function setPhase(phase) {
  anim.phase = phase;
  anim.phaseStart = anim.clock;
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
// Yields to pending work (tile data from the workers, the encoder) without waiting for the
// next screen refresh.
const nextTask = () => new Promise((resolve) => {
  const { port1, port2 } = new MessageChannel();
  port1.onmessage = () => resolve();
  port2.postMessage(null);
});

// Render loop: capture the current state as one frame, then advance the timeline by exactly
// one frame's worth. Waiting for tiles or the encoder only slows rendering, never the video.
async function renderFrames(run) {
  const frameMs = 1000 / FPS;
  // Where the render time goes (dev only, logged when the frames are done): see logRenderTiming.
  const t = run.timing = { started: performance.now(), frames: 0, waitMs: 0, holds: 0, holdMs: 0, drawMs: 0, overlayMs: 0, encodeMs: 0, stepMs: 0 };
  let holding = true;
  for (;;) {
    let t0 = performance.now();
    // Not tied to the screen's refresh rate: frames are drawn as fast as the GPU and encoder
    // allow, and map.redraw() replaces MapLibre's own pending repaint instead of drawing twice.
    // While holding for tiles, wait a screen refresh at a time so MapLibre can load them.
    await (holding ? nextFrame() : nextTask());
    if (anim !== run) return;
    let t1 = performance.now();
    holding = holdForTiles(t1);
    if (holding) {
      t.holds++;
      t.holdMs += t1 - t0;
      continue;
    }
    t.waitMs += t1 - t0;
    map.redraw();
    t0 = performance.now();
    t.drawMs += t0 - t1;
    renderOverlay(t0);
    t1 = performance.now();
    t.overlayMs += t1 - t0;
    await run.recorder.frame();
    if (anim !== run) return;
    t0 = performance.now();
    t.encodeMs += t0 - t1;
    t.frames++;
    renderProgress('frames', anim.clock / anim.totalMs);
    const done = step(frameMs) === 'done';
    t.stepMs += performance.now() - t0;
    if (done) {
      if (import.meta.env.DEV) logRenderTiming(t);
      endAnimation();
      return;
    }
  }
}

// Breakdown of a render's frame stage, per part: total seconds, share and ms per video frame.
function logRenderTiming(t) {
  const total = performance.now() - t.started;
  const row = (ms) => ({ seconds: +(ms / 1000).toFixed(1), share: `${Math.round((ms / total) * 100)}%`, msPerFrame: +(ms / t.frames).toFixed(1) });
  console.info(`Render timing: ${t.frames} frames (${(t.frames / FPS).toFixed(1)} s of video) in ${(total / 1000).toFixed(1)} s, ` +
    `${(t.frames / FPS / (total / 1000)).toFixed(2)}× real time; ${t.holds} waits for tiles`);
  console.table({
    'waiting for tiles': row(t.holdMs),
    'yielding between frames': row(t.waitMs),
    'drawing the map': row(t.drawMs),
    'drawing the overlay': row(t.overlayMs),
    'capturing + encoding': row(t.encodeMs),
    'camera + prefetch': row(t.stepMs),
  });
}

// Live preview: advance by real elapsed time.
function tick(now) {
  const realDt = anim.last ? Math.min(100, now - anim.last) : 0;
  anim.last = now;
  const holding = holdForTiles(now);
  const dtMs = anim.paused || holding ? 0 : realDt;
  music.setRunning(!anim.paused && !holding);
  music.update();
  if (step(dtMs) === 'done') {
    endAnimation();
    return;
  }
  renderOverlay(now);
}

// Advance the timeline by dtMs: camera, trail, phases. Returns 'done' at the very end.
function step(dtMs) {
  anim.clock += dtMs;
  const dt = dtMs / 1000;
  const t = anim.clock - anim.phaseStart;

  switch (anim.phase) {
    case 'intro':
      // Hold on the title card, then dive into the chase camera at the start.
      if (t >= INTRO_CARD_MS) {
        anim.diveTo ??= chaseCamera(pointAt(track, 0), anim.brg);
        map.jumpTo(lerpCamera(anim.introCam, anim.diveTo, easeInOut((t - INTRO_CARD_MS) / DIVE_MS)));
      }
      if (t >= INTRO_CARD_MS + DIVE_MS) setPhase('fly');
      break;
    case 'fly':
      if (dt) fly(dt);
      break;
    case 'photo':
      if (t > anim.photoMs) {
        anim.photo = null;
        if (anim.d >= track.total) startOutro();
        else setPhase('fly');
      }
      break;
    case 'outro':
      map.jumpTo(lerpCamera(anim.outroFrom, anim.outroTo, easeInOut(t / (OUTRO_MS - 500))));
      if (t >= OUTRO_MS) {
        setPhase('summary');
        music.fadeOut(MUSIC_FADE.duration, MUSIC_FADE.delay);
      }
      break;
    case 'summary':
      if (t >= SUMMARY_MS) return 'done';
      break;
  }
  if (anim.phase === 'fly' || anim.phase === 'photo') setProgress(anim.d);
  return null;
}

const easeInOut = (v) => {
  const x = Math.max(0, Math.min(1, v));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};

// Camera in between two camera states (center, zoom, pitch, bearing) at k ∈ [0, 1].
function lerpCamera(a, b, k) {
  const ca = maplibregl.LngLat.convert(a.center), cb = maplibregl.LngLat.convert(b.center);
  return {
    center: [ca.lng + (cb.lng - ca.lng) * k, ca.lat + (cb.lat - ca.lat) * k],
    zoom: a.zoom + (b.zoom - a.zoom) * k,
    pitch: a.pitch + (b.pitch - a.pitch) * k,
    bearing: lerpAngle(a.bearing, b.bearing, k),
  };
}

function fly(dt) {
  const next = photos[anim.nextPhoto];
  // Live playback eases off while imagery is still loading; renders wait instead.
  const ready = anim.recorder || map.areTilesLoaded();
  anim.pace += ((ready ? 1 : LIVE_SLOW_PACE) - anim.pace) * (1 - Math.exp(-dt * 2));
  anim.d = Math.min(track.total, anim.d + anim.speed * anim.pace * dt);
  if (next && anim.d >= next.d) {
    anim.d = next.d;
    anim.nextPhoto++;
    anim.photo = next;
    setPhase('photo');
  }
  followCamera(dt);
  // The vehicle turns with the road, a little smoothed so GPS jitter doesn't shake it.
  anim.heading = lerpAngle(anim.heading, travelHeading(anim.d), 1 - Math.exp(-dt * 6));
  // Keep a window of upcoming route warm; extend it in chunks rather than every frame.
  const aheadTo = anim.d + anim.speed * PREFETCH_AHEAD[1];
  if (aheadTo - anim.prefetchedTo > 1000) {
    prefetcher.around(track, Math.max(anim.prefetchedTo, anim.d + anim.speed * PREFETCH_AHEAD[0]), aheadTo, 800);
    anim.prefetchedTo = aheadTo;
  }
  if (anim.phase === 'fly' && anim.d >= track.total) startOutro();
}

// Hold the animation until the map has loaded: after a jump or at the start of a render,
// and during a render whenever tiles are still missing (rendering just takes longer).
function holdForTiles(now) {
  const ready = map.areTilesLoaded();
  if (anim.wait) {
    if (!ready && now - anim.wait.start < anim.wait.max) return true;
    // Some far-off tile may never settle; after a timed-out wait, move on a little before holding again.
    if (!ready) anim.noWaitUntil = now + 500;
    anim.wait = null;
    return false;
  }
  if (anim.recorder && !ready && now >= (anim.noWaitUntil ?? 0)) {
    holdFor(RECORD_TILE_WAIT, now);
    return true;
  }
  return false;
}

function holdFor(ms, now = performance.now()) {
  anim.wait = { start: now, max: ms };
}

// Direction of travel at distance d, looking a short way ahead (scaled with flight speed).
function travelHeading(d) {
  const ahead = Math.min(3000, Math.max(120, (anim?.speed ?? 2000) * 0.35));
  const a = pointAt(track, Math.max(0, Math.min(d, track.total - ahead))), b = pointAt(track, Math.min(track.total, d + ahead));
  return b.d > a.d + 1 ? bearing(a.lngLat, b.lngLat) : (anim?.heading ?? 0);
}

// General heading of the route from distance d: far enough ahead to ignore wiggles.
function routeBearing(d) {
  const ahead = Math.min(15000, Math.max(1500, track.total * 0.04));
  const a = pointAt(track, d), b = pointAt(track, d + ahead);
  return b.d > a.d + 1 ? bearing(a.lngLat, b.lngLat) : (anim?.brg ?? 0);
}

function followCamera(dt) {
  // A slow-turning camera keeps the view calm; the trail swings through the frame instead.
  anim.brg = lerpAngle(anim.brg, routeBearing(anim.d), 1 - Math.exp(-dt * 0.45));
  map.jumpTo(chaseCamera(pointAt(track, anim.d), anim.brg, dt));
}

// Camera placed behind the target along `brg`, kept above the terrain under both points.
function chaseCamera(target, brg, dt = 0) {
  const cam = anim?.cam ?? CAMERAS.medium;
  const exag = parseFloat(ui.exag.value);
  const targetAlt = map.queryTerrainElevation(target.lngLat) ?? target.ele * exag;
  const camLngLat = destination(target.lngLat, (brg + 180) % 360, cam.dist);
  if (anim) anim.camPos = camLngLat;
  const groundAlt = map.queryTerrainElevation(camLngLat) ?? targetAlt;
  let camAlt = Math.max(targetAlt, groundAlt) + cam.height;
  // Smooth altitude so terrain tiles popping in don't make the camera jump.
  if (anim) {
    anim.camAlt = anim.camAlt === null || !dt ? camAlt : anim.camAlt + (camAlt - anim.camAlt) * (1 - Math.exp(-dt * 2));
    camAlt = anim.camAlt;
  }
  return map.calculateCameraOptionsFromTo(camLngLat, camAlt, target.lngLat, targetAlt);
}

// Pull far back until the whole route and the curve of the Earth are in view.
function startOutro() {
  setPhase('outro');
  setProgress(track.total);
  const fit = map.cameraForBounds(track.bounds, { padding: 40, bearing: anim.brg });
  anim.outroFrom = { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
  anim.outroTo = { center: fit.center, zoom: Math.min(fit.zoom - 1, 8.5), pitch: 64, bearing: anim.brg };
}

async function endAnimation() {
  if (!anim) return;
  const rec = anim.recorder;
  anim = null;
  ui.play.textContent = '▶ Play';
  music.stop();
  renderOverlay(performance.now());
  if (rec) await finishRender(rec);
}

function stopAnimation() {
  if (!anim) return;
  const rec = anim.recorder;
  anim = null;
  if (rec) {
    rec.cancel();
    setRecordingResolution(false);
    cancelRender();
  }
  prefetcher.clear();
  // Quick fade rather than cutting the music off mid-note.
  music.setRunning(true);
  music.fadeOut(0.4);
  const ctx = music.ctx;
  setTimeout(() => { if (music.ctx === ctx) music.stop(); }, 500);
  ui.play.textContent = '▶ Play';
  if (track && mapReady) setProgress(track.total);
  renderOverlay(performance.now());
}

let trailDone = -1; // index of the last track point in the "done" trail source

// Show the trail up to distance d (meters).
function setProgress(d) {
  if (!mapReady || !track) return;
  const here = pointAt(track, d);
  let i = track.cum.findLastIndex((c) => c <= d);
  if (d >= track.total) i = track.coords.length - 1;
  const asLine = (coords) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
  // Move the done/head split forward in chunks (or back after a jump) to keep the head short.
  if (i < trailDone || track.cum[i] - track.cum[Math.max(trailDone, 0)] > 2000 || d >= track.total || d === 0) {
    trailDone = i;
    map.getSource('trail').setData(asLine(track.coords.slice(0, i + 1)));
  }
  map.getSource('trail-head').setData(asLine([...track.coords.slice(trailDone, i + 1), here.lngLat]));
}

// ---------- Rendering ----------

// Share of the progress bar each stage takes (only the stages that run are counted).
const STAGES = {
  frames: { label: 'Rendering frames', weight: 0.8 },
  music: { label: 'Adding music', weight: 0.03 },
  mp4: { label: 'Converting to MP4', weight: 0.17 },
};
let render = null; // { started, stages, abort }
let result = null; // { blob, name, url }

function startRender() {
  clearResult();
  render = {
    started: performance.now(),
    stages: ['frames', ...(music.songs.length ? ['music'] : []), ...(ui.saveAs.value === 'mp4' ? ['mp4'] : [])],
    abort: new AbortController(),
  };
  $('render-box').hidden = false;
  for (const b of [ui.play, ui.render]) b.disabled = true;
  renderProgress('frames', 0);
  startAnimation({ record: true });
}

// Progress of one stage (0–1, or null if unknown) → overall bar, percentage and time left.
// `detail` is shown next to the stage name, e.g. which encoder converts the MP4.
function renderProgress(stage, fraction, detail) {
  if (!render) return;
  const total = render.stages.reduce((sum, st) => sum + STAGES[st].weight, 0);
  let before = 0;
  for (const st of render.stages) {
    if (st === stage) break;
    before += STAGES[st].weight;
  }
  const overall = Math.min(1, (before + STAGES[stage].weight * Math.min(1, fraction ?? 0)) / total);
  const elapsed = (performance.now() - render.started) / 1000;
  $('render-stage').textContent = `${STAGES[stage].label}${detail ? ` (${detail})` : ''}…`;
  $('render-pct').textContent = `${Math.floor(overall * 100)}%`;
  $('render-bar').value = overall;
  $('render-time').textContent = overall > 0.03
    ? `${mmss(elapsed)} elapsed · about ${mmss((elapsed * (1 - overall)) / overall)} left`
    : `${mmss(elapsed)} elapsed`;
}

// After the frames: add the music, convert, then offer the file.
async function finishRender(rec) {
  const { signal } = render.abort;
  const { stages, started } = render;
  const notes = [];
  try {
    renderProgress('frames', 1);
    const stageStart = performance.now();
    const logStage = (label) => import.meta.env.DEV && console.info(`Render timing: ${label} ${((performance.now() - stageStart) / 1000).toFixed(1)} s after the last frame`);
    let { blob } = await rec.stop();
    logStage('WebM finished');
    setRecordingResolution(false);
    if (signal.aborted) return;
    if (stages.includes('music')) {
      renderProgress('music', 0);
      try {
        ({ blob } = await addSoundtrack(blob, music));
        logStage('music added');
      } catch (err) {
        console.error(err);
        notes.push(`Couldn't add the music (${err.message}), so the video is silent.`);
      }
      if (signal.aborted) return;
    }
    if (stages.includes('mp4')) {
      renderProgress('mp4', 0);
      try {
        const ENCODER_NAMES = { nvenc: 'NVIDIA GPU', x264: 'CPU' };
        blob = await toMp4(blob, (p, encoder) => renderProgress('mp4', p, ENCODER_NAMES[encoder]), signal);
        logStage('MP4 converted');
      } catch (err) {
        if (signal.aborted) return;
        console.error(err);
        notes.push(`Couldn't convert to MP4 (${err.message}), so it's WebM.`);
      }
    }
    if (signal.aborted) return;
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const name = `${(ui.title.value || track.name).replace(/[^\p{L}\p{N}\- ]+/gu, '').trim() || 'route'}.${ext}`;
    showResult(blob, name, (performance.now() - started) / 1000, notes);
    reportRender($('usage'));
  } finally {
    if (!signal.aborted) endRender();
  }
}

function cancelRender() {
  if (!render) return;
  render.abort.abort();
  endRender();
  setStatus('Render cancelled.');
}

function endRender() {
  render = null;
  $('render-box').hidden = true;
  for (const b of [ui.play, ui.render]) b.disabled = !track;
}

function showResult(blob, name, seconds, notes) {
  clearResult();
  result = { blob, name, url: URL.createObjectURL(blob) };
  const video = $('result-video');
  video.src = result.url;
  $('result-info').textContent = `${name} · ${(blob.size / 1e6).toFixed(1)} MB · rendered in ${mmss(seconds)}${notes.length ? ` · ${notes.join(' ')}` : ''}`;
  $('result-box').hidden = false;
  setStatus('');
}

function clearResult() {
  if (!result) return;
  $('result-video').removeAttribute('src');
  $('result-video').load();
  URL.revokeObjectURL(result.url);
  result = null;
  $('result-box').hidden = true;
}

// A real "Save as" dialog where the browser has one (Chrome); otherwise a normal download.
async function saveResult() {
  if (!result) return;
  const { blob, name } = result;
  if (window.showSaveFilePicker) {
    try {
      const ext = name.split('.').pop();
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: 'Video', accept: { [blob.type]: [`.${ext}`] } }],
      });
      const out = await handle.createWritable();
      await out.write(blob);
      await out.close();
      setStatus(`Saved ${handle.name}.`);
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // dialog closed
    }
  }
  const a = document.createElement('a');
  a.href = result.url;
  a.download = name;
  a.click();
  setStatus(`Saved ${name} to your downloads.`);
}

// ---------- Overlay ----------

function headlineStats() {
  const rows = Object.fromEntries(tripStats(track, photos.length));
  const out = [{ icon: 'route', value: km(track.total), label: 'Distance' }];
  if (track.hasTime) out.push({ icon: 'watch', value: hm(track.duration), label: 'Time' });
  out.push({ icon: 'mountain', value: `${Math.round(track.gain)} m`, label: 'Climb' });
  if (track.hasTime) out.push({ icon: 'speed', value: rows['Avg speed'], label: 'Avg speed' });
  return out;
}

// Closing card: the headline numbers plus the extras, up to six.
function summaryRows() {
  const rows = Object.fromEntries(tripStats(track, photos.length));
  return [
    ['Distance', km(track.total)],
    ['Time', track.hasTime ? hm(track.duration) : null],
    ['Climb', `${Math.round(track.gain)} m`],
    ['Avg speed', rows['Avg speed']],
    ['Max speed', rows['Max speed']],
    ['Highest point', rows['Highest point']],
    ['Photos', photos.length ? String(photos.length) : null],
  ].filter(([, v]) => v && v !== '—').slice(0, 6);
}

function photoCaption(p) {
  const time = p.date ? p.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
  return [time, km(p.d)].filter(Boolean).join(' · ');
}

// Screen position in overlay pixels, or null when off-screen or behind the camera.
function projector() {
  const k = ui.overlay.width / map.getCanvas().clientWidth;
  const { width: w, height: h } = ui.overlay;
  // Only the low chase camera can have route points behind it; map.project would mirror
  // those onto the screen, so drop anything outside the camera's forward half.
  const cam = (anim?.phase === 'fly' || anim?.phase === 'photo') && anim.camPos;
  const brg = map.getBearing();
  return (lngLat) => {
    if (cam) {
      const off = Math.abs(((bearing(cam, lngLat) - brg + 540) % 360) - 180);
      if (off > 80 && haversine(cam, lngLat) > 300) return null;
    }
    const p = map.project(lngLat);
    const x = p.x * k, y = p.y * k;
    return Number.isFinite(x) && x > -100 && x < w + 100 && y > -100 && y < h + 100 ? [x, y] : null;
  };
}

function renderOverlay(now) {
  const w = ui.overlay.width, h = ui.overlay.height;
  if (!w || !h) return;
  const f = {
    phase: 'idle', track, here: null, project: projector(), spots,
    avatar: avatarImg || photos[0]?.img || null,
    title: ui.title.value || track?.name || '', subtitle: ui.subtitle.value,
    minimap, headline: track ? headlineStats() : [], summaryRows: track ? summaryRows() : [], time: anim ? anim.clock : now,
    introT: 0, barAlpha: 0, dotAlpha: 0, summaryAlpha: 0, photo: null,
  };
  if (anim && track) {
    const t = anim.clock - anim.phaseStart;
    const ease = (v) => Math.max(0, Math.min(1, v));
    f.phase = anim.phase;
    f.here = pointAt(track, anim.d);
    f.introT = t;
    if (anim.phase === 'fly') f.barAlpha = ease(t / 600);
    if (anim.phase === 'photo') f.barAlpha = 1;
    if (anim.phase === 'outro') f.barAlpha = 1 - ease(t / 800);
    f.dotAlpha = anim.phase === 'fly' || anim.phase === 'photo' ? 1 : anim.phase === 'outro' ? 1 - ease(t / 800) : 0;
    if (anim.phase === 'summary') f.summaryAlpha = ease(t / 700);
    f.rider = riderSprite(w, h);
    if (anim.phase === 'photo' && anim.photo) {
      f.photo = {
        img: anim.photo.img, alpha: ease(Math.min(t, anim.photoMs - t) / PHOTO_FADE_MS), progress: t / anim.photoMs,
        tilt: photos.indexOf(anim.photo) % 2 ? 2 : -2, caption: photoCaption(anim.photo),
      };
    }
  } else if (viewer) {
    const p = viewer.spot.photos[viewer.index];
    f.photo = { img: p.img, alpha: 1, progress: 0, tilt: -2, caption: photoCaption(p) };
  }
  drawOverlay(octx, w, h, f);
}

// The chosen vehicle rendered as the map camera sees it: tilted like the map, turned by its
// heading relative to the map's bearing.
function riderSprite(w, h) {
  if (ui.rider.value === 'dot') return null;
  const size = Math.round((VEHICLE_SIZE * Math.min(w, h)) / 1080);
  const img = vehicles.render(ui.rider.value, anim.heading - map.getBearing(), map.getPitch(), size);
  return img && { img, size };
}

// Clicks on the frame: close an open photo, open a pin's photo, or jump via the profile.
ui.stage.addEventListener('click', (e) => {
  if (!track) return;
  if (viewer) {
    viewer = null;
    renderOverlay(performance.now());
    return;
  }
  const rect = ui.overlay.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * ui.overlay.width;
  const y = ((e.clientY - rect.top) / rect.height) * ui.overlay.height;
  if (anim) {
    const r = profileRect(ui.overlay.width, ui.overlay.height);
    if (!anim.recorder && (anim.phase === 'fly' || anim.phase === 'photo') && x >= r.x && x <= r.x + r.w && y >= r.y - 20 && y <= r.y + r.h + 20) {
      jumpTo(((x - r.x) / r.w) * track.total);
    }
    return;
  }
  const f = { spots, project: projector() };
  const hit = pinHeads(ui.overlay.width, ui.overlay.height, f).find((p) => Math.hypot(p.x - x, p.y - y) <= p.r * 1.2);
  if (hit) {
    viewer = { spot: hit.spot, index: 0 };
    renderOverlay(performance.now());
  }
});

function jumpTo(d) {
  anim.d = d;
  anim.prefetchedTo = d;
  anim.photo = null;
  setPhase('fly');
  anim.nextPhoto = photos.findIndex((p) => p.d > d);
  if (anim.nextPhoto < 0) anim.nextPhoto = photos.length;
  // Point the camera along the route at the new spot and let its tiles load first.
  anim.brg = routeBearing(d);
  anim.camAlt = null;
  map.jumpTo(chaseCamera(pointAt(track, d), anim.brg));
  holdFor(JUMP_TILE_WAIT);
}

// ---------- Wiring ----------

function setStatus(msg) {
  ui.status.textContent = msg;
}

ui.files.addEventListener('change', () => loadFiles(ui.files.files));
document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dragging'); });
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
document.addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('dragging');
  loadFiles(e.dataTransfer.files);
});

ui.play.addEventListener('click', () => {
  if (!anim) startAnimation();
  else {
    anim.paused = !anim.paused;
    ui.play.textContent = anim.paused ? '▶ Resume' : '❚❚ Pause';
  }
});
ui.stop.addEventListener('click', stopAnimation);
$('new-session').addEventListener('click', newSession);
ui.render.addEventListener('click', startRender);
$('render-cancel').addEventListener('click', () => (anim?.recorder ? stopAnimation() : cancelRender()));
$('result-save').addEventListener('click', saveResult);
$('result-discard').addEventListener('click', clearResult);
ui.offset.addEventListener('change', () => track && refreshPhotos());
ui.format.addEventListener('change', () => { stopAnimation(); fitStage(); });
window.addEventListener('resize', () => { if (!anim?.recorder) fitStage(); });

for (const input of [ui.title, ui.subtitle]) {
  input.addEventListener('input', () => {
    input.dataset.edited = input.value ? '1' : '';
    renderOverlay(performance.now());
  });
}
ui.activity.addEventListener('change', () => {
  updateSubtitle();
  if (!ui.rider.dataset.edited) ui.rider.value = ACTIVITY_RIDER[ui.activity.value] ?? 'dot';
  renderOverlay(performance.now());
});
ui.rider.addEventListener('change', () => { ui.rider.dataset.edited = '1'; });
ui.avatar.addEventListener('change', async () => {
  const file = ui.avatar.files[0];
  if (!file) return;
  const { photos: [p] } = await readPhotos([file]);
  avatarImg = p?.img ?? null;
  renderOverlay(performance.now());
});

ui.exag.addEventListener('input', () => {
  $('exag-out').textContent = `${ui.exag.value}×`;
  map.setTerrain({ source: 'terrain', exaggeration: parseFloat(ui.exag.value) });
});
ui.len.addEventListener('input', () => {
  const sec = Number(ui.len.value);
  $('len-out').textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  if (anim) anim.speed = track.total / sec;
  renderMusic();
});
ui.photoLen.addEventListener('input', () => {
  $('photo-len-out').textContent = `${ui.photoLen.value} s`;
  if (anim) anim.photoMs = parseFloat(ui.photoLen.value) * 1000;
  renderMusic();
});
ui.cam.addEventListener('change', () => { if (anim) anim.cam = CAMERAS[ui.cam.value]; });
ui.musicFiles.addEventListener('change', () => { addMusic([...ui.musicFiles.files]); ui.musicFiles.value = ''; });
ui.musicVol.addEventListener('input', () => {
  $('music-vol-out').textContent = `${ui.musicVol.value}%`;
  music.setVolume(ui.musicVol.value / 100);
});

fitStage();
renderMusic();
initUsage($('usage'));
