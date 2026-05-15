const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Booking = require('../models/Booking');
const Availability = require('../models/Availability');
const BlockedTime = require('../models/BlockedTime');
const User = require('../models/User');
const SavedLocation = require('../models/SavedLocation');
const PackagePurchase = require('../models/PackagePurchase');
const { ensureAuthenticated } = require('../middleware/passportMiddleware');
const { audit } = require('../utils/auditLog');
const { computeBookingPaymentBreakdown } = require('../utils/paymentBreakdown');
const { getAvailableTimeSlots } = require('../utils/timeUtils');
const { calculateTravelTime, calculateDistanceMiles } = require('../services/mapService');
const { createChainBookings } = require('../services/chainBookingService');
const {
  reservePackageCredit,
  returnReservedCredit,
  markRedemptionReturned,
} = require('../services/packageReservation');
const { DateTime } = require('luxon');
const smsService = require('../services/smsService');
const { formatPhoneNumber } = require('../../src/utils/phoneUtils');
const {
  sendBookingConfirmationEmail,
  sendBookingNotificationToProvider,
  sendBookingCancellationEmail,
  sendBookingCompletedEmail,
} = require('../utils/email');

// No fallback rate. Earlier versions used a silent $120/hr fallback
// when a provider hadn't configured basePricing, which meant clients
// could be charged a made-up number the provider never agreed to.
// Booking creation now requires the request body to carry an explicit
// pricing object with a positive totalPrice — the provider's services
// page is the source of truth.

// Reservation logic lives in services/packageReservation.js — same helper
// used by chainBookingService and recurring-series materialization, so
// sessions-mode and minutes-mode behavior stays consistent across all
// three booking entry points.

// POST / (Create a new booking)
router.post('/', ensureAuthenticated, async (req, res) => {
  console.log('=== BOOKING CREATION DEBUG ===');
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  console.log('User:', req.user.email, 'ID:', req.user._id, 'Type:', req.user.accountType);
  
  try {
    const { date, time, duration, location } = req.body;
    
    // Validate time format
    const timeFormat24h = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeFormat24h.test(time)) {
      console.error('Invalid time format:', time);
      return res.status(400).json({ message: 'Invalid time format. Use 24-hour format (HH:mm)' });
    }

    // If client is booking, use their provider
    // If provider is booking for client, use provider's ID
    const providerId = req.user.accountType === 'CLIENT' 
      ? req.user.providerId 
      : req.user._id;

    // Provider booking on behalf has two flavors:
    //   (a) Existing managed client — req.body.clientId points at one
    //       of this provider's clients. Booking attaches there.
    //   (b) One-off guest — provider hasn't picked a client; booking
    //       carries recipientType='other' + recipientInfo (name/phone).
    //       We attribute it to the provider's own _id as a placeholder
    //       so the schema's required `client` ref is satisfied. No
    //       new managed-client doc is created. Use case: provider
    //       walks in mid-day and wants to book for whoever happens to
    //       be at the address (couple's massage, friend tagging
    //       along, etc.) without inflating the roster.
    const isProviderGuestBooking =
      req.user.accountType === 'PROVIDER'
      && !req.body.clientId
      && req.body.recipientType === 'other';

    const clientId = req.user.accountType === 'CLIENT'
      ? req.user._id
      : (isProviderGuestBooking ? req.user._id : req.body.clientId);

    // Verify provider-client relationship — skipped for guest bookings
    // since the "client" is the provider themselves, just a placeholder.
    if (req.user.accountType === 'PROVIDER' && !isProviderGuestBooking) {
      const client = await User.findById(clientId);
      if (!client || !client.providerId.equals(req.user._id)) {
        return res.status(403).json({ message: 'Invalid client for this provider' });
      }
    }

    // Resolve the provider's IANA timezone — every time-math op below
    // anchors here. Falls back to LA if the provider hasn't set one
    // (legacy / single-provider deployment).
    const { tzForProviderId } = require('../utils/providerTz');
    const providerTz = await tzForProviderId(providerId);

    const bookingDateLA = DateTime.fromISO(date, { zone: providerTz }).startOf('day');
    const bookingDate = bookingDateLA.toUTC().toJSDate();

    // Create booking start time in provider's timezone
    const bookingStartTimeLA = DateTime.fromFormat(`${bookingDateLA.toFormat('yyyy-MM-dd')} ${time}`,
      'yyyy-MM-dd HH:mm',
      { zone: providerTz }
    );
    
    // Convert to UTC for storage
    const bookingStartTime = bookingStartTimeLA.toUTC().toJSDate();
    
    // Calculate end time
    const bookingEndTimeLA = bookingStartTimeLA.plus({ minutes: duration });
    const endTime = bookingEndTimeLA.toFormat('HH:mm');

    // Get ALL availability blocks for the day (manual + template may coexist)
    const localDateStr = bookingDateLA.toFormat('yyyy-MM-dd');
    const availabilityBlocks = await Availability.find({
      provider: providerId,
      localDate: localDateStr
    }).sort({ start: 1 });

    if (availabilityBlocks.length === 0) {
      // Surface as a structured error so the client-side booking form
      // can deep-link the provider to /provider/schedule-template
      // instead of leaving them puzzled by a vague string.
      return res.status(400).json({
        message: 'No availability for the selected date',
        errorCode: 'NO_AVAILABILITY'
      });
    }

    // Pricing safety net. Provider must have at least one entry in
    // basePricing OR the client must submit a pricing object with a
    // positive totalPrice. We never invent prices. If a provider
    // skipped the services page entirely and a booking somehow lands
    // here with $0, reject with a specific code the UI can intercept.
    const providerPricing = await User.findById(providerId)
      .select('providerProfile.basePricing providerProfile.pricingTiers')
      .lean();
    const hasBasePricing = (providerPricing?.providerProfile?.basePricing || []).length > 0;
    const submittedPrice = Number(req.body.pricing?.totalPrice) || 0;
    if (!hasBasePricing && submittedPrice <= 0) {
      return res.status(400).json({
        message: 'Set your services and pricing before taking bookings.',
        errorCode: 'NO_PRICING_CONFIGURED'
      });
    }

    // Get existing bookings for this provider on this date
    const startOfDay = bookingDateLA.startOf('day').toUTC().toJSDate();
    const endOfDay = bookingDateLA.endOf('day').toUTC().toJSDate();
    const existingBookings = await Booking.find({
      provider: providerId,
      date: { $gte: startOfDay, $lt: endOfDay },
      status: { $ne: 'cancelled' }
    }).sort({ startTime: 1 });

    // Fetch provider's home base for travel time calculations
    let homeBase = null;
    const homeLoc = await SavedLocation.findOne({ provider: providerId, isHomeBase: true });
    if (homeLoc) {
      homeBase = { lat: homeLoc.lat, lng: homeLoc.lng };
    }

    // GCal freshness gate before the booking-creation conflict check.
    // This is the LAST line of defense before a client books over a
    // GCal event the sync missed — the previous incident was clients
    // booking into slots that should have been blocked. Even if the
    // booking form rendered a stale slot, the inline sync here catches
    // it before we persist a conflict.
    const { ensureFreshGcalSync } = require('../services/googleCalendarSync');
    const { ensureFreshExternalFeeds } = require('../services/externalCalendarFeedService');
    await Promise.all([
      ensureFreshGcalSync(providerId),
      ensureFreshExternalFeeds(providerId),
    ]);

    // Fetch blocked times for this date
    const blockedTimes = await BlockedTime.find({
      provider: providerId,
      localDate: localDateStr
    });

    // Check slot availability across ALL blocks (same logic as GET /available/:date)
    const bufferMinutes = 15;
    // Provider's per-account same-address turnover preference. Has to
    // match what the GET /available picker used so the slot the client
    // chose isn't silently rejected here for a buffer mismatch.
    const providerForBuffer = await User.findById(providerId)
      .select('providerProfile.sameAddressTurnoverBuffer').lean();
    const forceBufferForProvider = providerForBuffer?.providerProfile?.sameAddressTurnoverBuffer !== false;
    let allSlots = [];
    for (const availability of availabilityBlocks) {
      const slots = await getAvailableTimeSlots(
        availability,
        existingBookings,
        location,
        duration,
        bufferMinutes,
        null,  // requestedGroupId
        0,     // extraDepartureBuffer
        providerId,
        [],    // addons
        homeBase,
        blockedTimes,
        { forceBuffer: forceBufferForProvider }
      );
      allSlots = allSlots.concat(slots);
    }

    // Deduplicate by time string (in provider's TZ)
    const seenTimes = new Set();
    const availableSlots = allSlots.filter(slot => {
      const key = DateTime.fromJSDate(slot).setZone(providerTz).toFormat('HH:mm');
      if (seenTimes.has(key)) return false;
      seenTimes.add(key);
      return true;
    });

    // Convert available slots to provider-TZ time strings for comparison
    const availableTimeStrings = availableSlots.map(slot => {
      const slotLA = DateTime.fromJSDate(slot).setZone(providerTz);
      return slotLA.toFormat('HH:mm');
    });

    // Check if the requested time is in the available slots
    const isSlotAvailable = availableTimeStrings.includes(time);

    if (!isSlotAvailable) {
      return res.status(400).json({ message: 'This time slot is no longer available' });
    }

    // Validate add-ons against provider's configured services
    if (req.body.addons && Array.isArray(req.body.addons)) {
      const providerUser = await User.findById(providerId);
      const providerAddons = providerUser?.providerProfile?.addons || [];
      const activeAddonNames = providerAddons
        .filter(a => a.isActive)
        .map(a => a.name);

      for (const addon of req.body.addons) {
        // Validate against provider's configured addons (by name)
        if (activeAddonNames.length > 0 && !activeAddonNames.includes(addon.name)) {
          return res.status(400).json({
            message: `Add-on "${addon.name}" is not available from this provider`
          });
        }

        // Validate price is a positive number
        if (typeof addon.price !== 'number' || addon.price < 0) {
          return res.status(400).json({
            message: `Invalid price for add-on "${addon.name}". Price must be a positive number.`
          });
        }
      }
    }
    
    // Create booking
    console.log('Creating booking object with data:', {
      provider: providerId,
      client: clientId,
      date: bookingDate,
      localDate: bookingDateLA.toFormat('yyyy-MM-dd'),
      startTime: time,
      endTime: endTime,
      duration,
      location
    });

    // Determine if this booking is being paid via a package credit. The
    // client sends `packagePurchaseId` when they pick "Use package credit"
    // in the booking form's payment step. We reserve the credit atomically
    // BEFORE saving the booking so concurrent uses can't double-redeem.
    //
    // `packageMinutesApplied` (optional, minutes-mode only) supports
    // partial redemption: a client with 30 minutes left in their package
    // booking a 60-min session can apply 30 from the package and pay the
    // rest via cash/card/zelle. When omitted, the full duration is
    // applied (the original behavior). When less than `duration`, the
    // booking's `paymentMethod` must be a non-package method to cover
    // the difference.
    const requestedPackageId = req.body.packagePurchaseId || null;
    const usingPackage = !!requestedPackageId;
    const requestedMinutesApplied = usingPackage
      ? (req.body.packageMinutesApplied != null
          ? Number(req.body.packageMinutesApplied)
          : duration)
      : 0;
    const isPartialRedemption = usingPackage && requestedMinutesApplied < duration;

    if (isPartialRedemption) {
      if (!Number.isFinite(requestedMinutesApplied) || requestedMinutesApplied <= 0) {
        return res.status(400).json({
          message: 'packageMinutesApplied must be a positive number less than or equal to the booking duration.',
        });
      }
      const secondary = req.body.paymentMethod;
      if (!secondary || secondary === 'package') {
        return res.status(400).json({
          message: 'Partial package redemption requires a non-package paymentMethod (cash/zelle/card) for the remaining balance.',
        });
      }
    }

    // Pre-allocate the booking _id so we can reference it in the package's
    // redemptions array atomically before the booking itself is persisted.
    const bookingObjectId = new mongoose.Types.ObjectId();

    let reservedRedemption = null;
    if (usingPackage) {
      reservedRedemption = await reservePackageCredit({
        packageId: requestedPackageId,
        clientId,
        providerId,
        duration,
        minutesToApply: requestedMinutesApplied,
        bookingId: bookingObjectId,
      });
      if (!reservedRedemption) {
        return res.status(400).json({
          message: 'That package isn\'t available — it may be paid out, cancelled, or has insufficient remaining minutes.',
        });
      }
    }

    const booking = new Booking({
      _id: bookingObjectId,
      provider: providerId,
      client: clientId,
      timezone: providerTz,
      date: bookingDate,
      localDate: bookingDateLA.toFormat('yyyy-MM-dd'),
      startTime: time,
      endTime: endTime,
      duration,
      location: {
        lat: location.lat,
        lng: location.lng,
        address: location.address
      },
      // Add service type if provided
      ...(req.body.serviceType && {
        serviceType: {
          id: req.body.serviceType.id,
          name: req.body.serviceType.name
        }
      }),
      // Add add-ons if provided
      ...(req.body.addons && {
        addons: req.body.addons.map(addon => ({
          id: addon.id,
          name: addon.name,
          price: addon.price,
          extraTime: addon.extraTime || 0
        }))
      }),
      // Add pricing if provided. No fallback — the guard at the top
      // of this handler rejects bookings that would land here with
      // missing pricing. We trust whatever the form computed against
      // the provider's current basePricing.
      ...(req.body.pricing && {
        pricing: {
          basePrice: Number(req.body.pricing.basePrice) || 0,
          addonsPrice: Number(req.body.pricing.addonsPrice) || 0,
          totalPrice: Number(req.body.pricing.totalPrice) || 0
        }
      }),
      // Add recipient information if provided
      ...(req.body.recipientType && {
        recipientType: req.body.recipientType
      }),
      ...(req.body.recipientType === 'other' && req.body.recipientInfo && {
        recipientInfo: {
          name: req.body.recipientInfo.name,
          phone: req.body.recipientInfo.phone,
          email: req.body.recipientInfo.email || ''
        }
      }),
      // Payment method — when fully paid via package, mark 'package' +
      // 'paid' immediately (the package itself was paid for at purchase).
      // For PARTIAL redemption, the package covers some minutes and the
      // body's paymentMethod (cash/card/zelle) covers the rest, so
      // the booking shows that secondary method and stays 'unpaid' until
      // the remainder is collected at the appointment.
      paymentMethod: (usingPackage && !isPartialRedemption)
        ? 'package'
        : (req.body.paymentMethod || 'cash'),
      paymentStatus: (usingPackage && !isPartialRedemption) ? 'paid' : 'unpaid',
      paidAt: (usingPackage && !isPartialRedemption) ? new Date() : null,
      ...(usingPackage && {
        packageRedemption: {
          packagePurchase: requestedPackageId,
          minutesApplied: requestedMinutesApplied,
          redeemedAt: new Date(),
        },
      }),
      // Always store who placed the booking
      bookedBy: {
        name: req.user.profile?.fullName || req.user.email,
        userId: req.user._id
      }
    });

    console.log('Booking object created, attempting to save to MongoDB...');
    console.log('Booking object ID (pre-save):', booking._id);

    try {
      const savedBooking = await booking.save();
      console.log('✅ BOOKING SAVED SUCCESSFULLY!');
      console.log('Saved booking ID:', savedBooking._id);
      console.log('Saved booking data:', JSON.stringify(savedBooking.toObject(), null, 2));
      
      // Calculate and store travel distance (non-blocking)
      try {
        // Find the previous booking on the same day (or use home base)
        const dayBookings = await Booking.find({
          provider: providerId,
          localDate: localDateStr,
          status: { $ne: 'cancelled' },
          _id: { $ne: savedBooking._id },
          startTime: { $lt: savedBooking.startTime }
        }).sort({ startTime: -1 }).limit(1);

        let fromLocation, fromAddress;
        if (dayBookings.length > 0) {
          fromLocation = dayBookings[0].location;
          fromAddress = dayBookings[0].location?.address || 'Previous appointment';
        } else if (homeBase) {
          fromLocation = homeBase;
          const homeLoc = await SavedLocation.findOne({ provider: providerId, isHomeBase: true });
          fromAddress = homeLoc?.address || 'Home base';
        }

        if (fromLocation && savedBooking.location) {
          const miles = await calculateDistanceMiles(fromLocation, savedBooking.location);
          savedBooking.travelDistance = {
            miles,
            fromAddress,
            toAddress: savedBooking.location.address || 'Client location',
          };
          await savedBooking.save();
        }
      } catch (distErr) {
        console.error('Error calculating travel distance:', distErr.message);
      }

      // Send SMS notifications
      try {
        // Get provider details
        const provider = await User.findById(savedBooking.provider);
        const providerName = provider.profile.fullName || provider.email;

        // Determine recipient details
        let recipientPhone, recipientName;
        if (savedBooking.recipientType === 'self') {
          const client = await User.findById(savedBooking.client);
          recipientPhone = client.profile?.phoneNumber || null;
          recipientName = client.profile?.fullName || client.email || 'Client';
        } else {
          recipientPhone = savedBooking.recipientInfo?.phone || null;
          recipientName = savedBooking.recipientInfo?.name || 'Guest';
        }

        const providerPhone = provider.profile?.phoneNumber || null;

        const recipientMessage = `Hi ${recipientName}, your massage with ${providerName} is confirmed on ${savedBooking.localDate} at ${savedBooking.startTime}.`;
        const providerMessage = `New booking: ${recipientName} on ${savedBooking.localDate} at ${savedBooking.startTime}.`;

        if (recipientPhone) {
          await smsService.sendSms(formatPhoneNumber(recipientPhone), recipientMessage);
        } else {
          console.log('Skipping recipient SMS: no phone number on file');
        }
        if (providerPhone) {
          await smsService.sendSms(formatPhoneNumber(providerPhone), providerMessage);
        }

        console.log('✅ SMS notifications processed');
      } catch (smsError) {
        console.error('❌ Error sending SMS notifications:', smsError);
      }

      // Send email notifications (non-blocking)
      try {
        const provider = await User.findById(savedBooking.provider);
        const client = await User.findById(savedBooking.client);
        const clientName = savedBooking.recipientType === 'other'
          ? savedBooking.recipientInfo?.name || 'Guest'
          : (client.profile?.fullName || client.email);

        // Email to client with calendar invite. Pass the full provider doc
        // so the template can pull businessName + logoUrl for white-label
        // branding rather than rendering Avayble's chrome over a stranger's
        // appointment.
        if (client.email) {
          sendBookingConfirmationEmail(client.email, savedBooking, provider, clientName);
        }
        // Email to provider
        if (provider.email) {
          sendBookingNotificationToProvider(provider.email, savedBooking, provider, clientName);
        }
      } catch (emailError) {
        console.error('❌ Error sending email notifications:', emailError);
      }

      res.status(201).json(savedBooking);
    } catch (saveError) {
      console.error('❌ FAILED TO SAVE BOOKING TO MONGODB!');
      console.error('Save error details:', saveError);
      console.error('Error name:', saveError.name);
      console.error('Error message:', saveError.message);
      if (saveError.errors) {
        console.error('Validation errors:', saveError.errors);
      }
      // If we already pulled a credit off a package and the booking save
      // failed, return the credit so it isn't silently consumed.
      if (usingPackage) {
        try {
          await returnReservedCredit({
            packageId: requestedPackageId,
            bookingId: bookingObjectId,
          });
          console.log('Reserved package credit returned after save failure.');
        } catch (returnErr) {
          console.error('Failed to return reserved package credit:', returnErr.message);
        }
      }
      throw saveError;
    }

  } catch (error) {
    console.error('❌ ERROR IN BOOKING CREATION PROCESS!');
    console.error('Full error object:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Booking creation failed',
      error: error.message,
      details: error.errors || error.toString()
    });
  }
});

