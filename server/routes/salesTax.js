const router = require('express').Router();
const { calculateSalesTax, SalesTaxInputError } = require('../lib/salesTaxCalc');

// GET /api/sales-tax?month=2025-01
router.get('/sales-tax', async (req, res) => {
  try {
    res.json(await calculateSalesTax(req.query.month));
  } catch (err) {
    if (err instanceof SalesTaxInputError) {
      return res.status(400).json({ error: err.message });
    }
    console.error('Sales tax calculation error:', err.message);
    res.status(500).json({ error: 'Failed to calculate sales tax' });
  }
});

module.exports = router;
