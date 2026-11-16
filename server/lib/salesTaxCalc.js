// Texas sales tax calculation from Stripe charges. Shared by the web route
// (routes/salesTax.js) and the MCP endpoint (routes/mcp.js) so both always
// produce the same numbers.
const Stripe = require('stripe');

const TX_ZIP_PREFIXES = ['75', '76', '77', '78', '79'];
const TX_TAX_RATE = 0.0825;
const TX_STATE_VALUES = new Set(['tx', 'texas']);

let stripeClient = null;
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe is not configured (STRIPE_SECRET_KEY is missing)');
  }
  if (!stripeClient) stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}

function ownerEmail() {
  return process.env.OWNER_EMAIL || 'operations@smartsyndicator.com';
}

function isTxState(state) {
  return TX_STATE_VALUES.has((state || '').toLowerCase().trim());
}

function isTxZip(zip) {
  if (!zip) return false;
  const prefix = String(zip).trim().replace(/\D/g, '').substring(0, 2);
  return TX_ZIP_PREFIXES.includes(prefix);
}

function hasState(state) {
  return !!(state || '').trim();
}

async function withRetry(fn, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

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

class SalesTaxInputError extends Error {}

function parseMonth(month) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw new SalesTaxInputError('month required as YYYY-MM');
  }
  const [year, mo] = month.split('-').map(Number);
  if (mo < 1 || mo > 12) throw new SalesTaxInputError('invalid month');
  return { year, mo };
}

// Returns the full result object for a month ("YYYY-MM").
async function calculateSalesTax(month, { stripe } = {}) {
  const { year, mo } = parseMonth(month);
  const client = stripe || getStripe();
  const OWNER_EMAIL = ownerEmail();

  // Texas time window:
  // Start: 1st of month at 06:00 UTC (= midnight CST / 1am CDT)
  // End:   1st of next month at 05:59:59 UTC
  const startDate = new Date(Date.UTC(year, mo - 1, 1, 6, 0, 0));
  const endDate = new Date(Date.UTC(year, mo, 1, 5, 59, 59));
  const startTs = Math.floor(startDate.getTime() / 1000);
  const endTs = Math.floor(endDate.getTime() / 1000);

  const charges = await listAll((cursor) =>
    client.charges.list({
      created: { gte: startTs, lte: endTs },
      limit: 100,
      expand: ['data.customer'],
      ...(cursor && { starting_after: cursor }),
    })
  );

  const txTransactions = [];
  const otherTransactions = [];
  const unknownTransactions = [];
  const excludedTransactions = []; // audit log: every skipped charge appears here with a reason

  for (const charge of charges) {
    const customer = typeof charge.customer === 'object' ? charge.customer : null;

    const custEmail = (
      charge.billing_details?.email ||
      customer?.email ||
      ''
    ).toLowerCase().trim();

    const name = charge.billing_details?.name || customer?.name || 'Unknown';

    const netAmount = charge.amount - (charge.amount_refunded || 0);

    const exclude = (reason) => excludedTransactions.push({
      id: charge.id, name, email: custEmail,
      date: charge.created, amount: charge.amount, reason,
    });

    if (charge.livemode === false) { exclude('Test mode charge (livemode=false)'); continue; }
    if (custEmail === OWNER_EMAIL) {
      exclude('Self-purchase -- no legal consideration, not subject to sales tax');
      continue;
    }
    if (charge.status !== 'succeeded') { exclude(`Status not succeeded (was: ${charge.status})`); continue; }
    if (charge.refunded) { exclude('Fully refunded'); continue; }
    if (netAmount <= 0) {
      exclude(`Net amount is $${(netAmount / 100).toFixed(2)} after partial refund`);
      continue;
    }

    // State resolution, in order:
    // 1. Stripe customer address.state (authoritative record on file)
    // 2. Charge billing_details.address.state (state at time of payment)
    // 3. ZIP prefix from billing_details.address.postal_code
    // 4. Unknown, flagged for review
    const customerState = customer?.address?.state || '';
    const billingState = charge.billing_details?.address?.state || '';
    const zip = charge.billing_details?.address?.postal_code || '';

    let state;
    let stateSource;
    let resolvedState;

    if (hasState(customerState)) {
      state = isTxState(customerState) ? 'TX' : 'OTHER';
      stateSource = 'customer_address';
      resolvedState = customerState;
    } else if (hasState(billingState)) {
      state = isTxState(billingState) ? 'TX' : 'OTHER';
      stateSource = 'billing_details';
      resolvedState = billingState;
    } else if (zip) {
      state = isTxZip(zip) ? 'TX' : 'OTHER';
      stateSource = 'zip';
      resolvedState = zip;
    } else {
      state = null;
      stateSource = 'unknown';
      resolvedState = '';
    }

    const txn = {
      id: charge.id,
      name,
      email: custEmail,
      date: charge.created,
      amount: netAmount,
      state,
      stateSource,
      resolvedState,
    };

    if (state === 'TX') txTransactions.push(txn);
    else if (state === 'OTHER') otherTransactions.push(txn);
    else unknownTransactions.push(txn);
  }

  const byDateDesc = (a, b) => b.date - a.date;
  txTransactions.sort(byDateDesc);
  otherTransactions.sort(byDateDesc);
  unknownTransactions.sort(byDateDesc);
  excludedTransactions.sort(byDateDesc);

  const txRevenueCents = txTransactions.reduce((sum, t) => sum + t.amount, 0);
  const txRevenue = txRevenueCents / 100;
  const taxDue = txRevenue * TX_TAX_RATE;

  return {
    month,
    period: {
      startUtc: startDate.toISOString(),
      endUtc: endDate.toISOString(),
    },
    summary: {
      txRevenue,
      taxRate: TX_TAX_RATE,
      taxDue,
      txTransactionCount: txTransactions.length,
      otherCount: otherTransactions.length,
      unknownCount: unknownTransactions.length,
      excludedCount: excludedTransactions.length,
      totalChargesFetched: charges.length,
    },
    txTransactions,
    otherTransactions,
    unknownTransactions,
    excludedTransactions,
  };
}

module.exports = { calculateSalesTax, SalesTaxInputError, TX_TAX_RATE };