// POST /bulk — book a back-to-back chain of sessions at the same address.
//
// The canonical case is a couple's massage: client books for himself + spouse,
// same home, same provider, sequential time slots with the standard settle
// buffer between them. Each session has its own recipient, duration, addons,
// pricing, and (optionally) package-credit redemption. All bookings share a
// generated groupId so future scope-aware operations can identify the chain.
//
// Validates that:
//   - all sessions share the same date + address (server-enforced)
//   - the chain of (duration + buffer) fits in an availability block
//   - the first session's start time is in the actual available-slots list
//     for the COMBINED chain duration (so we never half-book)
//   - if PROVIDER is calling: the target client belongs to this provider
//   - per-session addons are valid for this provider
//   - per-session package credits (if used) are reservable
//
// Atomic: if any session fails to save, every booking already created for
// this chain is hard-deleted, and any package credits already reserved are
// returned. The caller sees one clean error.
router.post('/bulk', ensureAuthenticated, async (req, res) => {
  try {
    // Body shape (back-compat): either a bare array of session payloads,
    // or an object `{ sessions: [...] }`. Wrapper shape kept for any
    // caller that already adopted it; both forms work. The
    // forceBuffer-on-the-wrapper field is no longer read — the
    // setting moved to the provider's own profile (see below).
    let bookingRequests;
    if (Array.isArray(req.body)) {
      bookingRequests = req.body;
    } else if (req.body && Array.isArray(req.body.sessions)) {
      bookingRequests = req.body.sessions;
    } else {
      return res.status(400).json({ message: 'Expected sessions array (bare or in { sessions })' });
    }
    if (bookingRequests.length === 0) {
      return res.status(400).json({ message: 'Expected at least one session' });
    }
    if (bookingRequests.length === 1) {
      // Forwarding a single-session bulk call to POST /bookings would lose
      // request-shape parity. Reject so the client uses the right entry.
      return res.status(400).json({ message: 'Use POST /api/bookings for a single booking' });
    }

    const first = bookingRequests[0];
    if (!first.location || !first.location.address) {
      return res.status(400).json({ message: 'First session must include a complete location' });
    }
    const sameDate = bookingRequests.every(r => r.date === first.date);
    const sameAddress = bookingRequests.every(r =>
      r.location?.address === first.location.address &&
      r.location?.lat === first.location.lat &&
      r.location?.lng === first.location.lng
    );
    if (!sameDate || !sameAddress) {
      return res.status(400).json({ message: 'All sessions in a group must share the same date and address' });
    }

    // Resolve provider/client from auth context. CLIENT books for self;
    // PROVIDER books on behalf of a target clientId in the request.
    // Provider guest-booking: no clientId on the first session AND
    // recipientType='other' → attribute the chain to the provider's
    // own _id as a placeholder client (no managed-client doc created).
    const isProviderGuestChain =
      req.user.accountType === 'PROVIDER'
      && !first.clientId
      && first.recipientType === 'other';
    const provider = req.user.accountType === 'CLIENT' ? req.user.providerId : req.user._id;
    const client = req.user.accountType === 'CLIENT'
      ? req.user._id
      : (isProviderGuestChain ? req.user._id : first.clientId);
    if (!provider || !client) {
      return res.status(400).json({ message: 'Could not resolve provider/client for this booking' });
    }
    if (req.user.accountType === 'PROVIDER' && !isProviderGuestChain) {
      const target = await User.findById(client);
      if (!target || !target.providerId?.equals(req.user._id)) {
        return res.status(403).json({ message: 'Invalid client for this provider' });
      }
    }

    // Hand off to the shared chain-booking service. It validates, fits,
    // creates atomically, and rolls back on partial failure. We just
    // surface its typed errors as appropriate HTTP responses.
    //
    // Read the provider's same-address-turnover preference once and
    // pass it to the chain creator — this controls whether sibling
    // sessions are flush (false) or have a 15-min cleanup gap (true).
    const providerForBuffer = await User.findById(provider)
      .select('providerProfile.sameAddressTurnoverBuffer').lean();
    const chainForceBuffer = providerForBuffer?.providerProfile?.sameAddressTurnoverBuffer !== false;
    const created = await createChainBookings({
      provider,
      client,
      bookedBy: { name: req.user.profile?.fullName || req.user.email, userId: req.user._id },
      date: first.date,
      startTime: first.time,
      location: first.location,
      sessions: bookingRequests.map(r => ({
        duration: r.duration,
        serviceType: r.serviceType,
        addons: r.addons,
        pricing: r.pricing,
        paymentMethod: r.paymentMethod,
        packagePurchaseId: r.packagePurchaseId,
        packageMinutesApplied: r.packageMinutesApplied,
        recipientType: r.recipientType,
        recipientInfo: r.recipientInfo,
      })),
      status: 'confirmed',
      // Per-provider preference (User.providerProfile.sameAddressTurnoverBuffer).
      // True → chain siblings + adjacent same-address bookings get the
      // 15-min cleanup buffer. False → flush (sheet-sharing couples,
      // in-and-out modalities, etc).
      forceBuffer: chainForceBuffer,
    });

    res.status(201).json(created);
  } catch (error) {
    if (error && error.code === 'CHAIN_DOES_NOT_FIT') {
      return res.status(400).json({
        message: error.message,
        chainDurationMin: error.chainDurationMin,
        alternatives: error.alternatives,
      });
    }
    if (error && error.code === 'CHAIN_VALIDATION') {
      return res.status(400).json({ message: error.message });
    }
    console.error('Bulk booking error:', error);
    res.status(500).json({ message: 'Bulk booking failed', error: error.message });
  }
});


