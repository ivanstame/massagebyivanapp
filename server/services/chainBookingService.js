// Shared chain-booking service.
//
// Used by:
//   - POST /api/bookings/bulk (couple's-massage / back-to-back chain
//     created by a client at booking time)
//   - The recurring-series materializer (per-occurrence chain creation
//     when a standing appointment carries additionalSessions)
//
// Responsibilities (single canonical implementation):
//   - Given a date, start time, location, and N session configs, validate
//     that the whole chain (sum of durations + (N-1) settle buffers) fits
//     in the provider's availability for that date and doesn't conflict
//     with existing bookings.
//   - Cascade per-session start/end times forward from the first start.
//   - Atomically reserve any per-session package credits.
//   - Create all bookings with a shared groupId (so future cancellations,
//     UI grouping, and analytics can identify the chain).
//   - Roll back fully on any save failure.
//
// Errors thrown:
//   - ChainValidationError    — input shape problem (e.g. mismatched
//                               address, addon not offered by provider).
//   - ChainDoesntFitError     — the chain can't fit at the requested
//                               start time. Carries `alternatives` so the
//                               HTTP wrapper can surface useful suggestions.
//
// Both errors carry .code so HTTP wrappers can distinguish 400 vs 500.

const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const Booking = require('../models/Booking');
const Availability = require('../models/Availability');
const BlockedTime = require('../models/BlockedTime');
const SavedLocation = require('../models/SavedLocation');
const User = require('../models/User');
const { reservePackageCredit, returnReservedCredit } = require('./packageReservation');
const { getAvailableTimeSlots } = require('../utils/timeUtils');

const SETTLE_BUFFER = 15;
const DEFAULT_TZ = 'America/Los_Angeles';
const MAX_CHAIN_LENGTH = 6;

// Fallback price helper — mirrors the calculatePrice in routes/bookings.js
// so the service stays self-contained.
function calculatePrice(duration) {
  const BASE_RATE = 120; // $120/hr
  return Math.ceil((duration / 60) * BASE_RATE);
}

class ChainValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ChainValidationError';
    this.code = 'CHAIN_VALIDATION';
  }
}

class ChainDoesntFitError extends Error {
  constructor(message, { chainDurationMin, alternatives = [] } = {}) {
    super(message);
    this.name = 'ChainDoesntFitError';
    this.code = 'CHAIN_DOES_NOT_FIT';
    this.chainDurationMin = chainDurationMin;
    this.alternatives = alternatives;
  }
}

/**
 * Create a chain of back-to-back bookings.
 *
 * @param {Object} input
 * @param {ObjectId} input.provider
 * @param {ObjectId} input.client
 * @param {Object}   input.bookedBy        - { name, userId } for audit trail
 * @param {string}   input.date            - 'yyyy-MM-dd' in LA tz
 * @param {string}   input.startTime       - 'HH:mm' first session start
 * @param {Object}   input.location        - { lat, lng, address } shared by all sessions
 * @param {Array}    input.sessions        - per-session configs, see below
 * @param {string}   [input.status]        - default 'pending'; recurring uses 'confirmed'
 * @param {ObjectId} [input.series]        - optional ref to a RecurringSeries
 * @param {Object}   [input.providerConfig] - { addons: [{name, isActive}] } if pre-fetched
 *
 * Each session in `sessions`:
 *   { duration, serviceType?, addons?, pricing?, paymentMethod?,
 *     packagePurchaseId?, recipientType?, recipientInfo? }
 *
 * @returns {Array<Booking>} the created Booking docs (all with shared groupId)
 * @throws {ChainValidationError|ChainDoesntFitError}
 */
