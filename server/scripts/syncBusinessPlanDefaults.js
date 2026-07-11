// One-off sync: overwrite the live business_plan row's sections with the
// current code defaults (DEFAULT_PLAN in routes/businessPlan.js).
//
// Needed because readPlan() backfills MISSING sections only -- once a section
// exists in the DB row, updated code defaults never reach it. Run this after
// editing DEFAULT_PLAN when the live plan should match the code.
//
// WARNING: this replaces any agent edits made to these sections in prod.
//
// Usage (against Railway Postgres):
//   railway run node server/scripts/syncBusinessPlanDefaults.js
// Or locally with DATABASE_URL set:
//   node server/scripts/syncBusinessPlanDefaults.js
//
// Sync only specific sections by passing them as args:
//   node server/scripts/syncBusinessPlanDefaults.js phases risks

const { DEFAULT_PLAN, EDITABLE_SECTIONS, updatePlan } = require('../routes/businessPlan');
const { getPool } = require('../lib/db');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set -- aborting.');
    process.exit(1);
  }

  const requested = process.argv.slice(2);
  const sections = requested.length ? requested : EDITABLE_SECTIONS;
  const invalid = sections.filter(s => !EDITABLE_SECTIONS.includes(s));
  if (invalid.length) {
    console.error(`Unknown section(s): ${invalid.join(', ')}. Valid: ${EDITABLE_SECTIONS.join(', ')}`);
    process.exit(1);
  }

  const partial = {};
  for (const s of sections) partial[s] = DEFAULT_PLAN[s];

  const saved = await updatePlan(partial);
  console.log(`Synced sections from code defaults: ${sections.join(', ')}`);
  console.log(`Plan now has sections: ${Object.keys(saved).join(', ')}`);
  await getPool().end();
}

main().catch(err => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
