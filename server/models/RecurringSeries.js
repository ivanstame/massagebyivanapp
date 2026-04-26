const mongoose = require('mongoose');

// A standing appointment — provider sets up "Mabel, every Tuesday 10am"
// once, the system materializes a rolling window of concrete Booking docs
// that inherit the existing booking machinery (cancellation, payment,
// package redemption, reminders, GCal sync, mileage). The series row
// stores the recurrence rule + the snapshot of the booking template
// (service type, duration, location, pricing) so the rule can change
// over time without retroactively rewriting past materialized
// occurrences.
//
// v1 scope (per plans/standing-appointments-v2.md when we write it):
//   - weekly cadence with intervalWeeks: 1 | 2 | 4
//   - single day-of-week
//   - end conditions: open-ended | end date | N occurrences
//   - provider-initiated only
//
// Things explicitly NOT in v1 (deferred to v2):
//   monthly patterns, multi-day series, holiday-skip ranges, pause/resume,
//   client-initiated, group standing appointments.

const RecurringSeriesSchema = new mongoose.Schema({
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  // Recurrence rule — kept narrow on purpose (see v2 doc for what's
  // deferred). startDate is the first occurrence (LA-local YYYY-MM-DD);
  // intervalWeeks is the gap between occurrences.
  startDate: { type: String, required: true }, // 'yyyy-MM-dd' in LA tz
  startTime: { type: String, required: true }, // 'HH:mm' in LA tz
  duration: {
    type: Number,
    required: true,
    min: 30,
    max: 180,
  },
  intervalWeeks: {
    type: Number,
    required: true,
    enum: [1, 2, 4],
    default: 1,
  },
  // dayOfWeek is derived from startDate but persisted for query speed
  // and to make the rule self-describing in the UI ("every Tuesday").
  // 0 = Sunday … 6 = Saturday — matches JS Date.getDay() / Luxon's
  // (weekday === 7 ? 0 : weekday) convention used elsewhere in the app.
  dayOfWeek: { type: Number, required: true, min: 0, max: 6 },

  // End condition. Exactly one of (endDate, occurrenceLimit) is set;
  // both null = open-ended ("until cancelled").
  endDate: { type: String, default: null }, // 'yyyy-MM-dd' inclusive
  occurrenceLimit: { type: Number, default: null, min: 1 },

  // Materialization watermark — extends as the rolling window advances.
  // Every date <= this has been considered for materialization (either
  // it became a Booking, or was skipped due to a conflict).
  lastMaterializedThrough: { type: Date, default: null },

  // Snapshot of the booking template at series-creation time. These
  // ride along onto each materialized Booking. If the provider changes
  // their pricing later, existing materialized occurrences keep the
  // original price (matches how packages snapshot at purchase time).
  serviceType: {
    id: { type: String },
    name: { type: String },
  },
  addons: [{
    id: { type: String },
    name: { type: String },
    price: { type: Number },
    extraTime: { type: Number, default: 0 },
  }],
  pricing: {
    basePrice: { type: Number },
    addonsPrice: { type: Number },
    totalPrice: { type: Number },
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'zelle', 'venmo', 'card', 'package'],
    default: 'cash',
  },
  // If the series is paid via packages, each occurrence will try to
  // redeem a credit at materialization time (or fall through to the
  // default cash status if the package runs out / is cancelled).
  packagePurchase: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PackagePurchase',
    default: null,
  },
  location: {
    address: { type: String, required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  recipientType: { type: String, enum: ['self', 'other'], default: 'self' },
  recipientInfo: {
    name: { type: String },
    phone: { type: String },
    email: { type: String },
  },

  // Series lifecycle. v1 only ever uses 'active' or 'cancelled'.
  // 'paused' is reserved for v2 (skip a date range without ending).
  status: {
    type: String,
    enum: ['active', 'cancelled'],
    default: 'active',
    index: true,
  },
  cancelledAt: { type: Date, default: null },
  cancelledBy: { type: String, enum: ['CLIENT', 'PROVIDER', null], default: null },
}, { timestamps: true });

// Useful for the lazy-extend path: "find every active series whose window
// hasn't reached this date." Compound index keeps the scan cheap.
RecurringSeriesSchema.index({ provider: 1, status: 1, lastMaterializedThrough: 1 });

module.exports = mongoose.model('RecurringSeries', RecurringSeriesSchema);
