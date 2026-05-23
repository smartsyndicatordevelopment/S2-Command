/**
 * Dynamic Sync Engine -- REST interface
 *
 * POST   /api/integrate/discover          Register a new system and provision its cache table
 * GET    /api/integrate/systems           List all registered systems with status
 * POST   /api/integrate/sync/:systemName  Manually trigger a sync run for one system
 * DELETE /api/integrate/systems/:systemName  Deactivate a system (never drops the table)
 * GET    /api/integrate/query/:tableName  Run a simple JSONB search against a cache table
 */

const router = require('express').Router();
const db     = require('../lib/db');
const {
  sanitizeTableName,
  discoverAndProvision,
  runSyncForSystem,
} = require('../lib/syncEngine');

// ─── POST /api/integrate/discover ────────────────────────────────────────────

router.post('/integrate/discover', async (req, res) => {
  const { system_name, sample_json_payload, fetch_config } = req.body;

  if (!system_name || typeof system_name !== 'string') {
    return res.status(400).json({ error: 'system_name (string) required' });
  }
  if (!sample_json_payload || typeof sample_json_payload !== 'object') {
    return res.status(400).json({ error: 'sample_json_payload (object or array) required' });
  }

  try {
    const result = await discoverAndProvision(
      system_name.trim(),
      sample_json_payload,
      fetch_config || {}
    );
    res.status(201).json(result);
  } catch (err) {
    const isUserError = /already (registered|exists)|empty identifier|unparseable|does not exist in the sample/i.test(err.message);
    res.status(isUserError ? 400 : 500).json({ error: err.message });
  }
});

// ─── GET /api/integrate/systems ──────────────────────────────────────────────

router.get('/integrate/systems', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT system_name, table_name, external_id_field, email_field,
              active, created_at, last_run_at, last_run_status, last_run_count
       FROM sync_registry
       ORDER BY system_name`
    );

    // Augment each row with the live row count from its cache table
    const enriched = await Promise.all(rows.map(async row => {
      let row_count = null;
      try {
        const { rows: cr } = await db.query(
          `SELECT COUNT(*) AS n FROM "${row.table_name}"`
        );
        row_count = parseInt(cr[0].n, 10);
      } catch { /* table may have been manually dropped */ }
      return { ...row, row_count };
    }));

    res.json(enriched);
  } catch (err) {
    console.error('integrate/systems error:', err.message);
    res.status(500).json({ error: 'Failed to list registered systems' });
  }
});

// ─── POST /api/integrate/sync/:systemName ────────────────────────────────────

router.post('/integrate/sync/:systemName', async (req, res) => {
  const { systemName } = req.params;
  try {
    const result = await runSyncForSystem(systemName);
    res.json(result);
  } catch (err) {
    const notFound = /not found or inactive/i.test(err.message);
    res.status(notFound ? 404 : 502).json({ error: err.message });
  }
});

// ─── DELETE /api/integrate/systems/:systemName ────────────────────────────────

router.delete('/integrate/systems/:systemName', async (req, res) => {
  const { systemName } = req.params;
  try {
    const { rowCount } = await db.query(
      'UPDATE sync_registry SET active = false WHERE system_name = $1',
      [systemName]
    );
    if (!rowCount) return res.status(404).json({ error: 'System not found' });

    res.json({
      message: `System '${systemName}' deactivated. Its cache table and data are preserved.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/integrate/query/:systemName ────────────────────────────────────
// Simple JSONB search: ?field=contact.name&value=John
// Uses the GIN index on raw_payload for fast containment lookups.

router.get('/integrate/query/:systemName', async (req, res) => {
  const { systemName } = req.params;
  const { field, value, email, limit = '100' } = req.query;

  try {
    const { rows: reg } = await db.query(
      'SELECT table_name FROM sync_registry WHERE system_name = $1 AND active = true',
      [systemName]
    );
    if (!reg.length) return res.status(404).json({ error: 'System not found or inactive' });

    const tableName = reg[0].table_name;
    const rowLimit  = Math.min(parseInt(limit, 10) || 100, 1000);

    let sql    = `SELECT * FROM "${tableName}" WHERE true`;
    const params = [];

    if (email) {
      params.push(email);
      sql += ` AND associated_email = $${params.length}`;
    }

    if (field && value !== undefined) {
      // Build a JSONB @> containment query -- uses the GIN index
      const parts = field.split('.');
      let jsonbLiteral = JSON.stringify(value);
      for (let i = parts.length - 1; i >= 0; i--) {
        jsonbLiteral = JSON.stringify({ [parts[i]]: JSON.parse(jsonbLiteral) });
      }
      params.push(jsonbLiteral);
      sql += ` AND raw_payload @> $${params.length}::jsonb`;
    }

    sql += ` ORDER BY last_synced_at DESC LIMIT ${rowLimit}`;

    const { rows } = await db.query(sql, params);
    res.json({ system_name: systemName, count: rows.length, results: rows });
  } catch (err) {
    console.error('integrate/query error:', err.message);
    res.status(500).json({ error: 'Query failed' });
  }
});

// ─── GET /api/integrate/preview-table/:systemName ────────────────────────────
// Returns what table name WOULD be generated for a given system_name,
// without creating anything. Useful for the UI to show before confirming.

router.get('/integrate/preview-table/:systemName', (req, res) => {
  try {
    const table = sanitizeTableName(req.params.systemName);
    res.json({ system_name: req.params.systemName, table_name: table });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
