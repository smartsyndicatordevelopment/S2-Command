// Checks the shared sales tax calculation with a fake Stripe (no network, no keys).
// Usage: node scripts/test-sales-tax-calc.cjs
const assert = require('node:assert');
const path = require('node:path');
const { calculateSalesTax, SalesTaxInputError } = require(path.join(__dirname, '..', 'server', 'lib', 'salesTaxCalc'));

const charge = (id, amount, over = {}) => ({
  id, amount, amount_refunded: 0, status: 'succeeded', refunded: false, livemode: true, created: 1760000000,
  billing_details: { email: `${id}@example.com`, name: 'Jane Example', address: { state: 'TX', postal_code: '75001' } },
  customer: null, ...over,
});
const fakeStripe = (charges) => ({ charges: { list: async () => ({ data: charges, has_more: false }) } });

(async () => {
  // 1) Money is worked out in cents and rounded once: $1,000.01 at 8.25% is $82.50 (82.500825 rounded).
  let r = await calculateSalesTax('2026-10', { stripe: fakeStripe([charge('a', 100001)]) });
  assert.strictEqual(r.summary.txRevenueCents, 100001);
  assert.strictEqual(r.summary.taxDueCents, 8250);
  assert.strictEqual(r.summary.taxDue, 82.5);

  // 2) Out-of-state, test-mode, refunded and unknown-state charges are not taxed.
  r = await calculateSalesTax('2026-10', {
    stripe: fakeStripe([
      charge('tx', 10000),
      charge('ca', 5000, { billing_details: { email: 'ca@example.com', address: { state: 'CA' } } }),
      charge('test', 5000, { livemode: false }),
      charge('refunded', 5000, { refunded: true }),
      charge('nostate', 7000, { billing_details: { email: 'x@example.com', address: {} } }),
    ]),
  });
  assert.strictEqual(r.summary.txRevenueCents, 10000);
  assert.strictEqual(r.summary.taxDueCents, 825);
  assert.strictEqual(r.summary.otherCount, 1);
  assert.strictEqual(r.summary.unknownCount, 1);
  assert.strictEqual(r.summary.excludedCount, 2);

  // 3) Bad input is an input error, not a crash.
  for (const bad of [undefined, '2026-13', 'abc', ['2026-10'], 202610]) {
    await assert.rejects(() => calculateSalesTax(bad, { stripe: fakeStripe([]) }), SalesTaxInputError);
  }
  console.log('PASS sales tax calculation (3 groups)');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
