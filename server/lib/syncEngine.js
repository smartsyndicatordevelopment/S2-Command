/**
 * Dynamic Sync Engine -- Hybrid Schema Architecture
 *
 * Workflow:
 *   1. Discovery: caller POSTs a system_name + sample_json_payload
 *   2. Claude identifies ONLY which fields map to external_id and email
 *   3. Backend sanitizes table name deterministically (never from Claude)
 *   4. information_schema guard blocks creation if the table already exists
 *   5. Fixed 5-column DDL + GIN index execute in a transaction
 *   6. Sync runner loops sync_registry and upserts via ON CONFLICT
 */

const Anthropic = require('@anthropic-ai/sdk');
const fetch     = require('node-fetch');
const db        = require('./db');

// ─── Name sanitization -- deterministic, no LLM involvement ──────────────────

function sanitizeTableName(systemName) {
  const clean = String(systemName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')  // collapse any non-alphanum run into _
    .replace(/^_+|_+$/g, '');      // trim leading/trailing underscores
  if (!clean) throw new Error('system_name produces an empty identifier after sanitization');
  return `cache_${clean}`;
}

// ─── Env-var interpolation for fetch configs ──────────────────────────────────

function resolveEnvTokens(str) {
  return String(str).replace(/\{([A-Z0-9_]+)\}/g, (_, name) => process.env[name] || '');
}

function resolveConfig(fetchConfig) {
  const cfg = JSON.parse(JSON.stringify(fetchConfig)); // deep clone

  if (cfg.url)   cfg.url   = resolveEnvTokens(cfg.url);
  if (cfg.query_params) {
    for (const k of Object.keys(cfg.query_params)) {
      cfg.query_params[k] = resolveEnvTokens(cfg.query_params[k]);
    }
  }
  return cfg;
}

// ─── JSONPath resolver (dot-notation, e.g. "contact.id") ─────────────────────

function getNestedValue(obj, path) {
  if (!path) return undefined;
  return path.split('.').reduce((cur, key) => (cur != null ? cur[key] : undefined), obj);
}

// ─── information_schema guard ─────────────────────────────────────────────────

async function tableExists(tableName) {
  const { rows } = await db.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return rows.length > 0;
}

// ─── Claude orchestration -- field mapping ONLY ───────────────────────────────

async function analyzePayloadWithClaude(samplePayload) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Normalize: if the payload is an array, inspect the first element
  const record = Array.isArray(samplePayload) ? samplePayload[0] : samplePayload;
  if (!record || typeof record !== 'object') {
    throw new Error('sample_json_payload must be a JSON object or a non-empty array of objects');
  }

  const prompt = `You are a database schema analyst. Inspect the following JSON record from an external API and identify exactly two things:

1. The field path that uniquely identifies each record (the primary key / ID field).
2. The field path that contains an email address, if one exists. If none exists, use null.

Field paths use dot notation for nested fields (e.g. "contact.id" or "user.email").

RESPOND WITH ONLY valid JSON in this exact shape -- no markdown, no explanation:
{"external_id_path":"<dot.notation.path>","email_path":"<dot.notation.path or null>"}

JSON record to analyze:
${JSON.stringify(record, null, 2)}`;

  const resp = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages:   [{ role: 'user', content: prompt }],
  });

  const text = resp.content.find(b => b.type === 'text')?.text?.trim() || '';

  // Strict parse -- never eval, never trust raw output
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Claude returned unparseable response: ${text.slice(0, 200)}`);
  }

  if (typeof parsed.external_id_path !== 'string' || !parsed.external_id_path) {
    throw new Error(`Claude response missing required 'external_id_path': ${text.slice(0, 200)}`);
  }

  // Validate the claimed paths actually exist in the record
  const idValue = getNestedValue(record, parsed.external_id_path);
  if (idValue === undefined) {
    throw new Error(`Claude suggested external_id_path '${parsed.external_id_path}' but that field does not exist in the sample record`);
  }

  return {
    external_id_field: parsed.external_id_path,
    email_field:       parsed.email_path && parsed.email_path !== 'null' ? parsed.email_path : null,
  };
}

// ─── Fixed DDL with GIN index -- no dynamic column types ─────────────────────

async function createCacheTable(tableName) {
  // Hard block: never overwrite existing data structures
  if (await tableExists(tableName)) {
    throw new Error(`Table '${tableName}' already exists -- creation blocked to protect existing data`);
  }

  // Identifiers are already sanitized (only [a-z0-9_] with cache_ prefix).
  // Wrapping in double-quotes is still best practice for DDL.
  const t = `"${tableName}"`;

  await db.query(`
    CREATE TABLE ${t} (
      id               SERIAL PRIMARY KEY,
      external_id      VARCHAR(255) UNIQUE NOT NULL,
      associated_email VARCHAR(255),
      raw_payload      JSONB NOT NULL,
      last_synced_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`CREATE INDEX "${tableName}_email_idx" ON ${t}(associated_email)`);
  await db.query(`CREATE INDEX "${tableName}_gin_idx"   ON ${t} USING GIN(raw_payload)`);
}

// ─── Discovery -- end-to-end entrypoint called by the route ──────────────────

