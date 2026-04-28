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
    ref: 'StaticLocation',
    default: null
  },
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
    // Convert UTC timestamps to LA DateTime for validation
    const startDT = DateTime.fromJSDate(this.start, { zone: 'UTC' }).setZone(DEFAULT_TZ);
    const endDT = DateTime.fromJSDate(this.end, { zone: 'UTC' }).setZone(DEFAULT_TZ);
    
    // Validate times are within same LA day
    if (!startDT.hasSame(endDT, 'day')) {
      throw new Error('Start and end times must be within the same day');
    }

    // Set derived date fields
    this.localDate = startDT.toFormat(TIME_FORMATS.ISO_DATE);
    this.date = startDT.startOf('day').toUTC().toJSDate();
    
    if (!startDT.hasSame(endDT, 'day')) {
      throw new Error('Start and end times must be within the same day');
    }

  // Generate available slots
  const slots = LuxonService.generateTimeSlots(
    startDT.toISO(),
    endDT.toISO(),
    30 // 30-minute intervals
  );
  this.availableSlots = slots.map(slot =>
    DateTime.fromISO(slot.start).setZone(DEFAULT_TZ).toFormat(TIME_FORMATS.TIME_24H)
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

module.exports = mongoose.model('Availability', AvailabilitySchema);
