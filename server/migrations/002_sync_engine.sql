-- Registry of every system registered with the Dynamic Sync Engine.
-- Each row represents one external API data stream and its corresponding
-- cache_* table in this database.
CREATE TABLE IF NOT EXISTS sync_registry (
  id                SERIAL PRIMARY KEY,
  system_name       VARCHAR(255) UNIQUE NOT NULL,
  table_name        VARCHAR(255) UNIQUE NOT NULL,
  external_id_field TEXT NOT NULL,
  email_field       TEXT,
  fetch_config      JSONB NOT NULL DEFAULT '{}',
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_run_at       TIMESTAMPTZ,
  last_run_status   TEXT,
  last_run_count    INTEGER
);

CREATE INDEX IF NOT EXISTS sync_registry_active_idx ON sync_registry(active);