router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    if (req.query.stats === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const appointments = await Booking.find({
        provider: req.user._id,
        date: {
          $gte: today,
          $lt: tomorrow
        },
        status: { $ne: 'cancelled' }
      });

      const now = new Date();
      const stats = {
        total: appointments.length,
        completed: appointments.filter(appt => {
          const endTime = new Date(appt.date);
          const [hours, minutes] = appt.endTime.split(':');
          endTime.setHours(parseInt(hours), parseInt(minutes));
          return endTime < now;
        }).length
      };
      stats.upcoming = stats.total - stats.completed;

      return res.json(stats);
    }

    // Check if a specific date filter is provided
    let dateFilter = {};
    if (req.query.date) {
      const requestedDate = new Date(req.query.date);
      requestedDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(requestedDate);
      nextDay.setDate(nextDay.getDate() + 1);
      
      dateFilter = {
        date: {
          $gte: requestedDate,
          $lt: nextDay
        }
      };
      
      console.log('Date filter applied:', req.query.date);
      console.log('Date range:', requestedDate, 'to', nextDay);
    }

    // Existing booking list logic with clientId filter support
    let bookings;
    
    if (req.user.accountType === 'PROVIDER') {
      // If clientId is provided, filter bookings for that specific client
      if (req.query.clientId) {
        // Verify that the client belongs to this provider
        const client = await User.findOne({
          _id: req.query.clientId,
          providerId: req.user._id
        });
        
        if (!client) {
          return res.status(403).json({ message: 'Client not found or not associated with this provider' });
        }
        
        bookings = await Booking.find({
          provider: req.user._id,
          client: req.query.clientId
        })
        .populate('client', 'email profile.fullName clientProfile')
        .sort({ date: 1, startTime: 1 });
      } else {
        // Apply date filter if provided, otherwise get all bookings
        if (req.query.date) {
          // Get bookings for specific date only
          bookings = await Booking.find({
            provider: req.user._id,
            ...dateFilter
          })
          .populate('client', 'email profile.fullName clientProfile.pricingTierId')
          .sort({ startTime: 1 });
          
          console.log('Fetching bookings for specific date:', req.query.date);
          console.log('Found bookings:', bookings.length);
        } else {
          // Get all bookings for this provider's clients (past and future)
          const futureDate = new Date();
          futureDate.setFullYear(futureDate.getFullYear() + 1); // Include bookings up to 1 year in future
          
          console.log('Fetching all bookings for provider:', req.user._id);
          console.log('Date range: from', new Date(0), 'to', futureDate);
          
          bookings = await Booking.findForProvider(req.user._id, new Date(0), futureDate)
            .populate('client', 'email profile.fullName clientProfile.pricingTierId')
            .exec();
            
          console.log('Found bookings:', bookings.length);
          if (bookings.length > 0) {
            console.log('First booking:', JSON.stringify(bookings[0], null, 2));
          }
        }
      }
    } else if (req.user.accountType === 'CLIENT') {
      // Get only client's own bookings with date filter if provided
      const clientQuery = { 
        client: req.user._id,
        ...dateFilter
      };
      bookings = await Booking.find(clientQuery)
        .populate('provider', 'providerProfile.businessName');
    } else {
      return res.status(403).json({ message: 'Invalid account type' });
    }

    res.json(bookings);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ message: 'Error fetching bookings' });
  }
});

// GET /revenue (Provider income summary) — must be before /:id
//
// Cash-basis income, the way a sole-prop massage therapist files
// Schedule C. Includes:
//   - Booking payments collected (cash/check/app/card portions paid)
//   - Tips collected on bookings
//   - Package sales recognized at purchase time
//   - Refunds as negative income on the day of refund
// Explicitly EXCLUDES:
//   - Package redemptions (no new money; cash was counted at purchase)
//   - Future bookings that haven't happened OR haven't been paid yet
//
// Per-method breakdown: cash / check / paymentApp / card / packages.
// Card line shows GROSS (the basis for income tax); fees surface
// separately so the provider can categorize as a deductible expense.
//
// Side stats: services delivered + how many were package redemptions
// (so the provider knows "I worked N sessions, M of which generated
// no new income because they were prepaid").
// GET /recent-activity — Dashboard activity feed.
//
// Surfaces booking-life-cycle events (new bookings, cancellations) in
// the last N days for the logged-in provider. Each event carries:
//   - type:      'created' | 'cancelled'
//   - eventAt:   the date the event happened
//   - bookingId, clientName, localDate (the appointment's own date)
//
// Also returns `newSinceLastVisit` — the count of events newer than
// the provider's lastDashboardVisitAt. Drives the "X new" badge so
// the provider sees at a glance whether anything's happened since
// they last checked.
//
// Returning events instead of a separate notifications collection
// keeps this stateless — no risk of "marked read" state drift, and
// it works retroactively for every booking that's ever been created.
router.get('/recent-activity', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Only providers can view activity' });
    }
    const days = Math.min(parseInt(req.query.days, 10) || 7, 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const bookings = await Booking.find({
      provider: req.user._id,
      $or: [
        { createdAt: { $gte: since } },
        { cancelledAt: { $gte: since } },
      ],
    })
      .populate('client', 'profile.fullName email')
      .sort({ createdAt: -1 })
      .lean();

    const events = [];
    for (const b of bookings) {
      const clientName = b.recipientType === 'other' && b.recipientInfo?.name
        ? b.recipientInfo.name
        : (b.client?.profile?.fullName || b.client?.email || 'Client');

      if (b.createdAt && b.createdAt >= since) {
        events.push({
          type: 'created',
          eventAt: b.createdAt,
          bookingId: b._id,
          clientName,
          localDate: b.localDate,
          startTime: b.startTime,
          duration: b.duration,
        });
      }
      if (b.cancelledAt && b.cancelledAt >= since) {
        events.push({
          type: 'cancelled',
          eventAt: b.cancelledAt,
          bookingId: b._id,
          clientName,
          localDate: b.localDate,
          startTime: b.startTime,
          duration: b.duration,
          cancelledBy: b.cancelledBy,
        });
      }
    }

    events.sort((a, b) => new Date(b.eventAt) - new Date(a.eventAt));

    const lastVisit = req.user.providerProfile?.lastDashboardVisitAt;
    const newSinceLastVisit = lastVisit
      ? events.filter(e => new Date(e.eventAt) > new Date(lastVisit)).length
      : events.length;

    res.json({ events, newSinceLastVisit, lastDashboardVisitAt: lastVisit });
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    res.status(500).json({ message: 'Error fetching activity' });
  }
});

