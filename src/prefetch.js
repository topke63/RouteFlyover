// Warms the browser HTTP cache with tiles for the stretch of route the camera is about
// to reach, so MapLibre finds them locally instead of waiting on the network.
import { pointAt } from './gpx.js';
import { worldXY, tileUrl } from './geo.js';

const MAX_IN_FLIGHT = 8; // leave most connections free for tiles needed right now

const tileXY = (p, z) => worldXY(p, 2 ** z).map(Math.floor);

export class TilePrefetcher {
  // sources: [{ urls: [...templates], levels: [[zoom, radius in tiles around each point], ...] }]
  constructor(sources) {
    this.sources = sources;
    this.seen = new Set();
    this.queue = [];
    this.inFlight = 0;
  }

  // Queue tiles around route points between distances `from` and `to` (meters).
  around(track, from, to, step = 400) {
    for (let d = from; d <= Math.min(to, track.total); d += step) {
      const p = pointAt(track, d).lngLat;
      for (const src of this.sources) {
        for (const [z, radius] of src.levels) {
          const [cx, cy] = tileXY(p, z);
          for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
              const x = cx + dx, y = cy + dy;
              // Same template choice MapLibre makes, so the cached URL is the one it requests.
              const tpl = src.urls[(x + y) % src.urls.length];
              const url = tileUrl(tpl, z, x, y);
              if (this.seen.has(url)) continue;
              this.seen.add(url);
              this.queue.push(url);
            }
          }
        }
      }
    }
    this.pump();
  }

  // Queue every tile covering a bounding box ([[w, s], [e, n]]) at the given zooms, with a margin.
  area([[w, s], [e, n]], zooms, urls) {
    for (const z of zooms) {
      const [x0, y0] = tileXY([w, n], z), [x1, y1] = tileXY([e, s], z);
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        for (let y = y0 - 1; y <= y1 + 1; y++) {
          const url = tileUrl(urls[(x + y) % urls.length], z, x, y);
          if (!this.seen.has(url)) {
            this.seen.add(url);
            this.queue.push(url);
          }
        }
      }
    }
    this.pump();
  }

  clear() {
    this.queue.length = 0;
  }

  pump() {
    while (this.inFlight < MAX_IN_FLIGHT && this.queue.length) {
      const url = this.queue.shift();
      this.inFlight++;
      fetch(url, { mode: 'cors', credentials: 'same-origin' })
        .then((r) => r.arrayBuffer())
        .catch(() => this.seen.delete(url))
        .finally(() => { this.inFlight--; this.pump(); });
    }
  }
}
