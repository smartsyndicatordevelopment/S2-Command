const router = require('express').Router();
const {
  digitsConfigured, digitsQueryEntries, ensureS2Source, syncParties, syncTransactions,
  partyRef, partyExternalId, S2_SOURCE_EXTERNAL_ID, STRIPE_PARTY_ID, LABELS,
} = require('./digits');

// Income re-categorization: rebuild the "Sales Uncategorized" Stripe transactions
// with the correct income category and write them into our own Digits source. The
// user then bulk-deletes the native originals, leaving ours as the record of truth.

const UNCATEGORIZED = 'Sales Uncategorized';
const ALL_LEG_TYPES = ['Income', 'Assets', 'Liabilities', 'Expenses', 'CostOfGoodsSold', 'OtherIncome', 'OtherExpenses'];

// Deterministic re-categorization rules. Ordered: the first matching rule wins;
// DEFAULT_RULE applies to everything else. These same rules drive both the
// classifier and what the UI displays, so the two can never drift apart.
const RULES = [
  {
    when: 'Description contains "subscription"',
    categoryName: 'Saas Income (Stripe)',
    label: LABELS.subscription,
    test: (d) => /subscription/i.test(d || ''),
  },
];
const DEFAULT_RULE = {
  when: 'Everything else (e.g. GHL "Auto-Recharge" wallet top-ups)',
  categoryName: 'Rebilling Income',
  label: LABELS.rebilling,
};

function classifyIncome(description) {
  const rule = RULES.find(r => r.test(description)) || DEFAULT_RULE;
  return { label: rule.label, categoryName: rule.categoryName };
}

// Display-safe rule list for the UI (no test functions).
function rulesDisplay() {
  return [
    ...RULES.map(r => ({ when: r.when, categoryName: r.categoryName })),
    { when: DEFAULT_RULE.when, categoryName: DEFAULT_RULE.categoryName, fallback: true },
  ];
}

const VALID_LABELS = new Set([LABELS.subscription, LABELS.rebilling, LABELS.consulting]);

// Pull the month's Sales Uncategorized income transactions, reconstructing the full
// double-entry (income + Stripe Clearing + Stripe Fee legs) from the ledger.
async function getUncategorizedIncome(year, month) {
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const end   = new Date(Date.UTC(year, month, 1)).toISOString();
  const details = await digitsQueryEntries({ occurredAfter: start, occurredBefore: end, categoryTypes: ALL_LEG_TYPES });

  // Group legs by transaction.
  const byTxn = new Map();
  for (const ed of details) {
    const tid = ed.transactionId;
    if (!tid) continue;
    if (!byTxn.has(tid)) byTxn.set(tid, []);
    byTxn.get(tid).push(ed);
  }

  const items = [];
  for (const [tid, legs] of byTxn) {
    const incomeLeg = legs.find(l => l.entry?.category?.type === 'Income');
    if (!incomeLeg || incomeLeg.entry?.category?.name !== UNCATEGORIZED) continue;

    const income = incomeLeg.entry;
    const amountCents = Math.round(Math.abs(Number(income.amount?.amount) || 0));
    if (!amountCents) continue;

    const description = income.description || '';
    const party = income.counterparty?.name || null;
    const date = (incomeLeg.date || '').split('T')[0];
    const { label, categoryName } = classifyIncome(description);

    // Offsetting legs -- map each to one of our source labels.
    const others = legs.filter(l => l !== incomeLeg).map(l => {
      const e = l.entry || {};
      const cat = e.category || {};
      let legLabel = null;
      if (cat.name === 'Stripe Clearing') legLabel = LABELS.clearing;
      else if (cat.type === 'Expenses' || cat.type === 'CostOfGoodsSold') legLabel = LABELS.fees;
      return {
        amountCents: Math.round(Math.abs(Number(e.amount?.amount) || 0)),
        label: legLabel,
        categoryName: cat.name || null,
        description: e.description || '',
      };
    });

    // Only auto-apply transactions whose structure we fully recognize (every
    // offsetting leg mapped to a known label). Anything unusual is flagged, not guessed.
    const recognized = others.length > 0 && others.every(l => l.label && l.amountCents > 0);

    items.push({
      transactionId: tid,
      date,
      party,
      description,
      amountDollars: amountCents / 100,
      currentCategory: UNCATEGORIZED,
      proposedCategory: categoryName,
      proposedLabel: label,
      incomeCents: amountCents,
      others,
      recognized,
    });
  }

  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return items;
}

