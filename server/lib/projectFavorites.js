/**
 * Starred projects for the Projects page (table project_favorites, migration 009).
 * kind is 'worker' or 'pages' for Cloudflare projects and 'folder' for a project folder on the Brandon's Projects tab.
 */
const { query } = require('./db');

const KINDS = ['worker', 'pages', 'folder'];
const key = (kind, name) => `${kind}:${name}`;

/** Every starred project as a Set of "kind:name". */
async function getFavoriteKeys() {
  const { rows } = await query('SELECT kind, name FROM project_favorites');
  return new Set(rows.map((r) => key(r.kind, r.name)));
}

/** Star or unstar one project. Throws an error starting with "bad " for input that is not accepted. */
async function setFavorite({ kind, name, favorite }) {
  if (!KINDS.includes(kind)) throw new Error('bad kind');
  if (typeof name !== 'string' || !name || name.length > 200) throw new Error('bad name');
  if (typeof favorite !== 'boolean') throw new Error('bad favorite');
  if (favorite) {
    await query('INSERT INTO project_favorites (kind, name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [kind, name]);
  } else {
    await query('DELETE FROM project_favorites WHERE kind = $1 AND name = $2', [kind, name]);
  }
}

module.exports = { getFavoriteKeys, setFavorite, key, KINDS };
