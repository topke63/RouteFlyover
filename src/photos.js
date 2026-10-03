import exifr from 'exifr';
import { haversine } from './geo.js';
import { distanceAtTime } from './gpx.js';

const VIDEO = /\.(mp4|mov|m4v|avi|mkv|webm|3gp)$/i;
const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'];
const MAX_SIDE = 2048; // photos are shown at most screen-sized; keeps memory and video encoding light
const MAX_GPS_DISTANCE = 2000;

export const photoKey = (name) => name.replace(/\.[^.]+$/, '').toLowerCase();

// Read EXIF and decode every photo once; placement on the track is a separate step.
// Files sharing a base name (IMG_1.HEIC, IMG_1.jpg, …) are one photo: metadata comes from
// whichever copy has it (converted copies usually lose GPS), pixels from whichever decodes.
export async function readPhotos(files, onProgress) {
  const groups = new Map();
  const skipped = [];
  for (const f of files) {
    if (f.type.startsWith('video/') || VIDEO.test(f.name)) {
      skipped.push({ name: f.name, reason: 'Video — not supported yet' });
      continue;
    }
    const key = photoKey(f.name);
    if (groups.has(key)) groups.get(key).push(f);
    else groups.set(key, [f]);
  }

  const photos = [];
  let done = 0;
  for (const [key, group] of groups) {
    onProgress?.(++done, groups.size);
    // Try browser-native formats first; HEIC needs the (large, lazily loaded) decoder.
    group.sort((a, b) => isHeicName(a) - isHeicName(b));

    let meta = { lngLat: null, date: null };
    for (const f of group) {
      meta = await readMeta(f);
      if (meta.lngLat) break;
    }
    let image = null;
    for (const f of group) {
      image = await decode(f);
      if (image) break;
    }
    if (!image) {
      skipped.push({ name: group[0].name, reason: 'Could not read this image file' });
      continue;
    }
    photos.push({ key, name: group[0].name, ...image, ...meta, d: null, how: null, note: '' });
  }
  return { photos, skipped };
}

async function readMeta(file) {
  try {
    const m = await exifr.parse(file, { gps: true });
    const hasGps = Number.isFinite(m?.longitude) && !(m.longitude === 0 && m.latitude === 0);
    return { lngLat: hasGps ? [m.longitude, m.latitude] : null, date: exifDate(m) };
  } catch {
    return { lngLat: null, date: null };
  }
}

async function decode(file) {
  let bitmap = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    if (await isHeic(file)) {
      try {
        const { heicTo } = await import('heic-to');
        bitmap = await heicTo({ blob: file, type: 'bitmap' });
      } catch { /* corrupt or unsupported HEIC variant */ }
    }
  }
  if (!bitmap) return null;

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  await img.decode();
  return { url, img };
}

const isHeicName = (f) => /\.hei[cf]$/i.test(f.name);

// Sniff the ISO-BMFF brand rather than trusting the extension: phones often save
// JPEGs named .HEIC and vice versa.
async function isHeic(file) {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const text = String.fromCharCode(...head);
  return text.slice(4, 8) === 'ftyp' && HEIC_BRANDS.includes(text.slice(8, 12));
}

// Assign each photo a distance along the track. GPS wins; otherwise use the
// timestamp shifted by the camera clock offset (hours the camera is ahead).
export function placePhotos(photos, track, offsetHours = 0) {
  for (const p of photos) {
    p.d = null;
    p.how = null;
    p.note = '';
    if (p.lngLat) {
      let best = Infinity, bi = 0;
      track.coords.forEach((c, i) => {
        const dist = haversine(c, p.lngLat);
        if (dist < best) { best = dist; bi = i; }
      });
      if (best < MAX_GPS_DISTANCE) {
        p.d = track.cum[bi];
        p.how = 'gps';
      } else {
        p.note = `Taken ${(best / 1000).toFixed(1)} km away from the track`;
      }
    }
    if (p.d === null && p.date instanceof Date) {
      p.d = distanceAtTime(track, p.date.getTime() - offsetHours * 3600e3);
      if (p.d !== null) p.how = 'time';
      else if (!p.note) p.note = track.hasTime ? 'Taken outside the track’s time range' : 'No GPS, and the track has no times';
    }
    if (p.d === null && !p.note) {
      p.note = 'No GPS or date in the file (converted copies lose them — use the original)';
    }
  }
  photos.sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity));
  return photos.filter((p) => p.d !== null);
}

// EXIF times are wall-clock without a zone; exifr reads them as browser-local.
// If the camera wrote an OffsetTime tag, reinterpret the wall clock in that zone.
function exifDate(meta) {
  const d = meta?.DateTimeOriginal || meta?.CreateDate;
  if (!(d instanceof Date)) return null;
  const m = /^([+-])(\d\d):?(\d\d)$/.exec(meta.OffsetTimeOriginal || meta.OffsetTime || '');
  if (!m) return d;
  const wall = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
  const offsetMin = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
  return new Date(wall - offsetMin * 60e3);
}