// Build one SourceTransaction from a preview item.
function buildTransaction(item) {
  const custId = partyExternalId(item.party);
  const entries = [{
    amount: { amount: item.incomeCents, code: 'USD' },
    type: 'Credit',
    category: { label: item.proposedLabel },
    description: item.description,
    counterparty: partyRef(custId),
  }];
  for (const leg of item.others) {
    entries.push({
      amount: { amount: leg.amountCents, code: 'USD' },
      type: 'Debit',
      category: { label: leg.label },
      description: leg.description || undefined,
      counterparty: partyRef(STRIPE_PARTY_ID),
    });
  }
  return {
    externalId: { issuer: 'command.smartsyndicator.com', id: `recat-${item.transactionId}` },
    sourceId: S2_SOURCE_EXTERNAL_ID,
    date: `${item.date}T12:00:00Z`,
    memo: item.description,
    entries,
  };
}

async function applyRecat(items) {
  await ensureS2Source();

  // Sync every distinct customer party (Digits dedupes to existing parties by name)
  // plus Stripe.
  const partyMap = new Map();
  for (const it of items) {
    if (it.party) partyMap.set(partyExternalId(it.party), it.party);
  }
  const parties = [
    { externalId: STRIPE_PARTY_ID, name: 'Stripe', kind: 'Business' },
    ...[...partyMap].map(([externalId, name]) => ({ externalId, name, kind: 'Business' })),
  ];
  await syncParties(parties);

  const txns = items.map(buildTransaction);
  const results = [];
  for (let i = 0; i < txns.length; i += 100) {
    results.push(await syncTransactions(txns.slice(i, i + 100)));
  }
  return { written: txns.length };
}

// Preview snapshots are cached server-side so Apply uses ledger-authoritative data
// (never client-supplied amounts) AND still works after the user has deleted the
// originals (the delete-first ordering). Short-lived, in-memory.
const previewCache = new Map(); // previewId -> { items, at }
const PREVIEW_TTL_MS = 60 * 60 * 1000;

function cachePreview(items) {
  const now = Date.now();
  for (const [id, v] of previewCache) if (now - v.at > PREVIEW_TTL_MS) previewCache.delete(id);
  const previewId = `pv_${now}_${Math.random().toString(36).slice(2, 10)}`;
  previewCache.set(previewId, { items, at: now });
  return previewId;
}

// GET /api/digits/recat/preview?year=&month=
router.get('/digits/recat/preview', async (req, res) => {
  if (!digitsConfigured()) return res.status(400).json({ error: 'Digits is not connected' });
  const year = parseInt(req.query.year, 10);
  const month = parseInt(req.query.month, 10);
  if (!year || !month || month < 1 || month > 12) return res.status(400).json({ error: 'valid year and month required' });
  try {
    const items = await getUncategorizedIncome(year, month);
    const previewId = cachePreview(items);
    res.json({
      previewId, year, month,
      rules: rulesDisplay(),
      count: items.length,
      subscriptionCount: items.filter(i => i.proposedLabel === LABELS.subscription).length,
      rebillingCount:    items.filter(i => i.proposedLabel === LABELS.rebilling).length,
      unrecognizedCount: items.filter(i => !i.recognized).length,
      items,
    });
  } catch (err) {
    console.error('recat preview error:', err.message);
    res.status(500).json({ error: 'Failed to load uncategorized income' });
  }
});

// POST /api/digits/recat/apply  { previewId, overrides?: { transactionId: label } }
// Uses the cached preview snapshot -- works whether or not the originals have been
// deleted yet, and never trusts client-supplied amounts/legs.
router.post('/digits/recat/apply', async (req, res) => {
  if (!digitsConfigured()) return res.status(400).json({ error: 'Digits is not connected' });
  const { previewId, overrides } = req.body || {};
  const snapshot = previewId && previewCache.get(previewId);
  if (!snapshot) return res.status(410).json({ error: 'Preview expired -- please refresh the preview and try again.' });

  try {
    const applicable = snapshot.items.filter(i => i.recognized);
    if (overrides && typeof overrides === 'object') {
      for (const it of applicable) {
        const ov = overrides[it.transactionId];
        if (ov && VALID_LABELS.has(ov)) it.proposedLabel = ov;
      }
    }

    if (!applicable.length) {
      return res.json({ applied: 0, skipped: snapshot.items.length, toDelete: [], written: 0 });
    }

    const result = await applyRecat(applicable);
    res.json({
      applied: applicable.length,
      skipped: snapshot.items.length - applicable.length,
      written: result.written,
      // The exact originals to bulk-delete in Digits.
      toDelete: applicable.map(i => ({
        transactionId: i.transactionId, date: i.date, party: i.party,
        amountDollars: i.amountDollars, description: i.description,
      })),
    });
  } catch (err) {
    console.error('recat apply error:', err.message);
    res.status(500).json({ error: `Failed to apply: ${err.message}` });
  }
});

module.exports = router;
