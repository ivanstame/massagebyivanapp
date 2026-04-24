const mongoose = require('mongoose');

// A package a provider offers for sale — e.g. "5-Pack 60-min Massage."
// Clients purchase these to become PackagePurchase records they can then
// redeem one credit at a time toward bookings.
//
// Templates are provider-specific and reference a specific sessionDuration;
// packages don't currently support variable-duration or "any service" semantics
// (that's tracked in plans/packages-v2.md). v1 also has no expiration —
// purchased packages live forever until cancelled/refunded.
//
// isActive acts as a soft-retire: a template with active purchases tied to it
// can't be hard-deleted without orphaning provenance, but setting isActive=false
// removes it from the browse list so no new purchases happen.
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
  sessionsTotal: {
    type: Number,
    required: true,
    min: [1, 'A package must include at least 1 session'],
    max: [100, 'A package cannot include more than 100 sessions'],
  },
  // Minutes. Must match a duration the provider offers via basePricing.
  // Enforced at the route layer (not at the schema level) so the provider
  // can reorder their pricing table without breaking saved templates.
  sessionDuration: {
    type: Number,
    required: true,
    min: [30, 'Session duration must be at least 30 minutes'],
    max: [180, 'Session duration cannot exceed 180 minutes'],
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
