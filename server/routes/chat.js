const router = require('express').Router();
const Anthropic = require('@anthropic-ai/sdk');
const Stripe = require('stripe');
const fetch = require('node-fetch');
const { query } = require('../lib/db');
const { fetchPnL: digitsFetchPnL, queryTransactions: digitsQueryTransactions } = require('./digits');
const { readPlan: readBusinessPlan, updatePlan: updateBusinessPlan } = require('./businessPlan');
const metricsCache = require('../lib/metricsCache');

const AGENT = 'overview';

// Persist a user/assistant turn to the session so it survives reloads and
// shows when the chat is reopened from the sidebar. No-op without a sessionId.
async function persistMessages(sessionId, userText, assistantText) {
  if (!sessionId) return;
  try {
    await query(
      `INSERT INTO chat_messages(session_id, role, content) VALUES($1,'user',$2),($1,'assistant',$3)`,
      [sessionId, userText, assistantText]
    );
    await query('UPDATE chat_sessions SET updated_at = now() WHERE id = $1', [sessionId]);
  } catch (err) {
    console.error('overview chat: failed to persist messages:', err.message);
  }
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const OWNER_EMAIL = 'operations@smartsyndicator.com';

const PLAN_NAME_MAP = {
  '29700|month': 'Smart Syndicator Pro Monthly',
  '297000|year': 'Smart Syndicator Pro Annual',
};

function resolvePlanName(price) {
  const key = `${price?.unit_amount}|${price?.recurring?.interval}`;
  if (PLAN_NAME_MAP[key]) return PLAN_NAME_MAP[key];
  return price?.nickname || 'Plan';
}

// -- Shared helpers --

async function withRetry(fn, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

async function listAllStripe(fetcher) {
  const results = [];
  let hasMore = true;
  let startingAfter;
  while (hasMore) {
    const batch = await withRetry(() => fetcher(startingAfter));
    results.push(...batch.data);
    hasMore = batch.has_more;
    if (batch.data.length > 0) startingAfter = batch.data[batch.data.length - 1].id;
    else hasMore = false;
  }
  return results;
}

// -- Facebook Ads helpers --

function normalizeFbAccountId(id) {
  if (!id) return null;
  return id.startsWith('act_') ? id : `act_${id}`;
}

async function fbGet(fbPath, queryParams) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error('META_ACCESS_TOKEN not configured');
  const qs = new URLSearchParams({ access_token: token, ...queryParams });
  for (let i = 0; i < 3; i++) {
    try {
      const r    = await fetch(`https://graph.facebook.com/v21.0${fbPath}?${qs}`);
      const data = await r.json();
      if (data.error) throw new Error(data.error.message);
      return data;
    } catch (err) {
      if (i === 2) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

function parseFbRow(row) {
  const leads     = (row.actions || []).find(a => a.action_type === 'lead')?.value || 0;
  const purchases = (row.actions || []).find(a => a.action_type === 'purchase')?.value || 0;
  const spend     = parseFloat(row.spend || 0);
  const cpl       = leads > 0 ? spend / parseInt(leads) : null;
  return {
    name:         row.campaign_name || row.adset_name || row.ad_name || null,
    campaignName: row.campaign_name || null,
    adsetName:    row.adset_name    || null,
    adName:       row.ad_name       || null,
    spend,
    impressions:  parseInt(row.impressions || 0),
    clicks:       parseInt(row.clicks || 0),
    ctr:          parseFloat(row.ctr || 0),
    cpm:          parseFloat(row.cpm || 0),
    cpc:          parseFloat(row.cpc || 0),
    reach:        parseInt(row.reach || 0),
    leads:        parseInt(leads),
    purchases:    parseInt(purchases),
    costPerLead:  cpl,
    purchaseRoas: parseFloat(row.purchase_roas?.[0]?.value || 0),
  };
}

async function toolGetFbPerformance(datePreset, level) {
  const accountId = normalizeFbAccountId(process.env.META_AD_ACCOUNT_ID);
  if (!accountId) throw new Error('META_AD_ACCOUNT_ID not configured');
  const preset       = datePreset || 'last_30d';
  const insightLevel = ['account', 'campaign', 'adset', 'ad'].includes(level) ? level : 'account';
  const nameFields   = insightLevel === 'campaign' ? ',campaign_name'
                     : insightLevel === 'adset'    ? ',campaign_name,adset_name'
                     : insightLevel === 'ad'       ? ',campaign_name,adset_name,ad_name'
                     : '';
  const fields = `spend,impressions,clicks,ctr,cpm,cpc,reach,frequency,actions,cost_per_action_type,action_values,purchase_roas${nameFields}`;
  const data = await fbGet(`/${accountId}/insights`, { fields, date_preset: preset, level: insightLevel, limit: '50' });

  if (insightLevel === 'account') {
    return { datePreset: preset, level: insightLevel, ...parseFbRow(data.data?.[0] || {}) };
  }

  const rows = (data.data || []).map(parseFbRow);
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  return { datePreset: preset, level: insightLevel, totalSpend, count: rows.length, breakdown: rows };
}

async function toolGetFbCampaigns() {
  const accountId = normalizeFbAccountId(process.env.META_AD_ACCOUNT_ID);
  if (!accountId) throw new Error('META_AD_ACCOUNT_ID not configured');
  const fields = 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time';
  const data = await fbGet(`/${accountId}/campaigns`, { fields, limit: '50' });
  const campaigns = (data.data || []).map(c => ({
    id:            c.id,
    name:          c.name,
    status:        c.status,
    objective:     c.objective,
    dailyBudget:   c.daily_budget  ? parseFloat(c.daily_budget)  / 100 : null,
    lifetimeBudget: c.lifetime_budget ? parseFloat(c.lifetime_budget) / 100 : null,
    startDate:     c.start_time || null,
    endDate:       c.stop_time  || null,
  }));
  const active  = campaigns.filter(c => c.status === 'ACTIVE').length;
  const paused  = campaigns.filter(c => c.status === 'PAUSED').length;
  return { campaigns, total: campaigns.length, active, paused };
}

// -- GHL helpers --

async function ghlGet(endpoint, queryParams) {
  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey) throw new Error('GHL_API_KEY not configured');
  const qs = new URLSearchParams(Object.fromEntries(
    Object.entries({ locationId, ...queryParams }).filter(([, v]) => v != null && v !== '')
  ));
  for (let i = 0; i < 3; i++) {
    try {
      const r    = await fetch(`https://services.leadconnectorhq.com${endpoint}?${qs}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Version: '2021-07-28', Accept: 'application/json' },
      });
      if (!r.ok && r.status !== 200) throw new Error(`GHL API ${r.status} for ${endpoint}`);
      return r.json();
    } catch (err) {
      if (i === 2) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

async function toolGetGhlPipeline() {
  // Serve the background-cached pipeline when available (refreshed by the sync
  // runner); fall back to a live call on a cold cache.
  const cached = await metricsCache.get('ghl:pipeline');
  if (cached) return { ...cached.data, cachedAt: cached.computedAt };
  const data = await ghlGet('/opportunities/search', { limit: '100' });
  const opps = data.opportunities || [];
  const byStage = {};
  let totalValue = 0;
  for (const opp of opps) {
    const stage = opp.pipelineStageId || 'Unknown';
    const stageName = opp.pipelineStageName || opp.pipelineStageId || 'Unknown';
    if (!byStage[stage]) byStage[stage] = { name: stageName, count: 0, value: 0 };
    byStage[stage].count++;
    byStage[stage].value += parseFloat(opp.monetaryValue || 0);
    totalValue += parseFloat(opp.monetaryValue || 0);
  }
  return {
    totalOpportunities: opps.length,
    totalPipelineValue: totalValue,
    byStage: Object.values(byStage).sort((a, b) => b.count - a.count),
  };
}

async function toolGetGhlContacts() {
  const cached = await metricsCache.get('ghl:contacts');
  if (cached) return { ...cached.data, cachedAt: cached.computedAt };
  // GHL's GET /contacts/ rejects a startAfterDate query with HTTP 422, and the
  // two lookups were in one Promise.all -- so the 30-day query failing took the
  // whole tool down. Fetch the total independently; the 30-day-new count needs
  // the POST /contacts/search endpoint, so leave it null rather than 422.
  let totalContacts = null;
  try {
    const allData = await ghlGet('/contacts/', { limit: '1' });
    totalContacts = allData.meta?.total ?? allData.total ?? null;
  } catch (err) {
    console.error('toolGetGhlContacts total error:', err.message);
  }
  return { totalContacts, recentContacts30d: null };
}

// -- Make.com helpers --

async function makeGet(endpoint, queryParams) {
  const apiKey = process.env.MAKE_API_KEY;
  const zone   = (process.env.MAKE_ZONE || 'us1').toLowerCase();
  if (!apiKey) throw new Error('MAKE_API_KEY not configured');
  const qs = new URLSearchParams(Object.fromEntries(
    Object.entries(queryParams || {}).filter(([, v]) => v != null && v !== '')
  ));
  for (let i = 0; i < 3; i++) {
    try {
      const r    = await fetch(`https://${zone}.make.com/api/v2${endpoint}${qs.toString() ? '?' + qs : ''}`, {
        headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' },
      });
      const data = await r.json();
      return data;
    } catch (err) {
      if (i === 2) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

async function toolGetMakeOverview() {
  const teamId = process.env.MAKE_TEAM_ID;
  const params = teamId ? { teamId } : {};
  const data = await makeGet('/scenarios', params);
  const scenarios = data.scenarios || data || [];
  const active   = scenarios.filter(s => s.isEnabled).length;
  const inactive = scenarios.filter(s => !s.isEnabled).length;
  return {
    totalScenarios: scenarios.length,
    active,
    inactive,
    scenarios: scenarios.slice(0, 20).map(s => ({
      name:          s.name,
      active:        s.isEnabled,
      lastRun:       s.lastEdit  || null,
      nextExecution: s.scheduling?.nextExecution || null,
    })),
  };
}

// -- ClickUp helpers --

async function clickupGet(endpoint) {
  const apiKey = process.env.CLICKUP_API_KEY;
  if (!apiKey) throw new Error('CLICKUP_API_KEY not configured');
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`https://api.clickup.com/api/v2${endpoint}`, {
        headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      });
      if (!r.ok) throw new Error(`ClickUp API ${r.status} for ${endpoint}`);
      return r.json();
    } catch (err) {
      if (i === 2) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

async function clickupPost(endpoint, body) {
  const apiKey = process.env.CLICKUP_API_KEY;
  if (!apiKey) throw new Error('CLICKUP_API_KEY not configured');
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`https://api.clickup.com/api/v2${endpoint}`, {
        method: 'POST',
        headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(`ClickUp API ${r.status}: ${data?.err || JSON.stringify(data).slice(0, 200)}`);
      return data;
    } catch (err) {
      if (i === 2) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

// Lists + members across the workspace, so the analyst can resolve a list_id and
// assignee user ids before creating a task (rather than guessing).
async function toolGetClickupWorkspace() {
  const teamId = process.env.CLICKUP_TEAM_ID;
  if (!teamId) throw new Error('CLICKUP_TEAM_ID not configured');

  const teamData = await clickupGet('/team');
  const team = (teamData.teams || []).find(t => String(t.id) === String(teamId)) || teamData.teams?.[0];
  const members = (team?.members || [])
    .map(m => ({ id: m.user?.id, username: m.user?.username, email: m.user?.email }))
    .filter(m => m.id);

  const spacesData = await clickupGet(`/team/${teamId}/space`);
  const spaces = spacesData.spaces || [];
  const lists = [];
  for (const space of spaces) {
    const [folderless, folders] = await Promise.all([
      clickupGet(`/space/${space.id}/list`).catch(() => ({ lists: [] })),
      clickupGet(`/space/${space.id}/folder`).catch(() => ({ folders: [] })),
    ]);
    for (const l of (folderless.lists || [])) lists.push({ id: l.id, name: l.name, space: space.name, folder: null });
    for (const f of (folders.folders || [])) for (const l of (f.lists || [])) lists.push({ id: l.id, name: l.name, space: space.name, folder: f.name });
  }

  return { members, lists: lists.slice(0, 200) };
}

async function toolGetClickupTasks(overdueOnly) {
  const teamId = process.env.CLICKUP_TEAM_ID;
  if (!teamId) throw new Error('CLICKUP_TEAM_ID not configured');
  const now = Date.now();

  // Filtered team tasks (open only), paginated 100/page; cap pages defensively.
  const all = [];
  for (let page = 0; page < 5; page++) {
    const params = new URLSearchParams({
      include_closed: 'false',
      subtasks:       'true',
      order_by:       'due_date',
      page:           String(page),
    });
    if (overdueOnly) params.set('due_date_lt', String(now));
    const data  = await clickupGet(`/team/${teamId}/task?${params}`);
    const tasks = data.tasks || [];
    all.push(...tasks);
    if (tasks.length < 100) break;
  }

  const tasks = all.map(t => ({
    name:      t.name,
    status:    t.status?.status || null,
    dueDate:   t.due_date ? new Date(Number(t.due_date)).toLocaleDateString('en-US') : null,
    overdue:   t.due_date ? Number(t.due_date) < now : false,
    assignees: (t.assignees || []).map(a => a.username).filter(Boolean),
    list:      t.list?.name || null,
  }));

  return {
    totalOpen:    tasks.length,
    overdueCount: tasks.filter(t => t.overdue).length,
    tasks:        tasks.slice(0, 50),
  };
}

// -- Sales tax helpers --

const TX_ZIP_PREFIXES = ['75', '76', '77', '78', '79'];
const TX_TAX_RATE = 0.0825;
const TX_STATE_VALUES = new Set(['tx', 'texas']);

function isTxState(s) { return TX_STATE_VALUES.has((s || '').toLowerCase().trim()); }
function isTxZip(zip) {
  if (!zip) return false;
  return TX_ZIP_PREFIXES.includes(String(zip).trim().replace(/\D/g, '').substring(0, 2));
}
function hasState(s) { return !!(s || '').trim(); }

// -- Tool implementations --

async function toolGetSubscriptions(status = 'active') {
  const validStatuses = ['active', 'canceled', 'past_due', 'trialing', 'unpaid', 'all'];
  const resolvedStatus = validStatuses.includes(status) ? status : 'active';

  const allSubs = await listAllStripe((cursor) =>
    stripe.subscriptions.list({
      status: resolvedStatus, limit: 100, expand: ['data.customer'],
      ...(cursor && { starting_after: cursor }),
    })
  );
  const filtered = allSubs.filter(sub => {
    const email = (sub.customer?.email || '').toLowerCase();
    return email !== OWNER_EMAIL;
  });
  const results = await Promise.all(filtered.map(async (sub) => {
    let actualAmount = null;
    if (sub.status === 'active' || sub.status === 'trialing') {
      try {
        const invoices = await withRetry(() =>
          stripe.invoices.list({ subscription: sub.id, status: 'paid', limit: 1 })
        );
        if (invoices.data.length > 0) actualAmount = invoices.data[0].total;
      } catch {}
    }
    const price = sub.items.data[0]?.price;
    const listPrice = price?.unit_amount || 0;
    const charged = actualAmount !== null ? actualAmount : listPrice;
    const mrrEq = (sub.status === 'active' || sub.status === 'trialing')
      ? (price?.recurring?.interval === 'year' ? charged / 100 / 12 : charged / 100)
      : 0;
    return {
      customerName: sub.customer?.name || sub.customer?.email || 'Unknown',
      customerEmail: sub.customer?.email || '',
      planName: resolvePlanName(price),
      interval: price?.recurring?.interval || 'month',
      status: sub.status,
      chargedDollars: charged / 100,
      mrrEquivalent: mrrEq,
      started: new Date(sub.created * 1000).toLocaleDateString(),
      canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000).toLocaleDateString() : null,
      ...(sub.status === 'active' ? { nextPayment: new Date(sub.current_period_end * 1000).toLocaleDateString() } : {}),
    };
  }));
  const activeSubs = results.filter(r => r.status === 'active' || r.status === 'trialing');
  const totalMrr = activeSubs.reduce((s, r) => s + r.mrrEquivalent, 0);
  return { subscriptions: results, totalMrr, arr: totalMrr * 12, count: results.length, activeCount: activeSubs.length, statusQueried: resolvedStatus };
}

async function toolGetYtdRevenue() {
  const now = new Date();
  const ytdStart = Math.floor(new Date(now.getFullYear(), 0, 1).getTime() / 1000);
  const allInvoices = await listAllStripe((cursor) =>
    stripe.invoices.list({
      status: 'paid', created: { gte: ytdStart }, limit: 100,
      ...(cursor && { starting_after: cursor }),
    })
  );
  const ytdRevenueCents = allInvoices.reduce((sum, inv) => sum + inv.total, 0);
  return {
    year: now.getFullYear(),
    ytdRevenueDollars: ytdRevenueCents / 100,
    invoiceCount: allInvoices.length,
  };
}

async function toolGetPnL({ year, start_date, end_date, interval } = {}) {
  const today = new Date().toISOString().split('T')[0];
  const currentYear = new Date().getFullYear();

  let startDate, endDate, iv;
  if (start_date && end_date) {
    // Explicit period (month, quarter, custom range).
    startDate = start_date;
    endDate = end_date;
    iv = interval || 'Month';
  } else {
    // Full calendar year (current year capped at today).
    const y = year || currentYear;
    startDate = `${y}-01-01`;
    endDate = y === currentYear ? today : `${y}-12-31`;
    iv = 'Year';
  }

  const parsed = await digitsFetchPnL({ interval: iv, startDate, endDate });
  return { startDate, endDate, interval: iv, ...parsed };
}

async function toolGetTransactions(input = {}) {
  const categoryTypes = input.expenses_only ? ['Expenses', 'CostOfGoodsSold', 'OtherExpenses'] : undefined;
  return await digitsQueryTransactions({
    startDate:     input.start_date,
    endDate:       input.end_date,
    categoryTypes,
    categoryMatch: input.category_match,
    limit:         input.limit || 100,
  });
}

async function toolGetSalesTax(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('month must be YYYY-MM');
  const [year, mo] = month.split('-').map(Number);
  if (mo < 1 || mo > 12) throw new Error('Invalid month');
  const startDate = new Date(Date.UTC(year, mo - 1, 1, 6, 0, 0));
  const endDate = new Date(Date.UTC(year, mo, 1, 5, 59, 59));
  const startTs = Math.floor(startDate.getTime() / 1000);
  const endTs = Math.floor(endDate.getTime() / 1000);

  const charges = await listAllStripe((cursor) =>
    stripe.charges.list({
      created: { gte: startTs, lte: endTs }, limit: 100, expand: ['data.customer'],
      ...(cursor && { starting_after: cursor }),
    })
  );

  const txTransactions = [], otherTransactions = [], unknownTransactions = [];
  for (const charge of charges) {
    if (charge.livemode === false) continue;
    if (charge.status !== 'succeeded' || charge.refunded) continue;
    const customer = typeof charge.customer === 'object' ? charge.customer : null;
    const custEmail = (charge.billing_details?.email || customer?.email || '').toLowerCase().trim();
    if (custEmail === OWNER_EMAIL) continue; // self-purchase -- no legal consideration
    const netAmount = charge.amount - (charge.amount_refunded || 0);
    if (netAmount <= 0) continue;

    const customerState = customer?.address?.state || '';
    const billingState  = charge.billing_details?.address?.state || '';
    const zip           = charge.billing_details?.address?.postal_code || '';
    let state, stateSource;

    if (hasState(customerState)) {
      state = isTxState(customerState) ? 'TX' : 'OTHER'; stateSource = 'customer_address';
    } else if (hasState(billingState)) {
      state = isTxState(billingState) ? 'TX' : 'OTHER'; stateSource = 'billing_details';
    } else if (zip) {
      state = isTxZip(zip) ? 'TX' : 'OTHER'; stateSource = 'zip';
    } else {
      state = null; stateSource = 'unknown';
    }

    const txn = {
      name: charge.billing_details?.name || customer?.name || 'Unknown',
      amountDollars: netAmount / 100,
      stateSource,
    };
    if (state === 'TX') txTransactions.push(txn);
    else if (state === 'OTHER') otherTransactions.push(txn);
    else unknownTransactions.push(txn);
  }

  const txRevenue = txTransactions.reduce((s, t) => s + t.amountDollars, 0);
  return {
    month,
    txRevenueDollars: txRevenue,
    taxRate: '8.25%',
    taxDueDollars: txRevenue * TX_TAX_RATE,
    txTransactionCount: txTransactions.length,
    otherStateCount: otherTransactions.length,
    unknownCount: unknownTransactions.length,
    txTransactions,
    otherTransactions,
    unknownTransactions: unknownTransactions.map(t => ({ ...t, note: 'No state data -- may need manual review' })),
  };
}

// -- Generic platform access (orchestrator) --
//
// One helper per connected platform, each fixed to that platform's API host and
// auth so the model can only reach known systems (it supplies the path, never the
// host). GETs are reads; POST/PUT/PATCH/DELETE are writes and are gated behind the
// approval card before they run. This is what lets the analyst do everything the
// dedicated GHL / ClickUp / Make / Facebook / Digits agents can do.

async function ghlApi(method, endpoint, body) {
  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey) throw new Error('GHL_API_KEY not configured');
  const m = method.toUpperCase();
  let url = `https://services.leadconnectorhq.com${endpoint}`;
  if (m === 'GET' && locationId && !/[?&]locationId=/.test(endpoint)) {
    url += (endpoint.includes('?') ? '&' : '?') + `locationId=${encodeURIComponent(locationId)}`;
  }
  const opts = { method: m, headers: { Authorization: `Bearer ${apiKey}`, Version: '2021-07-28', 'Content-Type': 'application/json', Accept: 'application/json' } };
  if (body && ['POST', 'PUT', 'PATCH'].includes(m)) {
    if (locationId && body && typeof body === 'object' && body.locationId == null && body.location_id == null) body = { ...body, locationId };
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(url, opts);
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await r.json() : { raw: await r.text() };
  return { status: r.status, data };
}

async function clickupApi(method, endpoint, body) {
  const apiKey = process.env.CLICKUP_API_KEY;
  if (!apiKey) throw new Error('CLICKUP_API_KEY not configured');
  const m = method.toUpperCase();
  const opts = { method: m, headers: { Authorization: apiKey, 'Content-Type': 'application/json' } };
  if (body && ['POST', 'PUT', 'PATCH'].includes(m)) opts.body = JSON.stringify(body);
  const r = await fetch(`https://api.clickup.com/api/v2${endpoint}`, opts);
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

async function makeApi(method, endpoint, body) {
  const apiKey = process.env.MAKE_API_KEY;
  const zone = (process.env.MAKE_ZONE || 'us1').toLowerCase();
  if (!apiKey) throw new Error('MAKE_API_KEY not configured');
  const m = method.toUpperCase();
  const opts = { method: m, headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' } };
  if (body && ['POST', 'PUT', 'PATCH'].includes(m)) opts.body = JSON.stringify(body);
  const r = await fetch(`https://${zone}.make.com/api/v2${endpoint}`, opts);
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

async function fbApi(method, path, body) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error('META_ACCESS_TOKEN not configured');
  const m = method.toUpperCase();
  let url = `https://graph.facebook.com/v21.0${path.startsWith('/') ? path : '/' + path}`;
  const opts = { method: m, headers: { 'Content-Type': 'application/json' } };
  if (m === 'GET') {
    url += (path.includes('?') ? '&' : '?') + `access_token=${encodeURIComponent(token)}`;
  } else {
    opts.body = JSON.stringify({ ...(body || {}), access_token: token });
  }
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

async function digitsApi(method, endpoint, body) {
  const { getToken, getTokenCache } = require('../lib/digitsTokens');
  const m = method.toUpperCase();
  if (m !== 'GET' && m !== 'POST') throw new Error('Digits is read-only (GET, or POST for /v1/ledger/entries/query).');
  const token = await getToken();
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' };
  // The ledger is scoped to the connected business -- the Digits-Business-Id header
  // is required or queries 400. Mirror the dedicated digits route's businessHeaders.
  const businessId = process.env.DIGITS_BUSINESS_ID || getTokenCache().businessId || '';
  if (businessId) headers['Digits-Business-Id'] = businessId;
  const opts = { method: m, headers };
  if (body && m === 'POST') opts.body = JSON.stringify(body);
  const r = await fetch(`https://connect.digits.com${endpoint}`, opts);
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

function platformApi(platform, method, endpoint, body) {
  switch (platform) {
    case 'ghl':     return ghlApi(method, endpoint, body);
    case 'clickup': return clickupApi(method, endpoint, body);
    case 'make':    return makeApi(method, endpoint, body);
    case 'fb':      return fbApi(method, endpoint, body);
    case 'digits':  return digitsApi(method, endpoint, body);
    default: throw new Error(`Unknown platform: ${platform}`);
  }
}

// A tool_use block that mutates data and must be approved before it runs.
function isAnalystWrite(b) {
  if (b.name === 'toggle_fb_campaign' || b.name === 'create_clickup_task') return true;
  if (b.name === 'update_business_plan') return true;
  if (b.name === 'agent_api') {
    const method = (b.input?.method || 'GET').toUpperCase();
    if (method === 'GET') return false;
    // Digits is a read-only integration -- it uses POST only for ledger/statement
    // queries, so a Digits POST is a read, not a write requiring approval.
    if (b.input?.platform === 'digits') return false;
    return true;
  }
  return false;
}

// -- Tool registry --

const TOOLS = [
  {
    name: 'get_subscriptions',
    description: 'Fetch Stripe subscriptions by status. Use status="active" (default) for current MRR/ARR. Use status="canceled" for churned customers. Use status="all" for every subscription ever (active + canceled + past_due + trialing). Returns customer name, plan, amount, MRR equivalent, start date, cancel date, and totals.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['active', 'canceled', 'past_due', 'trialing', 'unpaid', 'all'],
          description: 'Which subscriptions to fetch. Default: active.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_ytd_revenue',
    description: 'Fetch year-to-date Stripe revenue from paid invoices (Jan 1 to today). Returns total dollars collected and invoice count.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_pnl',
    description: 'Fetch the Digits Profit & Loss statement for any period -- a single month, a quarter, a custom range, or a full year. For a specific month (e.g. "last month" / "May 2026") pass start_date and end_date for that month. For a full year pass year. Returns total income, total expenses, net income, and itemized income/expense lines for that exact period.',
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'Period start in YYYY-MM-DD, e.g. 2026-05-01 for May 2026. Use with end_date for month/quarter/custom ranges.' },
        end_date:   { type: 'string', description: 'Period end in YYYY-MM-DD, e.g. 2026-05-31. Use with start_date.' },
        year:       { type: 'integer', description: 'Full calendar year, e.g. 2025 or 2026. Used only when start_date/end_date are not provided.' },
        interval:   { type: 'string', enum: ['Year', 'Quarter', 'Month'], description: 'Granularity. Defaults to Month for a date range, Year for a full year.' },
      },
      required: [],
    },
  },
  {
    name: 'get_transactions',
    description: 'List individual ledger transactions from Digits accounting for a date range: date, description, vendor/counterparty, category, and amount (negative = money out). Use this for ANY request for transaction-level detail, itemized breakdowns, "show me the transactions", "what did I spend on X", "list recent transactions", or vendor-by-vendor spend. Runs immediately -- it is read-only, no approval needed. Prefer this over get_pnl when the user wants the actual line items rather than totals.',
    input_schema: {
      type: 'object',
      properties: {
        start_date:    { type: 'string', description: 'Start date YYYY-MM-DD. Defaults to the start of last month.' },
        end_date:      { type: 'string', description: 'End date YYYY-MM-DD (inclusive). Defaults to today.' },
        expenses_only: { type: 'boolean', description: 'When true, only expense transactions (Expenses, CostOfGoodsSold, OtherExpenses).' },
        category_match:{ type: 'string', description: 'Optional case-insensitive substring/regex to match against the category, description, or vendor -- e.g. "software" or "apps" to find Software & Apps spend.' },
        limit:         { type: 'integer', description: 'Max transactions to return (default 100, max 500), most recent first.' },
      },
      required: [],
    },
  },
  {
    name: 'get_sales_tax',
    description: 'Calculate Texas sales tax liability for a specific month. Pulls all Stripe charges for the month and classifies them by state using address data. Returns TX revenue, 8.25% tax due, and full transaction breakdown.',
    input_schema: {
      type: 'object',
      properties: { month: { type: 'string', description: 'Month in YYYY-MM format, e.g. 2026-04' } },
      required: ['month'],
    },
  },
  {
    name: 'get_fb_performance',
    description: 'Fetch Facebook Ads performance metrics broken down by account, campaign, ad set, or individual ad. Returns spend, impressions, clicks, CTR, CPM, CPC, leads, cost-per-lead, and ROAS. Use level="ad" for ad-level stats, level="adset" for ad set stats, level="campaign" for campaign stats, level="account" (default) for totals.',
    input_schema: {
      type: 'object',
      properties: {
        date_preset: {
          type: 'string',
          enum: ['today', 'yesterday', 'this_week', 'last_7d', 'last_14d', 'last_30d', 'this_month', 'last_month', 'last_90d', 'this_year'],
          description: 'Date range preset. Default: last_30d.',
        },
        level: {
          type: 'string',
          enum: ['account', 'campaign', 'adset', 'ad'],
          description: 'Breakdown level. "account" = totals only (default). "campaign" = per campaign. "adset" = per ad set. "ad" = per individual ad.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_fb_campaigns',
    description: 'List all Facebook ad campaigns with their status (active/paused), objective, and budget. Use to see what campaigns exist and their current state.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_ghl_pipeline',
    description: 'Fetch GHL CRM pipeline data: total opportunities, pipeline value in dollars, and breakdown by stage. Use for sales pipeline, lead funnel, and deal value questions.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_ghl_contacts',
    description: 'Fetch GHL CRM contact counts: total contacts in the database and how many were added in the last 30 days. Use for lead generation volume and contact growth questions.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_make_overview',
    description: 'Fetch Make.com automation workspace overview: total scenarios, how many are active vs inactive, and scenario names with last-run times. Use for automation health and workflow questions.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_clickup_tasks',
    description: 'Fetch open ClickUp tasks for the workspace -- names, statuses, due dates, assignees, and lists -- plus totalOpen and overdueCount. Use for any project/task question: how many open or overdue tasks, what is due, workload by person. Pass overdue_only=true to fetch only tasks already past their due date.',
    input_schema: {
      type: 'object',
      properties: {
        overdue_only: { type: 'boolean', description: 'When true, only return tasks past their due date.' },
      },
      required: [],
    },
  },
  {
    name: 'get_clickup_workspace',
    description: 'List ClickUp lists (id, name, space, folder) and team members (id, username, email). ALWAYS call this before create_clickup_task to get the exact list_id to create the task in and the user ids of any assignees -- never guess ids.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'create_clickup_task',
    description: 'Create a new ClickUp task and optionally assign it. Requires user approval before it runs -- it returns a pending approval, so do NOT assume it executed. Call get_clickup_workspace first to resolve list_id and assignee user ids. Always include a clear preview_description naming the task, the list, and the assignee(s).',
    input_schema: {
      type: 'object',
      properties: {
        list_id:             { type: 'string', description: 'Id of the ClickUp list to create the task in (from get_clickup_workspace).' },
        name:                { type: 'string', description: 'Task name/title.' },
        assignee_ids:        { type: 'array', items: { type: 'number' }, description: 'ClickUp user ids to assign (from get_clickup_workspace members).' },
        description:         { type: 'string', description: 'Optional task description / details.' },
        due_date:            { type: 'string', description: 'Optional due date in YYYY-MM-DD.' },
        preview_description: { type: 'string', description: 'Plain-English summary shown to Brandon for approval, e.g. "Create task \'Decom R. and J. Sebastian\' in Operations, assigned to Jes Belang".' },
      },
      required: ['list_id', 'name', 'preview_description'],
    },
  },
  {
    name: 'toggle_fb_campaign',
    description: 'Pause or activate a Facebook ad campaign. Requires user approval before executing -- do not call this without confirming intent. Use get_fb_campaigns first to find the campaign ID.',
    input_schema: {
      type: 'object',
      properties: {
        campaign_id:         { type: 'string', description: 'The Facebook campaign ID (numeric string).' },
        status:              { type: 'string', enum: ['ACTIVE', 'PAUSED'], description: 'The new status to set.' },
        campaign_name:       { type: 'string', description: 'Human-readable campaign name for the confirmation message.' },
        preview_description: { type: 'string', description: 'Plain-English summary shown to Brandon for approval, e.g. "Pause campaign: S2 SLO - Sales".' },
      },
      required: ['campaign_id', 'status', 'preview_description'],
    },
  },
  {
    name: 'get_business_plan',
    description: 'Fetch the current Business Plan document (the content shown on the Business Plan page): vision statement, growth roadmap phases, competitive moat, and risk register. ALWAYS call this before update_business_plan so you edit the real current content rather than guessing.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'update_business_plan',
    description: 'Edit the Business Plan document. Requires Brandon\'s approval before it saves -- it returns a pending approval, so do NOT assume it saved. Call get_business_plan FIRST, then pass ONLY the section(s) you are changing. For phases/moat/risks you must pass the COMPLETE new array for that section (the whole array is replaced, not merged item-by-item) -- start from the current array and add/edit/remove items as needed. Always include a clear preview_description of exactly what is changing.',
    input_schema: {
      type: 'object',
      properties: {
        vision: { type: 'string', description: 'New vision statement (replaces the current one).' },
        phases: {
          type: 'array',
          description: 'Complete replacement growth roadmap. Each phase: { phase, title, status, items }. status must be "complete", "active", or "upcoming".',
          items: {
            type: 'object',
            properties: {
              phase:  { type: 'string', description: 'e.g. "Phase 2"' },
              title:  { type: 'string', description: 'e.g. "Revenue Engine"' },
              status: { type: 'string', enum: ['complete', 'active', 'upcoming'] },
              items:  { type: 'array', items: { type: 'string' }, description: 'Bullet points for the phase.' },
            },
            required: ['phase', 'title', 'status', 'items'],
          },
        },
        moat: {
          type: 'array',
          description: 'Complete replacement competitive moat list. Each item: { label, desc }.',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              desc:  { type: 'string' },
            },
            required: ['label', 'desc'],
          },
        },
        risks: {
          type: 'array',
          description: 'Complete replacement risk register. Each item: { risk, mitigation }.',
          items: {
            type: 'object',
            properties: {
              risk:       { type: 'string' },
              mitigation: { type: 'string' },
            },
            required: ['risk', 'mitigation'],
          },
        },
        preview_description: { type: 'string', description: 'Plain-English summary of exactly what is changing, shown to Brandon for approval, e.g. "Update Phase 2 MRR target from $20K to $30K and add a risk about API reliability".' },
      },
      required: ['preview_description'],
    },
  },
  {
    name: 'agent_api',
    description: 'Direct access to any connected platform API -- this lets you do ANYTHING the dedicated GHL, ClickUp, Make, Facebook Ads, and Digits agents can do, including writes. Use it for anything the specific tools above do not cover. method GET runs immediately (reads). method POST/PUT/PATCH/DELETE are WRITES: they return a pending approval card and only execute after Brandon approves -- never assume a write ran. Always include a specific preview_description for writes. Prefer the specific tools (get_pnl, get_ghl_pipeline, get_clickup_tasks, etc.) for common reads.',
    input_schema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['ghl', 'clickup', 'make', 'fb', 'digits'], description: 'Which connected system to call.' },
        method:   { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], description: 'GET = read (runs now). POST/PUT/PATCH/DELETE = write (needs approval).' },
        endpoint: { type: 'string', description: 'API path including any query string. GHL (base services.leadconnectorhq.com): /contacts/, /contacts/{id}, /conversations/messages (POST to send SMS/email), /opportunities/search. ClickUp (api.clickup.com/api/v2): /list/{listId}/task (POST create), /task/{taskId} (PUT update, DELETE), /team/{teamId}/task. Make (v2): /scenarios, /scenarios/{id} (PATCH/DELETE). Facebook Graph: /{campaignId} (POST to update status/budget), /act_{accountId}/campaigns. Digits (connect.digits.com): /v1/ledger/statement/balance-sheet?startDate=&endDate=&interval=Year, /v1/ledger/entries/query (POST).' },
        body:     { type: 'object', description: 'JSON body for POST/PUT/PATCH (also Digits POST queries). For the Digits ledger query (/v1/ledger/entries/query) the shape is { "filters": { "occurredAfter": "2026-06-01T00:00:00.000Z", "occurredBefore": "2026-07-01T00:00:00.000Z", "categoryTypes": ["Expenses","CostOfGoodsSold","OtherExpenses"] }, "limit": 1000 }. occurredAfter/occurredBefore are full ISO timestamps; filter the resulting entries by category name client-side (each entry is entryDetails[].entry with amount.amount in cents, category.name, counterparty.name, description).' },
        preview_description: { type: 'string', description: 'Required for writes. Plain-English summary of exactly what will change, with names/values.' },
      },
      required: ['platform', 'method', 'endpoint'],
    },
  },
];

async function executeTool(name, input) {
  switch (name) {
    case 'get_subscriptions': return await toolGetSubscriptions(input.status);
    case 'get_ytd_revenue':   return await toolGetYtdRevenue();
    case 'get_pnl':           return await toolGetPnL(input);
    case 'get_transactions':  return await toolGetTransactions(input);
    case 'get_sales_tax':     return await toolGetSalesTax(input.month);
    case 'get_fb_performance': return await toolGetFbPerformance(input.date_preset, input.level);
    case 'get_fb_campaigns':   return await toolGetFbCampaigns();
    case 'get_ghl_pipeline':   return await toolGetGhlPipeline();
    case 'get_ghl_contacts':   return await toolGetGhlContacts();
    case 'get_make_overview':  return await toolGetMakeOverview();
    case 'get_clickup_tasks':  return await toolGetClickupTasks(input.overdue_only);
    case 'get_clickup_workspace': return await toolGetClickupWorkspace();
    case 'get_business_plan':   return await readBusinessPlan();
    case 'agent_api': {
      // Only reads reach here -- writes are intercepted for approval before execution.
      const method = (input.method || 'GET').toUpperCase();
      if (method === 'GET') return await platformApi(input.platform, 'GET', input.endpoint, null);
      // Digits is read-only and uses POST for ledger/statement queries -- run it
      // inline (with its body) and return the data so it can be summarized.
      if (input.platform === 'digits') return await platformApi('digits', 'POST', input.endpoint, input.body || {});
      throw new Error('Writes must be approved, not executed inline.');
    }
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// -- System prompt --

function buildSystemPrompt(ctx) {
  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const d = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  return [
    `You are an AI business analyst embedded inside Smart Syndicator's internal command center.`,
    `Smart Syndicator is a SaaS platform and CRM built for real estate syndicators and capital raisers.`,
    `You are speaking directly with Brandon, the founder.`,
    `Today: ${date}`,
    ``,
    `== DASHBOARD SNAPSHOT (may be slightly stale) ==`,
    `MRR:            ${d(ctx.mrr || 0)}`,
    `ARR:            ${d((ctx.mrr || 0) * 12)}`,
    `Active Clients: ${ctx.uniqueClients || 0}`,
    `Subscriptions:  ${ctx.subscriptionCount || 0}`,
    `YTD Revenue:    ${d((ctx.ytdRevenue || 0) / 100)}`,
    ``,
    `== LIVE DATA TOOLS ==`,
    `You have tools that pull LIVE data from all connected systems. Always call the relevant tool before answering any numbers question.`,
    ``,
    `Stripe (billing):`,
    `- get_subscriptions(status)   -- subs by status: "active" (MRR/ARR), "canceled" (churn), "all" (full history)`,
    `- get_ytd_revenue             -- year-to-date paid invoices`,
    `- get_sales_tax(YYYY-MM)      -- Texas 8.25% liability for any month`,
    ``,
    `Digits (accounting):`,
    `- get_pnl(...)                -- Digits P&L for any period: pass start_date + end_date for a specific month/quarter/range (e.g. "last month"), or year for a full year`,
    `- get_transactions(start_date, end_date, expenses_only, category_match, limit) -- itemized ledger transactions (date, vendor, category, amount). Use this whenever Brandon wants line items, "transaction level data", "recent transactions", or spend on a specific vendor/category. Read-only, runs immediately -- never route this through agent_api or an approval.`,
    ``,
    `Facebook Ads (paid acquisition):`,
    `- get_fb_performance(date_preset, level) -- level="account" for totals, "campaign"/"adset"/"ad" for breakdowns. Returns spend, impressions, clicks, CTR, CPM, CPC, leads, cost-per-lead, ROAS per row`,
    `- get_fb_campaigns            -- all campaigns with status and budgets`,
    `- toggle_fb_campaign(campaign_id, status, preview_description) -- pause or activate a campaign. ALWAYS call get_fb_campaigns first to get the id. Returns a pending approval -- do not assume it executed.`,
    ``,
    `GHL CRM (contacts and pipeline):`,
    `- get_ghl_pipeline            -- opportunity count, pipeline value, breakdown by stage`,
    `- get_ghl_contacts            -- total contact count`,
    ``,
    `Make.com (automations):`,
    `- get_make_overview           -- scenario count, active vs inactive, last-run times`,
    ``,
    `ClickUp (tasks and projects):`,
    `- get_clickup_tasks(overdue_only) -- open tasks with status, due date, assignee, list, plus totalOpen and overdueCount. Pass overdue_only=true for just-past-due tasks.`,
    `- get_clickup_workspace        -- lists (id, name, space, folder) and team members (id, username, email)`,
    `- create_clickup_task(list_id, name, assignee_ids, due_date, description, preview_description) -- create and assign a task. ALWAYS call get_clickup_workspace FIRST to resolve the list_id and assignee user ids by name. Returns a pending approval -- do not assume it executed. If the list or assignee is ambiguous, ask Brandon which one.`,
    ``,
    `Business Plan (the Business Plan page content):`,
    `- get_business_plan             -- read the current vision, roadmap phases, competitive moat, and risk register`,
    `- update_business_plan(vision?, phases?, moat?, risks?, preview_description) -- edit the plan. ALWAYS call get_business_plan first, then pass only the section(s) you are changing. For phases/moat/risks pass the COMPLETE new array (it replaces that whole section). Returns a pending approval -- do not assume it saved.`,
    ``,
    `Anything else (orchestrator):`,
    `- agent_api(platform, method, endpoint, body, preview_description) -- direct access to ghl, clickup, make, fb, or digits. Do anything the dedicated agents can, including writes (send SMS, create/update/delete contacts, tasks, opportunities, scenarios, campaigns). GET runs now; POST/PUT/PATCH/DELETE require Brandon's approval -- never assume a write executed. Use the specific tools above for common reads; use agent_api for everything else.`,
    ``,
    `RULE: For any question requiring accurate numbers, call the appropriate tool first. Do not guess from the snapshot above.`,
    `RULE: For any write/change, use the right tool (create_clickup_task, toggle_fb_campaign, or agent_api) and present it for approval. Confirm the target (which contact, task, campaign, list) before proposing. Never claim a change is done until the approval has executed.`,
    ``,
    `== STYLE ==`,
    `Answer directly and concisely. Show calculations when doing math. No filler. Brandon is a busy founder.`,
  ].join('\n');
}

// -- Route --

const VALID_ROLES = new Set(['user', 'assistant']);
const MAX_MESSAGE_LEN = 4000;
const MAX_HISTORY_ENTRIES = 40;
const MAX_HISTORY_CONTENT_LEN = 10000;

router.post('/chat', async (req, res) => {
  const { message, history, context, sessionId } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message required' });
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return res.status(400).json({ error: 'message too long (max 4000 characters)' });
  }

  // Only pass known numeric fields into the system prompt -- never raw client strings
  const safeContext = {
    mrr:               Number((context || {}).mrr)               || 0,
    uniqueClients:     Number((context || {}).uniqueClients)     || 0,
    subscriptionCount: Number((context || {}).subscriptionCount) || 0,
    ytdRevenue:        Number((context || {}).ytdRevenue)        || 0,
  };

  // Validate history: only known roles, string content, bounded length
  const safeHistory = Array.isArray(history)
    ? history
        .slice(-MAX_HISTORY_ENTRIES)
        .filter(m => VALID_ROLES.has(m?.role) && typeof m?.content === 'string')
        .map(m => ({ role: m.role, content: m.content.slice(0, MAX_HISTORY_CONTENT_LEN) }))
    : [];

  const userMessage = message.trim();
  const systemPrompt = buildSystemPrompt(safeContext);
  let messages = [
    ...safeHistory,
    { role: 'user', content: userMessage },
  ];

  let attempts = 3;
  while (attempts > 0) {
    try {
      // Agentic loop -- continues until Claude returns end_turn (no more tool calls)
      while (true) {
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
          tools: TOOLS,
          messages,
        });

        if (response.stop_reason === 'end_turn') {
          const text = response.content.find(b => b.type === 'text')?.text || '';
          await persistMessages(sessionId, userMessage, text);
          return res.json({ reply: text });
        }

        if (response.stop_reason === 'tool_use') {
          // Intercept write actions -- return pending_action for client-side approval
          const writeBlock = response.content.find(b => b.type === 'tool_use' && isAnalystWrite(b));
          if (writeBlock) {
            const claudeText = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
            const { preview_description, ...rest } = writeBlock.input;
            // Persist the turn now so the request + proposal survive a reload even
            // before the action is approved. The approval/result is appended later
            // by /chat/execute.
            await persistMessages(sessionId, userMessage, claudeText || `(Proposed an action for approval: ${preview_description})`);
            return res.json({
              type:    'pending_action',
              message: claudeText,
              preview: preview_description,
              sessionId,
              action:  { type: writeBlock.name, ...rest },
            });
          }

          const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
          const toolResults = await Promise.all(
            toolUseBlocks.map(async (block) => {
              try {
                const result = await executeTool(block.name, block.input);
                return {
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: JSON.stringify(result, null, 2),
                };
              } catch (err) {
                return {
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: `Error: ${err.message}`,
                  is_error: true,
                };
              }
            })
          );
          messages = [
            ...messages,
            { role: 'assistant', content: response.content },
            { role: 'user', content: toolResults },
          ];
          continue;
        }

        // Unexpected stop reason -- return whatever text exists
        const text = response.content.find(b => b.type === 'text')?.text || '';
        const reply = text || 'No response generated.';
        await persistMessages(sessionId, userMessage, reply);
        return res.json({ reply });
      }
    } catch (err) {
      attempts--;
      if (attempts === 0) {
        console.error('Chat API error:', err.message);
        return res.status(500).json({ error: 'Failed to get a response. Please try again.' });
      }
      await new Promise(r => setTimeout(r, 1000 * (3 - attempts)));
    }
  }
});

// POST /api/chat/execute -- run an approved action from the analyst
router.post('/chat/execute', async (req, res) => {
  const { action, sessionId, preview } = req.body;
  if (!action?.type) return res.status(400).json({ error: 'action.type required' });

  // Append the approval + result to the session transcript (best effort).
  const logResult = (replyText) =>
    persistMessages(sessionId, `[Action approved]${preview ? ` ${preview}` : ''}`, replyText);

  if (action.type === 'toggle_fb_campaign') {
    const { campaign_id, status } = action;
    if (!campaign_id || !status) return res.status(400).json({ error: 'campaign_id and status required' });
    const token = process.env.META_ACCESS_TOKEN;
    if (!token) return res.status(400).json({ error: 'META_ACCESS_TOKEN not configured' });

    for (let i = 0; i < 3; i++) {
      try {
        const r    = await fetch(`https://graph.facebook.com/v21.0/${campaign_id}`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ status, access_token: token }),
        });
        const data = await r.json();
        if (data.error) return res.status(400).json({ error: data.error.message });
        const verb = status === 'PAUSED' ? 'paused' : 'activated';
        const reply = `Campaign ${verb} successfully.`;
        await logResult(reply);
        return res.json({ reply });
      } catch (err) {
        if (i === 2) return res.status(502).json({ error: err.message });
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }

  if (action.type === 'create_clickup_task') {
    const { list_id, name, assignee_ids, description, due_date } = action;
    if (!list_id || !name) return res.status(400).json({ error: 'list_id and name required' });

    const body = { name };
    if (Array.isArray(assignee_ids) && assignee_ids.length) body.assignees = assignee_ids;
    if (description) body.description = description;
    if (due_date) {
      const ts = Date.parse(due_date);
      if (!isNaN(ts)) { body.due_date = ts; body.due_date_time = false; }
    }

    try {
      const data = await clickupPost(`/list/${list_id}/task`, body);
      if (data?.id) {
        const reply = `Task created: "${data.name}"${data.url ? ` -- ${data.url}` : ''}`;
        await logResult(reply);
        return res.json({ reply });
      }
      return res.status(400).json({ error: data?.err || 'ClickUp did not return a task id' });
    } catch (err) {
      return res.status(502).json({ error: `Failed to create task: ${err.message}` });
    }
  }

  if (action.type === 'update_business_plan') {
    const { type, ...partial } = action; // everything except the discriminator is plan content
    try {
      await updateBusinessPlan(partial);
      const changed = ['vision', 'phases', 'moat', 'risks'].filter(k => partial[k] !== undefined);
      const reply = `Business plan updated${changed.length ? ` (${changed.join(', ')})` : ''}.`;
      await logResult(reply);
      return res.json({ reply });
    } catch (err) {
      return res.status(502).json({ error: `Failed to update business plan: ${err.message}` });
    }
  }

  if (action.type === 'agent_api') {
    const { platform, method, endpoint, body } = action;
    if (!platform || !method || !endpoint) return res.status(400).json({ error: 'platform, method, endpoint required' });
    if ((method || '').toUpperCase() === 'GET') return res.status(400).json({ error: 'GET is a read -- it does not need approval' });

    try {
      const result = await platformApi(platform, method, endpoint, body);
      const ok = result.status < 300;
      if (!ok) {
        // message can be a string or an array of strings depending on platform --
        // handle both so we surface the real reason, not just its first character.
        const rawMsg = result.data?.message;
        const detail = (Array.isArray(rawMsg) ? rawMsg[0] : rawMsg) ||
          result.data?.err || result.data?.error?.message || JSON.stringify(result.data).slice(0, 300);
        const reply = `That didn't go through -- ${platform} returned HTTP ${result.status}: ${detail}`;
        await logResult(reply);
        return res.json({ reply });
      }
      const d = result.data || {};
      const ref = d.url || d.id || d.contact?.id || d.opportunity?.id || d.task?.id || '';
      const reply = `Done.${ref ? ` (${ref})` : ''}`;
      await logResult(reply);
      return res.json({ reply });
    } catch (err) {
      return res.status(502).json({ error: `Execution failed: ${err.message}` });
    }
  }

  res.status(400).json({ error: `Unknown action type: ${action.type}` });
});

module.exports = router;
