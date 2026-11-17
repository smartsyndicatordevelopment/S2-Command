const router = require('express').Router();
const Anthropic = require('@anthropic-ai/sdk');
const Stripe = require('stripe');
const fetch = require('node-fetch');
const { query } = require('../lib/db');
const { readPlan: readBusinessPlan, updatePlan: updateBusinessPlan } = require('./businessPlan');
const metricsCache = require('../lib/metricsCache');
const { calculateSalesTax, SalesTaxInputError } = require('../lib/salesTaxCalc');

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

async function toolGetSalesTax(month) {
  // One shared calculation (lib/salesTaxCalc.js) so the chat assistant, the Sales Tax page and the MCP tool always agree.
  let r;
  try {
    r = await calculateSalesTax(month);
  } catch (err) {
    if (err instanceof SalesTaxInputError) throw new Error(err.message);
    throw err;
  }
  const brief = (t) => ({ name: t.name, amountDollars: t.amount / 100, stateSource: t.stateSource });
  return {
    month: r.month,
    txRevenueDollars: r.summary.txRevenue,
    taxRate: '8.25%',
    taxDueDollars: r.summary.taxDue,
    txTransactionCount: r.summary.txTransactionCount,
    otherStateCount: r.summary.otherCount,
    unknownCount: r.summary.unknownCount,
    txTransactions: r.txTransactions.map(brief),
    otherTransactions: r.otherTransactions.map(brief),
    unknownTransactions: r.unknownTransactions.map(t => ({ ...brief(t), note: 'No state data -- may need manual review' })),
  };
}

// -- Generic platform access (orchestrator) --
//
// One helper per connected platform, each fixed to that platform's API host and
// auth so the model can only reach known systems (it supplies the path, never the
// host). GETs are reads; POST/PUT/PATCH/DELETE are writes and are gated behind the
// approval card before they run. This is what lets the analyst do everything the
// dedicated Make / Facebook agents can do.

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

function platformApi(platform, method, endpoint, body) {
  switch (platform) {
    case 'make':    return makeApi(method, endpoint, body);
    case 'fb':      return fbApi(method, endpoint, body);
    default: throw new Error(`Unknown platform: ${platform}`);
  }
}

