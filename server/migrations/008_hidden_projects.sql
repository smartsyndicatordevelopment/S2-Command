-- Cloudflare projects the owner chose to hide on the Projects page (one row per hidden project).
CREATE TABLE IF NOT EXISTS hidden_projects (
  kind       TEXT NOT NULL,
  name       TEXT NOT NULL,
  hidden_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, name)
);
