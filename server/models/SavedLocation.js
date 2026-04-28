const mongoose = require('mongoose');

// A place the provider keeps on file. A single physical address can wear
// multiple roles — home base, in-studio location, or simply a saved
// departure point — so roles are flags on the same record rather than
// separate models. This collapses the prior SavedLocation/StaticLocation
// split that forced providers to maintain duplicate entries for one
// physical place (e.g. Peters Chiropractic).
const SavedLocationSchema = new mongoose.Schema({
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true // e.g. "Peters Chiropractic", "Home"
  },
  address: {
    type: String,
    required: true
  },
  lat: {
    type: Number,
    required: true
  },
  lng: {
    type: Number,
    required: true
  },
  // Default departure point. Exactly one per provider (enforced by the
  // partial unique index below).
  isHomeBase: {
    type: Boolean,
    default: false
  },
  // True when clients come *here* to the provider — has its own
  // turnover buffer (sheet/towel reset between back-to-back bookings)
  // and an optional pricing override (in-studio rates often differ
  // from in-home).
  isStaticLocation: {
    type: Boolean,
    default: false
  },
  staticConfig: {
    bufferMinutes: { type: Number, default: 15, min: 0, max: 120 },
    useMobilePricing: { type: Boolean, default: true },
    pricing: [{
      duration: { type: Number, required: true },
      price: { type: Number, required: true },
      label: String,
      displayOrder: { type: Number, default: null }
    }]
  }
}, { timestamps: true });

// One home base per provider
SavedLocationSchema.index(
  { provider: 1, isHomeBase: 1 },
  { unique: true, partialFilterExpression: { isHomeBase: true } }
);

module.exports = mongoose.model('SavedLocation', SavedLocationSchema);