// A tool_use block that mutates data and must be approved before it runs.
function isAnalystWrite(b) {
  if (b.name === 'toggle_fb_campaign') return true;
  if (b.name === 'update_business_plan') return true;
  if (b.name === 'agent_api') {
    const method = (b.input?.method || 'GET').toUpperCase();
    if (method === 'GET') return false;
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
    name: 'get_make_overview',
    description: 'Fetch Make.com automation workspace overview: total scenarios, how many are active vs inactive, and scenario names with last-run times. Use for automation health and workflow questions.',
    input_schema: { type: 'object', properties: {}, required: [] },
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
    description: 'Fetch the current Business Plan document (the content shown on the Business Plan page): vision statement, growth roadmap phases, competitive moat, risk register, and the CROS cost comparison (Smart Syndicator vs assemble-it-yourself, used as a sales/marketing tool). ALWAYS call this before update_business_plan so you edit the real current content rather than guessing.',
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
        costComparison: {
          type: 'object',
          description: 'Complete replacement CROS cost comparison (the sales/marketing tool on the Business Plan page). Shape: { headline, positioning, ssLabel, ssTotal, ssDetail, diyLabel, diyTotal, diyDetail, rows: [{ item, diy, ss }], footnote }. Pass the whole object with every field.',
          properties: {
            headline:    { type: 'string' },
            positioning: { type: 'string' },
            ssLabel:     { type: 'string' },
            ssTotal:     { type: 'string' },
            ssDetail:    { type: 'string' },
            diyLabel:    { type: 'string' },
            diyTotal:    { type: 'string' },
            diyDetail:   { type: 'string' },
            rows: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  item: { type: 'string' },
                  diy:  { type: 'string' },
                  ss:   { type: 'string' },
                },
                required: ['item', 'diy', 'ss'],
              },
            },
            footnote: { type: 'string' },
          },
          required: ['headline', 'positioning', 'ssLabel', 'ssTotal', 'ssDetail', 'diyLabel', 'diyTotal', 'diyDetail', 'rows', 'footnote'],
        },
        preview_description: { type: 'string', description: 'Plain-English summary of exactly what is changing, shown to Brandon for approval, e.g. "Update Phase 2 MRR target from $20K to $30K and add a risk about API reliability".' },
      },
      required: ['preview_description'],
    },
  },
  {
    name: 'agent_api',
    description: 'Direct access to the Make.com and Facebook Ads APIs. Reads (GET) run immediately; any POST, PUT, PATCH or DELETE is shown to Brandon for approval first.',
    input_schema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['make', 'fb'], description: 'Which connected system to call.' },
        method:   { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], description: 'GET = read (runs now). POST/PUT/PATCH/DELETE = write (needs approval).' },
        endpoint: { type: 'string', description: 'API path including any query string, for example the Make.com path /scenarios or a Facebook Graph path.' },
        body:     { type: 'object', description: 'JSON body for POST/PUT/PATCH.' },
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
    case 'get_sales_tax':     return await toolGetSalesTax(input.month);
    case 'get_fb_performance': return await toolGetFbPerformance(input.date_preset, input.level);
    case 'get_fb_campaigns':   return await toolGetFbCampaigns();
    case 'get_make_overview':  return await toolGetMakeOverview();
    case 'get_business_plan':   return await readBusinessPlan();
    case 'agent_api': {
      // Only reads reach here -- writes are intercepted for approval before execution.
      const method = (input.method || 'GET').toUpperCase();
      if (method === 'GET') return await platformApi(input.platform, 'GET', input.endpoint, null);
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
    `Smart Syndicator is a done-for-you capital-raising system (CROS: Capital Raising Operating System) for real estate syndicators. It runs on a CRM under the hood, but it is positioned and sold on the outcome -- never as a CRM (CRM framing anchors prospects to $50-150/month tools and causes sticker shock at $2,000 setup + $297/month).`,
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
    `Facebook Ads (paid acquisition):`,
    `- get_fb_performance(date_preset, level) -- level="account" for totals, "campaign"/"adset"/"ad" for breakdowns. Returns spend, impressions, clicks, CTR, CPM, CPC, leads, cost-per-lead, ROAS per row`,
    `- get_fb_campaigns            -- all campaigns with status and budgets`,
    `- toggle_fb_campaign(campaign_id, status, preview_description) -- pause or activate a campaign. ALWAYS call get_fb_campaigns first to get the id. Returns a pending approval -- do not assume it executed.`,
    ``,
    `Make.com (automations):`,
    `- get_make_overview           -- scenario count, active vs inactive, last-run times`,
    ``,
    `Business Plan (the Business Plan page content):`,
    `- get_business_plan             -- read the current vision, roadmap phases, competitive moat, risk register, and CROS cost comparison`,
    `- update_business_plan(vision?, phases?, moat?, risks?, costComparison?, preview_description) -- edit the plan. ALWAYS call get_business_plan first, then pass only the section(s) you are changing. For phases/moat/risks pass the COMPLETE new array, and for costComparison the COMPLETE new object (each replaces that whole section). Returns a pending approval -- do not assume it saved.`,
    ``,
    `Anything else (orchestrator):`,
    `- agent_api(platform, method, endpoint, body, preview_description) -- direct access to make or fb. Reads run now; writes need approval.`,
    ``,
    `RULE: For any question requiring accurate numbers, call the appropriate tool first. Do not guess from the snapshot above.`,
    `RULE: For any write/change, use the right tool (toggle_fb_campaign or agent_api) and present it for approval. Confirm the target before proposing the change.`,
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

// Image attachments (pasted or dropped into the Overview agent). Anthropic vision
// accepts base64 jpeg/png/gif/webp up to 5MB each; cap the count so one request
// stays within the 12mb body limit set in index.js.
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function sanitizeImages(images) {
  if (!Array.isArray(images)) return [];
  const out = [];
  for (const img of images.slice(0, MAX_IMAGES)) {
    if (!img || typeof img !== 'object') continue;
    const media_type = img.media_type;
    let data = img.data;
    if (!ALLOWED_IMAGE_TYPES.has(media_type) || typeof data !== 'string') continue;
    // Strip a data-URL prefix defensively -- the client should send raw base64.
    const marker = data.indexOf('base64,');
    if (marker !== -1) data = data.slice(marker + 'base64,'.length);
    data = data.trim();
    if (!data) continue;
    // base64 decodes to ~3/4 of its length in bytes.
    if (Math.floor(data.length * 0.75) > MAX_IMAGE_BYTES) continue;
    out.push({ type: 'image', source: { type: 'base64', media_type, data } });
  }
  return out;
}

router.post('/chat', async (req, res) => {
  const { message, history, context, sessionId, images } = req.body;

  const safeImages = sanitizeImages(images);
  const hasText = typeof message === 'string' && !!message.trim();

  if (!hasText && safeImages.length === 0) {
    return res.status(400).json({ error: 'message or image required' });
  }
  if (typeof message === 'string' && message.length > MAX_MESSAGE_LEN) {
    return res.status(400).json({ error: 'message too long (max 4000 characters)' });
  }

  // Only pass known numeric fields into the system prompt -- never raw client strings
  const safeContext = {
    mrr:               Number((context || {}).mrr)               || 0,
    uniqueClients:     Number((context || {}).uniqueClients)     || 0,
    subscriptionCount: Number((context || {}).subscriptionCount) || 0,
    ytdRevenue:        Number((context || {}).ytdRevenue)        || 0,
  };

  // Validate history: only known roles, non-empty string content, bounded length
  const safeHistory = Array.isArray(history)
    ? history
        .slice(-MAX_HISTORY_ENTRIES)
        .filter(m => VALID_ROLES.has(m?.role) && typeof m?.content === 'string' && m.content.trim())
        .map(m => ({ role: m.role, content: m.content.slice(0, MAX_HISTORY_CONTENT_LEN) }))
    : [];

  const userMessage = hasText ? message.trim() : '';
  const systemPrompt = buildSystemPrompt(safeContext);

  // Current turn: image blocks (if any) followed by the text. Anthropic needs a
  // non-empty text block, so fall back to a neutral prompt when only images are sent.
  const userContent = safeImages.length
    ? [...safeImages, { type: 'text', text: userMessage || 'Please review the attached image(s).' }]
    : userMessage;

  // What we persist to the transcript -- base64 images are never stored; a marker
  // stands in so the reopened chat reads sensibly.
  const persistedUserText = userMessage ||
    `[${safeImages.length} image${safeImages.length > 1 ? 's' : ''} attached]`;

  let messages = [
    ...safeHistory,
    { role: 'user', content: userContent },
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
          await persistMessages(sessionId, persistedUserText, text);
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
            await persistMessages(sessionId, persistedUserText, claudeText || `(Proposed an action for approval: ${preview_description})`);
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
        await persistMessages(sessionId, persistedUserText, reply);
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

  if (action.type === 'update_business_plan') {
    const { type, ...partial } = action; // everything except the discriminator is plan content
    try {
      await updateBusinessPlan(partial);
      const changed = ['vision', 'phases', 'moat', 'risks', 'costComparison'].filter(k => partial[k] !== undefined);
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
