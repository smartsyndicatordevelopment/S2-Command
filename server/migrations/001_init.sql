-- Chat sessions: one row per named conversation per agent type
CREATE TABLE IF NOT EXISTS chat_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent       TEXT NOT NULL CHECK (agent IN ('ghl', 'clickup', 'fb')),
  name        TEXT NOT NULL DEFAULT 'New Chat',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chat messages: ordered messages within a session
CREATE TABLE IF NOT EXISTS chat_messages (
  id          BIGSERIAL PRIMARY KEY,
  session_id  UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON chat_messages(session_id, id);

-- Changelog entries: persistent record of all approved write actions
CREATE TABLE IF NOT EXISTS changelog_entries (
  id           TEXT PRIMARY KEY,
  agent        TEXT NOT NULL CHECK (agent IN ('ghl', 'clickup', 'fb')),
  timestamp    TIMESTAMPTZ NOT NULL DEFAULT now(),
  description  TEXT NOT NULL,
  action       JSONB NOT NULL,
  result       JSONB NOT NULL DEFAULT '{}',
  undo_action  JSONB,
  undone       BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS changelog_entries_agent_idx ON changelog_entries(agent, timestamp DESC);

-- Auto-update updated_at on chat_sessions
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_sessions_updated_at ON chat_sessions;
CREATE TRIGGER chat_sessions_updated_at
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
