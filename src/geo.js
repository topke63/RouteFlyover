// Small spherical-earth helpers. Coordinates are [lng, lat].
const R = 6371008.8;
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

export function haversine(a, b) {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearing(a, b) {
  const φ1 = toRad(a[1]), φ2 = toRad(b[1]), Δλ = toRad(b[0] - a[0]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function destination(p, brg, dist) {
  const δ = dist / R, θ = toRad(brg), φ1 = toRad(p[1]), λ1 = toRad(p[0]);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [toDeg(λ2), toDeg(φ2)];
}

// Interpolate between angles along the shortest arc.
export function lerpAngle(a, b, t) {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}

// [min, max] of an array. Math.min(...arr) throws on very long arrays.
export function extent(arr) {
  let lo = Infinity, hi = -Infinity;
  for (const v of arr) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return [lo, hi];
}

// Web Mercator: [lng, lat] → pixel position in a square world `size` px wide.
export function worldXY([lng, lat], size) {
  const r = toRad(lat);
  return [((lng + 180) / 360) * size, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * size];
}

// Fill a {z}/{x}/{y} tile URL template.
// x wraps around the globe, so routes past ±180° still get valid tiles.
export const tileUrl = (tpl, z, x, y) => tpl.replace('{z}', z).replace('{x}', ((x % 2 ** z) + 2 ** z) % 2 ** z).replace('{y}', y);
