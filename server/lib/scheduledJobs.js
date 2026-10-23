// What the Node server does with timers, as one function a Cloudflare Cron Trigger can call.
// The Worker runs it every 15 minutes (wrangler.jsonc) only when JOBS_ENABLED=1, so a parallel copy of the app never
// syncs or warms alongside the host that is still live.
const { runAllSyncs } = require('./syncEngine');
const { warmAll, set: cacheSet } = require('./metricsCache');
const { PgStore } = require('./rateLimitStore');

async function runScheduledJobs() {
  const startedAt = new Date().toISOString();
  let syncs = { ok: 0, error: 0 };
  try {
    const results = (await runAllSyncs()) || [];
    syncs = {
      ok: results.filter(r => r.status === 'ok').length,
      error: results.filter(r => r.status === 'error').length,
    };
    console.log(`[SyncEngine] Completed: ${syncs.ok} ok, ${syncs.error} errors`);
  } catch (e) {
    console.error('[SyncEngine] runAllSyncs failed:', e.message);
    syncs.failed = e.message;
  }
  await warmAll().catch(() => {});
  await PgStore.sweep().catch(() => {});
  // A heartbeat so it is visible (in the database, and to anyone checking) that the schedule is really running.
  await cacheSet('scheduled_jobs_last_run', { startedAt, finishedAt: new Date().toISOString(), syncs });
}

module.exports = { runScheduledJobs };
