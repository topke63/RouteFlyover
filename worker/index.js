// The site's only server code (Cloudflare Workers): a shared, approximate count of the Esri map
// tiles used this month, so the app can show how many renders the free allowance has left.
// Only /api/* reaches this Worker (see wrangler.jsonc); everything else is static assets.
//
//   GET  /api/usage  → { month, tiles, renders, allowance, rendersLeft }
//   POST /api/usage  body: { tiles, render }  — tiles one page used since its last report;
//                    render: true when they belong to a finished render
const ALLOWANCE = 2_000_000;      // free Esri basemap tiles per month
const PER_RENDER_GUESS = 1000;    // tiles per render until this month has renders to average
const MAX_REPORT = 20_000;        // one report can't add more (a long trip uses a few thousand)

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname !== '/api/usage') return new Response('Not found', { status: 404 });
    const month = new Date().toISOString().slice(0, 7);

    if (request.method === 'POST') {
      const body = await request.json().catch(() => null);
      const tiles = Math.round(Number(body?.tiles));
      if (!(tiles > 0 && tiles <= MAX_REPORT)) return new Response('Bad tile count', { status: 400 });
      await env.DB.prepare(
        `INSERT INTO usage (month, tiles, renders) VALUES (?1, ?2, ?3)
         ON CONFLICT (month) DO UPDATE SET tiles = tiles + ?2, renders = renders + ?3`,
      ).bind(month, tiles, body.render ? 1 : 0).run();
      return new Response(null, { status: 204 });
    }

    if (request.method === 'GET') {
      const row = await env.DB.prepare('SELECT tiles, renders FROM usage WHERE month = ?1').bind(month).first()
        ?? { tiles: 0, renders: 0 };
      // Averaged over everything reported, so tiles from previews without a render count too.
      const perRender = row.renders ? row.tiles / row.renders : PER_RENDER_GUESS;
      return Response.json({
        month, tiles: row.tiles, renders: row.renders, allowance: ALLOWANCE,
        rendersLeft: Math.max(0, Math.floor((ALLOWANCE - row.tiles) / perRender)),
      }, { headers: { 'cache-control': 'no-store' } });
    }

    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, POST' } });
  },
};
