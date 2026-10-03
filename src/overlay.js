// Everything drawn on top of the map. The same code paints the live preview and the
// recorded video, so what you see is what you get. Sizes are in "design units": the
// short side of the frame is 1080 units (a vertical video is 1080×1920).

// RouteFly palette: coral-orange accent on frosted navy.
export const ACCENT = '#ff5a1f';
const ACCENT_2 = '#ff3d6e';
const NAVY = 'rgba(13,21,36,0.78)';
const NAVY_SOLID = '#0d1524';
const MUTED = 'rgba(255,255,255,0.68)';
const FONT = 'Montserrat, system-ui, sans-serif';
const SHADOW = 'rgba(0,0,0,0.45)';

const logo = new Image();
logo.src = '/logo.svg';

const unit = (w, h) => Math.min(w, h) / 1080;

// The stats card at the bottom during the flight.
function hudCard(w, h) {
  const u = unit(w, h);
  return { x: 40 * u, y: h - 80 * u - 250 * u, w: w - 80 * u, h: 250 * u };
}

// Where the elevation profile sits; also used to hit-test clicks for jumping.
export function profileRect(w, h) {
  const u = unit(w, h), c = hudCard(w, h);
  const x = c.x + 196 * u;
  return { x, y: c.y + 132 * u, w: c.x + c.w - 36 * u - x, h: 88 * u };
}

const PIN_TIP = 72;  // units from the route up to the pin head center
const PIN_HEAD = 34;

// Photo pin head centers, for click hit-testing; same geometry as drawPins.
export function pinHeads(w, h, f) {
  const u = unit(w, h);
  return f.spots.map((spot) => {
    const p = f.project(spot.lngLat);
    return p && { spot, x: p[0], y: p[1] - PIN_TIP * u, r: PIN_HEAD * u };
  }).filter(Boolean);
}

/**
 * f: {
 *   phase: 'idle' | 'intro' | 'fly' | 'photo' | 'outro' | 'summary',
 *   track, here, project(lngLat) -> [x, y] in canvas px or null, time (ms, for subtle motion),
 *   spots, avatar, title, subtitle, minimap,
 *   headline: [{ icon, value, label }], summaryRows: [[label, value]],
 *   introT, barAlpha, dotAlpha, summaryAlpha, photo: { img, alpha, progress, tilt, caption } | null,
 *   rider: { img, size } | null — rendered 3D vehicle (square, ground point at its centre) shown instead of the dot,
 * }
 */
