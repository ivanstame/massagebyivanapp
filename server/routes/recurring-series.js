const express = require('express');
const router = express.Router();
const { DateTime } = require('luxon');
const mongoose = require('mongoose');
const RecurringSeries = require('../models/RecurringSeries');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { ensureAuthenticated } = require('../middleware/passportMiddleware');
const { DEFAULT_TZ } = require('../../src/utils/timeConstants');
const { createChainBookings } = require('../services/chainBookingService');
const {
  reservePackageCredit,
  returnReservedCredit,
  markRedemptionReturned,
} = require('../services/packageReservation');

// Rolling-window length. Each series materializes occurrences out this
// far from "now" at creation time; the lazy-extend path (called by the
// availability fetch flow) keeps it topped up as time passes.
const WINDOW_DAYS = 90;

// Compute the list of dates a series should occur on, bounded by the
// window and any end-condition. Returns 'yyyy-MM-dd' strings local to
// the series' timezone (the standing arrangement's "every Tuesday"
// means Tuesday in the provider/series TZ).
function generateOccurrenceDates(series, throughDate) {
  const dates = [];
  const tz = series.timezone || DEFAULT_TZ;
  let current = DateTime.fromFormat(series.startDate, 'yyyy-MM-dd', { zone: tz });
  const through = DateTime.fromJSDate(throughDate).setZone(tz);
  const endDate = series.endDate
    ? DateTime.fromFormat(series.endDate, 'yyyy-MM-dd', { zone: tz })
    : null;

  let count = 0;
  while (current <= through) {
    if (endDate && current > endDate) break;
    if (series.occurrenceLimit && count >= series.occurrenceLimit) break;
    dates.push(current.toFormat('yyyy-MM-dd'));
    count += 1;
    current = current.plus({ weeks: series.intervalWeeks });
  }
  return dates;
}

