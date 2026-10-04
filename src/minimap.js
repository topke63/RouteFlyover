// Small flat street map of the whole route for the intro card, stitched from map tiles
// into a square canvas.
// With an ArcGIS API key: Esri's key-based static basemap tiles (512 px); without: the public
// World Street Map (256 px). See the satellite source in main.js.
const ARCGIS_KEY = import.meta.env.VITE_ARCGIS_KEY;
const TILES = ARCGIS_KEY
  ? `https://static-map-tiles-api.arcgis.com/arcgis/rest/services/static-basemap-tiles-service/v1/arcgis/streets/static/tile/{z}/{y}/{x}?token=${encodeURIComponent(ARCGIS_KEY)}`
  : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
const TILE = ARCGIS_KEY ? 512 : 256; // tile size in px
const SIZE = 512;  // output px
const PAD = 0.18;  // fraction of the frame left around the route

const worldPx = ([lng, lat], z) => {
  const s = TILE * 2 ** z, r = (lat * Math.PI) / 180;
  return [((lng + 180) / 360) * s, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s];
};

export async function renderMinimap(track) {
  const [[w, s], [e, n]] = track.bounds;
  // Largest zoom where the route (plus padding) still fits in the square.
  let z = 14;
  for (; z > 1; z--) {
    const [x0, y0] = worldPx([w, n], z), [x1, y1] = worldPx([e, s], z);
    if (Math.max(x1 - x0, y1 - y0) <= SIZE * (1 - PAD * 2)) break;
  }
  const [x0, y0] = worldPx([w, n], z), [x1, y1] = worldPx([e, s], z);
  const left = (x0 + x1) / 2 - SIZE / 2, top = (y0 + y1) / 2 - SIZE / 2;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#eceae4';
  ctx.fillRect(0, 0, SIZE, SIZE);

  const loads = [];
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + SIZE) / TILE); tx++) {
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + SIZE) / TILE); ty++) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = TILES.replace('{z}', z).replace('{x}', tx).replace('{y}', ty);
      loads.push(img.decode().then(() => ctx.drawImage(img, tx * TILE - left, ty * TILE - top)).catch(() => {}));
    }
  }
  await Promise.all(loads);

  const pts = track.coords.map((c) => {
    const [x, y] = worldPx(c, z);
    return [x - left, y - top];
  });
  const line = new Path2D();
  pts.forEach(([x, y], i) => (i ? line.lineTo(x, y) : line.moveTo(x, y)));
  ctx.lineJoin = ctx.lineCap = 'round';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 9;
  ctx.stroke(line);
  ctx.strokeStyle = '#ff5a1f';
  ctx.lineWidth = 5;
  ctx.stroke(line);
  for (const [[x, y], color] of [[pts[0], '#0d1524'], [pts.at(-1), '#ff3d6e']]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 6.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillText('© Esri', 8, SIZE - 8);
  return canvas;
}
