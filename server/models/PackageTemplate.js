const mongoose = require('mongoose');

// A package a provider offers for sale — e.g. "5-Pack 60-min Massage" or
// "5 hours of bodywork." Clients purchase these to become PackagePurchase
// records they can then redeem against bookings.
//
// Two modes:
//
//   - kind:'sessions' (default) — fixed N × fixed-duration sessions. The
//     duration must match one of the provider's basePricing entries (so we
//     never sell something we can't redeem). One booking consumes one
//     credit. v1 default; ~80% of real packages are this shape.
//
//   - kind:'minutes' — pre-paid pool of minutes the client can spend at any
//     duration the provider offers. A 60-min booking consumes 60; a 90-min
//     consumes 90. Add-ons stay paid per-visit (their extraTime does NOT
//     debit the package). Useful for "hours of bodywork" style sales and
//     for clients who want to mix durations.
//
// isActive acts as a soft-retire: a template with active purchases tied to
// it can't be hard-deleted without orphaning provenance, but setting
// isActive=false removes it from the browse list so no new purchases happen.
const PackageTemplateSchema = new mongoose.Schema({
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Package name is required'],
    trim: true,
    maxlength: 100,
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500,
    default: '',
  },
  kind: {
    type: String,
    enum: ['sessions', 'minutes'],
    default: 'sessions',
  },
  // sessions-mode only. Number of fixed-duration sessions in the pack.
  sessionsTotal: {
    type: Number,
    min: [1, 'A package must include at least 1 session'],
    max: [100, 'A package cannot include more than 100 sessions'],
  },
  // sessions-mode only. Minutes per session — must match one of the
  // provider's basePricing durations (route layer enforces).
  sessionDuration: {
    type: Number,
    min: [30, 'Session duration must be at least 30 minutes'],
    max: [180, 'Session duration cannot exceed 180 minutes'],
  },
  // minutes-mode only. Total minutes in the pool. Cap at 100h so a typo'd
  // 60000 doesn't sail through. Routes validate at write time.
  minutesTotal: {
    type: Number,
    min: [30, 'Minutes total must be at least 30'],
    max: [6000, 'Minutes total cannot exceed 6000 (100 hours)'],
  },
  // Total price for the whole package, in dollars (matches basePricing.price).
  // Cents conversion happens at Stripe call time, same as bookings.
  price: {
    type: Number,
    required: true,
    min: [0, 'Price cannot be negative'],
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

module.exports = mongoose.model('PackageTemplate', PackageTemplateSchema);
