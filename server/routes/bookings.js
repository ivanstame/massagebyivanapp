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

// Calculate price helper (fallback when provider has no pricing configured)
const calculatePrice = (duration) => {
  const BASE_RATE = 120; // $120 per hour
  return Math.ceil((duration / 60) * BASE_RATE);
};

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

    const clientId = req.user.accountType === 'CLIENT'
      ? req.user._id
      : req.body.clientId;

    // Verify provider-client relationship
    if (req.user.accountType === 'PROVIDER') {
      const client = await User.findById(clientId);
      if (!client || !client.providerId.equals(req.user._id)) {
        return res.status(403).json({ message: 'Invalid client for this provider' });
      }
    }

    const bookingDateLA = DateTime.fromISO(date, { zone: 'America/Los_Angeles' }).startOf('day');
    const bookingDate = bookingDateLA.toUTC().toJSDate();

    // Create booking start time in LA timezone
    const bookingStartTimeLA = DateTime.fromFormat(`${bookingDateLA.toFormat('yyyy-MM-dd')} ${time}`, 
      'yyyy-MM-dd HH:mm', 
      { zone: 'America/Los_Angeles' }
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
      return res.status(400).json({ message: 'No availability for the selected date' });
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

    // Fetch blocked times for this date
    const blockedTimes = await BlockedTime.find({
      provider: providerId,
      localDate: localDateStr
    });

    // Check slot availability across ALL blocks (same logic as GET /available/:date)
    const bufferMinutes = 15;
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
        blockedTimes
      );
      allSlots = allSlots.concat(slots);
    }

    // Deduplicate by time string
    const seenTimes = new Set();
    const availableSlots = allSlots.filter(slot => {
      const key = DateTime.fromJSDate(slot).setZone('America/Los_Angeles').toFormat('HH:mm');
      if (seenTimes.has(key)) return false;
      seenTimes.add(key);
      return true;
    });

    // Convert available slots to LA time strings for comparison
    const availableTimeStrings = availableSlots.map(slot => {
      const slotLA = DateTime.fromJSDate(slot).setZone('America/Los_Angeles');
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
    // rest via cash/card/venmo/zelle. When omitted, the full duration is
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
          message: 'Partial package redemption requires a non-package paymentMethod (cash/zelle/venmo/card) for the remaining balance.',
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
      // Add pricing if provided
      ...(req.body.pricing && {
        pricing: {
          basePrice: req.body.pricing.basePrice || calculatePrice(duration),
          addonsPrice: req.body.pricing.addonsPrice || 0,
          totalPrice: req.body.pricing.totalPrice || calculatePrice(duration)
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
      // body's paymentMethod (cash/card/venmo/zelle) covers the rest, so
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
    // or an object `{ sessions: [...], forceBuffer?: bool }`. The wrapper
    // shape is the new form — callers that need to pass chain-level
    // options (currently just forceBuffer for the same-address turnover
    // toggle) use it. Bare arrays still work for any caller that hasn't
    // migrated.
    let bookingRequests;
    let chainForceBuffer = false;
    if (Array.isArray(req.body)) {
      bookingRequests = req.body;
    } else if (req.body && Array.isArray(req.body.sessions)) {
      bookingRequests = req.body.sessions;
      chainForceBuffer = req.body.forceBuffer === true;
    } else {
      return res.status(400).json({ message: 'Expected sessions array (bare or in { sessions, forceBuffer })' });
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
    const provider = req.user.accountType === 'CLIENT' ? req.user.providerId : req.user._id;
    const client = req.user.accountType === 'CLIENT' ? req.user._id : first.clientId;
    if (!provider || !client) {
      return res.status(400).json({ message: 'Could not resolve provider/client for this booking' });
    }
    if (req.user.accountType === 'PROVIDER') {
      const target = await User.findById(client);
      if (!target || !target.providerId?.equals(req.user._id)) {
        return res.status(403).json({ message: 'Invalid client for this provider' });
      }
    }

    // Hand off to the shared chain-booking service. It validates, fits,
    // creates atomically, and rolls back on partial failure. We just
    // surface its typed errors as appropriate HTTP responses.
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
      status: 'pending',
      // Per-booking opt-in to the same-address settle buffer. Default
      // false (chain is flush). The booking form's "add turnover"
      // toggle sends this true when the couple needs a sheet change
      // between sessions.
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
          .populate('client', 'email profile.fullName')
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
            .populate('client', 'email profile.fullName')
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

// GET /revenue (Provider revenue summary) — must be before /:id
router.get('/revenue', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Only providers can view revenue' });
    }

    const now = DateTime.now().setZone('America/Los_Angeles');
    const startOfWeek = now.startOf('week').toJSDate();
    const startOfMonth = now.startOf('month').toJSDate();

    const bookings = await Booking.find({
      provider: req.user._id,
      status: { $in: ['confirmed', 'completed', 'in-progress'] },
    }).lean();

    let weekRevenue = 0;
    let monthRevenue = 0;
    let totalRevenue = 0;
    let paidCount = 0;
    let unpaidCount = 0;

    for (const b of bookings) {
      const price = b.pricing?.totalPrice || 0;
      const bookingDate = new Date(b.date);

      if (b.paymentStatus === 'paid') {
        totalRevenue += price;
        paidCount++;
        if (bookingDate >= startOfWeek) weekRevenue += price;
        if (bookingDate >= startOfMonth) monthRevenue += price;
      } else {
        unpaidCount++;
      }
    }

    res.json({ weekRevenue, monthRevenue, totalRevenue, paidCount, unpaidCount });
  } catch (error) {
    console.error('Error fetching revenue:', error);
    res.status(500).json({ message: 'Error fetching revenue' });
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
      .populate('provider', 'email profile.fullName profile.phoneNumber providerProfile.businessName providerProfile.venmoHandle');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Authorization: only the provider or client on this booking can view it
    const isProvider = req.user.accountType === 'PROVIDER' && booking.provider._id.equals(req.user._id);
    const isClient = req.user.accountType === 'CLIENT' && booking.client._id.equals(req.user._id);

    if (!isProvider && !isClient) {
      return res.status(403).json({ message: 'Not authorized to view this booking' });
    }

    res.json(booking);
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
        const bookingStartLA = DateTime.fromFormat(
          `${booking.localDate} ${booking.startTime}`,
          'yyyy-MM-dd HH:mm',
          { zone: 'America/Los_Angeles' }
        );
        const hoursUntil = bookingStartLA.diff(DateTime.now().setZone('America/Los_Angeles'), 'hours').hours;

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
          const todayStr = DateTime.now().setZone('America/Los_Angeles').toFormat('yyyy-MM-dd');
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

    res.json({
      message: 'Booking cancelled successfully',
      siblingsCancelled,
      seriesCancelled,
      chainSiblingsCancelled,
    });
  } catch (error) {
    console.error('❌ Error cancelling booking:', error);
    res.status(500).json({ message: 'Server error while cancelling booking' });
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

    booking.paymentStatus = paymentStatus;
    booking.paidAt = paymentStatus === 'paid' ? new Date() : null;
    await booking.save();

    res.json(booking);
  } catch (error) {
    console.error('Error updating payment status:', error);
    res.status(500).json({ message: 'Error updating payment status' });
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

    const bookingDateLA = DateTime.fromISO(date, { zone: 'America/Los_Angeles' }).startOf('day');
    const localDateStr = bookingDateLA.toFormat('yyyy-MM-dd');

    // Validate the new slot is available (same logic as POST /)
    const availabilityBlocks = await Availability.find({
      provider: providerId,
      localDate: localDateStr
    }).sort({ start: 1 });

    if (availabilityBlocks.length === 0) {
      return res.status(400).json({ message: 'No availability for the selected date' });
    }

    const startOfDay = bookingDateLA.startOf('day').toUTC().toJSDate();
    const endOfDay = bookingDateLA.endOf('day').toUTC().toJSDate();

    // Exclude the current booking from conflict checks
    const existingBookings = await Booking.find({
      provider: providerId,
      date: { $gte: startOfDay, $lt: endOfDay },
      status: { $ne: 'cancelled' },
      _id: { $ne: booking._id }
    }).sort({ startTime: 1 });

    let homeBase = null;
    const homeLoc = await SavedLocation.findOne({ provider: providerId, isHomeBase: true });
    if (homeLoc) {
      homeBase = { lat: homeLoc.lat, lng: homeLoc.lng };
    }

    let allSlots = [];
    for (const availability of availabilityBlocks) {
      const slots = await getAvailableTimeSlots(
        availability, existingBookings, location, duration,
        15, null, 0, providerId, [], homeBase
      );
      allSlots = allSlots.concat(slots);
    }

    const availableTimeStrings = allSlots.map(slot =>
      DateTime.fromJSDate(slot).setZone('America/Los_Angeles').toFormat('HH:mm')
    );

    if (!availableTimeStrings.includes(time)) {
      return res.status(400).json({ message: 'This time slot is not available' });
    }

    // Store old details for notification
    const oldDate = booking.localDate;
    const oldTime = booking.startTime;

    // Update the booking
    const newStartLA = DateTime.fromFormat(`${localDateStr} ${time}`, 'yyyy-MM-dd HH:mm', { zone: 'America/Los_Angeles' });
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
