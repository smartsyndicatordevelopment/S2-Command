-- Business plan content, editable by the Overview analyst. A single JSON document
-- (id = 1) holding vision, phases, moat, and risks. The page reads it from the API
-- and the analyst can propose edits (approved via the approval card). Seeded with
-- the previously-hardcoded defaults on first read by the businessPlan route.
CREATE TABLE IF NOT EXISTS business_plan (
  id         INTEGER PRIMARY KEY,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
