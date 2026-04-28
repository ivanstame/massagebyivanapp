const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const { DEFAULT_TZ, TIME_FORMATS } = require('../../src/utils/timeConstants');

const BlockedTimeSchema = new mongoose.Schema({
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: { type: Date, required: true },
  localDate: { type: String, required: true },
  start: { type: Date, required: true },
  end: { type: Date, required: true },
  source: {
    type: String,
    enum: ['manual', 'google_calendar'],
    default: 'manual'
  },
  googleEventId: {
    type: String,
    default: null
  },
  // Location for Google Calendar events that have one (affects travel time calc)
  location: {
    address: { type: String, default: null },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null }
  },
  // Provider has chosen to ignore this blocked time (for Google Calendar events)
  overridden: { type: Boolean, default: false },
  // Optional human-readable note. Surfaced in the day view so the
  // provider remembers why the slot is held ("Doctor", "Family thing").
  reason: { type: String, default: '', trim: true, maxlength: 200 },
  // True for "block the entire day" — schema-level marker so the UI can
  // render "All day" instead of "12:00 AM – 11:59 PM" and so callers can
  // easily distinguish from a deliberately wide manual range.
  allDay: { type: Boolean, default: false }
}, { timestamps: true });

// Derive localDate / date from `start` BEFORE validation runs — both
// fields are required, and Mongoose validates before pre('save'). If we
// computed them in pre('save'), the required-check would fail first.
BlockedTimeSchema.pre('validate', function(next) {
  try {
    if (!this.start || !this.end) return next();
    const startDT = DateTime.fromJSDate(this.start, { zone: 'UTC' }).setZone(DEFAULT_TZ);
    const endDT = DateTime.fromJSDate(this.end, { zone: 'UTC' }).setZone(DEFAULT_TZ);

    if (!startDT.hasSame(endDT, 'day')) {
      return next(new Error('Start and end times must be within the same day'));
    }

    this.localDate = startDT.toFormat(TIME_FORMATS.ISO_DATE);
    this.date = startDT.startOf('day').toUTC().toJSDate();

    next();
  } catch (error) {
    next(error);
  }
});

BlockedTimeSchema.index({ provider: 1, localDate: 1 });
BlockedTimeSchema.index({ provider: 1, googleEventId: 1 }, { sparse: true });

module.exports = mongoose.model('BlockedTime', BlockedTimeSchema);