async function createChainBookings(input) {
  const {
    provider,
    client,
    bookedBy,
    date,
    startTime,
    location,
    sessions,
    status = 'pending',
    series = null,
  } = input;

  // ─── Input shape validation ──────────────────────────────────────────
  if (!provider) throw new ChainValidationError('provider is required');
  if (!client) throw new ChainValidationError('client is required');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ChainValidationError('date must be yyyy-MM-dd');
  }
  if (!startTime || !/^([01]?\d|2[0-3]):[0-5]\d$/.test(startTime)) {
    throw new ChainValidationError('startTime must be HH:mm');
  }
  if (!location || !location.address || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
    throw new ChainValidationError('location requires address, lat, lng');
  }
  if (!Array.isArray(sessions) || sessions.length === 0) {
    throw new ChainValidationError('sessions must be a non-empty array');
  }
  if (sessions.length > MAX_CHAIN_LENGTH) {
    throw new ChainValidationError(`A chain cannot exceed ${MAX_CHAIN_LENGTH} sessions`);
  }

  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const dur = Number(s.duration);
    if (!Number.isFinite(dur) || dur < 30 || dur > 180) {
      throw new ChainValidationError(`Session ${i + 1}: duration must be 30–180 minutes`);
    }
  }

  // Cascade times.
  const bookingDateLA = DateTime.fromISO(date, { zone: DEFAULT_TZ }).startOf('day');
  if (!bookingDateLA.isValid) throw new ChainValidationError('Invalid date');

  const sessionPlan = [];
  let cursor = DateTime.fromFormat(`${date} ${startTime}`, 'yyyy-MM-dd HH:mm', { zone: DEFAULT_TZ });
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const dur = Number(s.duration);
    const start = cursor;
    const end = start.plus({ minutes: dur });
    sessionPlan.push({ start, end, duration: dur, request: s });
    cursor = end.plus({ minutes: SETTLE_BUFFER });
  }

  const totalDurationWithBuffers = sessionPlan.reduce((acc, s, i) =>
    acc + s.duration + (i < sessionPlan.length - 1 ? SETTLE_BUFFER : 0), 0);

  // ─── "Does this fit?" check ──────────────────────────────────────────
  const localDateStr = bookingDateLA.toFormat('yyyy-MM-dd');
  const availabilityBlocks = await Availability.find({
    provider,
    localDate: localDateStr,
  }).sort({ start: 1 });
  if (availabilityBlocks.length === 0) {
    throw new ChainDoesntFitError('No availability for the selected date', {
      chainDurationMin: totalDurationWithBuffers,
      alternatives: [],
    });
  }

  const existingBookings = await Booking.find({
    provider,
    date: {
      $gte: bookingDateLA.startOf('day').toUTC().toJSDate(),
      $lt: bookingDateLA.endOf('day').toUTC().toJSDate(),
    },
    status: { $ne: 'cancelled' },
  }).sort({ startTime: 1 });

  const homeLoc = await SavedLocation.findOne({ provider, isHomeBase: true });
  const homeBase = homeLoc ? { lat: homeLoc.lat, lng: homeLoc.lng } : null;

  const blockedTimes = await BlockedTime.find({ provider, localDate: localDateStr });

  let chainSlots = [];
  for (const availability of availabilityBlocks) {
    const slots = await getAvailableTimeSlots(
      availability,
      existingBookings,
      location,
      totalDurationWithBuffers,
      SETTLE_BUFFER,
      null, 0,
      provider, [],
      homeBase, blockedTimes
    );
    chainSlots = chainSlots.concat(slots);
  }

  const wantedMinute = (() => {
    const [h, m] = startTime.split(':').map(Number);
    return h * 60 + m;
  })();
  const chainSlotMinutes = chainSlots
    .map(slot => {
      const dt = DateTime.fromJSDate(slot).setZone(DEFAULT_TZ);
      return dt.hour * 60 + dt.minute;
    })
    .sort((a, b) => a - b);
  const chainSlotMinuteSet = new Set(chainSlotMinutes);

  if (!chainSlotMinuteSet.has(wantedMinute)) {
    const minuteToLabel = (m) =>
      `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const allAlternatives = chainSlotMinutes.map(minuteToLabel);
    throw new ChainDoesntFitError(
      `This back-to-back chain (${totalDurationWithBuffers} min including buffers) doesn't fit at ${startTime}. ${
        allAlternatives.length === 0
          ? 'No start time today fits the full chain.'
          : `Closest fits: ${allAlternatives.slice(0, 4).join(', ')}.`
      }`,
      { chainDurationMin: totalDurationWithBuffers, alternatives: allAlternatives }
    );
  }

  // ─── Per-session addon validation ────────────────────────────────────
  const providerUser = await User.findById(provider);
  const providerAddons = providerUser?.providerProfile?.addons || [];
  const activeAddonNames = providerAddons.filter(a => a.isActive).map(a => a.name);
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    if (!Array.isArray(s.addons)) continue;
    for (const addon of s.addons) {
      if (activeAddonNames.length > 0 && !activeAddonNames.includes(addon.name)) {
        throw new ChainValidationError(`Session ${i + 1}: add-on "${addon.name}" is not offered`);
      }
      if (typeof addon.price !== 'number' || addon.price < 0) {
        throw new ChainValidationError(`Session ${i + 1}: invalid price for add-on "${addon.name}"`);
      }
    }
  }

  // ─── Atomic chain creation with rollback on partial failure ──────────
  const groupId = new mongoose.Types.ObjectId().toString();
  const created = [];
  const reservedCredits = []; // { packageId, bookingId }

  try {
    for (let i = 0; i < sessionPlan.length; i++) {
      const { start, end, duration: dur, request: r } = sessionPlan[i];
      const bookingObjectId = new mongoose.Types.ObjectId();

      // Optional package redemption per session. Same partial-redemption
      // shape as the single-booking path: when r.packageMinutesApplied
      // is less than the session's duration, we reserve only that many
      // minutes from the package and the session's paymentMethod (which
      // must be a non-package method) covers the rest.
      let packageRedemption = null;
      let paymentMethodFinal = r.paymentMethod || 'cash';
      let paymentStatusFinal = 'unpaid';
      let paidAtFinal = null;

      if (r.packagePurchaseId) {
        const sessionMinutesApplied = r.packageMinutesApplied != null
          ? Number(r.packageMinutesApplied)
          : dur;
        const sessionPartial = sessionMinutesApplied < dur;
        if (sessionPartial) {
          if (!Number.isFinite(sessionMinutesApplied) || sessionMinutesApplied <= 0) {
            throw new Error(`Session ${i + 1}: packageMinutesApplied must be a positive number ≤ duration`);
          }
          if (!r.paymentMethod || r.paymentMethod === 'package') {
            throw new Error(`Session ${i + 1}: partial package redemption requires a non-package paymentMethod`);
          }
        }
        const reserved = await reservePackageCredit({
          packageId: r.packagePurchaseId,
          clientId: client,
          providerId: provider,
          duration: dur,
          minutesToApply: sessionMinutesApplied,
          bookingId: bookingObjectId,
        });
        if (!reserved) {
          throw new Error(`Session ${i + 1}: package credit unavailable`);
        }
        reservedCredits.push({ packageId: r.packagePurchaseId, bookingId: bookingObjectId });
        packageRedemption = {
          packagePurchase: reserved._id,
          minutesApplied: sessionMinutesApplied,
          redeemedAt: new Date(),
        };
        if (!sessionPartial) {
          paymentMethodFinal = 'package';
          paymentStatusFinal = 'paid';
          paidAtFinal = new Date();
        }
        // Partial: leave paymentMethod as the secondary, status unpaid.
      }

      const booking = new Booking({
        _id: bookingObjectId,
        provider,
        client,
        ...(series ? { series } : {}),
        date: bookingDateLA.toUTC().toJSDate(),
        localDate: localDateStr,
        startTime: start.toFormat('HH:mm'),
        endTime: end.toFormat('HH:mm'),
        duration: dur,
        location: { lat: location.lat, lng: location.lng, address: location.address },
        ...(r.serviceType && {
          serviceType: { id: r.serviceType.id, name: r.serviceType.name },
        }),
        ...(r.addons && {
          addons: r.addons.map(a => ({
            id: a.id,
            name: a.name,
            price: a.price,
            extraTime: a.extraTime || 0,
          })),
        }),
        ...(r.pricing && {
          pricing: {
            basePrice: r.pricing.basePrice ?? calculatePrice(dur),
            addonsPrice: r.pricing.addonsPrice ?? 0,
            totalPrice: r.pricing.totalPrice ?? calculatePrice(dur),
          },
        }),
        paymentMethod: paymentMethodFinal,
        paymentStatus: paymentStatusFinal,
        paidAt: paidAtFinal,
        ...(packageRedemption && { packageRedemption }),
        recipientType: r.recipientType || 'self',
        ...(r.recipientType === 'other' && r.recipientInfo && {
          recipientInfo: {
            name: r.recipientInfo.name,
            phone: r.recipientInfo.phone,
            email: r.recipientInfo.email || '',
          },
        }),
        groupId,
        isLastInGroup: i === sessionPlan.length - 1,
        status,
        bookedBy: bookedBy || { name: 'System', userId: null },
      });

      await booking.save();
      created.push(booking);
    }

    return created;
  } catch (chainErr) {
    // Roll back everything created so far.
    for (const b of created) {
      try { await Booking.findByIdAndDelete(b._id); } catch (_) { /* swallow */ }
    }
    for (const rc of reservedCredits) {
      try { await returnReservedCredit(rc); } catch (_) { /* swallow */ }
    }
    if (chainErr instanceof ChainValidationError || chainErr instanceof ChainDoesntFitError) {
      throw chainErr;
    }
    // Wrap unexpected errors so callers can distinguish.
    const wrapped = new Error(`Chain creation failed mid-flight: ${chainErr.message}`);
    wrapped.code = 'CHAIN_INTERNAL';
    wrapped.cause = chainErr;
    throw wrapped;
  }
}

module.exports = {
  createChainBookings,
  ChainValidationError,
  ChainDoesntFitError,
  SETTLE_BUFFER,
  MAX_CHAIN_LENGTH,
};
