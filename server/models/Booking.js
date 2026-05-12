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
  // Back-reference to a RecurringSeries when this booking was generated
  // by a standing appointment. The booking is otherwise a normal booking
  // — it can be cancelled, rescheduled, paid for, or skipped indpendently
  // of the series. The series field exists so the UI can show a repeat
  // icon and so cancel-scope semantics ("this one / following / all") can
  // find sibling occurrences. Null for one-off bookings.
  series: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RecurringSeries',
    default: null,
    index: true,
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
  // Service type (usually the selected package label) for single-session bookings
  serviceType: {
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
  // Payment information
  paymentMethod: {
    type: String,
    // 'package' = paid via a previously-purchased package credit; in
    // that case paymentStatus flips to 'paid' immediately at booking
    // time and packageRedemption holds a back-reference to the
    // consumed credit.
    enum: ['cash', 'check', 'paymentApp', 'card', 'package'],
    default: 'cash'
  },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'paid'],
    default: 'unpaid'
  },
  paidAt: {
    type: Date,
    default: null
  },
  // Optional tip on top of the base session price. Provider records it
  // after the appointment if the client tipped. Cash-basis income —
  // counts toward total income on the day collected (paidAt).
  tipAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  // Refund tracking. When a paid booking is refunded — usually because
  // the provider had to cancel and the client paid card/upfront — we
  // record the refunded amount and timestamp. Reports treat refunds as
  // negative income on the day of the refund (cash basis).
  refundedAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  refundedAt: {
    type: Date,
    default: null,
  },
  // Stripe processor fee on this booking's card payment. Captured from
  // the Stripe webhook event (balance transaction). Tax basis is the
  // GROSS amount the client paid; the fee is a deductible business
  // expense. We surface both gross and net on the income report.
  stripeFeeAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  stripePaymentIntentId: {
    type: String,
    default: null
  },
  // Stripe webhook event ID that flipped this to paid. Lets us
  // distinguish first-success from retries — the webhook handler
  // checks paymentStatus before writing, so this records the event
  // that actually triggered the transition.
  stripeEventId: {
    type: String,
    default: null,
    index: true,
  },
  // Provider's private notes for this session — free-form, optional.
  // What the provider wants to remember about how the session went.
  // Visible only to the provider on this booking; the client never sees
  // it. No structure imposed: SOAP-using providers can format it
  // themselves; narrative-style providers can write paragraphs; no-note
  // providers leave it blank. Capped at 5000 chars to keep the doc
  // bounded and the index payloads sane.
  providerNote: {
    type: String,
    default: null,
    maxlength: 5000,
  },
  // Set when this booking consumed a credit from a PackagePurchase.
  // The credit is returned to the package on in-window cancellations
  // (per provider policy) and stays consumed on late cancellations.
  // If null, this booking was paid via cash/card/zelle, not a package.
  //
  // `minutesApplied` is the minutes-mode portion of the booking
  // covered by the package. When equal to `duration` the booking is
  // fully package-paid; when less, the difference is paid via the
  // booking's primary `paymentMethod` field (cash/card/zelle).
  // Sessions-mode redemptions always cover the full session, so
  // minutesApplied equals duration there too.
  packageRedemption: {
    packagePurchase: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PackagePurchase',
      default: null,
    },
    minutesApplied: { type: Number, default: null },
    redeemedAt: { type: Date, default: null },
  },
  // Mileage tracking (distance from previous stop to this booking's location)
  travelDistance: {
    miles: { type: Number, default: null },
    fromAddress: { type: String, default: null },
    toAddress: { type: String, default: null },
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
  // Who placed the booking (the account holder)
  bookedBy: {
    name: { type: String },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  status: {
    type: String,
    // 'pending' is retained in the enum for legacy rows only — no
    // new code path should set it. Bookings start as 'confirmed':
    // once it's on the books, it's on the books until cancelled or
    // rescheduled.
    enum: ['pending', 'confirmed', 'in-progress', 'completed', 'cancelled'],
    default: 'confirmed'
  },
  // IANA timezone the booking's local times (startTime, endTime,
  // localDate) are expressed in. Snapshotted from the provider AT
  // CREATION TIME so a provider's later TZ change doesn't shift this
  // booking's interpretation. Pre-save uses this with DEFAULT_TZ
  // fallback for legacy bookings created before the field existed.
  timezone: { type: String, default: 'America/Los_Angeles' },
  cancelledAt: { type: Date, default: null },
  cancelledBy: { type: String, enum: ['CLIENT', 'PROVIDER', null], default: null },
  lateCancellation: { type: Boolean, default: false },
  lateCancelFee: { type: Number, default: 0 },
  completedAt: { type: Date, default: null },
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
    // Use the booking's stored timezone (snapshot at creation time)
    // with fallback to DEFAULT_TZ for legacy rows. This is intentional
    // history-preservation: if the provider changes TZ later, this
    // booking's localDate / startTime / endTime stay in the TZ they
    // were recorded in.
    const tz = this.timezone || DEFAULT_TZ;

    // Compute localDate from `date` in the booking's TZ.
    const laDateTime = DateTime.fromJSDate(this.date, { zone: 'UTC' }).setZone(tz);
    this.localDate = laDateTime.toFormat(TIME_FORMATS.ISO_DATE);

    // Calculate endTime based on startTime and duration
    const startDT = DateTime.fromFormat(
      `${this.localDate} ${this.startTime}`,
      'yyyy-MM-dd HH:mm',
      { zone: tz }
    );
    const endDT = startDT.plus({ minutes: this.duration });
    this.endTime = endDT.toFormat('HH:mm');

    // Validate times are within the same day in the booking's TZ.
    // Hand explicit zone to validateSameDay so it doesn't fall back
    // to LA for a non-LA booking.
    if (!startDT.hasSame(endDT, 'day')) {
      throw new Error('Booking cannot span multiple days');
    }

    // For multi-session bookings, validate DST in the booking's TZ
    if (this.groupId && LuxonService.checkDSTTransition(startDT.toISO(), endDT.toISO(), tz)) {
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
