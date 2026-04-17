const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Availability = require('../models/Availability');
const BlockedTime = require('../models/BlockedTime');
const User = require('../models/User');
const SavedLocation = require('../models/SavedLocation');
const { ensureAuthenticated } = require('../middleware/passportMiddleware');
const { getAvailableTimeSlots } = require('../utils/timeUtils');
const { calculateTravelTime, calculateDistanceMiles } = require('../services/mapService');
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

    const booking = new Booking({
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
      // Add massage type if provided
      ...(req.body.massageType && {
        massageType: {
          id: req.body.massageType.id,
          name: req.body.massageType.name
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
      // Payment method
      paymentMethod: req.body.paymentMethod || 'cash',
      paymentStatus: 'unpaid',
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
          recipientPhone = client.profile.phoneNumber;
          recipientName = client.profile.fullName || client.email;
        } else {
          recipientPhone = savedBooking.recipientInfo.phone;
          recipientName = savedBooking.recipientInfo.name;
        }
        
        // Format phone numbers
        const formattedRecipientPhone = formatPhoneNumber(recipientPhone);
        const formattedProviderPhone = formatPhoneNumber(provider.profile.phoneNumber);
        
        // Construct messages
        const recipientMessage = `Hi ${recipientName}, your massage with ${providerName} is confirmed on ${savedBooking.localDate} at ${savedBooking.startTime}.`;
        const providerMessage = `New booking: ${recipientName} on ${savedBooking.localDate} at ${savedBooking.startTime}.`;
        
        // Send SMS
        await smsService.sendSms(formattedRecipientPhone, recipientMessage);
        await smsService.sendSms(formattedProviderPhone, providerMessage);
        
        console.log('✅ SMS notifications sent successfully');
      } catch (smsError) {
        console.error('❌ Error sending SMS notifications:', smsError);
      }

      // Send email notifications (non-blocking)
      try {
        const provider = await User.findById(savedBooking.provider);
        const client = await User.findById(savedBooking.client);
        const providerName = provider.profile?.fullName || provider.providerProfile?.businessName || provider.email;
        const clientName = savedBooking.recipientType === 'other'
          ? savedBooking.recipientInfo?.name || 'Guest'
          : (client.profile?.fullName || client.email);

        // Email to client with calendar invite
        if (client.email) {
          sendBookingConfirmationEmail(client.email, savedBooking, providerName, clientName);
        }
        // Email to provider
        if (provider.email) {
          sendBookingNotificationToProvider(provider.email, savedBooking, providerName, clientName);
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

// bookings.js (Bulk Endpoint)

router.post('/bulk', ensureAuthenticated, async (req, res) => {
  try {
    const bookingRequests = req.body;
    if (!Array.isArray(bookingRequests) || bookingRequests.length === 0) {
      console.error('Bulk booking failed: Expected array of booking requests');
      return res.status(400).json({ message: 'Expected array of booking requests' });
    }

    // Check for authenticated user
    if (!req.user || !req.user.id) {
      console.error('Bulk booking failed: No user ID found in the request');
      return res.status(401).json({ message: 'Unauthorized: No user ID found' });
    }

    // Validate all bookings are for the same date and location
    const firstRequest = bookingRequests[0];
    
    // Validate time format for first request
    const timeFormat24h = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeFormat24h.test(firstRequest.time)) {
      return res.status(400).json({ message: 'Invalid time format. Use 24-hour format (HH:mm)' });
    }

    const allSameDate = bookingRequests.every(req => req.date === firstRequest.date);
    const allSameLocation = bookingRequests.every(req => 
      req.location.address === firstRequest.location.address &&
      req.location.lat === firstRequest.location.lat &&
      req.location.lng === firstRequest.location.lng
    );

    if (!allSameDate || !allSameLocation) {
      console.error('Bulk booking failed: All bookings must have the same date and location');
      return res.status(400).json({ 
        message: 'All bookings in a group must be for the same date and location' 
      });
    }

    const bookingDate = new Date(firstRequest.date);
    
    // Get admin availability once for the date
    const availability = await Availability.findOne({
      date: bookingDate
    });

    if (!availability) {
      console.error('Bulk booking failed: No availability for the selected date');
      return res.status(400).json({ message: 'No availability for the selected date' });
    }

    // Get existing bookings once
    const existingBookings = await Booking.find({
      date: bookingDate
    }).sort({ startTime: 1 });

    // Validate all slots are available
    const validationPromises = bookingRequests.map(async (request, index) => {
      // Create booking start time in LA timezone
      const bookingDateLA = DateTime.fromISO(request.date, { zone: 'America/Los_Angeles' }).startOf('day');
      const bookingStartTimeLA = DateTime.fromFormat(
        `${bookingDateLA.toFormat('yyyy-MM-dd')} ${request.time}`, 
        'yyyy-MM-dd HH:mm', 
        { zone: 'America/Los_Angeles' }
      );

      // Pass groupId and extraDepartureBuffer to availability check
      const availableSlots = await getAvailableTimeSlots(
        availability,
        existingBookings,
        request.location,
        request.duration,
        15,
        request.groupId,
        request.extraDepartureBuffer
      );

      // Convert available slots to LA time strings for comparison
      const availableTimeStrings = availableSlots.map(slot => {
        const slotLA = DateTime.fromJSDate(slot).setZone('America/Los_Angeles');
        return slotLA.toFormat('HH:mm');
      });
      
      // Check if the requested time is in the available slots
      const isSlotAvailable = availableTimeStrings.includes(request.time);

      if (!isSlotAvailable) {
        console.error(`Bulk booking failed: Slot not available for session ${index + 1}`);
        throw new Error(`Slot not available for session ${index + 1}`);
      }
    });

    try {
      await Promise.all(validationPromises);
    } catch (error) {
      // The specific error message will be sent to the front end
      console.error(`Bulk booking validation error: ${error.message}`);
      return res.status(400).json({ message: error.message });
    }

    // Create all bookings
    const bookingPromises = bookingRequests.map((request, index) => {
      // Create booking start time in LA timezone
      const bookingDateLA = DateTime.fromISO(request.date, { zone: 'America/Los_Angeles' }).startOf('day');
      const bookingStartTimeLA = DateTime.fromFormat(
        `${bookingDateLA.toFormat('yyyy-MM-dd')} ${request.time}`, 
        'yyyy-MM-dd HH:mm', 
        { zone: 'America/Los_Angeles' }
      );
      
      // Convert to UTC for storage
      const bookingStartTime = bookingStartTimeLA.toUTC().toJSDate();
      
      // Calculate end time
      const bookingEndTimeLA = bookingStartTimeLA.plus({ minutes: request.duration });
      const endTime = bookingEndTimeLA.toFormat('HH:mm');
      
      const price = calculatePrice(request.duration);

      const booking = new Booking({
        provider: req.user.accountType === 'CLIENT' ? req.user.providerId : req.user._id,
        client: req.user.id,
        date: bookingDateLA.toUTC().toJSDate(),
        localDate: bookingDateLA.toFormat('yyyy-MM-dd'),
        startTime: request.time,
        endTime: endTime,
        duration: request.duration,
        location: request.location,
        price,
        groupId: request.groupId,
        isLastInGroup: index === bookingRequests.length - 1,
        extraDepartureBuffer: request.extraDepartureBuffer,
        // Add recipient information if provided
        ...(request.recipientType && {
          recipientType: request.recipientType
        }),
        ...(request.recipientType === 'other' && request.recipientInfo && {
          recipientInfo: {
            name: request.recipientInfo.name,
            phone: request.recipientInfo.phone,
            email: request.recipientInfo.email || ''
          }
        })
      });

      return booking.save();
    });

    const savedBookings = await Promise.all(bookingPromises);
    console.log('Bulk bookings successfully created:', savedBookings);
    res.status(201).json(savedBookings);

  } catch (error) {
    console.error('Error creating bulk bookings:', error.message);
    res.status(500).json({ message: `Bulk booking creation failed: ${error.message}` });
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
          // Middle leg: previous client → this client
          const prev = dayBookings[i - 1];
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

    // Send cancellation SMS notifications
    try {
      const provider = await User.findById(booking.provider);
      const client = await User.findById(booking.client);
      const cancelledByType = req.user.accountType;

      // Determine recipient details
      let recipientPhone, recipientName;
      if (booking.recipientType === 'self') {
        recipientPhone = client.profile.phoneNumber;
        recipientName = client.profile.fullName || client.email;
      } else {
        recipientPhone = booking.recipientInfo.phone;
        recipientName = booking.recipientInfo.name;
      }

      const providerName = provider.profile.fullName || provider.email;
      const dateStr = booking.localDate;
      const timeStr = booking.startTime;

      if (cancelledByType === 'CLIENT') {
        // Notify provider that client cancelled
        const formattedProviderPhone = formatPhoneNumber(provider.profile.phoneNumber);
        const providerMsg = `Cancelled: ${recipientName}'s appointment on ${dateStr} at ${timeStr} has been cancelled by the client.`;
        await smsService.sendSms(formattedProviderPhone, providerMsg);
        console.log('✅ Cancellation SMS sent to provider');
      } else {
        // Notify client that provider cancelled
        const formattedRecipientPhone = formatPhoneNumber(recipientPhone);
        const clientMsg = `Hi ${recipientName}, your massage with ${providerName} on ${dateStr} at ${timeStr} has been cancelled. Please rebook at your convenience.`;
        await smsService.sendSms(formattedRecipientPhone, clientMsg);
        console.log('✅ Cancellation SMS sent to client');
      }
    } catch (smsError) {
      console.error('❌ Error sending cancellation SMS:', smsError);
    }

    // Send cancellation email (non-blocking)
    try {
      const provider = await User.findById(booking.provider);
      const client = await User.findById(booking.client);
      const providerName = provider.profile?.fullName || provider.email;
      const clientName = booking.recipientType === 'other'
        ? booking.recipientInfo?.name || 'Guest'
        : (client.profile?.fullName || client.email);

      if (req.user.accountType === 'CLIENT' && provider.email) {
        sendBookingCancellationEmail(provider.email, booking, providerName, clientName, 'CLIENT');
      } else if (client.email) {
        sendBookingCancellationEmail(client.email, booking, providerName, clientName, 'PROVIDER');
      }
    } catch (emailError) {
      console.error('❌ Error sending cancellation email:', emailError);
    }

    res.json({ message: 'Booking cancelled successfully' });
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
    booking.status = 'pending'; // Reset to pending after reschedule

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

      // Notify the other party via SMS
      if (isClient && provider.profile?.phoneNumber) {
        await smsService.sendSms(formatPhoneNumber(provider.profile.phoneNumber), smsMsg);
      } else if (isProvider && client.profile?.phoneNumber) {
        await smsService.sendSms(formatPhoneNumber(client.profile.phoneNumber), smsMsg);
      }

      // Send updated confirmation email with new calendar invite to client
      if (client.email) {
        sendBookingConfirmationEmail(client.email, booking, providerName, clientName);
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
        const providerName = provider.profile?.fullName || provider.providerProfile?.businessName || provider.email;
        const clientName = booking.recipientType === 'other'
          ? booking.recipientInfo?.name || 'Guest'
          : (client.profile?.fullName || client.email);

        if (client.email) {
          sendBookingCompletedEmail(client.email, booking, providerName, clientName);
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
