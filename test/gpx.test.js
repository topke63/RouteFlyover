import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trackFromPoints, findDetours, cutDetours, pointAt, distanceAtTime, nearestOnTrack } from '../src/gpx.js';
import { haversine, bearing, extent, tileUrl } from '../src/geo.js';
import { tripStats, fmtKm } from '../src/stats.js';

// Read the sample GPX with a regex so no DOMParser is needed.
const xml = readFileSync(new URL('../samples/stelvio-pass.gpx', import.meta.url), 'utf8');
const pts = [...xml.matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)"><ele>([^<]+)<\/ele><time>([^<]+)<\/time>/g)]
  .map((m) => ({ p: [+m[2], +m[1]], seg: 0, e: +m[3], t: Date.parse(m[4]) }));
const track = trackFromPoints('Stelvio Pass', pts);

// A straight line with a spur out to 600 m and back, then on.
const line = (n, lon0 = 10) => Array.from({ length: n }, (_, i) => ({ p: [lon0 + i * 0.0001, 46], seg: 0, e: 0, t: null }));
const spur = () => {
  const out = line(80), back = line(80).reverse();
  const on = line(80, 10.008 + 0.0001);
  return [...out, ...back.slice(1), ...on];
};

test('geo basics', () => {
  assert.ok(Math.abs(haversine([0, 0], [0, 1]) - 111195) < 100);
  assert.ok(Math.abs(bearing([0, 0], [1, 0]) - 90) < 0.01);
});

test('sample track: sane distance, climb and timing', () => {
  assert.ok(track.total > 5000 && track.total < 100000, `total ${track.total}`);
  assert.ok(track.gain > 500, `gain ${track.gain}`);
  assert.equal(track.hasTime, true);
  assert.ok(track.cum.every((d, i) => i === 0 || d >= track.cum[i - 1]));
  assert.equal(track.cum.length, track.coords.length);
});

test('GPS spike is dropped', () => {
  const bad = pts.map((q) => ({ ...q }));
  const k = 100;
  bad[k].p = [bad[k].p[0] + 0.5, bad[k].p[1] + 0.5]; // ~70 km away for one second
  const t = trackFromPoints('x', bad);
  assert.ok(Math.abs(t.total - track.total) < track.total * 0.02, `${t.total} vs ${track.total}`);
});

test('pointAt interpolates and clamps', () => {
  assert.deepEqual(pointAt(track, -5).lngLat, track.coords[0]);
  assert.equal(pointAt(track, 1e9).d, track.total);
  const mid = pointAt(track, track.total / 2);
  assert.ok(mid.ele >= Math.min(...track.ele) && mid.ele <= Math.max(...track.ele));
});

test('distanceAtTime maps time to distance, null outside slack', () => {
  const t0 = track.time[0], t1 = track.time.at(-1);
  assert.equal(distanceAtTime(track, t0), 0);
  assert.equal(distanceAtTime(track, t1), track.total);
  assert.equal(distanceAtTime(track, t1 + 31 * 60e3), null);
  const half = distanceAtTime(track, (t0 + t1) / 2);
  assert.ok(half > 0 && half < track.total);
});

test('findDetours finds a spur and cutDetours removes it', () => {
  const t = trackFromPoints('spur', spur());
  const det = findDetours(t);
  assert.equal(det.length, 1);
  const cut = cutDetours(t, det);
  assert.ok(cut.total < t.total - 1000, `${cut.total} vs ${t.total}`);
});

test('stats and formatting', () => {
  const rows = Object.fromEntries(tripStats(track, 2));
  assert.equal(rows.Photos, '2');
  assert.ok(rows.Distance.endsWith('km'));
  assert.equal(fmtKm(500), '500 m');
  assert.equal(fmtKm(12345), '12.3 km');
});

test('extent handles arrays too long for Math.min(...arr)', () => {
  const big = Array.from({ length: 500_000 }, (_, i) => i - 10);
  assert.deepEqual(extent(big), [-10, 499_989]);
});

test('nearestOnTrack projects onto the segment, not the nearest vertex', () => {
  // Two points 2 km apart; a photo beside the middle is ~1 km along, not at either end.
  const t = trackFromPoints('s', [
    { p: [10, 46], seg: 0, e: 0, t: null },
    { p: [10.0259, 46], seg: 0, e: 0, t: null },
  ]);
  const r = nearestOnTrack(t, [10.01295, 46.0001]);
  assert.ok(Math.abs(r.d - t.total / 2) < 5, `${r.d} vs ${t.total / 2}`);
  assert.ok(r.dist < 15);
});

test('route across the antimeridian gets a small bounding box', () => {
  const t = trackFromPoints('fiji', [
    { p: [179.9, -17], seg: 0, e: 0, t: null },
    { p: [-179.9, -17], seg: 0, e: 0, t: null },
  ]);
  assert.ok(t.bounds[1][0] - t.bounds[0][0] < 1, JSON.stringify(t.bounds));
});

test('tileUrl wraps x around the globe', () => {
  assert.equal(tileUrl('{z}/{x}/{y}', 3, 8, 2), '3/0/2');
  assert.equal(tileUrl('{z}/{x}/{y}', 3, -1, 2), '3/7/2');
});