// POST /mark-dashboard-visited — Stamp the "last visited" timestamp
// so the next activity-feed query knows what counts as "new."
router.post('/mark-dashboard-visited', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Only providers' });
    }
    await User.updateOne(
      { _id: req.user._id },
      { $set: { 'providerProfile.lastDashboardVisitAt': new Date() } }
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error marking dashboard visited:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/revenue', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Only providers can view revenue' });
    }

    // Provider's TZ defines week / month / quarter / year boundaries —
    // a NY provider's "this week" starts on NY time, not server-host LA.
    const { tzForProviderId } = require('../utils/providerTz');
    const providerTz = await tzForProviderId(req.user._id);
    const now = DateTime.now().setZone(providerTz);
    const startOfWeek = now.startOf('week').toJSDate();
    const startOfMonth = now.startOf('month').toJSDate();
    const startOfQuarter = now.startOf('quarter').toJSDate();
    const startOfYear = now.startOf('year').toJSDate();

    const [bookings, packagePurchases] = await Promise.all([
      Booking.find({
        provider: req.user._id,
        status: { $in: ['confirmed', 'completed', 'in-progress'] },
      }).lean(),
      PackagePurchase.find({
        provider: req.user._id,
        paymentStatus: 'paid',
      }).lean(),
    ]);

    const pkgById = new Map(packagePurchases.map(p => [String(p._id), p]));

    // Cents-internal so totals are exact across hundreds of rows.
    const blank = () => ({
      incomeTotalCents: 0,
      bookingPaymentsCents: 0,
      tipsCents: 0,
      packageSalesCents: 0,
      refundsCents: 0,        // negative income — already subtracted from incomeTotal
      stripeFeesCents: 0,     // deductible expense, NOT in incomeTotal
      // Per-method: maps to the actual income source. 'package' here
      // means PACKAGE SALES (which are income); package REDEMPTIONS
      // never hit this map (they're commitment fulfillment, not income).
      byMethodCents: { cash: 0, check: 0, paymentApp: 0, card: 0, package: 0 },
      sessionsDelivered: 0,
      sessionsRedeemedFromPackage: 0,
      outstandingCents: 0,
    });
    const buckets = {
      week: blank(),
      month: blank(),
      quarter: blank(),
      year: blank(),
      all: blank(),
    };

    const addToBuckets = (date, mutator) => {
      const d = new Date(date);
      mutator(buckets.all);
      if (d >= startOfYear) mutator(buckets.year);
      if (d >= startOfQuarter) mutator(buckets.quarter);
      if (d >= startOfMonth) mutator(buckets.month);
      if (d >= startOfWeek) mutator(buckets.week);
    };

    const nowMs = now.toMillis();
    let paidCount = 0;
    let unpaidCount = 0;

    // BOOKINGS
    for (const b of bookings) {
      const pkgId = b.packageRedemption?.packagePurchase
        ? String(b.packageRedemption.packagePurchase)
        : null;
      const pkg = pkgId ? pkgById.get(pkgId) : null;
      const split = computeBookingPaymentBreakdown(b, pkg);

      let isDelivered = false;
      if (b.localDate && b.endTime) {
        const bookingTz = b.timezone || providerTz;
        const endsAt = DateTime.fromFormat(
          `${b.localDate} ${b.endTime}`,
          'yyyy-MM-dd HH:mm',
          { zone: bookingTz }
        );
        if (endsAt.isValid) isDelivered = endsAt.toMillis() <= nowMs;
      }

      // Session count + redemption count (delivered work, regardless
      // of who paid). Provider sees "you did N sessions this month,
      // M of which were package redemptions = no new income."
      if (isDelivered) {
        addToBuckets(b.date, (bk) => {
          bk.sessionsDelivered += 1;
          if (split.minutesFromPackage > 0) {
            bk.sessionsRedeemedFromPackage += 1;
          }
        });
      }

      // Income (cash-basis): only the non-package portion of a booking
      // counts, and only when collected. The package side was income at
      // package-purchase time — counting it again here would double.
      if (b.paymentStatus === 'paid' && split.fromOtherCents > 0) {
        const collectedDate = b.paidAt || b.date;
        const method = b.paymentMethod;
        addToBuckets(collectedDate, (bk) => {
          bk.incomeTotalCents += split.fromOtherCents;
          bk.bookingPaymentsCents += split.fromOtherCents;
          if (bk.byMethodCents[method] !== undefined) {
            bk.byMethodCents[method] += split.fromOtherCents;
          }
        });
      }

      // Tips — separate income line. Default attribution is the same
      // method as the base session (most common case). The exception:
      // `tippedInCash` flag for card/check/app service paid + tip
      // handed over as cash. Routes the tip into the cash bucket so
      // end-of-week reconciliation matches what's physically in the
      // provider's wallet.
      const tipCents = Math.round((b.tipAmount || 0) * 100);
      if (tipCents > 0 && b.paymentStatus === 'paid') {
        const collectedDate = b.paidAt || b.date;
        const tipMethod = b.tippedInCash ? 'cash' : b.paymentMethod;
        addToBuckets(collectedDate, (bk) => {
          bk.incomeTotalCents += tipCents;
          bk.tipsCents += tipCents;
          if (bk.byMethodCents[tipMethod] !== undefined) {
            bk.byMethodCents[tipMethod] += tipCents;
          }
        });
      }

      // Refunds — negative income on the day of refund.
      const refundCents = Math.round((b.refundedAmount || 0) * 100);
      if (refundCents > 0 && b.refundedAt) {
        addToBuckets(b.refundedAt, (bk) => {
          bk.incomeTotalCents -= refundCents;
          bk.refundsCents += refundCents;
        });
      }

      // Stripe fees — deductible expense (tax write-off), not income.
      // Track separately so the CSV / report can surface the gross-vs-
      // net distinction.
      const feeCents = Math.round((b.stripeFeeAmount || 0) * 100);
      if (feeCents > 0) {
        const feeDate = b.paidAt || b.date;
        addToBuckets(feeDate, (bk) => {
          bk.stripeFeesCents += feeCents;
        });
      }

      // Outstanding (still owed) — delivered work whose cash side
      // hasn't been collected.
      if (isDelivered && b.paymentStatus !== 'paid' && split.fromOtherCents > 0) {
        addToBuckets(b.date, (bk) => {
          bk.outstandingCents += split.fromOtherCents;
        });
      }

      if (b.paymentStatus === 'paid') paidCount++;
      else unpaidCount++;
    }

    // PACKAGE SALES — recognized at purchase time. Per-method:
    // stripe → 'card', cash → 'cash', comped → don't count.
    let packageSalesCount = 0;
    for (const p of packagePurchases) {
      if (!p.purchasedAt) continue;
      if (p.paymentMethod === 'comped') continue;
      const cents = Math.round((p.price || 0) * 100);
      const method = p.paymentMethod === 'stripe' ? 'card' : 'cash';
      addToBuckets(p.purchasedAt, (bk) => {
        bk.incomeTotalCents += cents;
        bk.packageSalesCents += cents;
        bk.byMethodCents[method] += cents;
      });
      packageSalesCount++;

      // Package refunds — negative income on the refund day.
      const refundCents = Math.round((p.refundedAmount || 0) * 100);
      if (refundCents > 0 && p.refundedAt) {
        addToBuckets(p.refundedAt, (bk) => {
          bk.incomeTotalCents -= refundCents;
          bk.refundsCents += refundCents;
        });
      }

      // Package Stripe fees — same expense bucket as booking fees.
      const feeCents = Math.round((p.stripeFeeAmount || 0) * 100);
      if (feeCents > 0) {
        addToBuckets(p.purchasedAt, (bk) => {
          bk.stripeFeesCents += feeCents;
        });
      }
    }

    const formatBucket = (b) => ({
      income: {
        total: b.incomeTotalCents / 100,
        bookingPayments: b.bookingPaymentsCents / 100,
        tips: b.tipsCents / 100,
        packageSales: b.packageSalesCents / 100,
        refunds: b.refundsCents / 100,
        outstanding: b.outstandingCents / 100,
        byMethod: {
          cash: b.byMethodCents.cash / 100,
          check: b.byMethodCents.check / 100,
          paymentApp: b.byMethodCents.paymentApp / 100,
          card: b.byMethodCents.card / 100,
          package: b.byMethodCents.package / 100,
        },
      },
      sessions: {
        delivered: b.sessionsDelivered,
        redeemedFromPackage: b.sessionsRedeemedFromPackage,
      },
      stripeFees: b.stripeFeesCents / 100,
    });

    res.json({
      providerTz,
      week: formatBucket(buckets.week),
      month: formatBucket(buckets.month),
      quarter: formatBucket(buckets.quarter),
      year: formatBucket(buckets.year),
      all: formatBucket(buckets.all),
      paidCount,
      unpaidCount,
      packageSalesCount,
    });
  } catch (error) {
    console.error('Error fetching revenue:', error);
    res.status(500).json({ message: 'Error fetching revenue' });
  }
});

