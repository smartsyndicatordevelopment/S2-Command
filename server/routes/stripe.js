const router = require('express').Router();
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'operations@smartsyndicator.com';

// Map (listPrice cents, interval) -> display name for plans that have no Stripe nickname.
// Key format: "<cents>|<interval>"
const PLAN_NAME_MAP = {
  '29700|month':   'Smart Syndicator Pro Monthly',
  '297000|year':   'Smart Syndicator Pro Annual',
};

function resolvePlanName(price) {
  // Explicit map wins -- overrides any Stripe nickname for known price points
  const key = `${price?.unit_amount}|${price?.recurring?.interval}`;
  if (PLAN_NAME_MAP[key]) return PLAN_NAME_MAP[key];
  // Fall back to Stripe nickname, then generic label
  return price?.nickname || 'Plan';
}

async function withRetry(fn, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

// Paginate through all Stripe list results
async function listAll(fetcher) {
  const results = [];
  let hasMore = true;
  let startingAfter;

  while (hasMore) {
    const batch = await withRetry(() => fetcher(startingAfter));
    results.push(...batch.data);
    hasMore = batch.has_more;
    if (batch.data.length > 0) {
      startingAfter = batch.data[batch.data.length - 1].id;
    } else {
      hasMore = false;
    }
  }

  return results;
}

// Fetch last paid invoice amount for a subscription
async function getLastInvoiceAmount(subId) {
  try {
    const invoices = await withRetry(() =>
      stripe.invoices.list({ subscription: subId, status: 'paid', limit: 1 })
    );
    return invoices.data.length > 0 ? invoices.data[0].total : null;
  } catch {
    return null;
  }
}

function buildSubResult(sub, actualAmount) {
  const item = sub.items.data[0];
  const price = item?.price;
  const listPrice = price?.unit_amount || 0;
  return {
    id: sub.id,
    customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
    customerName: sub.customer?.name || sub.customer?.email || 'Unknown',
    customerEmail: sub.customer?.email || '',
    planName: resolvePlanName(price),
    interval: price?.recurring?.interval || 'month',
    listPrice,
    actualAmount: actualAmount !== null ? actualAmount : listPrice,
    created: sub.created,
    currentPeriodEnd: sub.current_period_end,
    cancelAt: sub.cancel_at || null,
    canceledAt: sub.canceled_at || null,
    status: sub.status,
    paused: !!sub.pause_collection,
  };
}

router.get('/subscriptions', async (req, res) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const twelveMonthsAgo = now - 365 * 24 * 60 * 60;

    // Fetch all subscription statuses and all-time paid invoices in parallel
    // Single invoice fetch (all-time, customer expanded) covers both spend tracking and one-offs
    const [rawActive, rawPaused, rawCanceled, allInvoices] = await Promise.all([
      listAll((cursor) =>
        stripe.subscriptions.list({
          status: 'active',
          limit: 100,
          expand: ['data.customer'],
          ...(cursor && { starting_after: cursor }),
        })
      ),
      // status:'paused' is a newer Stripe feature; catch API errors gracefully
      listAll((cursor) =>
        stripe.subscriptions.list({
          status: 'paused',
          limit: 100,
          expand: ['data.customer'],
          ...(cursor && { starting_after: cursor }),
        })
      ).catch(() => []),
      listAll((cursor) =>
        stripe.subscriptions.list({
          status: 'canceled',
          limit: 100,
          expand: ['data.customer'],
          ...(cursor && { starting_after: cursor }),
        })
      ),
      listAll((cursor) =>
        stripe.invoices.list({
          status: 'paid',
          limit: 100,
          expand: ['data.customer'],
          ...(cursor && { starting_after: cursor }),
        })
      ),
    ]);

    // Partition active subs: legacy-paused (pause_collection set) vs truly active
    const ownerFilter = (s) => (s.customer?.email || '') !== OWNER_EMAIL;

    const trueActive    = rawActive.filter(s => ownerFilter(s) && !s.cancel_at && !s.pause_collection);
    const legacyPaused  = rawActive.filter(s => ownerFilter(s) && !!s.pause_collection);
    const newPaused     = rawPaused.filter(ownerFilter);
    const recentCanceled = rawCanceled.filter(s =>
      ownerFilter(s) && s.canceled_at && s.canceled_at >= twelveMonthsAgo
    );

    const allPaused = [...legacyPaused, ...newPaused];

    const allCanceled = rawCanceled.filter(s => ownerFilter(s) && s.canceled_at);
    const totalEverCount = trueActive.length + allPaused.length + allCanceled.length;
    const totalCanceledAllTime = allCanceled.length;

    // Build allowed customer ID set (owner already filtered) for invoice aggregation
    const allowedCustomerIds = new Set(
      [...trueActive, ...allPaused, ...allCanceled]
        .map(s => typeof s.customer === 'string' ? s.customer : s.customer?.id)
        .filter(Boolean)
    );

    // Total all-time spend per customer from paid invoices (cents)
    const customerSpend = {};
    allInvoices.forEach(inv => {
      const custId = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id;
      if (custId && allowedCustomerIds.has(custId) && inv.total > 0) {
        customerSpend[custId] = (customerSpend[custId] || 0) + inv.total;
      }
    });

    // Average LTV across all unique customers who have spend recorded
    const spendValues = Object.values(customerSpend);
    const avgLtv = spendValues.length > 0
      ? spendValues.reduce((s, v) => s + v, 0) / spendValues.length
      : 0;

    // Average subscription length in months (active: length so far; canceled: full lifespan)
    const allSubsForLength = [...trueActive, ...allPaused, ...allCanceled];
    const avgSubLengthMonths = allSubsForLength.length > 0
      ? allSubsForLength.reduce((s, sub) => {
          const end = sub.canceled_at || now;
          return s + (end - sub.created) / (30.44 * 24 * 3600);
        }, 0) / allSubsForLength.length
      : 0;

    // New customers acquired in the current calendar year
    const thisYearStart = Math.floor(new Date(new Date().getFullYear(), 0, 1).getTime() / 1000);
    const newCustomersThisYear = [...trueActive, ...allPaused, ...allCanceled]
      .filter(s => s.created >= thisYearStart).length;

    // New subscription-product customers in trailing 3 months (matching CAC calculation window)
    // isSubProduct defined below; computed after subProductsEver is available -- placeholder replaced inline
    const threeMonthsAgo = now - 90 * 24 * 60 * 60;
    const newCustomersLast3Months = [...trueActive, ...allPaused, ...allCanceled]
      .filter(s => {
        const price = s.items?.data?.[0]?.price;
        const key = `${price?.unit_amount}|${price?.recurring?.interval}`;
        return (key in PLAN_NAME_MAP) && s.created >= threeMonthsAgo;
      }).length;

    // Windowed stats for dynamic LTV / CAC window selector on the Customers page
    // Only subscription products (price keys in PLAN_NAME_MAP) count for CAC and signup chart.
    const allSubsEver = [...trueActive, ...allPaused, ...allCanceled];
    const isSubProduct = (sub) => {
      const price = sub.items?.data?.[0]?.price;
      const key = `${price?.unit_amount}|${price?.recurring?.interval}`;
      return key in PLAN_NAME_MAP;
    };
    const subProductsEver = allSubsEver.filter(isSubProduct);
    const subCustId = s => (typeof s.customer === 'string' ? s.customer : s.customer?.id);
    const windowedStats = {};
    for (const days of [30, 90, 180, 365]) {
      const cutoff = now - days * 24 * 3600;
      const ids = new Set(subProductsEver.filter(s => s.created >= cutoff).map(subCustId).filter(Boolean));
      const spends = [...ids].map(id => customerSpend[id] || 0);
      windowedStats[days] = {
        newCustomers: ids.size,
        avgLtv: ids.size > 0 ? spends.reduce((a, b) => a + b, 0) / ids.size : 0,
      };
    }
    const allSubIds = new Set(subProductsEver.map(subCustId).filter(Boolean));
    const allSubSpends = [...allSubIds].map(id => customerSpend[id] || 0);
    windowedStats.all = {
      newCustomers: allSubIds.size,
      avgLtv: allSubIds.size > 0 ? allSubSpends.reduce((a, b) => a + b, 0) / allSubIds.size : 0,
    };

    // Monthly signup counts keyed "YYYY-MM" -- subscription products only
    const monthlySignups = {};
    subProductsEver.forEach(sub => {
      const d = new Date(sub.created * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlySignups[key] = (monthlySignups[key] || 0) + 1;
    });

    // Resolve invoice amounts for each group in parallel (N concurrent lookups per group)
    const resolveGroup = (subs) =>
      Promise.all(
        subs.map(async (sub) => {
          const actualAmount = await getLastInvoiceAmount(sub.id);
          const custId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
          return { ...buildSubResult(sub, actualAmount), totalSpend: customerSpend[custId] || 0 };
        })
      );

    const [activeResults, pausedResults, canceledResults] = await Promise.all([
      resolveGroup(trueActive),
      resolveGroup(allPaused),
      resolveGroup(recentCanceled),
    ]);

    // MRR from active only -- paused subs explicitly excluded
    const mrr = activeResults.reduce((sum, s) => {
      const amt = s.actualAmount / 100;
      return sum + (s.interval === 'year' ? amt / 12 : amt);
    }, 0);

    const uniqueClients = new Set(activeResults.map(s => s.customerId)).size;

    // One-off transactions: paid invoices with no linked subscription (all-time)
    const oneOffResults = allInvoices
      .filter(inv => !inv.subscription && (inv.customer?.email || '').toLowerCase() !== OWNER_EMAIL && inv.total > 0)
      .map(inv => ({
        id: inv.id,
        customerId: typeof inv.customer === 'string' ? inv.customer : inv.customer?.id,
        customerName: inv.customer?.name || inv.customer?.email || 'Unknown',
        customerEmail: inv.customer?.email || '',
        description: inv.lines?.data?.[0]?.description || 'One-off payment',
        amount: inv.total,
        created: inv.created,
      }));

    res.json({
      subscriptions: activeResults,
      pausedSubscriptions: pausedResults,
      canceledSubscriptions: canceledResults,
      oneOffTransactions: oneOffResults,
      mrr,
      uniqueClients,
      totalEverCount,
      totalCanceledAllTime,
      avgLtv,
      avgSubLengthMonths,
      newCustomersThisYear,
      newCustomersLast3Months,
      windowedStats,
      monthlySignups,
    });
  } catch (err) {
    console.error('Stripe /subscriptions error:', err.message);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

router.get('/revenue', async (req, res) => {
  try {
    const now = new Date();
    const ytdStart = Math.floor(new Date(now.getFullYear(), 0, 1).getTime() / 1000);

    const allInvoices = await listAll((cursor) =>
      stripe.invoices.list({
        status: 'paid',
        created: { gte: ytdStart },
        limit: 100,
        ...(cursor && { starting_after: cursor }),
      })
    );

    const ytdRevenue = allInvoices.reduce((sum, inv) => sum + inv.total, 0);

    res.json({
      ytdRevenue,
      invoiceCount: allInvoices.length,
      year: now.getFullYear(),
    });
  } catch (err) {
    console.error('Stripe /revenue error:', err.message);
    res.status(500).json({ error: 'Failed to fetch revenue' });
  }
});

module.exports = router;