export function drawOverlay(ctx, w, h, f) {
  const u = unit(w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  if (f.phase === 'intro') {
    drawIntro(ctx, w, h, u, f);
  } else if (f.track) {
    drawPins(ctx, u, f);
    if (f.dotAlpha > 0 && f.here) drawDot(ctx, u, f);
    if (f.barAlpha > 0) drawHud(ctx, w, h, u, f);
    if (f.summaryAlpha > 0) drawSummary(ctx, w, h, u, f);
  }
  if (f.photo?.alpha > 0) drawPhoto(ctx, w, h, u, f.photo);
  drawBrand(ctx, w, u);
  ctx.font = `600 ${17 * u}px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('Imagery © Esri · Places © OpenStreetMap', w - 24 * u, h - 26 * u);
  ctx.restore();
}

// ---------- Pieces ----------

function drawBrand(ctx, w, u) {
  ctx.save();
  const g = ctx.createLinearGradient(0, 0, 0, 200 * u);
  g.addColorStop(0, 'rgba(0,0,0,0.3)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, 200 * u);
  const size = 64 * u, x = 44 * u, y = 46 * u;
  ctx.shadowColor = SHADOW;
  ctx.shadowBlur = 10 * u;
  if (logo.complete && logo.naturalWidth) ctx.drawImage(logo, x, y, size, size);
  ctx.font = `800 ${38 * u}px ${FONT}`;
  const base = y + size / 2 + 13 * u;
  ctx.fillStyle = '#fff';
  ctx.fillText('Route', x + size + 16 * u, base);
  ctx.fillStyle = ACCENT;
  ctx.fillText('Fly', x + size + 16 * u + ctx.measureText('Route').width, base);
  ctx.restore();
}

function drawIntro(ctx, w, h, u, f) {
  const t = f.introT;
  const fade = (from, to) => clamp01((t - from) / (to - from));
  const enter = easeOut(fade(0, 700));
  const cardAlpha = 1 - fade(3200, 3900);   // minimap + stat chips
  const titleAlpha = 1 - fade(4300, 5200);  // headline lingers while the camera dives
  const pad = 60 * u;

  ctx.save();
  const g = ctx.createLinearGradient(0, h * 0.35, 0, h);
  g.addColorStop(0, 'rgba(13,21,36,0)');
  g.addColorStop(1, `rgba(13,21,36,${0.75 * titleAlpha})`);
  ctx.fillStyle = `rgba(13,21,36,${0.25 * titleAlpha})`;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Route overview, top right.
  if (f.minimap) {
    const size = 340 * u, x = w - 40 * u - size, y = 150 * u - (1 - enter) * 30 * u;
    ctx.save();
    ctx.globalAlpha = cardAlpha * enter;
    ctx.shadowColor = SHADOW;
    ctx.shadowBlur = 24 * u;
    roundRect(ctx, x - 6 * u, y - 6 * u, size + 12 * u, size + 12 * u, 32 * u);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.shadowBlur = 0;
    roundRect(ctx, x, y, size, size, 26 * u);
    ctx.clip();
    ctx.drawImage(f.minimap, x, y, size, size);
    ctx.restore();
  }

  // Stat chips card along the bottom.
  const card = { x: 40 * u, y: h - 80 * u - 190 * u + (1 - enter) * 40 * u, w: w - 80 * u, h: 190 * u };
  ctx.save();
  ctx.globalAlpha = cardAlpha * enter;
  glass(ctx, card, u);
  const stats = f.headline.slice(0, 4);
  const cell = card.w / stats.length;
  stats.forEach((s, i) => {
    const cx = card.x + cell * i + cell / 2;
    drawIcon(ctx, s.icon, cx - 18 * u, card.y + 26 * u, 36 * u, ACCENT);
    ctx.textAlign = 'center';
    text(ctx, s.value, cx, card.y + 116 * u, `800 ${38 * u}px ${FONT}`, '#fff', u, cell - 16 * u);
    text(ctx, s.label.toUpperCase(), cx, card.y + 152 * u, `700 ${17 * u}px ${FONT}`, MUTED, u, cell - 16 * u);
    if (i) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(card.x + cell * i, card.y + 34 * u, 2 * u, card.h - 68 * u);
    }
  });
  ctx.restore();

  // Headline above the card.
  ctx.save();
  ctx.globalAlpha = titleAlpha * enter;
  const maxW = w - pad * 2;
  ctx.font = `800 ${88 * u}px ${FONT}`;
  const lines = wrap(ctx, f.title, maxW).slice(0, 3);
  let y = h - 80 * u - 190 * u - 70 * u - (f.subtitle ? 56 * u : 0) - (lines.length - 1) * 96 * u - (1 - enter) * 30 * u;
  for (const line of lines) {
    text(ctx, line, pad, y, `800 ${88 * u}px ${FONT}`, '#fff', u);
    y += 96 * u;
  }
  if (f.subtitle) {
    // Accent tick, then the subtitle.
    ctx.fillStyle = ACCENT;
    roundRect(ctx, pad, y - 36 * u, 8 * u, 40 * u, 4 * u);
    ctx.fill();
    text(ctx, f.subtitle, pad + 24 * u, y - 4 * u, `700 ${34 * u}px ${FONT}`, '#fff', u, maxW - 24 * u);
  }
  ctx.restore();
  ctx.restore();
}

function drawPins(ctx, u, f) {
  // Far pins first so near ones overlap them.
  const pins = f.spots
    .map((spot) => ({ spot, p: f.project(spot.lngLat) }))
    .filter((x) => x.p)
    .sort((a, b) => a.p[1] - b.p[1]);
  for (const { spot, p } of pins) {
    const passed = f.here ? f.here.d >= spot.d - 1 : true;
    const [x, y] = p;
    const r = PIN_HEAD * u, hy = y - PIN_TIP * u;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y, 14 * u, 5 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = SHADOW;
    ctx.shadowBlur = 12 * u;
    ctx.fillStyle = passed ? accentGradient(ctx, x, hy, r) : '#ffffff';
    teardrop(ctx, x, y, hy, r);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(x, hy, r - 7 * u, 0, Math.PI * 2);
    ctx.clip();
    drawCover(ctx, spot.photos[0].img, x - r, hy - r, r * 2, r * 2);
    ctx.restore();
    if (spot.photos.length > 1) {
      ctx.save();
      ctx.fillStyle = NAVY_SOLID;
      ctx.beginPath();
      ctx.arc(x + r * 0.78, hy - r * 0.78, 15 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `800 ${17 * u}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(spot.photos.length, x + r * 0.78, hy - r * 0.78 + 1 * u);
      ctx.restore();
    }
  }
}

