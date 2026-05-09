const express = require('express');
const router = express.Router();
const { DateTime } = require('luxon');
const Expense = require('../models/Expense');
const { ensureAuthenticated } = require('../middleware/passportMiddleware');
const { tzForProviderDoc, tzForProviderId } = require('../utils/providerTz');

const VALID_CATEGORIES = ['supplies', 'equipment', 'marketing', 'education', 'other'];

// Build a Date + localDate pair from the user-supplied "yyyy-MM-dd"
// string, anchored in the provider's timezone. Storing both lets us
// query by Date for range filters and group by localDate for the UI's
// per-day/per-month view without re-parsing.
function dateInTz(yyyyMmDd, tz) {
  const dt = DateTime.fromFormat(yyyyMmDd, 'yyyy-MM-dd', { zone: tz });
  if (!dt.isValid) return null;
  return {
    date: dt.toUTC().toJSDate(),
    localDate: dt.toFormat('yyyy-MM-dd'),
  };
}

// Coerce a possibly-string dollar amount into integer cents. Accepts
// "12.50", "12.5", 12.5, etc. Round to nearest cent — the input UI
// uses a number input with step=0.01, but we don't trust that.
function toCents(input) {
  const n = Number(input);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function ensureProviderRole(req, res) {
  if (req.user.accountType !== 'PROVIDER') {
    res.status(403).json({ message: 'Only providers can manage expenses' });
    return false;
  }
  return true;
}

// GET /api/expenses?startDate=&endDate= — list provider's expenses in
// range + per-category subtotals + grand total. Range bounds are
// inclusive and parsed in the provider's TZ so a "2026-01-01 → 2026-12-31"
// query covers the full year as the provider experiences it, not as UTC.
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    if (!ensureProviderRole(req, res)) return;

    const tz = tzForProviderDoc(req.user);
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'startDate and endDate required (yyyy-MM-dd)' });
    }

    const start = DateTime.fromFormat(startDate, 'yyyy-MM-dd', { zone: tz });
    const end = DateTime.fromFormat(endDate, 'yyyy-MM-dd', { zone: tz });
    if (!start.isValid || !end.isValid) {
      return res.status(400).json({ message: 'Invalid date format' });
    }

    const expenses = await Expense.find({
      provider: req.user._id,
      date: {
        $gte: start.startOf('day').toUTC().toJSDate(),
        $lte: end.endOf('day').toUTC().toJSDate(),
      },
    })
      .sort({ date: -1, createdAt: -1 })
      .lean();

    const summary = {
      totalCents: 0,
      byCategory: Object.fromEntries(VALID_CATEGORIES.map(c => [c, 0])),
      count: expenses.length,
    };
    for (const e of expenses) {
      summary.totalCents += e.amountCents;
      summary.byCategory[e.category] = (summary.byCategory[e.category] || 0) + e.amountCents;
    }

    res.json({ expenses, summary, range: { startDate, endDate } });
  } catch (error) {
    console.error('Error listing expenses:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/expenses — create a new expense for the logged-in provider.
router.post('/', ensureAuthenticated, async (req, res) => {
  try {
    if (!ensureProviderRole(req, res)) return;

    const { date, amount, category, vendor, note, receiptUrl } = req.body;

    if (!date || !category || amount == null) {
      return res.status(400).json({ message: 'date, amount, and category are required' });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: 'invalid category' });
    }
    const cents = toCents(amount);
    if (cents == null) {
      return res.status(400).json({ message: 'invalid amount' });
    }

    const tz = await tzForProviderId(req.user._id);
    const stamped = dateInTz(date, tz);
    if (!stamped) {
      return res.status(400).json({ message: 'invalid date' });
    }

    const expense = await Expense.create({
      provider: req.user._id,
      date: stamped.date,
      localDate: stamped.localDate,
      timezone: tz,
      amountCents: cents,
      category,
      vendor: vendor || '',
      note: note || '',
      receiptUrl: receiptUrl || '',
    });

    res.status(201).json(expense);
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/expenses/:id — edit an expense the provider owns.
router.put('/:id', ensureAuthenticated, async (req, res) => {
  try {
    if (!ensureProviderRole(req, res)) return;

    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Not found' });
    if (!expense.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { date, amount, category, vendor, note, receiptUrl } = req.body;

    if (date !== undefined) {
      const stamped = dateInTz(date, expense.timezone);
      if (!stamped) return res.status(400).json({ message: 'invalid date' });
      expense.date = stamped.date;
      expense.localDate = stamped.localDate;
    }
    if (amount !== undefined) {
      const cents = toCents(amount);
      if (cents == null) return res.status(400).json({ message: 'invalid amount' });
      expense.amountCents = cents;
    }
    if (category !== undefined) {
      if (!VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({ message: 'invalid category' });
      }
      expense.category = category;
    }
    if (vendor !== undefined) expense.vendor = vendor || '';
    if (note !== undefined) expense.note = note || '';
    if (receiptUrl !== undefined) expense.receiptUrl = receiptUrl || '';

    await expense.save();
    res.json(expense);
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', ensureAuthenticated, async (req, res) => {
  try {
    if (!ensureProviderRole(req, res)) return;

    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Not found' });
    if (!expense.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await expense.deleteOne();
    res.json({ message: 'Deleted' });
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
