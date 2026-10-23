// express-rate-limit store kept in Postgres so limits hold across many app copies and restarts
// (the default store counts in one process's memory).
const db = require('./db');

class PgStore {
  constructor(prefix) {
    this.prefix = prefix;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  k(key) {
    return `${this.prefix}:${key}`;
  }

  async increment(key) {
    const { rows } = await db.query(
      `INSERT INTO rate_limit_hits (key, hits, reset_at)
       VALUES ($1, 1, now() + ($2 || ' milliseconds')::interval)
       ON CONFLICT (key) DO UPDATE SET
         hits     = CASE WHEN rate_limit_hits.reset_at <= now() THEN 1 ELSE rate_limit_hits.hits + 1 END,
         reset_at = CASE WHEN rate_limit_hits.reset_at <= now()
                         THEN now() + ($2 || ' milliseconds')::interval ELSE rate_limit_hits.reset_at END
       RETURNING hits, reset_at`,
      [this.k(key), String(this.windowMs)]
    );
    return { totalHits: rows[0].hits, resetTime: new Date(rows[0].reset_at) };
  }

  async decrement(key) {
    await db.query('UPDATE rate_limit_hits SET hits = GREATEST(hits - 1, 0) WHERE key = $1', [this.k(key)]);
  }

  async resetKey(key) {
    await db.query('DELETE FROM rate_limit_hits WHERE key = $1', [this.k(key)]);
  }

  // Called from the scheduled job to drop finished windows.
  static async sweep() {
    await db.query('DELETE FROM rate_limit_hits WHERE reset_at < now() - interval \'1 hour\'');
    await db.query('DELETE FROM recat_previews WHERE created_at < now() - interval \'1 hour\'');
  }
}

module.exports = { PgStore };
