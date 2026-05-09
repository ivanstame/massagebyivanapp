const mongoose = require('mongoose');

// Provider-logged business expense (supplies, equipment, etc.) — pure
// record-keeping for tax-time. We don't categorize for the provider, do
// any Schedule C math, or claim deductions. Just a ledger they can hand
// to their CPA. Mileage lives in its own report (computed from booking
// drive legs); this is everything else.
//
// amountCents: stored as integer cents to dodge float drift on totals.
// localDate: provider-TZ anchored "yyyy-MM-dd" so monthly bucketing in
//   the UI matches what the provider entered, no matter where they're
//   logging from.
const ExpenseSchema = new mongoose.Schema({
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  localDate: {
    type: String,
    required: true,
  },
  timezone: {
    type: String,
    required: true,
  },
  amountCents: {
    type: Number,
    required: true,
    min: 0,
  },
  category: {
    type: String,
    required: true,
    enum: ['supplies', 'tolls', 'equipment', 'marketing', 'education', 'other'],
  },
  vendor: {
    type: String,
    trim: true,
    maxlength: 200,
    default: '',
  },
  note: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: '',
  },
  // Optional pointer to where the receipt actually lives — Drive,
  // Dropbox, photo library, etc. We don't host receipt files in v1.
  receiptUrl: {
    type: String,
    trim: true,
    maxlength: 500,
    default: '',
  },
}, { timestamps: true });

ExpenseSchema.index({ provider: 1, date: -1 });
ExpenseSchema.index({ provider: 1, localDate: 1 });

module.exports = mongoose.model('Expense', ExpenseSchema);