// Materialize occurrences for a series within the window. Skips any
// occurrence whose time slot already has a non-cancelled booking on
// the calendar — those go in `conflicts` so the caller can surface them
// to the provider. Idempotent: re-running won't duplicate occurrences.
async function materializeSeries(series, options = {}) {
  const seriesTz = series.timezone || DEFAULT_TZ;
  const fromDate = options.fromDate
    ? DateTime.fromJSDate(options.fromDate).setZone(seriesTz)
    : DateTime.fromFormat(series.startDate, 'yyyy-MM-dd', { zone: seriesTz });
  const throughDate = options.throughDate
    || DateTime.now().setZone(seriesTz).plus({ days: WINDOW_DAYS }).toJSDate();

  const allDates = generateOccurrenceDates(series, throughDate);
  // Restrict to dates >= fromDate (caller may pass an extension cutoff).
  const fromStr = fromDate.toFormat('yyyy-MM-dd');
  const candidateDates = allDates.filter(d => d >= fromStr);

  // Pull existing series-tagged bookings so we don't double-create on
  // a re-materialization pass.
  const existing = await Booking.find({
    series: series._id,
    localDate: { $in: candidateDates },
  }).select('localDate');
  const existingDates = new Set(existing.map(b => b.localDate));

  // Pull other-booking conflicts in one query for efficiency.
  const otherBookings = await Booking.find({
    provider: series.provider,
    series: { $ne: series._id },
    localDate: { $in: candidateDates },
    status: { $ne: 'cancelled' },
  }).select('localDate startTime endTime');

  // Pre-compute the new occurrence's time bounds for overlap checks.
  const newStartMin = (() => {
    const [h, m] = series.startTime.split(':').map(Number);
    return h * 60 + m;
  })();
  const newEndMin = newStartMin + series.duration;

  const created = [];
  const conflicts = [];

  const isChainSeries = Array.isArray(series.additionalSessions) && series.additionalSessions.length > 0;

  for (const dateStr of candidateDates) {
    if (existingDates.has(dateStr)) continue; // already materialized

    // Chain path: delegate to the shared chain service. It does its own
    // availability + travel-time fit check, addon validation, atomic
    // creation, and rollback. Conflicts surface as ChainDoesntFitError.
    if (isChainSeries) {
      const sessions = [
        {
          duration: series.duration,
          serviceType: series.serviceType,
          addons: series.addons,
          pricing: series.pricing,
          paymentMethod: series.paymentMethod,
          packagePurchaseId: series.packagePurchase || undefined,
          recipientType: series.recipientType,
          recipientInfo: series.recipientInfo,
        },
        ...series.additionalSessions.map(as => ({
          duration: as.duration,
          serviceType: as.serviceType,
          addons: as.addons,
          pricing: as.pricing,
          paymentMethod: as.paymentMethod,
          packagePurchaseId: as.packagePurchase || undefined,
          recipientType: as.recipientType,
          recipientInfo: as.recipientInfo,
        })),
      ];

      try {
        const chainBookings = await createChainBookings({
          provider: series.provider,
          client: series.client,
          bookedBy: { name: 'Standing appointment', userId: series.provider },
          date: dateStr,
          startTime: series.startTime,
          location: series.location,
          sessions,
          status: 'confirmed',
          series: series._id,
          // Preserve the series' TZ on every chain occurrence so all
          // materialized bookings share the same canonical local-time
          // interpretation.
          timezone: seriesTz,
        });
        created.push(...chainBookings);
      } catch (err) {
        if (err.code === 'CHAIN_DOES_NOT_FIT') {
          conflicts.push({ date: dateStr, reason: 'chain_does_not_fit', message: err.message });
        } else if (err.code === 'CHAIN_VALIDATION') {
          conflicts.push({ date: dateStr, reason: 'chain_validation', message: err.message });
        } else {
          conflicts.push({ date: dateStr, reason: 'save_failed', error: err.message });
        }
      }
      continue;
    }

    // Single-session path — simpler conflict check against same-day bookings.
    const sameDayOthers = otherBookings.filter(b => b.localDate === dateStr);
    const hasConflict = sameDayOthers.some(b => {
      const [bsH, bsM] = b.startTime.split(':').map(Number);
      const [beH, beM] = b.endTime.split(':').map(Number);
      const bStart = bsH * 60 + bsM;
      const bEnd = beH * 60 + beM;
      return newStartMin < bEnd && newEndMin > bStart;
    });
    if (hasConflict) {
      conflicts.push({ date: dateStr, reason: 'existing_booking' });
      continue;
    }

    // Build a fresh Booking — same fields as POST /api/bookings would
    // create, plus the series back-reference.
    const startLA = DateTime.fromFormat(
      `${dateStr} ${series.startTime}`,
      'yyyy-MM-dd HH:mm',
      { zone: seriesTz }
    );
    const endLA = startLA.plus({ minutes: series.duration });
    const dateLA = DateTime.fromFormat(dateStr, 'yyyy-MM-dd', { zone: seriesTz }).startOf('day');

    // If the series is paid by package, attempt to reserve a credit per
    // occurrence. If the package runs out or is cancelled we silently
    // fall back to 'cash' / 'unpaid' rather than refusing to materialize
    // — provider can sort it out at the booking level.
    let bookingPaymentMethod = series.paymentMethod;
    let bookingPaymentStatus = 'unpaid';
    let paidAt = null;
    let packageRedemption = null;

    if (series.paymentMethod === 'package' && series.packagePurchase) {
      const bookingId = new mongoose.Types.ObjectId();
      const reserved = await reservePackageCredit({
        packageId: series.packagePurchase,
        clientId: series.client,
        providerId: series.provider,
        duration: series.duration,
        bookingId,
      });

      if (reserved) {
        bookingPaymentStatus = 'paid';
        paidAt = new Date();
        packageRedemption = { packagePurchase: reserved._id, redeemedAt: new Date() };
        // Use the pre-allocated id below.
        const booking = new Booking({
          _id: bookingId,
          provider: series.provider,
          client: series.client,
          series: series._id,
          timezone: seriesTz,
          date: dateLA.toUTC().toJSDate(),
          localDate: dateStr,
          startTime: series.startTime,
          endTime: endLA.toFormat('HH:mm'),
          duration: series.duration,
          location: series.location,
          serviceType: series.serviceType,
          addons: series.addons,
          pricing: series.pricing,
          paymentMethod: 'package',
          paymentStatus: 'paid',
          paidAt,
          packageRedemption,
          recipientType: series.recipientType,
          ...(series.recipientType === 'other' && series.recipientInfo
            ? { recipientInfo: series.recipientInfo }
            : {}),
          status: 'confirmed', // provider explicitly set up this commitment
          bookedBy: { name: 'Standing appointment', userId: series.provider },
        });
        try {
          await booking.save();
          created.push(booking);
        } catch (saveErr) {
          // Roll back the credit reservation on save failure.
          await returnReservedCredit({ packageId: reserved._id, bookingId });
          conflicts.push({ date: dateStr, reason: 'save_failed', error: saveErr.message });
        }
        continue;
      } else {
        // Package not redeemable — fall through to non-package booking.
        bookingPaymentMethod = 'cash';
      }
    }

    const booking = new Booking({
      provider: series.provider,
      client: series.client,
      series: series._id,
      timezone: seriesTz,
      date: dateLA.toUTC().toJSDate(),
      localDate: dateStr,
      startTime: series.startTime,
      endTime: endLA.toFormat('HH:mm'),
      duration: series.duration,
      location: series.location,
      serviceType: series.serviceType,
      addons: series.addons,
      pricing: series.pricing,
      paymentMethod: bookingPaymentMethod,
      paymentStatus: bookingPaymentStatus,
      paidAt,
      recipientType: series.recipientType,
      ...(series.recipientType === 'other' && series.recipientInfo
        ? { recipientInfo: series.recipientInfo }
        : {}),
      status: 'confirmed',
      bookedBy: { name: 'Standing appointment', userId: series.provider },
    });
    try {
      await booking.save();
      created.push(booking);
    } catch (saveErr) {
      conflicts.push({ date: dateStr, reason: 'save_failed', error: saveErr.message });
    }
  }

  // Advance the watermark — anything in the candidate window has been
  // considered, even if some were skipped.
  series.lastMaterializedThrough = throughDate;
  await series.save();

  return { created, conflicts };
}