async function discoverAndProvision(systemName, samplePayload, fetchConfig = {}) {
  // Step 1: deterministic sanitization -- Claude never touches this
  const tableName = sanitizeTableName(systemName);

  // Step 2: guard -- block if system already registered
  const { rows: existing } = await db.query(
    'SELECT 1 FROM sync_registry WHERE system_name = $1',
    [systemName]
  );
  if (existing.length) {
    throw new Error(`System '${systemName}' is already registered`);
  }

  // Step 3: Claude identifies field paths (stochastic layer)
  const { external_id_field, email_field } = await analyzePayloadWithClaude(samplePayload);

  // Step 4: DDL with information_schema guard (deterministic layer)
  await createCacheTable(tableName);

  // Step 5: register in sync_registry
  const { rows } = await db.query(
    `INSERT INTO sync_registry
       (system_name, table_name, external_id_field, email_field, fetch_config)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [systemName, tableName, external_id_field, email_field, JSON.stringify(fetchConfig)]
  );

  return {
    system_name:        rows[0].system_name,
    table_name:         rows[0].table_name,
    external_id_field:  rows[0].external_id_field,
    email_field:        rows[0].email_field,
    message:            `Table '${tableName}' created with GIN index on raw_payload`,
  };
}

// ─── Sync runner -- universal worker ─────────────────────────────────────────

async function fetchRecordsForSystem(reg) {
  const cfg = resolveConfig(reg.fetch_config);

  if (!cfg.url) {
    throw new Error(`No fetch URL configured for system '${reg.system_name}'`);
  }

  // Build query string
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(cfg.query_params || {})) {
    if (v) qs.append(k, v);
  }
  const url = qs.toString() ? `${cfg.url}?${qs.toString()}` : cfg.url;

  // Build auth header
  const headers = { 'Content-Type': 'application/json', ...(cfg.extra_headers || {}) };
  if (cfg.auth_env_var) {
    const token = process.env[cfg.auth_env_var] || '';
    const prefix = cfg.auth_prefix != null ? cfg.auth_prefix : 'Bearer ';
    headers[cfg.auth_header || 'Authorization'] = `${prefix}${token}`;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r    = await fetch(url, { method: cfg.method || 'GET', headers });
      const data = await r.json();

      // Extract the records array from the response using data_path
      let records = data;
      if (cfg.data_path) {
        records = getNestedValue(data, cfg.data_path);
      }
      if (!Array.isArray(records)) {
        throw new Error(`data_path '${cfg.data_path}' did not resolve to an array (got ${typeof records})`);
      }
      return records;
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

async function upsertRecords(reg, records) {
  const table = `"${reg.table_name}"`;
  let count   = 0;

  for (const record of records) {
    const externalId = String(getNestedValue(record, reg.external_id_field) ?? '');
    if (!externalId) continue;

    const email = reg.email_field
      ? (getNestedValue(record, reg.email_field) ?? null)
      : null;

    await db.query(
      `INSERT INTO ${table} (external_id, associated_email, raw_payload, last_synced_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (external_id) DO UPDATE SET
         associated_email = EXCLUDED.associated_email,
         raw_payload      = EXCLUDED.raw_payload,
         last_synced_at   = CURRENT_TIMESTAMP`,
      [externalId, email, JSON.stringify(record)]
    );
    count++;
  }
  return count;
}

async function runSyncForSystem(systemName) {
  const { rows } = await db.query(
    'SELECT * FROM sync_registry WHERE system_name = $1 AND active = true',
    [systemName]
  );
  if (!rows.length) throw new Error(`System '${systemName}' not found or inactive`);

  const reg     = rows[0];
  const started = Date.now();

  try {
    const records = await fetchRecordsForSystem(reg);
    const count   = await upsertRecords(reg, records);

    await db.query(
      `UPDATE sync_registry SET last_run_at = now(), last_run_status = 'ok', last_run_count = $1
       WHERE system_name = $2`,
      [count, systemName]
    );

    console.log(`[SyncEngine] ${systemName}: upserted ${count} records in ${Date.now() - started}ms`);
    return { system_name: systemName, count, status: 'ok' };
  } catch (err) {
    await db.query(
      `UPDATE sync_registry SET last_run_at = now(), last_run_status = $1
       WHERE system_name = $2`,
      [`error: ${err.message.slice(0, 200)}`, systemName]
    );
    console.error(`[SyncEngine] ${systemName} failed:`, err.message);
    throw err;
  }
}

async function runAllSyncs() {
  if (!process.env.DATABASE_URL) return;

  const { rows } = await db.query(
    'SELECT system_name FROM sync_registry WHERE active = true ORDER BY system_name'
  );

  const results = [];
  for (const { system_name } of rows) {
    try {
      results.push(await runSyncForSystem(system_name));
    } catch (err) {
      results.push({ system_name, status: 'error', error: err.message });
    }
  }
  return results;
}

// ─── Cron runner -- interval-based, starts after DB is ready ─────────────────

let syncTimer = null;

function startSyncRunner(intervalMinutes = 15) {
  if (syncTimer) return; // already running

  const ms = intervalMinutes * 60 * 1000;

  syncTimer = setInterval(async () => {
    console.log('[SyncEngine] Running scheduled sync for all systems...');
    try {
      const results = await runAllSyncs();
      const ok  = results.filter(r => r.status === 'ok').length;
      const err = results.filter(r => r.status === 'error').length;
      console.log(`[SyncEngine] Completed: ${ok} ok, ${err} errors`);
    } catch (e) {
      console.error('[SyncEngine] runAllSyncs failed:', e.message);
    }
  }, ms);

  // Unref so the timer doesn't keep the process alive on its own
  if (syncTimer.unref) syncTimer.unref();

  console.log(`[SyncEngine] Sync runner started -- interval: ${intervalMinutes}min`);
}

module.exports = {
  sanitizeTableName,
  discoverAndProvision,
  runSyncForSystem,
  runAllSyncs,
  startSyncRunner,
};
