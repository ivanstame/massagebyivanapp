const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const { DEFAULT_TZ, TIME_FORMATS } = require('../../src/utils/timeConstants');
const LuxonService = require('../../src/utils/LuxonService');

const LocationSchema = new mongoose.Schema({
  lat: {
    type: Number,
    required: true,
    min: -90,
    max: 90
  },
  lng: {
    type: Number,
    required: true,
    min: -180,
    max: 180
  },
  address: { 
    type: String, 
    required: [true, 'Address is required'],
    trim: true
  }
});

const BookingSchema = new mongoose.Schema({
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  client: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true
  },
  // Group ID for multi-session bookings
  groupId: {
    type: String,
    default: null
  },
  // Store dates in both UTC and local time
  date: { 
    type: Date,  // UTC date
    required: true
  },
  localDate: {
    type: String,  // LA date in YYYY-MM-DD
    required: true
  },
  // Times stored in LA local time HH:mm
  startTime: { 
    type: String, 
    required: true,
    validate: {
      validator: function(v) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: props => `${props.value} is not a valid time format! Use HH:MM`
    }
  },
  endTime: { 
    type: String, 
    required: true,
    validate: {
      validator: function(v) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: props => `${props.value} is not a valid time format! Use HH:MM`
    }
  },
  duration: { 
    type: Number, 
    required: true,
    min: [30, 'Duration must be at least 30 minutes'],
    max: [180, 'Duration cannot exceed 180 minutes']
  },
  location: {
    type: LocationSchema,
    required: true
  },
  // For multi-session bookings
  isLastInGroup: {
    type: Boolean,
    default: false
  },
  extraDepartureBuffer: {
    type: Number,
    default: 0
  },
  // Massage type for single-session bookings
  massageType: {
    id: { type: String },
    name: { type: String }
  },
  // Add-ons for single-session bookings
  addons: [{
    id: { type: String },
    name: { type: String },
    price: { type: Number },
    extraTime: { type: Number, default: 0 }
  }],
  // Pricing information
  pricing: {
    basePrice: { type: Number },
    addonsPrice: { type: Number },
    totalPrice: { type: Number }
  },
  // Recipient information
  recipientType: {
    type: String,
    enum: ['self', 'other'],
    default: 'self'
  },
  recipientInfo: {
    name: { type: String },
    phone: { type: String },
    email: { type: String }
  },
  status: { 
    type: String, 
    enum: ['pending', 'confirmed', 'in-progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  reminders: {
    sent24h: { type: Boolean, default: false },
    sent1h: { type: Boolean, default: false }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save middleware to handle timezone conversion
BookingSchema.pre('save', function(next) {
  try {
    // Convert to LA timezone for date/time handling
    const laDateTime = LuxonService.convertToLA(this.date);
    this.localDate = laDateTime.toFormat(TIME_FORMATS.ISO_DATE);

    // Calculate endTime based on startTime and duration
    const startDT = DateTime.fromFormat(
      `${this.localDate} ${this.startTime}`,
      'yyyy-MM-dd HH:mm',
      { zone: DEFAULT_TZ }
    );
    const endDT = startDT.plus({ minutes: this.duration });
    this.endTime = endDT.toFormat('HH:mm');

    // Validate times are within the same day in LA timezone
    if (!LuxonService.validateSameDay(startDT.toISO(), endDT.toISO())) {
      throw new Error('Booking cannot span multiple days');
    }

    // For multi-session bookings, validate DST
    if (this.groupId && LuxonService.checkDSTTransition(startDT.toISO(), endDT.toISO())) {
      throw new Error('Multi-session booking cannot span DST transition');
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Statics for finding overlapping bookings
BookingSchema.statics.findOverlapping = async function(startTimeStr, endTimeStr, providerId, date) {
  // Convert input times to LA DateTime objects
  const startDT = DateTime.fromFormat(`${date} ${startTimeStr}`, 'yyyy-MM-dd HH:mm', { zone: DEFAULT_TZ });
  const endDT = DateTime.fromFormat(`${date} ${endTimeStr}`, 'yyyy-MM-dd HH:mm', { zone: DEFAULT_TZ });

  return this.find({
    provider: providerId,
    date: startDT.toJSDate(),
    $or: [
      {
        startTime: { $lt: endTimeStr },
        endTime: { $gt: startTimeStr }
      }
    ],
    status: { $nin: ['cancelled', 'completed'] }
  });
};

// Find bookings for a specific provider (returns query object)
BookingSchema.statics.findForProvider = function(providerId, startDate, endDate) {
  const startLA = DateTime.fromJSDate(startDate, { zone: DEFAULT_TZ }).startOf('day');
  const endLA = DateTime.fromJSDate(endDate, { zone: DEFAULT_TZ }).endOf('day');

  return this.find({
    provider: providerId,
    date: {
      $gte: startLA.toUTC().toJSDate(),
      $lte: endLA.toUTC().toJSDate()
    }
  })
  .populate('client')
  .sort({ date: 1, startTime: 1 });
};

// Instance methods
BookingSchema.methods.getLocalStartTime = function() {
  return DateTime
    .fromJSDate(this.date)
    .setZone(DEFAULT_TZ)
    .set({ 
      hour: parseInt(this.startTime.split(':')[0]), 
      minute: parseInt(this.startTime.split(':')[1]) 
    });
};

BookingSchema.methods.getLocalEndTime = function() {
  return this.getLocalStartTime().plus({ minutes: this.duration });
};

BookingSchema.methods.formatLocalTime = function() {
  const start = this.getLocalStartTime().toFormat(TIME_FORMATS.TIME_12H);
  const end = this.getLocalEndTime().toFormat(TIME_FORMATS.TIME_12H);
  return `${start} - ${end}`;
};

module.exports = mongoose.model('Booking', BookingSchema);
