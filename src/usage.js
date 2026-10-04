// Shared count of the Esri map tiles used this month (server side: worker/index.js). Counts the
// tiles this page requested, reports them, and shows how many renders the free allowance has
// left. Only on the hosted site with an ArcGIS key: locally there is no /api/usage.
const ENABLED = Boolean(import.meta.env.VITE_ARCGIS_KEY) && !import.meta.env.DEV;
const ESRI_HOSTS = ['ibasemaps-api.arcgis.com', 'static-map-tiles-api.arcgis.com'];

const seen = new Set(); // tile URLs this page requested; repeats come from the browser cache
let reported = 0;

export function initUsage(el) {
  if (!ENABLED) return;
  performance.setResourceTimingBufferSize(100_000);
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (ESRI_HOSTS.includes(new URL(e.name).host)) seen.add(e.name);
    }
  }).observe({ type: 'resource', buffered: true });
  // Tiles from a preview without a render (or a cancelled render) still count.
  addEventListener('pagehide', () => {
    const tiles = seen.size - reported;
    if (tiles > 0) navigator.sendBeacon('/api/usage', new Blob([JSON.stringify({ tiles })], { type: 'application/json' }));
    reported = seen.size;
  });
  showUsage(el);
}

// After a finished render: report its tiles, then refresh the line.
export async function reportRender(el) {
  if (!ENABLED) return;
  const tiles = seen.size - reported;
  reported = seen.size;
  if (tiles > 0) {
    await fetch('/api/usage', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tiles, render: true }), keepalive: true,
    }).catch(() => {});
  }
  showUsage(el);
}

async function showUsage(el) {
  try {
    const res = await fetch('/api/usage');
    if (!res.ok) return;
    const { rendersLeft } = await res.json();
    el.textContent = rendersLeft > 0
      ? `Free map allowance: ≈ ${rendersLeft.toLocaleString('en')} renders left this month`
      : 'The free map allowance is used up this month — satellite imagery may stop loading until next month.';
    el.hidden = false;
  } catch {
    // No counter (e.g. offline): just don't show the line.
  }
}