// Lazy-extend any active series whose window has fallen behind a target
// date. Called by the availability-fetch path so providers don't have
// to manually "extend my standing" — visiting any availability view
// keeps things current. Intentionally idempotent and cheap when nothing
// to do.
async function lazyExtendForProvider(providerId, throughDate) {
  const stale = await RecurringSeries.find({
    provider: providerId,
    status: 'active',
    $or: [
      { lastMaterializedThrough: null },
      { lastMaterializedThrough: { $lt: throughDate } },
    ],
  });

  for (const series of stale) {
    try {
      await materializeSeries(series, {
        fromDate: series.lastMaterializedThrough || undefined,
        throughDate,
      });
    } catch (err) {
      console.error(`[RecurringSeries] Lazy-extend failed for series ${series._id}:`, err.message);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────
// Routes
// ──────────────────────────────────────────────────────────────────────

// Provider creates a standing appointment. Body mirrors the booking-form
// payload + cadence fields (intervalWeeks, end condition).
router.post('/', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const {
      clientId, startDate, startTime, duration, intervalWeeks,
      endDate, occurrenceLimit, location, serviceType, addons, pricing,
      paymentMethod, packagePurchaseId, recipientType, recipientInfo,
      additionalSessions,
    } = req.body;

    if (!clientId || !startDate || !startTime || !duration) {
      return res.status(400).json({
        message: 'clientId, startDate, startTime, and duration are required',
      });
    }
    if (![1, 2, 4].includes(Number(intervalWeeks))) {
      return res.status(400).json({ message: 'intervalWeeks must be 1, 2, or 4' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return res.status(400).json({ message: 'startDate must be yyyy-MM-dd' });
    }
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(startTime)) {
      return res.status(400).json({ message: 'startTime must be HH:mm' });
    }
    if (!location || !location.lat || !location.lng || !location.address) {
      return res.status(400).json({ message: 'Full location (lat/lng/address) is required' });
    }
    if (endDate && occurrenceLimit) {
      return res.status(400).json({ message: 'Set either endDate or occurrenceLimit, not both' });
    }

    // Verify the target user is a client of this provider.
    const client = await User.findOne({
      _id: clientId,
      providerId: req.user._id,
      accountType: 'CLIENT',
    });
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }

    // Resolve provider TZ — series' day-of-week and start time
    // anchor here. Snapshotted onto the series so future
    // materialization keeps using this TZ even if the provider's
    // setting changes.
    const { tzForProviderId } = require('../utils/providerTz');
    const providerTz = await tzForProviderId(req.user._id);

    // dayOfWeek derived from startDate. Luxon's weekday is 1..7
    // (Mon..Sun); convert to 0..6 (Sun..Sat) used elsewhere.
    const startDt = DateTime.fromFormat(startDate, 'yyyy-MM-dd', { zone: providerTz });
    if (!startDt.isValid) {
      return res.status(400).json({ message: 'startDate is not a valid date' });
    }
    const dayOfWeek = startDt.weekday === 7 ? 0 : startDt.weekday;

    // Sanitize additionalSessions — same validation the per-occurrence chain
    // service applies, hoisted up so we fail series creation rather than
    // every materialization attempt if the shape is bad.
    const cleanedAdditional = Array.isArray(additionalSessions)
      ? additionalSessions.map((s, i) => {
          const dur = Number(s.duration);
          if (!Number.isFinite(dur) || dur < 30 || dur > 180) {
            throw new Error(`Additional session ${i + 1}: duration must be 30–180 minutes`);
          }
          return {
            duration: dur,
            serviceType: s.serviceType,
            addons: Array.isArray(s.addons) ? s.addons : [],
            pricing: s.pricing,
            paymentMethod: s.paymentMethod || 'cash',
            packagePurchase: s.paymentMethod === 'package' ? s.packagePurchaseId : null,
            recipientType: s.recipientType || 'other',
            recipientInfo: s.recipientType === 'other' ? s.recipientInfo : undefined,
          };
        })
      : [];

    const series = await RecurringSeries.create({
      provider: req.user._id,
      client: clientId,
      timezone: providerTz,
      startDate,
      startTime,
      duration: Number(duration),
      intervalWeeks: Number(intervalWeeks),
      dayOfWeek,
      endDate: endDate || null,
      occurrenceLimit: occurrenceLimit ? Number(occurrenceLimit) : null,
      serviceType,
      addons: addons || [],
      pricing,
      paymentMethod: paymentMethod || 'cash',
      packagePurchase: paymentMethod === 'package' ? packagePurchaseId : null,
      location,
      recipientType: recipientType || 'self',
      recipientInfo: recipientType === 'other' ? recipientInfo : undefined,
      additionalSessions: cleanedAdditional,
    });

    const result = await materializeSeries(series);

    res.status(201).json({
      series,
      occurrencesCreated: result.created.length,
      conflicts: result.conflicts,
    });
  } catch (err) {
    console.error('Error creating recurring series:', err);
    res.status(500).json({ message: 'Failed to create standing appointment' });
  }
});

// List a provider's series — used by the client detail page's "Standing
// appointments" section. Includes a compact summary of upcoming
// occurrences so the UI doesn't need a second round-trip.
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }
    const filter = { provider: req.user._id };
    if (req.query.clientId) filter.client = req.query.clientId;
    if (req.query.status) filter.status = req.query.status;

    const series = await RecurringSeries.find(filter).sort({ createdAt: -1 });

    // Attach next upcoming + total occurrence count for each.
    const todayStr = DateTime.now().setZone(DEFAULT_TZ).toFormat('yyyy-MM-dd');
    const enriched = await Promise.all(series.map(async (s) => {
      const [nextBooking, total] = await Promise.all([
        Booking.findOne({
          series: s._id,
          status: { $ne: 'cancelled' },
          localDate: { $gte: todayStr },
        }).sort({ localDate: 1, startTime: 1 }).select('localDate startTime'),
        // Active occurrences only — cancelled bookings remain in the
        // collection as history but shouldn't inflate the "X on the
        // books" summary the UI shows next to each series.
        Booking.countDocuments({ series: s._id, status: { $ne: 'cancelled' } }),
      ]);
      return {
        ...s.toObject(),
        nextOccurrence: nextBooking
          ? { date: nextBooking.localDate, startTime: nextBooking.startTime }
          : null,
        totalOccurrences: total,
      };
    }));

    res.json(enriched);
  } catch (err) {
    console.error('Error listing recurring series:', err);
    res.status(500).json({ message: 'Failed to list standing appointments' });
  }
});

