import './env.js';
import path from 'node:path';
import { Readable } from 'node:stream';
import { env as bindings } from 'cloudflare:workers';
import { httpServerHandler } from 'cloudflare:node';
import mime from 'mime';
import rangeParser from 'range-parser';
import appModule from '../server/app.js';
import dbModule from '../server/lib/db.js';
import jobsModule from '../server/lib/scheduledJobs.js';

const { app } = appModule;
const { makePool, runWithPool } = dbModule;
const { runScheduledJobs } = jobsModule;

// Hyperdrive's own endpoint speaks plain Postgres to the Worker (it holds the encrypted link to PlanetScale).
const requestPool = (max) => makePool(bindings.HYPERDRIVE.connectionString, { noSsl: true, pool: { max } });

/** Serves the built client from the assets binding with the rules the Node server applies to client/dist. */
function mountClient() {
  const fetchAsset = (target, req) => {
    const headers = new Headers();
    for (const name of ['if-none-match', 'range', 'if-range']) {
      const value = req.headers[name];
      if (typeof value === 'string') headers.set(name, value);
    }
    return bindings.ASSETS.fetch(new Request(new URL(target, 'https://assets.invalid'), { headers }));
  };
  app.get('*', async (req, res) => {
    // Same as express.static followed by the index.html fallback.
    let target = req.path;
    let asset = path.extname(target) ? await fetchAsset(target, req) : undefined;
    if (!asset || asset.status === 404) {
      target = '/index.html';
      asset = await fetchAsset(target, req);
    }
    if (asset.status === 404) {
      res.status(404).type('text/plain').send('Not found');
      return;
    }
    res.status(asset.status);
    for (const name of ['content-length', 'content-range', 'etag']) {
      const value = asset.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    const type = mime.lookup(target);
    const charset = mime.charsets.lookup(type, '');
    res.setHeader('Content-Type', type + (charset ? `; charset=${charset}` : ''));
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=0');
    if (!asset.body || asset.status === 304) {
      res.end();
      return;
    }
    const rangeHeader = req.headers.range;
    if (asset.status === 200 && typeof rangeHeader === 'string') {
      const whole = Buffer.from(await asset.arrayBuffer());
      const ranges = rangeParser(whole.length, rangeHeader, { combine: true });
      if (ranges === -1) {
        res.removeHeader('Content-Length');
        res.status(416).setHeader('Content-Range', `bytes */${whole.length}`);
        res.end();
        return;
      }
      if (Array.isArray(ranges) && ranges.length === 1) {
        const { start, end } = ranges[0];
        res.status(206).setHeader('Content-Range', `bytes ${start}-${end}/${whole.length}`);
        res.setHeader('Content-Length', end - start + 1);
        res.end(whole.subarray(start, end + 1));
        return;
      }
      res.end(whole);
      return;
    }
    Readable.fromWeb(asset.body).pipe(res);
  });
}

mountClient();
app.listen(3000);
const handler = httpServerHandler({ port: 3000 });

export default {
  async fetch(request, env, ctx) {
    // The app trusts one proxy hop. Cloudflare puts the real client address in CF-Connecting-IP (never set by the
    // visitor), so it becomes the only X-Forwarded-For value; all traffic reaching the Worker is HTTPS.
    const headers = new Headers(request.headers);
    const ip = headers.get('cf-connecting-ip');
    if (ip) headers.set('x-forwarded-for', ip);
    else headers.delete('x-forwarded-for');
    headers.delete('x-real-ip');
    headers.set('x-forwarded-proto', 'https');
    const req = new Request(request, { headers });

    // A database connection may not be shared between requests on Workers: each request gets its own small pool,
    // closed after the response.
    const pool = requestPool(5);
    const close = () => ctx.waitUntil(pool.end().catch(() => {}));
    let response;
    try {
      response = await runWithPool(pool, () => handler.fetch(req, env, ctx));
    } catch (e) {
      close();
      throw e;
    }
    close();
    return response;
  },

  // The Node server runs the sync engine every 15 minutes with a timer; this Cron Trigger replaces it. It does nothing
  // until JOBS_ENABLED=1 is set at the cutover, so a parallel copy never syncs beside the host that is still live.
  async scheduled(_event, env, ctx) {
    if (env.JOBS_ENABLED !== '1') return;
    const pool = requestPool(3);
    ctx.waitUntil(
      runWithPool(pool, () => runScheduledJobs())
        .catch((e) => console.error('Scheduled jobs failed:', e instanceof Error ? e.message : e))
        .finally(() => pool.end().catch(() => {})),
    );
  },
};
