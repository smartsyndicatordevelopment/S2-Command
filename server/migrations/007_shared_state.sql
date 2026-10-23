-- State that used to live in one process's memory or on the container disk. Cloudflare runs many copies of the
-- app, so it has to be shared through the database.

-- Request counters for express-rate-limit (one row per limiter key and window).
CREATE TABLE IF NOT EXISTS rate_limit_hits (
  key        TEXT PRIMARY KEY,
  hits       INT NOT NULL,
  reset_at   TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limit_hits_reset_idx ON rate_limit_hits (reset_at);

-- Recategorize preview snapshots (one-hour life).
CREATE TABLE IF NOT EXISTS recat_previews (
  id         TEXT PRIMARY KEY,
  items      JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Email Studio history (a single JSON list, as the old sessions/ghl-email-history.json file held).
CREATE TABLE IF NOT EXISTS ghl_email_history (
  id         INT PRIMARY KEY DEFAULT 1,
  entries    JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ghl_email_history_singleton CHECK (id = 1)
);
