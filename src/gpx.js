import { haversine } from './geo.js';

const child = (el, tag) => el.getElementsByTagName(tag)[0]?.textContent?.trim();

export function parseGpx(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Not a valid GPX/XML file');

  let nodes = [...doc.getElementsByTagName('trkpt')];
  if (nodes.length < 2) nodes = [...doc.getElementsByTagName('rtept')];
  if (nodes.length < 2) throw new Error('GPX has no track or route points');

  const trk = doc.getElementsByTagName('trk')[0] || doc.getElementsByTagName('rte')[0];
  const name = (trk && child(trk, 'name')) || 'Untitled route';

  const coords = [], ele = [], time = [];
  for (const n of nodes) {
    const p = [parseFloat(n.getAttribute('lon')), parseFloat(n.getAttribute('lat'))];
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    // Drop near-duplicate points; they create zero-length segments and jittery bearings.
    if (coords.length && haversine(coords[coords.length - 1], p) < 0.5) continue;
    coords.push(p);
    const e = parseFloat(child(n, 'ele'));
    ele.push(Number.isFinite(e) ? e : null);
    const t = Date.parse(child(n, 'time') ?? '');
    time.push(Number.isFinite(t) ? t : null);
  }
  if (coords.length < 2) throw new Error('GPX track is too short');

  fillGaps(ele);
  return buildTrack(name, coords, ele, time);
}

function buildTrack(name, coords, ele, time) {
  const hasTime = time.every((t) => t !== null);

  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));

  // Elevation gain/loss with a 3 m hysteresis to ignore GPS noise; gainCum[i] is the climb so far.
  let gain = 0, loss = 0, ref = ele[0];
  const gainCum = [];
  for (const e of ele) {
    if (e - ref > 3) { gain += e - ref; ref = e; } else if (ref - e > 3) { loss += ref - e; ref = e; }
    gainCum.push(gain);
  }

  const lngs = coords.map((c) => c[0]), lats = coords.map((c) => c[1]);
  return {
    name, coords, ele, time, cum, hasTime, gain, loss, gainCum,
    total: cum[cum.length - 1],
    duration: hasTime ? time[time.length - 1] - time[0] : null,
    bounds: [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
  };
}

// Out-and-back spurs: the route drives down a road, turns around and comes back the same
// way. Route planners (e.g. Kurviger) make these when a stop sits off the intended road.
const SPUR_PROBE = 150;   // m either side of a turnaround that must lie on the same road
const SPUR_MATCH = 60;    // m apart the way out and the way back may be (divided roads)
const SPUR_STEP = 25;     // m
const SPUR_GAP = 150;     // m of unmatched road tolerated before the spur is considered over
const SPUR_MIN = 250;     // m each way; shorter turnarounds aren't listed

// Detours as { start, apex, end } distances (m) along the track, in route order.
export function findDetours(track) {
  const at = (d) => pointAt(track, d).lngLat;
  const detours = [];
  let d = SPUR_PROBE;
  while (d <= track.total - SPUR_PROBE) {
    if (haversine(at(d - SPUR_PROBE), at(d + SPUR_PROBE)) > SPUR_MATCH * 0.6) { d += SPUR_STEP; continue; }
    // The turnaround is where the way out and the way back are closest.
    let apex = d, best = Infinity;
    for (let a = d; a <= Math.min(d + 1000, track.total - SPUR_PROBE); a += SPUR_STEP / 5) {
      const gap = haversine(at(a - SPUR_PROBE), at(a + SPUR_PROBE));
      if (gap < best) { best = gap; apex = a; } else if (gap > SPUR_MATCH) break;
    }
    // Walk back along the way out, matching each point to the nearest one on the way back.
    let start = apex, end = apex, fwd = apex, miss = 0;
    for (let back = apex - SPUR_STEP; back >= 0 && miss < SPUR_GAP; back -= SPUR_STEP) {
      const p = at(back);
      let near = Infinity, nearD = fwd;
      for (let f = fwd; f <= Math.min(fwd + SPUR_GAP + SPUR_STEP * 2, track.total); f += SPUR_STEP / 2.5) {
        const g = haversine(p, at(f));
        if (g < near) { near = g; nearD = f; }
      }
      if (near < SPUR_MATCH) { start = back; end = fwd = nearD; miss = 0; } else miss += SPUR_STEP;
    }
    // A route that is one big out-and-back has nothing left once the spur is cut.
    const wholeRoute = start <= SPUR_STEP && end >= track.total - SPUR_STEP;
    if (apex - start >= SPUR_MIN && end - apex >= SPUR_MIN && !wholeRoute) detours.push({ start, apex, end });
    d = Math.max(end, apex) + SPUR_STEP;
  }
  return detours;
}

// A copy of the track with the given detours left out; the way on joins where each one began.
export function cutDetours(track, detours) {
  if (!detours.length) return track;
  const keep = [];
  let i = 0;
  for (const { start, end } of [...detours].sort((a, b) => a.start - b.start)) {
    const from = segmentAt(track.cum, start), to = segmentAt(track.cum, end) + 1;
    for (; i <= from; i++) keep.push(i);
    i = Math.max(i, to);
  }
  for (; i < track.coords.length; i++) keep.push(i);
  const pick = (arr) => keep.map((k) => arr[k]);
  return buildTrack(track.name, pick(track.coords), pick(track.ele), pick(track.time));
}

function fillGaps(arr) {
  const first = arr.find((v) => v !== null) ?? 0;
  let last = first;
  for (let i = 0; i < arr.length; i++) arr[i] === null ? (arr[i] = last) : (last = arr[i]);
}

// Index i such that cum[i] <= d < cum[i+1].
function segmentAt(cum, d) {
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    cum[mid] <= d ? (lo = mid) : (hi = mid);
  }
  return lo;
}

// Interpolated position at distance d (meters) along the track.
export function pointAt(track, d) {
  d = Math.max(0, Math.min(track.total, d));
  const i = segmentAt(track.cum, d);
  const j = Math.min(i + 1, track.coords.length - 1);
  const span = track.cum[j] - track.cum[i];
  const t = span > 0 ? (d - track.cum[i]) / span : 0;
  const a = track.coords[i], b = track.coords[j];
  return {
    lngLat: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
    ele: track.ele[i] + (track.ele[j] - track.ele[i]) * t,
    time: track.hasTime ? track.time[i] + (track.time[j] - track.time[i]) * t : null,
    gain: track.gainCum[i] + (track.gainCum[j] - track.gainCum[i]) * t,
    d,
  };
}

// Distance along the track at timestamp ms, or null if outside the recording.
export function distanceAtTime(track, ms, slackMs = 30 * 60e3) {
  if (!track.hasTime) return null;
  const t = track.time;
  if (ms < t[0] - slackMs || ms > t[t.length - 1] + slackMs) return null;
  if (ms <= t[0]) return 0;
  if (ms >= t[t.length - 1]) return track.total;
  const i = segmentAt(t, ms);
  const span = t[i + 1] - t[i];
  return track.cum[i] + (span > 0 ? ((ms - t[i]) / span) * (track.cum[i + 1] - track.cum[i]) : 0);
}
