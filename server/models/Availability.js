const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const { DEFAULT_TZ, TIME_FORMATS } = require('../../src/utils/timeConstants');
const LuxonService = require('../../src/utils/LuxonService');

const AvailabilitySchema = new mongoose.Schema({
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Store both UTC and localDate for querying efficiency
  date: { type: Date, required: true },          // UTC date
  localDate: { type: String, required: true },   // LA date string (YYYY-MM-DD)
  start: { type: Date, required: true },         // UTC timestamp
  end: { type: Date, required: true },           // UTC timestamp
  availableSlots: [{ type: String }], // Cached 30-minute slots in local time
  source: {
    type: String,
    enum: ['manual', 'template'],
    default: 'manual'
  },
  // Mode: 'mobile' = provider travels to client (default, all legacy
  // rows). 'static' = provider takes bookings at a fixed in-studio
  // location for this entire window — no per-booking drive-time math
  // inside the window, static buffer for turnover instead, surrounding
  // mobile bookings travel from staticLocation.address.
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
  // IANA timezone the block's local times are expressed in. Snapshotted
  // at creation. Pre-save uses this with DEFAULT_TZ fallback for legacy
  // rows. Keeps a provider's TZ-change from retroactively shifting
  // already-generated days.
  timezone: { type: String, default: 'America/Los_Angeles' },
  // Fixed location anchor info for this day (populated from template)
  anchor: {
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'SavedLocation', default: null },
    name: { type: String, default: null },
    address: { type: String, default: null },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    startTime: { type: String, default: null }, // "HH:mm" LA time
    endTime: { type: String, default: null }     // "HH:mm" LA time
  }
});

// Pre-save middleware to handle timezone conversion
AvailabilitySchema.pre('save', function(next) {
  try {
    // Use the block's stored timezone (snapshot at creation) with
    // DEFAULT_TZ fallback for legacy rows.
    const tz = this.timezone || DEFAULT_TZ;

    // Convert UTC timestamps to local DateTime in the block's TZ.
    const startDT = DateTime.fromJSDate(this.start, { zone: 'UTC' }).setZone(tz);
    const endDT = DateTime.fromJSDate(this.end, { zone: 'UTC' }).setZone(tz);

    // Validate times are within same local day in this block's TZ.
    if (!startDT.hasSame(endDT, 'day')) {
      throw new Error('Start and end times must be within the same day');
    }

    // Set derived date fields, anchored to the block's TZ.
    this.localDate = startDT.toFormat(TIME_FORMATS.ISO_DATE);
    this.date = startDT.startOf('day').toUTC().toJSDate();
    
    if (!startDT.hasSame(endDT, 'day')) {
      throw new Error('Start and end times must be within the same day');
    }

  // Generate available slots — anchor in this block's TZ so HH:MM
  // strings reflect the provider's wall clock, not always-LA.
  const slots = LuxonService.generateTimeSlots(
    startDT.toISO(),
    endDT.toISO(),
    30, // 30-minute intervals
    60, // appointmentDuration (default kept)
    tz
  );
  this.availableSlots = slots.map(slot =>
    DateTime.fromISO(slot.start).setZone(tz).toFormat(TIME_FORMATS.TIME_24H)
  );

    next();
  } catch (error) {
    next(error);
  }
});

// Static method to find availability for a provider
AvailabilitySchema.statics.findForProvider = async function(providerId, startDate, endDate) {
  // Ensure dates are in LA timezone
  const startLA = DateTime.fromJSDate(startDate, { zone: DEFAULT_TZ }).startOf('day');
  const endLA = DateTime.fromJSDate(endDate, { zone: DEFAULT_TZ }).endOf('day');

  return this.find({
    provider: providerId,
    date: {
      $gte: startLA.toUTC().toJSDate(),
      $lte: endLA.toUTC().toJSDate()
    }
  }).sort({ date: 1, start: 1 });
};

// Instance method to check if time slot is within block
AvailabilitySchema.methods.containsSlot = function(slotTime) {
  const slotDT = DateTime.fromISO(slotTime, { zone: DEFAULT_TZ });
  const blockStartDT = DateTime.fromFormat(
    `${this.localDate} ${this.start}`, 
    'yyyy-MM-dd HH:mm',
    { zone: DEFAULT_TZ }
  );
  const blockEndDT = DateTime.fromFormat(
    `${this.localDate} ${this.end}`,
    'yyyy-MM-dd HH:mm',
    { zone: DEFAULT_TZ }
  );

  return slotDT >= blockStartDT && slotDT < blockEndDT;
};

// Virtual for formatted date strings
AvailabilitySchema.virtual('formattedDate').get(function() {
  return DateTime
    .fromJSDate(this.date)
    .setZone(DEFAULT_TZ)
    .toFormat(TIME_FORMATS.HUMAN_DATE);
});

// Compound index for efficient provider-date queries
AvailabilitySchema.index({ provider: 1, date: 1 });

// Template-source rows must be unique per (provider, localDate). The
// generateFromTemplate dedup is a non-atomic findOne+create — two
// concurrent /blocks/:date requests can race past the check and both
// insert. The DB-level unique constraint closes the race. Manual rows
// are intentionally NOT covered: providers can have multiple non-
// overlapping manual blocks on the same day.
AvailabilitySchema.index(
  { provider: 1, localDate: 1 },
  {
    name: 'provider_1_localDate_1_template_unique',
    unique: true,
    partialFilterExpression: { source: 'template' },
  }
);

module.exports = mongoose.model('Availability', AvailabilitySchema);
