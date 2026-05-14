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
    enum: ['manual', 'google_calendar', 'external_ical'],
    default: 'manual'
  },
  googleEventId: {
    type: String,
    default: null
  },
  // Which Google calendar this block was synced from. Critical when a
  // provider syncs more than one calendar — without it, the per-
  // calendar stale-cleanup at the end of each sync pass cross-deletes
  // entries belonging to other synced calendars (since cleanup matches
  // by source='google_calendar' and "not in this calendar's
  // upsertedIds"). With this field, cleanup scopes to the calendar
  // currently being synced and leaves the others alone.
  googleCalendarId: {
    type: String,
    default: null
  },
  // Stable event identifier from an external iCal feed (RFC 5545 UID).
  // Combined with externalCalendarFeed (below) it uniquely identifies
  // an event across polls so subsequent fetches upsert rather than
  // duplicate. Day-slices of multi-day events get the slice's localDate
  // appended to keep their identifiers distinct.
  externalEventId: {
    type: String,
    default: null
  },
  // Which ExternalCalendarFeed this block came from. Scopes stale
  // cleanup to one feed at a time so syncing feed A doesn't nuke
  // events from feed B.
  externalCalendarFeed: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExternalCalendarFeed',
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
  allDay: { type: Boolean, default: false },
  // IANA timezone the block's local times are expressed in. Snapshotted
  // at creation so a provider's TZ change doesn't shift historical
  // blocks. Pre-validate uses with DEFAULT_TZ fallback for legacy.
  timezone: { type: String, default: 'America/Los_Angeles' },
}, { timestamps: true });

// Derive localDate / date from `start` BEFORE validation runs — both
// fields are required, and Mongoose validates before pre('save'). If we
// computed them in pre('save'), the required-check would fail first.
BlockedTimeSchema.pre('validate', function(next) {
  try {
    if (!this.start || !this.end) return next();
    const tz = this.timezone || DEFAULT_TZ;
    const startDT = DateTime.fromJSDate(this.start, { zone: 'UTC' }).setZone(tz);
    const endDT = DateTime.fromJSDate(this.end, { zone: 'UTC' }).setZone(tz);

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
BlockedTimeSchema.index({ externalCalendarFeed: 1, externalEventId: 1 }, { sparse: true });

module.exports = mongoose.model('BlockedTime', BlockedTimeSchema);
