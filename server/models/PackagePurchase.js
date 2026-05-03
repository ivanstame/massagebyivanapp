const mongoose = require('mongoose');

// A client's ownership of a specific package, created at Stripe-payment-
// intent-success time, when a provider comps a package, or when a provider
// records a cash sale (paymentMethod='cash', paymentStatus='paid').
//
// Fields snapshotted from PackageTemplate at purchase time. If the provider
// raises their 5-pack price next month, the client's existing purchase still
// reflects what they actually paid — no retroactive edits, no bugs from
// template mutation.
//
// Two redemption shapes mirror PackageTemplate.kind:
//   - sessions-mode: each redemption consumes 1 credit; minutesConsumed unused.
//   - minutes-mode:  each redemption consumes minutesConsumed minutes from
//                    the shared pool.
//
// Pre-consumed amounts (`preConsumedSessions` / `preConsumedMinutes`) are
// for backfilling historical usage that happened OUTSIDE the app — e.g. a
// provider records a cash package the client already partially used before
// the provider started tracking it in Avayble. They count against
// remaining the same way active redemptions do.
//
// Redemptions are an embedded array rather than a separate collection
// because (a) every redemption belongs to exactly one package, (b) the cap
// is small, and (c) atomic consume/return via a single findOneAndUpdate is
// simpler this way.
//
// A redemption entry is kept even after its credit is "returned" (e.g. when
// a booking is cancelled in-window) — returnedAt is set but the row stays
// so the UI can show history. sessionsUsed/minutesUsed counts only
// un-returned entries plus pre-consumed.
const RedemptionSchema = new mongoose.Schema({
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
  },
  // For minutes-mode packages: how many minutes this redemption consumed.
  // Zero/unused for sessions-mode (each redemption = 1 session).
  minutesConsumed: {
    type: Number,
    default: 0,
    min: 0,
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
  // Null when the provider comped a package directly without a template, or
  // recorded a cash sale ad-hoc.
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
  kind: {
    type: String,
    enum: ['sessions', 'minutes'],
    default: 'sessions',
  },
  // sessions-mode only.
  sessionsTotal: {
    type: Number,
    min: 1,
    max: 100,
  },
  sessionDuration: {
    type: Number,
    min: 30,
    max: 180,
  },
  // minutes-mode only.
  minutesTotal: {
    type: Number,
    min: 30,
    max: 6000,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },

  // Backfill fields — set when the provider is recording usage that
  // happened before the package landed in Avayble. Counted against remaining
  // alongside live redemptions but with no per-event detail beyond the note.
  preConsumedSessions: { type: Number, default: 0, min: 0 },
  preConsumedMinutes: { type: Number, default: 0, min: 0 },
  preConsumedNote: { type: String, default: '', trim: true, maxlength: 200 },

  // Marketing-framing snapshot. When a sessions-mode template ("5 × 90 min")
  // is purchased, the purchase is materialized as a minutes pool (450 min)
  // so the buyer can spend credits at any duration. We snapshot the original
  // session framing here so UI surfaces can still show "5-pack 90 min" for
  // the buyer's recognition. Null when the buyer purchased a true minutes-
  // pool template.
  displayPack: {
    sessions: { type: Number, min: 1, max: 100, default: undefined },
    sessionDuration: { type: Number, min: 30, max: 180, default: undefined },
  },

  // Payment context.
  paymentMethod: {
    type: String,
    // stripe: paid via Stripe Connect intent (online).
    // cash:   recorded by provider after they accepted cash in person.
    // comped: provider gave it free (loyalty / makeup / promo).
    enum: ['stripe', 'cash', 'comped'],
    default: 'stripe',
  },
  paymentStatus: {
    type: String,
    // pending: Stripe intent created, awaiting webhook
    // paid: Stripe confirmed OR comped OR cash-recorded (credits redeemable)
    // cancelled: provider cancelled (refunded out-of-band) — credits frozen
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

// ── Sessions-mode virtuals ────────────────────────────────────────────
// sessionsUsed = pre-consumed + active (non-returned) redemptions.
PackagePurchaseSchema.virtual('sessionsUsed').get(function() {
  const live = (this.redemptions || []).filter(r => !r.returnedAt).length;
  return live + (this.preConsumedSessions || 0);
});
PackagePurchaseSchema.virtual('sessionsRemaining').get(function() {
  if (this.kind !== 'sessions') return 0;
  return (this.sessionsTotal || 0) - this.sessionsUsed;
});

// ── Minutes-mode virtuals ─────────────────────────────────────────────
PackagePurchaseSchema.virtual('minutesUsed').get(function() {
  const live = (this.redemptions || [])
    .filter(r => !r.returnedAt)
    .reduce((sum, r) => sum + (r.minutesConsumed || 0), 0);
  return live + (this.preConsumedMinutes || 0);
});
PackagePurchaseSchema.virtual('minutesRemaining').get(function() {
  if (this.kind !== 'minutes') return 0;
  return (this.minutesTotal || 0) - this.minutesUsed;
});

// Eligible for use in a new booking of `duration` minutes?
//
// `opts.allowPartial` (minutes-mode only) qualifies the package when it
// has any positive remaining balance — even if less than `duration` —
// so the caller can offer a partial redemption (apply X min from the
// package, pay the difference via cash/card/venmo). Defaults to false
// to preserve the original "must cover the full booking" semantics for
// callers that don't expect partial behavior yet.
PackagePurchaseSchema.methods.canRedeemFor = function(duration, opts = {}) {
  if (this.paymentStatus !== 'paid' || this.cancelledAt) return false;
  if (this.kind === 'minutes') {
    if (opts.allowPartial) return this.minutesRemaining > 0;
    return this.minutesRemaining >= duration;
  }
  // sessions-mode: one credit is one fixed-duration session — partial
  // isn't a coherent operation. Always require an exact duration match.
  return this.sessionDuration === duration && this.sessionsRemaining > 0;
};

// Backwards-compat alias (older callers used canRedeem() with no arg).
// Returns true if there's *any* remaining capacity, regardless of duration.
PackagePurchaseSchema.methods.canRedeem = function() {
  if (this.paymentStatus !== 'paid' || this.cancelledAt) return false;
  return this.kind === 'minutes'
    ? this.minutesRemaining > 0
    : this.sessionsRemaining > 0;
};

// Find all packages a client can currently redeem against a booking of
// `duration` minutes. For sessions-mode, duration must match exactly.
// For minutes-mode, the package qualifies when it has ≥duration minutes
// remaining — OR, when `opts.allowPartial` is true, any positive
// balance counts (the caller can apply some minutes from the package
// and collect the rest via cash/card/venmo). Caller passes
// duration = the booking length being planned.
PackagePurchaseSchema.statics.redeemableForClient = function(clientId, { duration, provider, allowPartial } = {}) {
  const baseQuery = {
    client: clientId,
    paymentStatus: 'paid',
    cancelledAt: null,
  };
  if (provider) baseQuery.provider = provider;

  if (!duration) {
    // No duration filter — return everything that's still redeemable at all.
    return this.find(baseQuery);
  }

  // Mongo can't easily express the minutes-mode "remaining ≥ duration"
  // check with virtuals, so we fetch the candidate set and filter in JS.
  // Cardinality per client is tiny (handful of packages), so this is fine.
  return this.find(baseQuery).then(rows =>
    rows.filter(p => p.canRedeemFor(duration, { allowPartial }))
  );
};

module.exports = mongoose.model('PackagePurchase', PackagePurchaseSchema);
