const router = require('express').Router();
const { query } = require('../lib/db');

const VALID_AGENTS = new Set(['ghl', 'clickup', 'fb']);

function validateAgent(agent, res) {
  if (!VALID_AGENTS.has(agent)) {
    res.status(400).json({ error: 'invalid agent -- must be ghl, clickup, or fb' });
    return false;
  }
  return true;
}

// GET /api/sessions/:agent -- list sessions for an agent, newest first
router.get('/sessions/:agent', async (req, res) => {
  const { agent } = req.params;
  if (!validateAgent(agent, res)) return;

  try {
    const { rows } = await query(
      `SELECT id, name, created_at, updated_at
       FROM chat_sessions
       WHERE agent = $1
       ORDER BY updated_at DESC
       LIMIT 100`,
      [agent]
    );
    res.json(rows);
  } catch (err) {
    console.error('sessions list error:', err.message);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// POST /api/sessions/:agent -- create a new session
router.post('/sessions/:agent', async (req, res) => {
  const { agent } = req.params;
  if (!validateAgent(agent, res)) return;

  const name = (req.body?.name || 'New Chat').slice(0, 200);

  try {
    const { rows } = await query(
      `INSERT INTO chat_sessions(agent, name)
       VALUES($1, $2)
       RETURNING id, name, created_at, updated_at`,
      [agent, name]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('sessions create error:', err.message);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// PATCH /api/sessions/:agent/:id -- rename a session
router.patch('/sessions/:agent/:id', async (req, res) => {
  const { agent, id } = req.params;
  if (!validateAgent(agent, res)) return;

  const name = (req.body?.name || '').trim().slice(0, 200);
  if (!name) return res.status(400).json({ error: 'name required' });

  try {
    const { rows } = await query(
      `UPDATE chat_sessions
       SET name = $1
       WHERE id = $2 AND agent = $3
       RETURNING id, name, created_at, updated_at`,
      [name, id, agent]
    );
    if (!rows.length) return res.status(404).json({ error: 'session not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('sessions rename error:', err.message);
    res.status(500).json({ error: 'Failed to rename session' });
  }
});

// DELETE /api/sessions/:agent/:id -- delete a session and all its messages
router.delete('/sessions/:agent/:id', async (req, res) => {
  const { agent, id } = req.params;
  if (!validateAgent(agent, res)) return;

  try {
    const { rowCount } = await query(
      'DELETE FROM chat_sessions WHERE id = $1 AND agent = $2',
      [id, agent]
    );
    if (!rowCount) return res.status(404).json({ error: 'session not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('sessions delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// GET /api/sessions/:agent/:id/messages -- load full message history for a session
router.get('/sessions/:agent/:id/messages', async (req, res) => {
  const { agent, id } = req.params;
  if (!validateAgent(agent, res)) return;

  try {
    const sessionCheck = await query(
      'SELECT id FROM chat_sessions WHERE id = $1 AND agent = $2',
      [id, agent]
    );
    if (!sessionCheck.rows.length) return res.status(404).json({ error: 'session not found' });

    const { rows } = await query(
      `SELECT role, content, created_at
       FROM chat_messages
       WHERE session_id = $1
       ORDER BY id ASC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error('sessions messages error:', err.message);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// GET /api/sessions/:agent/changelog -- persistent changelog for an agent
router.get('/sessions/:agent/changelog', async (req, res) => {
  const { agent } = req.params;
  if (!validateAgent(agent, res)) return;

  try {
    const { rows } = await query(
      `SELECT id, agent, timestamp, description, action, result, undo_action AS "undoAction", undone
       FROM changelog_entries
       WHERE agent = $1
       ORDER BY timestamp DESC
       LIMIT 100`,
      [agent]
    );
    res.json(rows);
  } catch (err) {
    console.error('changelog fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch changelog' });
  }
});

module.exports = router;
