// What the Node server does with timers, as one function a Cloudflare Cron Trigger can call.
// The Worker runs it every 15 minutes (wrangler.jsonc) only when JOBS_ENABLED=1, so a parallel copy of the app never
// syncs or warms alongside the host that is still live.
const { runAllSyncs } = require('./syncEngine');
const { warmAll } = require('./metricsCache');
const { PgStore } = require('./rateLimitStore');

async function runScheduledJobs() {
  try {
    const results = await runAllSyncs();
    const ok = results.filter(r => r.status === 'ok').length;
    const err = results.filter(r => r.status === 'error').length;
    console.log(`[SyncEngine] Completed: ${ok} ok, ${err} errors`);
  } catch (e) {
    console.error('[SyncEngine] runAllSyncs failed:', e.message);
  }
  await warmAll().catch(() => {});
  await PgStore.sweep().catch(() => {});
}

module.exports = { runScheduledJobs };