// GET /income-transactions?startDate=&endDate=
//
// Transaction-level income report for CSV export and the Reports page
// list view. Returns every income-producing event in range:
//   - Booking payments collected (paidAt in range, non-package portion)
//   - Tips collected on bookings (paidAt in range)
//   - Package sales (purchasedAt in range)
//   - Package redemptions (NOT income, but listed for context — $0)
//   - Refunds (refundedAt in range, negative amount)
//
// Each row is a discrete event with date, type, method, who, amount.
// CPA-ready format; the client renders to CSV.
router.get('/income-transactions', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Only providers can view income reports' });
    }

    const { tzForProviderId } = require('../utils/providerTz');
    const providerTz = await tzForProviderId(req.user._id);
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'startDate and endDate are required (yyyy-MM-dd)' });
    }
    const start = DateTime.fromFormat(startDate, 'yyyy-MM-dd', { zone: providerTz });
    const end = DateTime.fromFormat(endDate, 'yyyy-MM-dd', { zone: providerTz });
    if (!start.isValid || !end.isValid) {
      return res.status(400).json({ message: 'Invalid date format' });
    }
    const startJs = start.startOf('day').toUTC().toJSDate();
    const endJs = end.endOf('day').toUTC().toJSDate();

    const [bookings, packagePurchases] = await Promise.all([
      Booking.find({
        provider: req.user._id,
        // Wider net than the date filter — a booking dated outside the
        // range can still produce a transaction inside it (e.g. cash
        // paid late, refund issued months later).
      }).populate('client', 'profile.fullName email').lean(),
      PackagePurchase.find({
        provider: req.user._id,
      }).populate('client', 'profile.fullName email').lean(),
    ]);

    const pkgById = new Map(packagePurchases.map(p => [String(p._id), p]));

    const transactions = [];
    const inRange = (d) => {
      if (!d) return false;
      const t = new Date(d).getTime();
      return t >= startJs.getTime() && t <= endJs.getTime();
    };
    const clientName = (c, fallback) =>
      c?.profile?.fullName || c?.email || fallback || 'Unknown';

    for (const b of bookings) {
      const pkg = b.packageRedemption?.packagePurchase
        ? pkgById.get(String(b.packageRedemption.packagePurchase))
        : null;
      const split = computeBookingPaymentBreakdown(b, pkg);
      const recipient = b.recipientType === 'other' && b.recipientInfo?.name
        ? b.recipientInfo.name
        : clientName(b.client);

      // Booking payment (non-package portion)
      if (b.paymentStatus === 'paid' && split.fromOtherCents > 0 && inRange(b.paidAt || b.date)) {
        transactions.push({
          date: b.paidAt || b.date,
          type: 'Service',
          method: b.paymentMethod,
          client: recipient,
          description: `${b.duration}-min ${b.serviceType?.name || 'session'}${split.minutesFromPackage > 0 ? ` (partial pkg)` : ''}`,
          amount: split.fromOtherCents / 100,
          notes: split.minutesFromPackage > 0
            ? `${split.minutesFromPackage} min from package + ${split.minutesFromOther} min via ${b.paymentMethod}`
            : '',
          stripeFee: 0,
          relatedId: b._id,
        });
      }

      // Tip — honor tippedInCash override so the CSV row shows the
      // method the cash actually arrived in.
      const tipCents = Math.round((b.tipAmount || 0) * 100);
      if (tipCents > 0 && b.paymentStatus === 'paid' && inRange(b.paidAt || b.date)) {
        const tipMethod = b.tippedInCash ? 'cash' : b.paymentMethod;
        transactions.push({
          date: b.paidAt || b.date,
          type: 'Tip',
          method: tipMethod,
          client: recipient,
          description: b.tippedInCash && b.paymentMethod !== 'cash'
            ? `Cash tip (on ${b.localDate} ${b.paymentMethod}-paid session)`
            : `Tip (on ${b.localDate} session)`,
          amount: tipCents / 100,
          notes: '',
          stripeFee: 0,
          relatedId: b._id,
        });
      }

      // Refund
      const refundCents = Math.round((b.refundedAmount || 0) * 100);
      if (refundCents > 0 && b.refundedAt && inRange(b.refundedAt)) {
        transactions.push({
          date: b.refundedAt,
          type: 'Refund',
          method: b.paymentMethod,
          client: recipient,
          description: `Refund of ${b.localDate} session`,
          amount: -refundCents / 100,
          notes: '',
          stripeFee: 0,
          relatedId: b._id,
        });
      }

      // Stripe fee — separate row so the provider's CSV can subtotal
      // fees as deductible expense.
      const feeCents = Math.round((b.stripeFeeAmount || 0) * 100);
      if (feeCents > 0 && inRange(b.paidAt || b.date)) {
        transactions.push({
          date: b.paidAt || b.date,
          type: 'Stripe fee',
          method: 'card',
          client: recipient,
          description: `Stripe processor fee (${b.localDate} session)`,
          amount: 0,
          notes: '',
          stripeFee: feeCents / 100,
          relatedId: b._id,
        });
      }

      // Package redemption — listed for context, $0 income.
      if (split.minutesFromPackage > 0 && b.localDate) {
        const sessionEnd = b.endTime
          ? DateTime.fromFormat(`${b.localDate} ${b.endTime}`, 'yyyy-MM-dd HH:mm', { zone: b.timezone || providerTz }).toUTC().toJSDate()
          : null;
        if (sessionEnd && inRange(sessionEnd) && sessionEnd <= new Date()) {
          transactions.push({
            date: sessionEnd,
            type: 'Package redemption',
            method: 'package',
            client: recipient,
            description: `${split.minutesFromPackage} min redeemed from ${split.packageName || 'package'}`,
            amount: 0,
            notes: 'Commitment fulfilled — no new income',
            stripeFee: 0,
            relatedId: b._id,
          });
        }
      }
    }

    // Package sales + refunds + fees
    for (const p of packagePurchases) {
      if (p.purchasedAt && inRange(p.purchasedAt) && p.paymentMethod !== 'comped') {
        transactions.push({
          date: p.purchasedAt,
          type: 'Package sale',
          method: p.paymentMethod === 'stripe' ? 'card' : 'cash',
          client: clientName(p.client),
          description: p.name || 'Package',
          amount: p.price || 0,
          notes: '',
          stripeFee: p.stripeFeeAmount || 0,
          relatedId: p._id,
        });
      }
      const refundCents = Math.round((p.refundedAmount || 0) * 100);
      if (refundCents > 0 && p.refundedAt && inRange(p.refundedAt)) {
        transactions.push({
          date: p.refundedAt,
          type: 'Package refund',
          method: p.paymentMethod === 'stripe' ? 'card' : 'cash',
          client: clientName(p.client),
          description: `Refund of ${p.name || 'package'}`,
          amount: -refundCents / 100,
          notes: '',
          stripeFee: 0,
          relatedId: p._id,
        });
      }
    }

    transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Summary totals
    const summary = {
      incomeTotal: 0,
      byMethod: { cash: 0, check: 0, paymentApp: 0, card: 0 },
      bookingPayments: 0,
      tips: 0,
      packageSales: 0,
      refunds: 0,
      stripeFees: 0,
      sessionsDelivered: 0,
      sessionsRedeemedFromPackage: 0,
    };
    for (const t of transactions) {
      if (t.type === 'Service' || t.type === 'Tip' || t.type === 'Package sale') {
        summary.incomeTotal += t.amount;
        if (summary.byMethod[t.method] !== undefined) {
          summary.byMethod[t.method] += t.amount;
        }
        if (t.type === 'Service') summary.bookingPayments += t.amount;
        if (t.type === 'Tip') summary.tips += t.amount;
        if (t.type === 'Package sale') summary.packageSales += t.amount;
      }
      if (t.type === 'Refund' || t.type === 'Package refund') {
        summary.incomeTotal += t.amount; // already negative
        summary.refunds += -t.amount;
      }
      if (t.type === 'Stripe fee') summary.stripeFees += t.stripeFee;
      if (t.type === 'Package redemption') summary.sessionsRedeemedFromPackage += 1;
      if (t.type === 'Service') summary.sessionsDelivered += 1;
    }

    res.json({ providerTz, range: { startDate, endDate }, transactions, summary });
  } catch (error) {
    console.error('Error fetching income transactions:', error);
    res.status(500).json({ message: 'Error fetching income transactions' });
  }
});

// GET /mileage-report (Provider mileage report with IRS deduction rules)
router.get('/mileage-report', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Only providers can view mileage reports' });
    }

    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'startDate and endDate are required (YYYY-MM-DD)' });
    }

    // Get provider's home office setting and home base location
    const provider = await User.findById(req.user._id);
    const hasHomeOffice = provider.providerProfile?.homeOffice || false;
    const homeLoc = await SavedLocation.findOne({ provider: req.user._id, isHomeBase: true });
    const homeBase = homeLoc ? { lat: homeLoc.lat, lng: homeLoc.lng, address: homeLoc.address } : null;

    // IRS standard mileage rate (2025)
    const IRS_RATE = 0.70;

    // Gaps between consecutive bookings ≥ this many minutes are
    // assumed to mean the provider went home in between (and back).
    // 2 hours is the threshold the user picked when scoping this —
    // enough to make a return trip worth it in LA traffic, short
    // enough to catch the obvious midday gaps.
    const GAP_HOME_THRESHOLD_MIN = 120;
    const minutesBetween = (endHHmm, startHHmm) => {
      const [eh, em] = endHHmm.split(':').map(Number);
      const [sh, sm] = startHHmm.split(':').map(Number);
      return (sh * 60 + sm) - (eh * 60 + em);
    };

    // Get all completed/confirmed bookings in date range
    const bookings = await Booking.find({
      provider: req.user._id,
      localDate: { $gte: startDate, $lte: endDate },
      status: { $in: ['confirmed', 'completed', 'in-progress'] },
    }).sort({ localDate: 1, startTime: 1 }).lean();

    // Group bookings by date
    const byDate = {};
    for (const b of bookings) {
      if (!byDate[b.localDate]) byDate[b.localDate] = [];
      byDate[b.localDate].push(b);
    }

    // Build daily mileage reports
    const dailyReports = [];
    let totalMiles = 0;
    let deductibleMiles = 0;

    for (const [date, dayBookings] of Object.entries(byDate)) {
      const legs = [];
      let dayTotal = 0;
      let dayDeductible = 0;

      for (let i = 0; i < dayBookings.length; i++) {
        const booking = dayBookings[i];

        // Leg: previous stop → this booking
        let fromLabel, toLabel, miles, isDeductible;

        if (i === 0) {
          // First leg: home → first client
          fromLabel = homeBase?.address || 'Home';
          toLabel = booking.location?.address || 'Client';

          if (booking.travelDistance?.miles != null) {
            miles = booking.travelDistance.miles;
          } else if (homeBase && booking.location) {
            miles = await calculateDistanceMiles(homeBase, booking.location);
          } else {
            miles = 0;
          }

          // IRS rule: home → first client is deductible ONLY if home office
          isDeductible = hasHomeOffice;
        } else {
          // Middle leg: previous client → this client.
          //
          // Before drawing the direct prev-to-current line, check the
          // gap. Long idle periods almost certainly mean the provider
          // went home and came back, so insert two synthetic round-trip
          // legs to reflect the reality of the day. Skip when home base
          // is unset (no destination), when either booking is missing
          // location (existing leg-skip pattern), or when the gap is
          // under threshold.
          const prev = dayBookings[i - 1];
          const gapMin = (prev.endTime && booking.startTime)
            ? minutesBetween(prev.endTime, booking.startTime)
            : 0;
          if (gapMin >= GAP_HOME_THRESHOLD_MIN
              && homeBase
              && prev.location?.lat != null
              && booking.location?.lat != null) {
            const goHomeMiles = await calculateDistanceMiles(prev.location, homeBase);
            const leaveHomeMiles = await calculateDistanceMiles(homeBase, booking.location);
            const isGapDeductible = hasHomeOffice;

            legs.push({
              from: prev.location?.address || 'Previous client',
              to: homeBase.address || 'Home',
              miles: goHomeMiles,
              isDeductible: isGapDeductible,
              gapTrip: true,
              gapMinutes: gapMin,
            });
            legs.push({
              from: homeBase.address || 'Home',
              to: booking.location?.address || 'Client',
              miles: leaveHomeMiles,
              isDeductible: isGapDeductible,
              gapTrip: true,
              gapMinutes: gapMin,
            });
            dayTotal += goHomeMiles + leaveHomeMiles;
            if (isGapDeductible) dayDeductible += goHomeMiles + leaveHomeMiles;
            // The "current booking" leg is now home→booking (already
            // pushed above). Skip the normal prev→current append below.
            continue;
          }

          fromLabel = prev.location?.address || 'Previous client';
          toLabel = booking.location?.address || 'Client';

          if (booking.travelDistance?.miles != null) {
            miles = booking.travelDistance.miles;
          } else if (prev.location && booking.location) {
            miles = await calculateDistanceMiles(prev.location, booking.location);
          } else {
            miles = 0;
          }

          // Client-to-client is always deductible
          isDeductible = true;
        }

        legs.push({ from: fromLabel, to: toLabel, miles, isDeductible });
        dayTotal += miles;
        if (isDeductible) dayDeductible += miles;
      }

      // Last leg: last client → home
      if (dayBookings.length > 0 && homeBase) {
        const lastBooking = dayBookings[dayBookings.length - 1];
        let returnMiles = 0;

        if (lastBooking.location && homeBase) {
          returnMiles = await calculateDistanceMiles(lastBooking.location, homeBase);
        }

        const isReturnDeductible = hasHomeOffice;
        legs.push({
          from: lastBooking.location?.address || 'Last client',
          to: homeBase.address || 'Home',
          miles: returnMiles,
          isDeductible: isReturnDeductible,
        });
        dayTotal += returnMiles;
        if (isReturnDeductible) dayDeductible += returnMiles;
      }

      dailyReports.push({
        date,
        appointments: dayBookings.length,
        legs,
        totalMiles: parseFloat(dayTotal.toFixed(2)),
        deductibleMiles: parseFloat(dayDeductible.toFixed(2)),
        deduction: parseFloat((dayDeductible * IRS_RATE).toFixed(2)),
      });

      totalMiles += dayTotal;
      deductibleMiles += dayDeductible;
    }

    res.json({
      startDate,
      endDate,
      hasHomeOffice,
      irsRate: IRS_RATE,
      summary: {
        totalDays: dailyReports.length,
        totalAppointments: bookings.length,
        totalMiles: parseFloat(totalMiles.toFixed(2)),
        deductibleMiles: parseFloat(deductibleMiles.toFixed(2)),
        nonDeductibleMiles: parseFloat((totalMiles - deductibleMiles).toFixed(2)),
        estimatedDeduction: parseFloat((deductibleMiles * IRS_RATE).toFixed(2)),
      },
      days: dailyReports,
    });
  } catch (error) {
    console.error('Error generating mileage report:', error);
    res.status(500).json({ message: 'Error generating mileage report' });
  }
});