// Detail view — series + the occurrences. Useful for a future "manage
// this series" page if we add one.
router.get('/:id', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }
    const series = await RecurringSeries.findOne({
      _id: req.params.id,
      provider: req.user._id,
    });
    if (!series) {
      return res.status(404).json({ message: 'Series not found' });
    }
    const occurrences = await Booking.find({ series: series._id })
      .sort({ localDate: 1, startTime: 1 });
    res.json({ series, occurrences });
  } catch (err) {
    console.error('Error loading series:', err);
    res.status(500).json({ message: 'Failed to load series' });
  }
});

// Cancel the series. Default cancels future un-started occurrences too;
// pass `?keepBookings=true` to leave existing materialized bookings
// alone (rare — usually if the provider cancels a series they want
// future appointments cleared).
router.delete('/:id', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }
    const series = await RecurringSeries.findOne({
      _id: req.params.id,
      provider: req.user._id,
    });
    if (!series) {
      return res.status(404).json({ message: 'Series not found' });
    }
    if (series.status === 'cancelled') {
      return res.status(400).json({ message: 'Series is already cancelled' });
    }

    series.status = 'cancelled';
    series.cancelledAt = new Date();
    series.cancelledBy = 'PROVIDER';
    await series.save();

    // Hard-delete future, not-yet-happened, not-individually-cancelled
    // occurrences. The series doc itself preserves the audit trail
    // (status, cancelledAt, cancelledBy). Past occurrences and any
    // future occurrences that were already individually cancelled stay
    // — those are real client-history events, not cascade noise.
    let occurrencesDeleted = 0;
    if (req.query.keepBookings !== 'true') {
      const todayStr = DateTime.now().setZone(DEFAULT_TZ).toFormat('yyyy-MM-dd');
      const future = await Booking.find({
        series: series._id,
        localDate: { $gt: todayStr },
        status: { $nin: ['cancelled', 'completed'] },
      });
      for (const b of future) {
        // Pull any package redemption rows pointing at this booking — the
        // booking is going away, so the redemption row would orphan.
        if (b.packageRedemption?.packagePurchase) {
          await returnReservedCredit({
            packageId: b.packageRedemption.packagePurchase,
            bookingId: b._id,
          });
        }
        await Booking.deleteOne({ _id: b._id });
        occurrencesDeleted += 1;
      }
    }

    res.json({
      message: 'Series cancelled',
      occurrencesDeleted,
      cancelledOccurrences: occurrencesDeleted, // back-compat
    });
  } catch (err) {
    console.error('Error cancelling series:', err);
    res.status(500).json({ message: 'Failed to cancel series' });
  }
});

// Exposed for use by other server code (e.g. availability route's lazy-
// extend path) — not a route, so attached to the module.
router.lazyExtendForProvider = lazyExtendForProvider;
router.materializeSeries = materializeSeries;

module.exports = router;
