/**
 * Sorts projects into types (Web Apps, Local Apps, Websites and so on) and links a Cloudflare project to its project folder,
 * so the Projects page can group cards by type and show the folder's logo on the Cloudflare card.
 *
 * A type comes from, in order: the folder's line in ".dashboard/types.txt" (Name|type, read by build-project-catalog.mjs),
 * the lists below, then simple rules on the name. Everything here is pure (no network, no database).
 */

// Display order of the groups: apps first, as the owner asked.
const TYPES = [
  { id: 'app', label: 'Web Apps' },
  { id: 'local', label: 'Local Apps' },
  { id: 'site', label: 'Websites' },
  { id: 'service', label: 'Bridges And Services' },
  { id: 'tool', label: 'Tools And Scripts' },
  { id: 'workspace', label: 'Workspaces And Docs' },
  { id: 'hosted', label: 'Hosted Sites' },
  { id: 'dev', label: 'Dev And Test Copies' },
  { id: 'copy', label: 'Worktrees And Copies' },
  { id: 'other', label: 'Other' },
];
const TYPE_IDS = new Set(TYPES.map((t) => t.id));

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// "ThriveMapper_3.0" and "thrivemapper" are the same project: drop a trailing version number.
const normFolder = (s) => norm(String(s || '').replace(/[_\s-]*v?\d+(\.\d+)*$/i, ''));

// ---- Project folders ----
const FOLDER_TYPES = {
  app: ['LeadSifter', 'S2 Command', 'InboxHelm', 'ScopeTask', 'Famtinerary', 'Tabor', 'FerretBooks', 'ThriveMapper_3.0', 'Frost FM',
    'Automated Options Trader', 'Active Listener Pro', 'FunnelAnalyzer', 'Treadmill Gator'],
  local: ['DashComm Pro', 'WardenKey', 'ScreenLoop', 'SoundControlPro', 'VideoTranscriber', 'FakeReviewRadar'],
  site: ['Automate With Brandon', 'Fuse at Park Row', 'Cloudflare Sites', 'Darktide Archivum'],
  service: ['GoHighLevel Bridge', 'Fal.ai Bridge', 'ElevenLabs Bridge', 'Claude-bridge', 'YouTube MCP', 'Discord MCP', 'GHL Agent'],
  tool: ['Scripts', 'scopetask-migration'],
  workspace: ['SOPs', "Brandon's Personal Workspace", 'Smart Syndicator Workspace', 'Obsidian Vaults'],
  other: ['Backups', 'NameLabs'],
};
const FOLDER_TYPE_BY_NAME = new Map(Object.entries(FOLDER_TYPES).flatMap(([type, names]) => names.map((n) => [n, type])));

/** The type of one project folder. `allNames` is every folder name, used to spot a worktree or copy of another project. */
function folderType(project, allNames = []) {
  if (project.type && TYPE_IDS.has(project.type)) return project.type;
  const known = FOLDER_TYPE_BY_NAME.get(project.name);
  if (known) return known;
  const name = project.name;
  if (/(^|-)wt(-|$)/i.test(name) || /worktrees?$/i.test(name)) return 'copy';
  const n = norm(name);
  if (allNames.some((other) => other !== name && FOLDER_TYPE_BY_NAME.has(other) && n.length > norm(other).length && n.startsWith(norm(other)))) return 'copy';
  if (/\bbridge$/i.test(name) || /\bmcp$/i.test(name)) return 'service';
  if (project.production) return 'app';
  return 'other';
}

// ---- Cloudflare projects ----
const CF_SITES = new Set(['automatewithbrandon', 'fuse-at-park-row', 'smartforgemedia', 'smartsyndicator', 'tenantmagnet', 'woodsofhaltom', 'darktide-archivum']);
const DEV_SUFFIX = /-(dev|preview|staging|test)$/;
const SERVICE_SUFFIX = /-(bridge|mcp|api|notify|sync|updates|maintenance)$/;
// Parts of a Worker name that are not part of the project's own name.
const ROLE_SUFFIX = /-(app|site|web|api|mcp|notify|sync|updates|maintenance|trader)$/;
// Worker names that do not spell their folder's name.
const FOLDER_ALIASES = {
  'fal-bridge': 'Fal.ai Bridge', 'ghl-bridge': 'GoHighLevel Bridge', aot: 'Automated Options Trader', dashcomm: 'DashComm Pro',
  smartsyndicator: 'Cloudflare Sites', tenantmagnet: 'Cloudflare Sites', smartforgemedia: 'Cloudflare Sites', woodsofhaltom: 'Cloudflare Sites',
};

/** "lead-sifter-dev" -> "lead-sifter"; "scoutwarden-api-dev" -> "scoutwarden". */
function baseName(workerName) {
  let n = String(workerName || '').toLowerCase().replace(DEV_SUFFIX, '');
  for (let i = 0; i < 2 && ROLE_SUFFIX.test(n); i++) n = n.replace(ROLE_SUFFIX, '');
  return n;
}

function cloudflareType(project) {
  const name = String(project.name || '').toLowerCase();
  if (/^ls-o\d+-s\d+$/.test(name)) return 'hosted'; // sites the lead app hosts for its accounts
  if (DEV_SUFFIX.test(name) || /-dev-/.test(name)) return 'dev';
  if (CF_SITES.has(name) || /-site$/.test(name) || project.kind === 'pages') return 'site';
  if (SERVICE_SUFFIX.test(name)) return 'service';
  return 'app';
}

/** The project folder a Cloudflare project belongs to (or null), matched by name. */
function folderFor(project, folders) {
  const base = baseName(project.name);
  const alias = FOLDER_ALIASES[base] || FOLDER_ALIASES[String(project.name).toLowerCase()];
  if (alias) return folders.find((f) => f.name === alias) || null;
  const key = norm(base);
  if (!key) return null;
  return folders.find((f) => FOLDER_TYPE_BY_NAME.has(f.name) && normFolder(f.name) === key)
    || folders.find((f) => normFolder(f.name) === key) || null;
}

/** Adds type, folder and logo to every Cloudflare project. */
function decorateCloudflare(projects, folders = []) {
  return projects.map((p) => {
    const folder = folderFor(p, folders);
    return { ...p, type: cloudflareType(p), folder: folder ? folder.name : null, logo: folder ? folder.logo || null : null };
  });
}

/**
 * Adds type and `worker` (the live Cloudflare Worker for that folder, when there is one) to every project folder.
 * `cloudflareProjects` may be empty when the Cloudflare report is not available.
 */
function decorateFolders(folders, cloudflareProjects = []) {
  const names = folders.map((f) => f.name);
  const live = cloudflareProjects.filter((p) => p.kind === 'worker' && cloudflareType(p) !== 'dev' && cloudflareType(p) !== 'hosted');
  return folders.map((f) => {
    const type = folderType(f, names);
    let worker = null;
    if (type !== 'copy') {
      const mine = live.filter((p) => folderFor(p, folders)?.name === f.name);
      // The busiest one is the app itself (a "-site" or "-notify" helper sees less traffic).
      mine.sort((a, b) => (b.requests24h || 0) - (a.requests24h || 0) || a.name.localeCompare(b.name));
      if (mine.length && f.name !== 'Cloudflare Sites') worker = mine[0].name;
    }
    return { ...f, type, worker };
  });
}

module.exports = { TYPES, folderType, cloudflareType, folderFor, baseName, decorateCloudflare, decorateFolders };