// GET /:id (Get a single booking by ID)
router.get('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('client', 'email profile.fullName profile.phoneNumber')
      .populate('provider', 'email profile.fullName profile.phoneNumber providerProfile.businessName');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Authorization: only the provider or client on this booking can view it
    const isProvider = req.user.accountType === 'PROVIDER' && booking.provider._id.equals(req.user._id);
    const isClient = req.user.accountType === 'CLIENT' && booking.client._id.equals(req.user._id);

    if (!isProvider && !isClient) {
      return res.status(403).json({ message: 'Not authorized to view this booking' });
    }

    // Resolve the package (if any) so the response can carry the
    // payment breakdown — the AppointmentDetail page surfaces this so
    // the provider sees exactly how much came from the package vs cash.
    let pkg = null;
    if (booking.packageRedemption?.packagePurchase) {
      pkg = await PackagePurchase
        .findById(booking.packageRedemption.packagePurchase)
        .lean();
    }
    const breakdown = computeBookingPaymentBreakdown(booking.toObject(), pkg);

    res.json({
      ...booking.toObject(),
      paymentBreakdown: breakdown,
    });
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ message: 'Error fetching booking' });
  }
});

// DELETE /:id (Cancel a booking — soft delete, sets status to 'cancelled' and sends SMS)
router.delete('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ message: 'Booking is already cancelled' });
    }

    // Check authorization
    if (req.user.accountType === 'PROVIDER' && !booking.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized to cancel this booking' });
    }

    if (req.user.accountType === 'CLIENT' && !booking.client.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized to cancel this booking' });
    }

    // Enforce cancellation policy (clients only — providers can always cancel)
    if (req.user.accountType === 'CLIENT') {
      const provider = await User.findById(booking.provider);
      const policy = provider?.providerProfile?.cancellationPolicy;

      if (policy?.enabled && policy.windowHours > 0) {
        // Use the booking's stored TZ (where the appointment is
        // happening) for the "hours until" check. A NY booking
        // viewed by a client in LA still counts down against the
        // appointment's local clock, not the client's.
        const bookingTz = booking.timezone || 'America/Los_Angeles';
        const bookingStartLA = DateTime.fromFormat(
          `${booking.localDate} ${booking.startTime}`,
          'yyyy-MM-dd HH:mm',
          { zone: bookingTz }
        );
        const hoursUntil = bookingStartLA.diff(DateTime.now(), 'hours').hours;

        if (hoursUntil < policy.windowHours) {
          const force = req.body?.force === true;

          if (!force) {
            return res.status(400).json({
              message: 'Late cancellation',
              lateCancellation: true,
              windowHours: policy.windowHours,
              hoursUntilAppointment: Math.max(0, Math.round(hoursUntil)),
              fee: policy.lateCancelFee || 0,
              feeMessage: policy.lateCancelFee > 0
                ? `Cancelling within ${policy.windowHours} hours of your appointment incurs a $${policy.lateCancelFee} fee.`
                : `Cancellations within ${policy.windowHours} hours of your appointment are discouraged. Please confirm to proceed.`,
            });
          }

          // Client confirmed — proceed but flag as late cancellation
          booking.lateCancellation = true;
          booking.lateCancelFee = policy.lateCancelFee || 0;
        }
      }
    }

    // Soft delete: mark as cancelled instead of deleting
    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    booking.cancelledBy = req.user.accountType;
    await booking.save();
    console.log('✅ Booking cancelled (soft delete):', booking._id);

    // Package credit handling: if this booking was paid via a package,
    // return the credit on in-window cancellations and on provider-side
    // cancellations (regardless of window). Late client-side cancellations
    // consume the credit, but the provider can manually reinstate it from
    // the client's package detail view (see Phase 6 endpoint).
    if (booking.packageRedemption?.packagePurchase) {
      const cancelledByProvider = req.user.accountType === 'PROVIDER';
      const isLateClientCancel = !cancelledByProvider && booking.lateCancellation;

      if (!isLateClientCancel) {
        try {
          await markRedemptionReturned({
            packageId: booking.packageRedemption.packagePurchase,
            bookingId: booking._id,
          });
          console.log(`✅ Returned package credit to ${booking.packageRedemption.packagePurchase}`);
        } catch (creditErr) {
          console.error('Failed to return package credit on cancel:', creditErr.message);
        }
      } else {
        console.log('Late client cancellation — package credit consumed (not returned).');
      }
    }

    // Send cancellation SMS notifications
    try {
      const provider = await User.findById(booking.provider);
      const client = await User.findById(booking.client);
      const cancelledByType = req.user.accountType;

      // Determine recipient details
      let recipientPhone, recipientName;
      if (booking.recipientType === 'self') {
        recipientPhone = client.profile?.phoneNumber || null;
        recipientName = client.profile?.fullName || client.email || 'Client';
      } else {
        recipientPhone = booking.recipientInfo?.phone || null;
        recipientName = booking.recipientInfo?.name || 'Guest';
      }

      const providerName = provider.profile?.fullName || provider.email;
      const providerPhone = provider.profile?.phoneNumber || null;
      const dateStr = booking.localDate;
      const timeStr = booking.startTime;

      if (cancelledByType === 'CLIENT') {
        if (providerPhone) {
          const providerMsg = `Cancelled: ${recipientName}'s appointment on ${dateStr} at ${timeStr} has been cancelled by the client.`;
          await smsService.sendSms(formatPhoneNumber(providerPhone), providerMsg);
          console.log('✅ Cancellation SMS sent to provider');
        }
      } else if (recipientPhone) {
        const clientMsg = `Hi ${recipientName}, your massage with ${providerName} on ${dateStr} at ${timeStr} has been cancelled. Please rebook at your convenience.`;
        await smsService.sendSms(formatPhoneNumber(recipientPhone), clientMsg);
        console.log('✅ Cancellation SMS sent to client');
      }
    } catch (smsError) {
      console.error('❌ Error sending cancellation SMS:', smsError);
    }

    // Send cancellation email (non-blocking)
    try {
      const provider = await User.findById(booking.provider);
      const client = await User.findById(booking.client);
      const clientName = booking.recipientType === 'other'
        ? booking.recipientInfo?.name || 'Guest'
        : (client.profile?.fullName || client.email);

      if (req.user.accountType === 'CLIENT' && provider.email) {
        sendBookingCancellationEmail(provider.email, booking, provider, clientName, 'CLIENT');
      } else if (client.email) {
        sendBookingCancellationEmail(client.email, booking, provider, clientName, 'PROVIDER');
      }
    } catch (emailError) {
      console.error('❌ Error sending cancellation email:', emailError);
    }

    // Chain coupling: if this booking is part of a back-to-back chain
    // (groupId is set — couple's massage / multi-recipient), always
    // cascade-cancel its same-time siblings. Half-cancelling a couple's
    // massage is virtually never what the user wants. This applies
    // regardless of scope (one/following/all) — the chain is an atomic
    // unit at the occurrence level.
    let chainSiblingsCancelled = 0;
    if (booking.groupId) {
      try {
        const chainSiblings = await Booking.find({
          groupId: booking.groupId,
          _id: { $ne: booking._id },
          status: { $nin: ['cancelled', 'completed'] },
        });
        for (const sib of chainSiblings) {
          sib.status = 'cancelled';
          sib.cancelledAt = new Date();
          sib.cancelledBy = req.user.accountType;
          await sib.save();
          if (sib.packageRedemption?.packagePurchase) {
            await markRedemptionReturned({
              packageId: sib.packageRedemption.packagePurchase,
              bookingId: sib._id,
            });
          }
          chainSiblingsCancelled += 1;
        }
      } catch (chainErr) {
        console.error('Chain-sibling cancel failed:', chainErr.message);
      }
    }

    // Series scope expansion. If this booking belongs to a recurring
    // series and the caller asked to cancel siblings too, fan out:
    //   - scope=one (default)      → just this booking, already done
    //   - scope=following          → this + every later un-cancelled occurrence
    //   - scope=all                → also cancel the series itself + every
    //                                un-cancelled occurrence (past not touched)
    // Sibling cancellations are silent (no SMS/email per occurrence) so the
    // user isn't spammed; the parent cancel's notification covers the action.
    // Series-scope expansion. Cancelling a series outright (scope='all' or
    // 'following') is a policy-level action — it ends the standing
    // arrangement, not 12 separate appointments. So instead of soft-
    // cancelling every future occurrence (12 dead rows in the DB,
    // cluttering UIs forever), we **hard-delete** them. The series doc
    // itself keeps status='cancelled' + cancelledAt/By as the audit trail
    // ("standing arrangement ended on X by Y"). The triggering booking
    // (this one) stays soft-cancelled — it carries the moment the
    // decision was made.
    //
    // What we keep:
    //   - Past occurrences (localDate ≤ today) — those are real history.
    //   - Future occurrences already individually cancelled before this
    //     point — those represent specific client decisions, not cascade.
    //
    // What we delete (only via this scope expansion):
    //   - Future, non-cancelled, non-completed occurrences in the series.
    let siblingsDeleted = 0;
    let seriesCancelled = false;
    const scope = req.query.scope;
    if (booking.series && (scope === 'following' || scope === 'all')) {
      try {
        const RecurringSeries = require('../models/RecurringSeries');
        const series = await RecurringSeries.findById(booking.series);

        if (series) {
          // "Today" in the series' TZ — a NY provider's series ending
          // "today" means NY today, not LA today.
          const seriesTz = series.timezone || booking.timezone || 'America/Los_Angeles';
          const todayStr = DateTime.now().setZone(seriesTz).toFormat('yyyy-MM-dd');
          const siblingFilter = {
            series: series._id,
            _id: { $ne: booking._id },
            status: { $nin: ['cancelled', 'completed'] },
            localDate: { $gt: todayStr }, // future-dated only
          };
          if (scope === 'following') {
            // "From this date forward" — sibling must be strictly after
            // the triggering booking's localDate (parent covers itself).
            siblingFilter.localDate = {
              $gt: booking.localDate > todayStr ? booking.localDate : todayStr,
            };
          }

          const siblings = await Booking.find(siblingFilter);
          for (const sib of siblings) {
            // Pull (not just mark-returned) any package redemption rows
            // referencing this booking — there'll be no booking left for
            // the redemption to point at.
            if (sib.packageRedemption?.packagePurchase) {
              await returnReservedCredit({
                packageId: sib.packageRedemption.packagePurchase,
                bookingId: sib._id,
              });
            }
            await Booking.deleteOne({ _id: sib._id });
            siblingsDeleted += 1;
          }

          if (scope === 'all' && series.status !== 'cancelled') {
            series.status = 'cancelled';
            series.cancelledAt = new Date();
            series.cancelledBy = req.user.accountType;
            await series.save();
            seriesCancelled = true;
          }
        }
      } catch (scopeErr) {
        console.error('Series-scope cancel failed:', scopeErr.message);
      }
    }
    const siblingsCancelled = siblingsDeleted; // back-compat field name

    audit({
      action: 'delete', resource: 'booking', resourceId: booking._id,
      details: {
        cancelledBy: req.user.accountType,
        clientId: booking.client,
        siblingsCancelled, seriesCancelled, chainSiblingsCancelled,
      }, req,
    });

    res.json({
      message: 'Booking cancelled successfully',
      siblingsCancelled,
      seriesCancelled,
      chainSiblingsCancelled,
    });
  } catch (error) {
    console.error('❌ Error cancelling booking:', error);
    res.status(500).json({ message: `Server error while cancelling booking: ${error.message}` });
  }
});

