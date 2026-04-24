const mongoose = require('mongoose');

// A client's ownership of a specific package, created at Stripe-payment-
// intent-success time (or directly when a provider comps a package).
//
// Fields snapshotted from PackageTemplate at purchase time. If the provider
// raises their 5-pack price next month, the client's existing purchase still
// reflects what they actually paid — no retroactive edits, no bugs from
// template mutation.
//
// Redemptions are an embedded array rather than a separate collection
// because (a) every redemption belongs to exactly one package, (b) the cap
// is small (<=100 per package by template validation), and (c) atomic
// consume/return via a single findOneAndUpdate is simpler this way.
//
// A redemption entry is kept even after its credit is "returned" (e.g. when
// a booking is cancelled in-window) — returnedAt is set but the row stays
// so the UI can show history. sessionsUsed counts only un-returned entries.
const RedemptionSchema = new mongoose.Schema({
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
  },
  redeemedAt: {
    type: Date,
    default: Date.now,
  },
  // Set when the credit is returned (e.g. in-window cancellation, or provider
  // manually reinstates). Non-null = credit is back in the pool.
  returnedAt: {
    type: Date,
    default: null,
  },
}, { _id: true });

const PackagePurchaseSchema = new mongoose.Schema({
  // Reference to the template the client bought (for provenance / analytics).
  // Null when the provider comped a package directly without a template.
  template: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PackageTemplate',
    default: null,
  },
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

  // Snapshotted fields — frozen at purchase time.
  name: { type: String, required: true, trim: true, maxlength: 100 },
  sessionsTotal: {
    type: Number,
    required: true,
    min: 1,
    max: 100,
  },
  sessionDuration: {
    type: Number,
    required: true,
    min: 30,
    max: 180,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },

  // Payment context.
  paymentMethod: {
    type: String,
    enum: ['stripe', 'comped'],
    default: 'stripe',
  },
  paymentStatus: {
    type: String,
    // pending: Stripe intent created, awaiting webhook
    // paid: Stripe confirmed OR comped (credits can be redeemed)
    // cancelled: provider cancelled (refunded via Stripe dashboard) — credits frozen
    enum: ['pending', 'paid', 'cancelled'],
    default: 'pending',
  },
  stripePaymentIntentId: {
    type: String,
    default: null,
    index: true,
    sparse: true,
  },
  purchasedAt: {
    type: Date,
    default: null, // set when paymentStatus flips to 'paid'
  },
  cancelledAt: {
    type: Date,
    default: null,
  },

  redemptions: [RedemptionSchema],
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// sessionsUsed = active (non-returned) redemptions.
PackagePurchaseSchema.virtual('sessionsUsed').get(function() {
  return (this.redemptions || []).filter(r => !r.returnedAt).length;
});

PackagePurchaseSchema.virtual('sessionsRemaining').get(function() {
  return this.sessionsTotal - this.sessionsUsed;
});

// Eligible for use in a new booking?
PackagePurchaseSchema.methods.canRedeem = function() {
  return this.paymentStatus === 'paid'
    && !this.cancelledAt
    && this.sessionsRemaining > 0;
};

// Find all packages a client can currently redeem, optionally filtered by
// session duration (for the booking form's "pick a package" step).
PackagePurchaseSchema.statics.redeemableForClient = function(clientId, { duration, provider } = {}) {
  const query = {
    client: clientId,
    paymentStatus: 'paid',
    cancelledAt: null,
  };
  if (duration) query.sessionDuration = duration;
  if (provider) query.provider = provider;
  return this.find(query);
};

module.exports = mongoose.model('PackagePurchase', PackagePurchaseSchema);
