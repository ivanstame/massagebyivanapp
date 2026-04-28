const mongoose = require('mongoose');

// A place where the provider takes in-studio bookings (their own room
// at a wellness center, a private studio, etc.). Distinct from
// SavedLocation — those are addresses the provider has *delivered to*
// or pin-drops; StaticLocations are addresses where *clients come to
// the provider*. The distinction matters because static-mode bookings
// have different scheduling math (static buffer, no per-booking drive
// time within the window) and often different pricing.
const StaticLocationSchema = new mongoose.Schema({
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  address: {
    type: String,
    required: true,
    trim: true
  },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },

  // Time between sequential bookings inside this location's static
  // availability window — sheet/towel turnover, room reset. NOT drive
  // time. Per-location because room reset varies by setup (e.g., spa
  // room with linen service vs solo studio).
  bufferMinutes: {
    type: Number,
    required: true,
    default: 15,
    min: 0,
    max: 120
  },

  // Pricing override. When `useMobilePricing` is true, the booking flow
  // pulls tiers from providerProfile.basePricing. When false, tiers
  // here take precedence. In-studio rates are commonly lower than
  // in-home (no travel cost baked in), so this is a first-class concept.
  useMobilePricing: { type: Boolean, default: false },
  pricing: [{
    duration: { type: Number, required: true },
    price: { type: Number, required: true },
    label: String,
    displayOrder: { type: Number, default: null }
  }],

  // Soft-delete so existing availability blocks/bookings that reference
  // this location keep resolving even after the provider archives it.
  archivedAt: { type: Date, default: null }
}, { timestamps: true });

StaticLocationSchema.index({ provider: 1, archivedAt: 1 });

module.exports = mongoose.model('StaticLocation', StaticLocationSchema);