// PATCH /:id/payment-status (Mark booking as paid/unpaid)
router.patch('/:id/payment-status', ensureAuthenticated, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Only the provider on this booking can update payment status
    if (req.user.accountType !== 'PROVIDER' || !booking.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'Only the provider can update payment status' });
    }

    const { paymentStatus } = req.body;
    if (!['paid', 'unpaid'].includes(paymentStatus)) {
      return res.status(400).json({ message: 'Invalid payment status' });
    }

    const previousStatus = booking.paymentStatus;
    booking.paymentStatus = paymentStatus;
    booking.paidAt = paymentStatus === 'paid' ? new Date() : null;
    await booking.save();

    if (previousStatus !== paymentStatus) {
      audit({
        action: 'update', resource: 'booking_payment_status',
        resourceId: booking._id,
        details: { from: previousStatus, to: paymentStatus, clientId: booking.client },
        req,
      });
    }

    res.json(booking);
  } catch (error) {
    console.error('Error updating payment status:', error);
    res.status(500).json({ message: 'Error updating payment status' });
  }
});

// PATCH /:id/tip — Set or update the tip amount on a booking.
// Provider-only. Tips are tracked separately from the base session
// price for income reporting (tips trend matters for some providers'
// pricing decisions). Cash-basis income on the booking's paidAt date.
router.patch('/:id/tip', ensureAuthenticated, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (req.user.accountType !== 'PROVIDER' || !booking.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'Only the provider can update tips' });
    }
    const { tipAmount, tippedInCash } = req.body;
    const amount = Number(tipAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ message: 'tipAmount must be a non-negative number' });
    }
    booking.tipAmount = Math.round(amount * 100) / 100;
    // tippedInCash only matters when the service was paid via a
    // non-cash method. Force false otherwise so the flag doesn't
    // accumulate noise.
    booking.tippedInCash = booking.paymentMethod !== 'cash' && !!tippedInCash;
    await booking.save();
    res.json(booking);
  } catch (error) {
    console.error('Error updating tip:', error);
    res.status(500).json({ message: 'Error updating tip' });
  }
});

// PATCH /:id/price — Adjust the actual charged amount on a booking.
// Provider-only. Used when what the client paid differs from the
// listed price for any reason. Stores the new amount + a free-form
// reason; original pricing.totalPrice stays untouched so we can
// always surface the delta in the UI and audit log.
//
// Guardrail: for partial-package-redeemed bookings the adjusted total
// must be at least the package-recognized portion (per-minute rate of
// the original purchase × minutes applied). Charging below that would
// mean the client paid less than the prepaid package value — that's
// a refund, not a price adjustment.
router.patch('/:id/price', ensureAuthenticated, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (req.user.accountType !== 'PROVIDER' || !booking.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'Only the provider can adjust price' });
    }

    const { actualChargedAmount, priceAdjustmentReason } = req.body;

    // null/undefined or empty string clears the override.
    if (actualChargedAmount === null || actualChargedAmount === undefined || actualChargedAmount === '') {
      const previousAmount = booking.actualChargedAmount;
      booking.actualChargedAmount = null;
      booking.priceAdjustmentReason = '';
      await booking.save();
      audit({
        userId: booking.client,
        action: 'update', resource: 'booking_price_adjustment',
        resourceId: booking._id,
        details: { from: previousAmount, to: null, cleared: true },
        req,
      });
      return res.json(booking);
    }

    const amount = Number(actualChargedAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ message: 'actualChargedAmount must be a non-negative number' });
    }

    // Guardrail: protect against undercutting a redeemed package's
    // already-recognized revenue. The package's per-minute rate was
    // fixed at purchase; charging below the redeemed portion's value
    // is functionally a refund.
    if (booking.packageRedemption?.minutesApplied && booking.packageRedemption.packagePurchase) {
      const pkg = await PackagePurchase.findById(booking.packageRedemption.packagePurchase).lean();
      if (pkg) {
        const split = computeBookingPaymentBreakdown(booking.toObject(), pkg);
        const packageDollars = split.fromPackageCents / 100;
        if (amount < packageDollars) {
          return res.status(400).json({
            message: `Adjusted amount ($${amount.toFixed(2)}) is less than the package portion already redeemed ($${packageDollars.toFixed(2)}). Use Refund instead if you need to return value to the client.`,
          });
        }
      }
    }

    const previousAmount = booking.actualChargedAmount;
    booking.actualChargedAmount = Math.round(amount * 100) / 100;
    booking.priceAdjustmentReason = (priceAdjustmentReason || '').toString().trim().slice(0, 500);
    await booking.save();

    audit({
      userId: booking.client,
      action: 'update', resource: 'booking_price_adjustment',
      resourceId: booking._id,
      details: {
        from: previousAmount,
        to: booking.actualChargedAmount,
        listedPrice: booking.pricing?.totalPrice,
        reason: booking.priceAdjustmentReason,
      },
      req,
    });
    res.json(booking);
  } catch (error) {
    console.error('Error adjusting price:', error);
    res.status(500).json({ message: 'Error adjusting price' });
  }
});

// POST /:id/refund — Record a refund on a booking.
// Provider-only. Records the amount + timestamp; doesn't move money on
// Stripe (that's a separate manual action in the Stripe dashboard for
// card refunds; cash/check refunds are out-of-band). The income report
// counts this as negative income on the day refunded.
router.post('/:id/refund', ensureAuthenticated, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (req.user.accountType !== 'PROVIDER' || !booking.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'Only the provider can issue refunds' });
    }
    const { refundedAmount } = req.body;
    const amount = Number(refundedAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'refundedAmount must be a positive number' });
    }
    booking.refundedAmount = Math.round(amount * 100) / 100;
    booking.refundedAt = new Date();
    await booking.save();
    audit({
      userId: booking.client,
      action: 'update', resource: 'booking_refund',
      resourceId: booking._id,
      details: { amount: booking.refundedAmount },
      req,
    });
    res.json(booking);
  } catch (error) {
    console.error('Error recording refund:', error);
    res.status(500).json({ message: 'Error recording refund' });
  }
});

// PATCH /:id/payment-method
//
// Provider-only. Switches an existing booking's payment method to a
// different one — most commonly when a client paid (or intended to
// pay) with their package balance but the booking was recorded as
// cash/zelle/card. The package balance must stay consistent with
// what the booking claims, so this endpoint handles the swap atomically:
//
//   - Switching FROM a package: marks the existing redemption as
//     returned (preserves history; frees the capacity).
//   - Switching TO a package: reserves a fresh credit (atomic check
//     against current balance). Optional `packageMinutesApplied` for
//     partial redemption — defaults to the full booking duration.
//   - Switching package → different package: returns the old
//     redemption AFTER the new reservation succeeds. If the new
//     reservation fails, the old stays in place.
//
// Body: { paymentMethod, packagePurchaseId?, packageMinutesApplied? }
router.patch('/:id/payment-method', ensureAuthenticated, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    if (req.user.accountType !== 'PROVIDER' || !booking.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'Only the provider can change payment method' });
    }

    const { paymentMethod, packagePurchaseId, packageMinutesApplied } = req.body;
    if (!['cash', 'check', 'paymentApp', 'card', 'package'].includes(paymentMethod)) {
      return res.status(400).json({ message: 'Invalid payment method' });
    }

    const usingPackage = paymentMethod === 'package' || !!packagePurchaseId;
    const minutesToApply = packageMinutesApplied != null
      ? Number(packageMinutesApplied)
      : booking.duration;

    // Sanity-check partial vs full when usingPackage
    if (usingPackage) {
      if (!packagePurchaseId) {
        return res.status(400).json({ message: 'packagePurchaseId required when paying via package' });
      }
      if (!Number.isFinite(minutesToApply) || minutesToApply <= 0 || minutesToApply > booking.duration) {
        return res.status(400).json({ message: 'packageMinutesApplied must be > 0 and ≤ booking duration' });
      }
    }

    const oldRedemption = booking.packageRedemption?.packagePurchase;
    const oldRedemptionId = oldRedemption ? String(oldRedemption) : null;
    let newRedemptionDoc = null;

    if (usingPackage) {
      // Reserve the new credit FIRST. If it fails (capacity, ownership,
      // duration mismatch on a sessions-mode pkg, etc.) we bail before
      // touching the old one — booking's payment state stays intact.
      newRedemptionDoc = await reservePackageCredit({
        packageId: packagePurchaseId,
        clientId: booking.client,
        providerId: booking.provider,
        duration: booking.duration,
        bookingId: booking._id,
        minutesToApply,
      });
      if (!newRedemptionDoc) {
        return res.status(409).json({
          message: 'Could not reserve a credit on the selected package — it may not have enough remaining balance, or it belongs to a different client / provider.',
        });
      }
    }

    // If the booking was previously package-paid AND we're either
    // switching off-package OR switching to a different package,
    // mark the old redemption as returned. Same-package re-reservation
    // would double-count, so skip it in that case.
    if (oldRedemptionId && oldRedemptionId !== String(packagePurchaseId || '')) {
      await markRedemptionReturned({
        packageId: oldRedemptionId,
        bookingId: booking._id,
      });
    }

    // Apply the payment fields. Package fully covering the duration =
    // 'paid' immediately (the credit was prepaid at purchase). Partial
    // package + cash/zelle for remainder = 'unpaid' until the provider
    // confirms the cash side. Pure cash/zelle/card change = 'unpaid'.
    if (usingPackage) {
      const isPartial = minutesToApply < booking.duration;
      booking.packageRedemption = {
        packagePurchase: packagePurchaseId,
        minutesApplied: minutesToApply,
        redeemedAt: new Date(),
      };
      // 'package' is the canonical method when it covers the whole
      // booking. For partial coverage, paymentMethod stays as the
      // remainder method (so the provider knows what to collect).
      booking.paymentMethod = isPartial ? paymentMethod : 'package';
      // Wait — when isPartial, we expected the caller to pass a
      // non-package paymentMethod for the remainder. If they passed
      // 'package' but partial, fall back to 'cash'.
      if (isPartial && paymentMethod === 'package') {
        booking.paymentMethod = 'cash';
      }
      booking.paymentStatus = isPartial ? 'unpaid' : 'paid';
      booking.paidAt = isPartial ? null : new Date();
    } else {
      // Non-package method. Clear any prior package redemption.
      booking.packageRedemption = {
        packagePurchase: null,
        minutesApplied: null,
        redeemedAt: null,
      };
      booking.paymentMethod = paymentMethod;
      // Don't auto-flip paymentStatus when switching off-package —
      // the provider toggles paid/unpaid separately. But if the
      // booking was 'paid' purely because it was package-redeemed,
      // it makes more sense to start back at 'unpaid' so the
      // provider explicitly confirms the new method's payment.
      if (oldRedemptionId) {
        booking.paymentStatus = 'unpaid';
        booking.paidAt = null;
      }
    }

    await booking.save();
    res.json(booking);
  } catch (error) {
    console.error('Error updating payment method:', error);
    res.status(500).json({ message: 'Error updating payment method' });
  }
});

