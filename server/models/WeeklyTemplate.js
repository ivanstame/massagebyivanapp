const mongoose = require('mongoose');

const WeeklyTemplateSchema = new mongoose.Schema({
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  dayOfWeek: {
    type: Number,
    required: true,
    min: 0,
    max: 6 // 0 = Sunday, 6 = Saturday
  },
  startTime: {
    type: String,
    required: true // "HH:mm" format in LA time
  },
  endTime: {
    type: String,
    required: true // "HH:mm" format in LA time
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Mode: mirrors Availability.kind. When 'static', materialized
  // availability rows for this template inherit kind+staticLocation.
  kind: {
    type: String,
    enum: ['mobile', 'static'],
    default: 'mobile'
  },
  staticLocation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SavedLocation',
    default: null
  },
  // Per-date opt-outs: dates (YYYY-MM-DD in LA) where the provider has
  // explicitly removed this template's occurrence. Materialization skips
  // any date in this list, so deleting a single template-derived
  // availability sticks instead of being resurrected on the next fetch.
  // Equivalent to iCal's EXDATE for a weekly RRULE.
  exclusions: {
    type: [String],
    default: []
  }
}, { timestamps: true });

// One template entry per provider per day of week
WeeklyTemplateSchema.index({ provider: 1, dayOfWeek: 1 }, { unique: true });

module.exports = mongoose.model('WeeklyTemplate', WeeklyTemplateSchema);
