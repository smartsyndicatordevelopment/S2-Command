const router = require('express').Router();
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'operations@smartsyndicator.com';
const TX_ZIP_PREFIXES = ['75', '76', '77', '78', '79'];
const TX_TAX_RATE = 0.0825;
const TX_STATE_VALUES = new Set(['tx', 'texas']);

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
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
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

// GET /api/sales-tax?month=2025-01
router.get('/sales-tax', async (req, res) => {
  const { month } = req.query;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'month required as YYYY-MM' });
  }

  const [year, mo] = month.split('-').map(Number);
  if (mo < 1 || mo > 12) {
    return res.status(400).json({ error: 'invalid month' });
  }

  // Texas time window:
  // Start: 1st of month at 06:00 UTC (= midnight CST / 1am CDT)
  // End:   1st of next month at 05:59:59 UTC
  const startDate = new Date(Date.UTC(year, mo - 1, 1, 6, 0, 0));
  const endDate = new Date(Date.UTC(year, mo, 1, 5, 59, 59));
  const startTs = Math.floor(startDate.getTime() / 1000);
  const endTs = Math.floor(endDate.getTime() / 1000);

  try {
    const charges = await listAll((cursor) =>
      stripe.charges.list({
        created: { gte: startTs, lte: endTs },
        limit: 100,
        expand: ['data.customer'],
        ...(cursor && { starting_after: cursor }),
      })
    );

    const txTransactions      = [];
    const otherTransactions   = [];
    const unknownTransactions = [];
    const excludedTransactions = [];  // audit log -- every skipped charge appears here with a reason

    for (const charge of charges) {
      const customer = typeof charge.customer === 'object' ? charge.customer : null;

      const custEmail = (
        charge.billing_details?.email ||
        customer?.email ||
        ''
      ).toLowerCase().trim();

      const name =
        charge.billing_details?.name ||
        customer?.name ||
        'Unknown';

      const netAmount = charge.amount - (charge.amount_refunded || 0);

      // -- Exclusion rules (each adds to the audit log) --

      if (charge.livemode === false) {
        excludedTransactions.push({
          id: charge.id, name, email: custEmail,
          date: charge.created, amount: charge.amount,
          reason: 'Test mode charge (livemode=false)',
        });
        continue;
      }

      if (custEmail === OWNER_EMAIL) {
        excludedTransactions.push({
          id: charge.id, name, email: custEmail,
          date: charge.created, amount: charge.amount,
          reason: 'Self-purchase -- no legal consideration, not subject to sales tax',
        });
        continue;
      }

      if (charge.status !== 'succeeded') {
        excludedTransactions.push({
          id: charge.id, name, email: custEmail,
          date: charge.created, amount: charge.amount,
          reason: `Status not succeeded (was: ${charge.status})`,
        });
        continue;
      }

      if (charge.refunded) {
        excludedTransactions.push({
          id: charge.id, name, email: custEmail,
          date: charge.created, amount: charge.amount,
          reason: 'Fully refunded',
        });
        continue;
      }

      if (netAmount <= 0) {
        excludedTransactions.push({
          id: charge.id, name, email: custEmail,
          date: charge.created, amount: charge.amount,
          reason: `Net amount is $${(netAmount / 100).toFixed(2)} after partial refund`,
        });
        continue;
      }

      // -- State resolution --
      // 1. Stripe customer address.state (authoritative record on file)
      // 2. Charge billing_details.address.state (state at time of payment)
      // 3. ZIP prefix from billing_details.address.postal_code
      // 4. Unknown -- flag for review

      const customerState = customer?.address?.state || '';
      const billingState  = charge.billing_details?.address?.state || '';
      const zip           = charge.billing_details?.address?.postal_code || '';

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

      if (state === 'TX') {
        txTransactions.push(txn);
      } else if (state === 'OTHER') {
        otherTransactions.push(txn);
      } else {
        unknownTransactions.push(txn);
      }
    }

    txTransactions.sort((a, b) => b.date - a.date);
    otherTransactions.sort((a, b) => b.date - a.date);
    unknownTransactions.sort((a, b) => b.date - a.date);
    excludedTransactions.sort((a, b) => b.date - a.date);

    const txRevenueCents = txTransactions.reduce((sum, t) => sum + t.amount, 0);
    const txRevenue = txRevenueCents / 100;
    const taxDue = txRevenue * TX_TAX_RATE;

    res.json({
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
    });
  } catch (err) {
    console.error('Sales tax calculation error:', err.message);
    res.status(500).json({ error: 'Failed to calculate sales tax' });
  }
});

module.exports = router;
