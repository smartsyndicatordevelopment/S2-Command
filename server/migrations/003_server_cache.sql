-- Persistent key/value cache for expensive computed metrics.
-- Routes check this table first and serve cached data instantly;
-- the sync runner and server startup refresh it on an interval.
CREATE TABLE IF NOT EXISTS server_cache (
  key          TEXT PRIMARY KEY,
  data         JSONB NOT NULL,
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