// Map-pin outline: circle of radius r centred at (x, hy) tapering to a point at (x, tipY).
function teardrop(ctx, x, tipY, hy, r) {
  const a = Math.acos(r / (tipY - hy)); // where the tangent lines from the tip touch the circle
  ctx.beginPath();
  ctx.moveTo(x, tipY);
  ctx.arc(x, hy, r, Math.PI / 2 + a, Math.PI / 2 - a + Math.PI * 2);
  ctx.closePath();
}

function accentGradient(ctx, x, y, r) {
  const g = ctx.createLinearGradient(x - r, y + r, x + r, y - r);
  g.addColorStop(0, ACCENT);
  g.addColorStop(1, ACCENT_2);
  return g;
}

function drawDot(ctx, u, f) {
  const p = f.project(f.here.lngLat);
  if (!p) return;
  if (f.rider) {
    drawVehicle(ctx, u, p, f.rider, f.dotAlpha);
    return;
  }
  const pulse = 0.5 + 0.5 * Math.sin((f.time ?? 0) / 260);
  ctx.save();
  ctx.globalAlpha = f.dotAlpha;
  ctx.fillStyle = `rgba(255,90,31,${0.18 + 0.17 * pulse})`;
  ctx.beginPath();
  ctx.arc(p[0], p[1], (22 + 8 * pulse) * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 8 * u;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(p[0], p[1], 13 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(p[0], p[1], 7.5 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// The 3D vehicle standing on the route, with a soft shadow under it.
function drawVehicle(ctx, u, [x, y], { img, size }, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(x, y, 0, x, y, 70 * u);
  g.addColorStop(0, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, 70 * u, 34 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  ctx.restore();
}

function drawHud(ctx, w, h, u, f) {
  const { track, here } = f;
  const card = hudCard(w, h);
  ctx.save();
  ctx.globalAlpha = f.barAlpha;
  glass(ctx, card, u);
  drawAvatar(ctx, f.avatar, card.x + 36 * u + 62 * u, card.y + card.h / 2, 62 * u, u);

  // Stats: label above value.
  const r = profileRect(w, h);
  const stats = [['Distance', km(here.d)]];
  if (track.hasTime) stats.push(['Time', hm(here.time - track.time[0])]);
  stats.push(['Climb', `${Math.round(here.gain)} m`]);
  const cell = r.w / stats.length;
  stats.forEach(([label, value], i) => {
    const x = r.x + cell * i;
    text(ctx, label.toUpperCase(), x, card.y + 56 * u, `700 ${17 * u}px ${FONT}`, MUTED, u);
    text(ctx, value, x, card.y + 104 * u, `800 ${40 * u}px ${FONT}`, '#fff', u, cell - 12 * u);
  });

  // Elevation profile: ridden part in the accent gradient, the rest faint.
  const min = Math.min(...track.ele), max = Math.max(...track.ele), range = Math.max(max - min, 30);
  const yOf = (e) => r.y + r.h - ((e - min) / range) * r.h * 0.92;
  const path = new Path2D();
  path.moveTo(r.x, r.y + r.h);
  const step = Math.max(1, Math.floor(track.cum.length / 600));
  for (let i = 0; i < track.cum.length; i += step) path.lineTo(r.x + (track.cum[i] / track.total) * r.w, yOf(track.ele[i]));
  path.lineTo(r.x + r.w, yOf(track.ele.at(-1)));
  path.lineTo(r.x + r.w, r.y + r.h);
  path.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fill(path);
  const px = r.x + (here.d / track.total) * r.w;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y - 4 * u, px - r.x, r.h + 8 * u);
  ctx.clip();
  const g = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
  g.addColorStop(0, ACCENT);
  g.addColorStop(1, ACCENT_2);
  ctx.fillStyle = g;
  ctx.fill(path);
  ctx.restore();
  // Current position on the profile.
  ctx.fillStyle = '#fff';
  ctx.fillRect(px - 1.5 * u, r.y - 4 * u, 3 * u, r.h + 4 * u);
  ctx.beginPath();
  ctx.arc(px, yOf(here.ele), 7 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSummary(ctx, w, h, u, f) {
  const rows = f.summaryRows.slice(0, 6);
  const cols = 3, rowH = 120 * u;
  const card = { x: 40 * u, w: w - 80 * u, h: 250 * u + Math.ceil(rows.length / cols) * rowH };
  card.y = h - 80 * u - card.h + (1 - easeOut(f.summaryAlpha)) * 40 * u;
  ctx.save();
  ctx.globalAlpha = f.summaryAlpha;
  glass(ctx, card, u);
  const pad = 40 * u;
  drawAvatar(ctx, f.avatar, card.x + pad + 56 * u, card.y + pad + 56 * u, 56 * u, u);
  const tx = card.x + pad + 140 * u, tw = card.w - (tx - card.x) - pad;
  text(ctx, f.title, tx, card.y + pad + 50 * u, `800 ${48 * u}px ${FONT}`, '#fff', u, tw);
  if (f.subtitle) text(ctx, f.subtitle, tx, card.y + pad + 96 * u, `700 ${26 * u}px ${FONT}`, ACCENT, u, tw);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(card.x + pad, card.y + 190 * u, card.w - pad * 2, 2 * u);
  const cell = (card.w - pad * 2) / cols;
  rows.forEach(([label, value], i) => {
    const x = card.x + pad + (i % cols) * cell, y = card.y + 250 * u + Math.floor(i / cols) * rowH;
    text(ctx, label.toUpperCase(), x, y, `700 ${17 * u}px ${FONT}`, MUTED, u, cell - 12 * u);
    text(ctx, value, x, y + 50 * u, `800 ${40 * u}px ${FONT}`, '#fff', u, cell - 12 * u);
  });
  ctx.restore();
}

// A photo stop: the print is dropped onto the dimmed map with a slight tilt and a caption.
function drawPhoto(ctx, w, h, u, photo) {
  const { img, alpha } = photo;
  const k = easeOut(clamp01(alpha));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(8,12,20,0.62)';
  ctx.fillRect(0, 0, w, h);

  const border = 16 * u;
  const scale = Math.min((w * 0.86 - border * 2) / img.naturalWidth, (h * 0.6 - border * 2) / img.naturalHeight);
  const iw = img.naturalWidth * scale, ih = img.naturalHeight * scale;
  ctx.translate(w / 2, h * 0.46);
  ctx.rotate(((photo.tilt ?? 0) * Math.PI) / 180);
  ctx.scale(0.92 + 0.08 * k, 0.92 + 0.08 * k);
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 40 * u;
  ctx.shadowOffsetY = 12 * u;
  ctx.fillStyle = '#fff';
  roundRect(ctx, -iw / 2 - border, -ih / 2 - border, iw + border * 2, ih + border * 2, 10 * u);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  // Slow push-in inside the frame.
  const zoom = 1 + 0.05 * (photo.progress ?? 0);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-iw / 2, -ih / 2, iw, ih);
  ctx.clip();
  ctx.drawImage(img, (-iw * zoom) / 2, (-ih * zoom) / 2, iw * zoom, ih * zoom);
  ctx.restore();

  if (photo.caption) {
    ctx.font = `700 ${28 * u}px ${FONT}`;
    const tw = ctx.measureText(photo.caption).width;
    const pw = tw + 100 * u, ph = 64 * u, py = ih / 2 + border + 36 * u;
    ctx.fillStyle = NAVY_SOLID;
    roundRect(ctx, -pw / 2, py, pw, ph, ph / 2);
    ctx.fill();
    drawIcon(ctx, 'camera', -pw / 2 + 26 * u, py + 16 * u, 32 * u, ACCENT);
    ctx.fillStyle = '#fff';
    ctx.fillText(photo.caption, -pw / 2 + 74 * u, py + 42 * u);
  }
  ctx.restore();
}

// ---------- Helpers ----------

// Frosted navy card.
function glass(ctx, r, u) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 30 * u;
  roundRect(ctx, r.x, r.y, r.w, r.h, 36 * u);
  ctx.fillStyle = NAVY;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 2 * u;
  ctx.stroke();
  ctx.restore();
}

function drawAvatar(ctx, img, cx, cy, r, u) {
  ctx.save();
  ctx.fillStyle = accentGradient(ctx, cx, cy, r);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 5 * u, 0, Math.PI * 2);
  ctx.fillStyle = NAVY_SOLID;
  ctx.fill();
  ctx.clip();
  if (img) drawCover(ctx, img, cx - r, cy - r, r * 2, r * 2);
  else if (logo.complete && logo.naturalWidth) ctx.drawImage(logo, cx - r * 0.6, cy - r * 0.6, r * 1.2, r * 1.2);
  ctx.restore();
}

function drawCover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

function text(ctx, str, x, y, font, color, u, maxWidth) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.shadowColor = SHADOW;
  ctx.shadowBlur = 8 * u;
  ctx.fillText(str, x, y, maxWidth);
  ctx.shadowBlur = 0;
}

function wrap(ctx, str, maxW) {
  const lines = [];
  let line = '';
  for (const word of str.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxW) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (v) => 1 - (1 - v) ** 3;

export const km = (m) => `${(m / 1000).toFixed(m < 100e3 ? 1 : 0)} km`;
export const hm = (ms) => {
  const min = Math.max(0, Math.round(ms / 60e3));
  return min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
};

// Line icons drawn into an s×s box at (x, y).
function drawIcon(ctx, name, x, y, s, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 24, s / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  switch (name) {
    case 'route': // distance: a winding path between two points
      ctx.arc(5, 19, 2.2, 0, Math.PI * 2);
      ctx.moveTo(21.2, 5); ctx.arc(19, 5, 2.2, 0, Math.PI * 2);
      ctx.moveTo(7, 17.5); ctx.bezierCurveTo(14, 14, 6, 9, 12, 8); ctx.lineTo(16.8, 6);
      break;
    case 'watch':
      ctx.arc(12, 14, 8, 0, Math.PI * 2);
      ctx.moveTo(12, 14); ctx.lineTo(12, 9.5);
      ctx.moveTo(9.5, 3); ctx.lineTo(14.5, 3);
      ctx.moveTo(12, 3); ctx.lineTo(12, 6);
      break;
    case 'mountain':
      ctx.moveTo(1.5, 20); ctx.lineTo(9, 6); ctx.lineTo(13.5, 14); ctx.lineTo(16, 10.5); ctx.lineTo(22.5, 20); ctx.closePath();
      break;
    case 'speed':
      ctx.arc(12, 15, 9, Math.PI, 0);
      ctx.moveTo(12, 15); ctx.lineTo(16.5, 9);
      break;
    case 'camera':
      ctx.roundRect(2, 7, 20, 13, 2.5);
      ctx.moveTo(8, 7); ctx.lineTo(9.5, 4); ctx.lineTo(14.5, 4); ctx.lineTo(16, 7);
      ctx.moveTo(16, 13.5); ctx.arc(12, 13.5, 4, 0, Math.PI * 2);
      break;
  }
  ctx.stroke();
  ctx.restore();
}
