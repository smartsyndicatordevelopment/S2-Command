// Spec progress: how much of each app's written spec is built, as a percentage.
// The numbers live in server/data/spec-progress.json, written by the `spec-progress` skill
// (it compares each app's spec to its code). This file only reads them and matches them to
// Cloudflare projects by name.

const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Cloudflare names often carry a suffix ("lead-sifter-app", "foo-dev"); try the plain name too.
const stripSuffix = (s) => s.replace(/(app|dev|worker|production|prod)$/, '');

function loadFile() {
  try {
    delete require.cache[require.resolve('../data/spec-progress.json')];
    return require('../data/spec-progress.json');
  } catch {
    return null;
  }
}

function buildIndex(file) {
  const index = new Map();
  for (const app of file?.apps || []) {
    if (typeof app.percent !== 'number') continue;
    for (const n of [app.name, ...(app.aliases || [])]) {
      const k = normalize(n);
      if (k) index.set(k, app);
    }
  }
  return index;
}

// Adds `specProgress` ({ percent, checkedAt, summary, done, total }) to each project that has a result.
function applySpecProgress(data) {
  const file = loadFile();
  if (!file || !data?.projects) return data;
  const index = buildIndex(file);
  const projects = data.projects.map((p) => {
    const k = normalize(p.name);
    const hit = index.get(k) || index.get(stripSuffix(k));
    if (!hit) return p;
    return {
      ...p,
      specProgress: {
        percent: Math.max(0, Math.min(100, Math.round(hit.percent))),
        checkedAt: hit.checkedAt || file.generatedAt || null,
        summary: hit.summary || '',
        done: hit.done ?? null,
        total: hit.total ?? null,
      },
    };
  });
  return { ...data, projects };
}

module.exports = { applySpecProgress, normalize };
