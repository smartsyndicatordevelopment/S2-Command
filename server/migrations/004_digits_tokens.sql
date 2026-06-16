-- Persist the Digits Connect OAuth token across deploys.
-- Railway's container filesystem is ephemeral (wiped on every redeploy), so a
-- local token file does not survive. Store the token in Postgres instead.
-- Token values are AES-256-GCM encrypted at rest (same ENCRYPTION_KEY as before).
-- Single-row table: id is pinned to 1.
CREATE TABLE IF NOT EXISTS digits_tokens (
  id            INT PRIMARY KEY DEFAULT 1,
  access_token  TEXT,
  refresh_token TEXT,
  business_id   TEXT,
  expires_at    BIGINT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT digits_tokens_singleton CHECK (id = 1)
);