// PATCH /:id/note (Set or clear the provider's private session note)
//
// Optional, free-form, capped at 5000 chars by the schema. Provider-
// only — clients can never read or write here. The provider posts
// `{ providerNote: "..." }` to set or `{ providerNote: null }` (or
// empty string) to clear.
router.patch('/:id/note', ensureAuthenticated, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (req.user.accountType !== 'PROVIDER' || !booking.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'Only the provider can update session notes' });
    }

    const raw = req.body?.providerNote;
    if (raw === undefined) {
      return res.status(400).json({ message: 'providerNote is required (string or null)' });
    }
    if (raw !== null && typeof raw !== 'string') {
      return res.status(400).json({ message: 'providerNote must be a string or null' });
    }

    // Empty string normalizes to null so "no note" has one canonical
    // representation in the DB and the client doesn't have to think
    // about the distinction.
    const next = raw === null ? null : (raw.trim() || null);
    if (next && next.length > 5000) {
      return res.status(400).json({ message: 'providerNote is capped at 5000 characters' });
    }

    booking.providerNote = next;
    await booking.save();

    res.json({ providerNote: booking.providerNote });
  } catch (error) {
    console.error('Error updating session note:', error);
    res.status(500).json({ message: 'Error updating session note' });
  }
});

// PUT /:id/reschedule (Reschedule a booking to a new date/time)
router.put('/:id/reschedule', ensureAuthenticated, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Only the client or provider on this booking can reschedule
    const isProvider = req.user.accountType === 'PROVIDER' && booking.provider.equals(req.user._id);
    const isClient = req.user.accountType === 'CLIENT' && booking.client.equals(req.user._id);

    if (!isProvider && !isClient) {
      return res.status(403).json({ message: 'Not authorized to reschedule this booking' });
    }

    // Can only reschedule pending or confirmed bookings
    if (!['pending', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({
        message: `Cannot reschedule a booking with status '${booking.status}'`
      });
    }

    const { date, time } = req.body;
    if (!date || !time) {
      return res.status(400).json({ message: 'New date and time are required' });
    }

    // Validate time format
    const timeFormat24h = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeFormat24h.test(time)) {
      return res.status(400).json({ message: 'Invalid time format. Use 24-hour format (HH:mm)' });
    }

    const providerId = booking.provider;
    const duration = booking.duration;
    const location = booking.location;

    // Use the booking's stored TZ for parsing the new date/time.
    // The reschedule keeps the booking in its original TZ (the
    // appointment is happening where it's happening); changing the
    // provider's TZ later doesn't move existing bookings.
    const rescheduleTz = booking.timezone || 'America/Los_Angeles';
    const bookingDateLA = DateTime.fromISO(date, { zone: rescheduleTz }).startOf('day');
    const localDateStr = bookingDateLA.toFormat('yyyy-MM-dd');

    // Direct conflict check (not slot-list membership). Reschedule is
    // a corrective action, not a fresh booking. Common case: provider
    // started 15 min late and wants the record to match reality. The
    // booking might already be outside declared availability (booked
    // on-behalf, or availability changed after the fact). Refusing
    // because "8:45 isn't in your 12pm-8pm availability" is wrong here.
    //
    // What we DO refuse: overlap with another non-cancelled booking,
    // or with a non-overridden BlockedTime (Google Calendar event,
    // manual block). Those are real, hard conflicts.
    const newStartMin = (() => {
      const [h, m] = time.split(':').map(Number);
      return h * 60 + m;
    })();
    const newEndMin = newStartMin + duration;
    if (newEndMin > 24 * 60) {
      return res.status(400).json({ message: 'Appointment would extend past midnight.' });
    }

    const startOfDay = bookingDateLA.startOf('day').toUTC().toJSDate();
    const endOfDay = bookingDateLA.endOf('day').toUTC().toJSDate();

    // Freshness gates before the reschedule conflict check — mirror
    // the booking-creation gates so reschedules also can't slip past
    // a calendar event the cache hasn't picked up yet.
    const { ensureFreshGcalSync } = require('../services/googleCalendarSync');
    const { ensureFreshExternalFeeds } = require('../services/externalCalendarFeedService');
    await Promise.all([
      ensureFreshGcalSync(providerId),
      ensureFreshExternalFeeds(providerId),
    ]);

    const otherBookings = await Booking.find({
      provider: providerId,
      date: { $gte: startOfDay, $lt: endOfDay },
      status: { $ne: 'cancelled' },
      _id: { $ne: booking._id }
    }).populate('client', 'profile.fullName email').sort({ startTime: 1 });

    const toMin = (hhmm) => {
      const [h, m] = hhmm.split(':').map(Number);
      return h * 60 + m;
    };
    const overlapBooking = otherBookings.find(b =>
      newStartMin < toMin(b.endTime) && newEndMin > toMin(b.startTime)
    );
    if (overlapBooking) {
      const who = overlapBooking.client?.profile?.fullName || overlapBooking.client?.email || 'another booking';
      return res.status(400).json({
        message: `That time overlaps with ${who} at ${overlapBooking.startTime}.`
      });
    }

    const dayBlocks = await BlockedTime.find({
      provider: providerId,
      localDate: localDateStr,
      overridden: { $ne: true }
    }).select('start end source reason');
    const overlapBlock = dayBlocks.find(bt => {
      // Each block carries its own timezone; the comparison happens in
      // local-of-block time so a block stored in NY but viewed via an
      // LA-defaulted system still produces correct minute counts.
      const blockTz = bt.timezone || rescheduleTz;
      const sLA = DateTime.fromJSDate(bt.start, { zone: 'UTC' }).setZone(blockTz);
      const eLA = DateTime.fromJSDate(bt.end, { zone: 'UTC' }).setZone(blockTz);
      const btStart = sLA.hour * 60 + sLA.minute;
      const btEnd = eLA.hour * 60 + eLA.minute;
      return newStartMin < btEnd && newEndMin > btStart;
    });
    if (overlapBlock) {
      const reason = overlapBlock.reason || (overlapBlock.source === 'google_calendar' ? 'a Google Calendar event' : 'blocked time');
      return res.status(400).json({ message: `That time overlaps with ${reason}.` });
    }

    // Store old details for notification
    const oldDate = booking.localDate;
    const oldTime = booking.startTime;

    // Update the booking — parse the new time in the booking's
    // stored TZ to keep its semantics consistent.
    const newStartLA = DateTime.fromFormat(`${localDateStr} ${time}`, 'yyyy-MM-dd HH:mm', { zone: rescheduleTz });
    const newEndLA = newStartLA.plus({ minutes: duration });

    booking.date = bookingDateLA.toUTC().toJSDate();
    booking.localDate = localDateStr;
    booking.startTime = time;
    booking.endTime = newEndLA.toFormat('HH:mm');
    // Don't demote on reschedule — a confirmed booking stays confirmed,
    // a tentative one stays tentative. Reschedule isn't a re-approval
    // event in this app's model: the provider is doing the moving (or
    // the client is asking to move) and the underlying agreement still
    // holds.

    await booking.save();

    // Send notifications (non-blocking)
    try {
      const provider = await User.findById(booking.provider);
      const client = await User.findById(booking.client);
      const providerName = provider.profile?.fullName || provider.email;
      const clientName = client.profile?.fullName || client.email;
      const rescheduledBy = isClient ? clientName : providerName;

      const fmtTime = (t) => DateTime.fromFormat(t, 'HH:mm').toFormat('h:mm a');
      const fmtDate = (d) => DateTime.fromFormat(d, 'yyyy-MM-dd').toFormat('EEE, MMM d');

      const smsMsg = `Rescheduled: Appointment moved from ${fmtDate(oldDate)} at ${fmtTime(oldTime)} to ${fmtDate(localDateStr)} at ${fmtTime(time)} by ${rescheduledBy}.`;

      // Notify the other party via SMS (skip silently if they have no phone)
      if (isClient && provider.profile?.phoneNumber) {
        await smsService.sendSms(formatPhoneNumber(provider.profile.phoneNumber), smsMsg);
      } else if (isProvider && client.profile?.phoneNumber) {
        await smsService.sendSms(formatPhoneNumber(client.profile.phoneNumber), smsMsg);
      }

      // Send updated confirmation email with new calendar invite if the
      // client has an email on file.
      if (client.email) {
        sendBookingConfirmationEmail(client.email, booking, provider, clientName);
      }
    } catch (notifyError) {
      console.error('Error sending reschedule notifications:', notifyError);
    }

    res.json(booking);
  } catch (error) {
    console.error('Error rescheduling booking:', error);
    res.status(500).json({ message: 'Error rescheduling booking' });
  }
});

// PATCH /:id/status (Update booking status — provider only)
router.patch('/:id/status', ensureAuthenticated, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Only the provider on this booking can update status
    if (req.user.accountType !== 'PROVIDER' || !booking.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'Only the provider can update booking status' });
    }

    const { status } = req.body;
    const allowed = ['confirmed', 'in-progress', 'completed'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Allowed: ${allowed.join(', ')}` });
    }

    // Validate status transitions
    const transitions = {
      'pending': ['confirmed', 'cancelled'],
      'confirmed': ['in-progress', 'completed', 'cancelled'],
      'in-progress': ['completed', 'cancelled'],
    };

    const allowedFrom = transitions[booking.status];
    if (!allowedFrom || !allowedFrom.includes(status)) {
      return res.status(400).json({
        message: `Cannot change status from '${booking.status}' to '${status}'`
      });
    }

    // Refuse to mark a booking 'completed' before it has actually
    // started. Easy mistap on the appointment-detail page (provider
    // confuses Complete with "mark paid" or tries to close the day
    // out preemptively) results in a session showing DONE on the
    // dashboard hours before the appointment occurs. 15-min grace
    // window so a session that begins a few minutes early can still
    // close out cleanly.
    if (status === 'completed' && booking.localDate && booking.startTime) {
      const bookingTz = booking.timezone || 'America/Los_Angeles';
      const startsAt = DateTime.fromFormat(
        `${booking.localDate} ${booking.startTime}`,
        'yyyy-MM-dd HH:mm',
        { zone: bookingTz }
      );
      if (startsAt.isValid) {
        const earliestCompleteable = startsAt.minus({ minutes: 15 });
        const nowInBookingTz = DateTime.now().setZone(bookingTz);
        if (nowInBookingTz < earliestCompleteable) {
          return res.status(400).json({
            message: `Can't mark complete — this appointment hasn't started yet (scheduled ${startsAt.toFormat('h:mm a')} ${bookingTz}).`
          });
        }
      }
    }

    booking.status = status;
    if (status === 'completed') {
      booking.completedAt = new Date();
    }
    await booking.save();

    // Send completion receipt email to client (non-blocking)
    if (status === 'completed') {
      try {
        const provider = await User.findById(booking.provider);
        const client = await User.findById(booking.client);
        const clientName = booking.recipientType === 'other'
          ? booking.recipientInfo?.name || 'Guest'
          : (client.profile?.fullName || client.email);

        if (client.email) {
          sendBookingCompletedEmail(client.email, booking, provider, clientName);
        }
      } catch (emailError) {
        console.error('❌ Error sending completion email:', emailError);
      }
    }

    res.json(booking);
  } catch (error) {
    console.error('Error updating booking status:', error);
    res.status(500).json({ message: 'Error updating booking status' });
  }
});

module.exports = router;
