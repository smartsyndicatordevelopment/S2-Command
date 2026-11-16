-- Projects the owner starred on the Projects page. kind is 'worker' or 'pages' (Cloudflare projects) or 'folder' (a project folder
-- on the Brandon's Projects tab). One row per starred project; unstarring deletes the row.
CREATE TABLE IF NOT EXISTS project_favorites (
  kind          TEXT NOT NULL,
  name          TEXT NOT NULL,
  favorited_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, name)
);
