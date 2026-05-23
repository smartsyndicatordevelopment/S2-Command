/**
 * Metrics cache backed by the server_cache Postgres table.
 *
 * get(key)       -- returns { data, computedAt } or null on miss
 * set(key, data) -- upserts the cache row
 * warmAll()      -- refreshes all expensive metrics; called on startup and by the sync runner
 */

const db = require('./db');

async function get(key) {
  try {
    const { rows } = await db.query(
      'SELECT data, computed_at FROM server_cache WHERE key = $1',
      [key]
    );
    if (!rows.length) return null;
    return { data: rows[0].data, computedAt: rows[0].computed_at };
  } catch {
    return null;
  }
}

async function set(key, data) {
  try {
    await db.query(
      `INSERT INTO server_cache (key, data, computed_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, computed_at = now()`,
      [key, JSON.stringify(data)]
    );
  } catch (err) {
    console.error('[MetricsCache] set error:', err.message);
  }
}

// Lazy-required to avoid circular deps at module load time
async function warmAll() {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.DATABASE_URL) {
    return;
  }
  try {
    console.log('[MetricsCache] Warming metrics cache...');
    const { computeSubscriptions, computeRevenue } = require('../routes/stripe');
    const [subs, rev] = await Promise.allSettled([computeSubscriptions(), computeRevenue()]);

    if (subs.status === 'fulfilled') {
      await set('stripe:subscriptions', subs.value);
      console.log('[MetricsCache] stripe:subscriptions cached');
    } else {
      console.error('[MetricsCache] stripe:subscriptions failed:', subs.reason?.message);
    }

    if (rev.status === 'fulfilled') {
      await set('stripe:revenue', rev.value);
      console.log('[MetricsCache] stripe:revenue cached');
    } else {
      console.error('[MetricsCache] stripe:revenue failed:', rev.reason?.message);
    }
  } catch (err) {
    console.error('[MetricsCache] warmAll error:', err.message);
  }
}

module.exports = { get, set, warmAll };
