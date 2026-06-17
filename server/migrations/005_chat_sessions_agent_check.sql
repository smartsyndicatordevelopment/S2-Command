-- The original chat_sessions.agent CHECK only allowed ('ghl','clickup','fb'), so
-- sessions for newer agents (make, qb, digits, overview) silently failed to
-- insert at the DB level -- which is why the Digits chat history was not saving
-- (session creation 500'd, the client swallowed it, and messages were never
-- persisted). The app validates agent against VALID_AGENTS before every insert,
-- so the parallel DB allow-list is redundant. Drop the stale CHECK (by whatever
-- name Postgres gave it) rather than maintaining a second list that drifts.
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'chat_sessions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%agent%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE chat_sessions DROP CONSTRAINT %I', cname);
  END IF;
END $$;
