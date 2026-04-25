const express = require('express');
const router = express.Router();
const Availability = require('../models/Availability');
const BlockedTime = require('../models/BlockedTime');
const Booking = require('../models/Booking');
const WeeklyTemplate = require('../models/WeeklyTemplate');
const SavedLocation = require('../models/SavedLocation');
const { ensureAuthenticated } = require('../middleware/passportMiddleware');
const { validateAvailabilityInput } = require('../middleware/validation');
const { DateTime } = require('luxon');
const { DEFAULT_TZ, TIME_FORMATS } = require('../../src/utils/timeConstants');
const LuxonService = require('../../src/utils/LuxonService');

/**
 * Generate availability from weekly template for a specific date and provider.
 * Only creates if no availability exists for that date yet.
 * Returns the created Availability doc, or null if no template applies.
 */
async function generateFromTemplate(providerId, laDate) {
  const localDateStr = laDate.toFormat(TIME_FORMATS.ISO_DATE);

  // Look up template for this day of week (Luxon: 1=Mon..7=Sun, convert to our 0=Sun..6=Sat)
  const luxonWeekday = laDate.weekday; // 1=Mon, 7=Sun
  const dayOfWeek = luxonWeekday === 7 ? 0 : luxonWeekday; // Convert to 0=Sun..6=Sat

  const template = await WeeklyTemplate.findOne({
    provider: providerId,
    dayOfWeek,
    isActive: true
  });
  if (!template) return null;

  // Check if a template-sourced availability already exists for this date
  const existingTemplate = await Availability.findOne({
    provider: providerId,
    localDate: localDateStr,
    source: 'template'
  });
  if (existingTemplate) return null; // Template already generated for this day

  // Create availability from template (even if manual blocks exist — they may cover different hours)
  const startLA = DateTime.fromFormat(
    `${localDateStr} ${template.startTime}`,
    'yyyy-MM-dd HH:mm',
    { zone: DEFAULT_TZ }
  );
  const endLA = DateTime.fromFormat(
    `${localDateStr} ${template.endTime}`,
    'yyyy-MM-dd HH:mm',
    { zone: DEFAULT_TZ }
  );

  const availData = {
    provider: providerId,
    date: laDate.startOf('day').toUTC().toJSDate(),
    localDate: localDateStr,
    start: startLA.toUTC().toJSDate(),
    end: endLA.toUTC().toJSDate(),
    source: 'template'
  };

  // Propagate anchor info if the template has one
  if (template.anchor && template.anchor.locationId) {
    const loc = await SavedLocation.findById(template.anchor.locationId);
    if (loc) {
      availData.anchor = {
        locationId: loc._id,
        name: loc.name,
        address: loc.address,
        lat: loc.lat,
        lng: loc.lng,
        startTime: template.anchor.startTime,
        endTime: template.anchor.endTime
      };
    }
  }

  const availability = new Availability(availData);
  await availability.save();
  return availability;
}

/**
 * Generate availability from templates for a date range.
 * Skips dates that already have availability.
 */
async function generateFromTemplateRange(providerId, startDate, endDate) {
  const templates = await WeeklyTemplate.find({ provider: providerId, isActive: true });
  if (templates.length === 0) return [];

  // Build a lookup by dayOfWeek
  const templateByDay = {};
  for (const t of templates) {
    templateByDay[t.dayOfWeek] = t;
  }

  // Pre-fetch all anchor locations referenced by templates
  const anchorLocationIds = templates
    .filter(t => t.anchor && t.anchor.locationId)
    .map(t => t.anchor.locationId);
  const anchorLocations = anchorLocationIds.length > 0
    ? await SavedLocation.find({ _id: { $in: anchorLocationIds } })
    : [];
  const locationById = {};
  for (const loc of anchorLocations) {
    locationById[loc._id.toString()] = loc;
  }

  // Get all existing availability in the range
  const existing = await Availability.find({
    provider: providerId,
    localDate: {
      $gte: startDate.toFormat(TIME_FORMATS.ISO_DATE),
      $lte: endDate.toFormat(TIME_FORMATS.ISO_DATE)
    }
  });
  const existingDates = new Set(existing.map(a => a.localDate));

  // Generate for each day in range that doesn't have availability yet
  const toCreate = [];
  let current = startDate.startOf('day');
  while (current <= endDate) {
    const localDateStr = current.toFormat(TIME_FORMATS.ISO_DATE);
    const luxonWeekday = current.weekday;
    const dayOfWeek = luxonWeekday === 7 ? 0 : luxonWeekday;

    if (!existingDates.has(localDateStr) && templateByDay[dayOfWeek]) {
      const template = templateByDay[dayOfWeek];
      const startLA = DateTime.fromFormat(
        `${localDateStr} ${template.startTime}`,
        'yyyy-MM-dd HH:mm',
        { zone: DEFAULT_TZ }
      );
      const endLA = DateTime.fromFormat(
        `${localDateStr} ${template.endTime}`,
        'yyyy-MM-dd HH:mm',
        { zone: DEFAULT_TZ }
      );

      const doc = {
        provider: providerId,
        date: current.startOf('day').toUTC().toJSDate(),
        localDate: localDateStr,
        start: startLA.toUTC().toJSDate(),
        end: endLA.toUTC().toJSDate(),
        source: 'template'
      };

      // Propagate anchor info
      if (template.anchor && template.anchor.locationId) {
        const loc = locationById[template.anchor.locationId.toString()];
        if (loc) {
          doc.anchor = {
            locationId: loc._id,
            name: loc.name,
            address: loc.address,
            lat: loc.lat,
            lng: loc.lng,
            startTime: template.anchor.startTime,
            endTime: template.anchor.endTime
          };
        }
      }

      toCreate.push(doc);
    }
    current = current.plus({ days: 1 });
  }

  if (toCreate.length > 0) {
    // Use insertMany — pre-save hooks won't fire, but we've already computed all fields
    // We need to generate availableSlots manually
    for (const doc of toCreate) {
      const startDT = DateTime.fromJSDate(doc.start, { zone: 'UTC' }).setZone(DEFAULT_TZ);
      const endDT = DateTime.fromJSDate(doc.end, { zone: 'UTC' }).setZone(DEFAULT_TZ);
      const slots = LuxonService.generateTimeSlots(startDT.toISO(), endDT.toISO(), 30);
      doc.availableSlots = slots.map(slot =>
        DateTime.fromISO(slot.start).setZone(DEFAULT_TZ).toFormat(TIME_FORMATS.TIME_24H)
      );
    }
    await Availability.insertMany(toCreate);
  }

  return toCreate;
}

// Get availability blocks for a specific date
router.get('/blocks/:date', ensureAuthenticated, async (req, res) => {
  try {
    const providerId = req.user._id;
    const laDate = DateTime.fromISO(req.params.date, { zone: DEFAULT_TZ });

    // Auto-generate from template if no availability exists for this date
    await generateFromTemplate(providerId, laDate);

    const blocks = await Availability.find({
      provider: providerId,
      localDate: laDate.toFormat(TIME_FORMATS.ISO_DATE)
    });

    res.json(blocks);
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({ message: 'Error fetching availability' });
  }
});

// Get availability block spans for a month
router.get('/month/:year/:month', ensureAuthenticated, async (req, res) => {
  try {
    const { year, month } = req.params;
    const startDate = DateTime.fromObject(
      { year: parseInt(year), month: parseInt(month), day: 1 },
      { zone: DEFAULT_TZ }
    );
    const endDate = startDate.endOf('month');

    // Determine the provider ID for template generation
    let providerId;
    if (req.user.accountType === 'PROVIDER') {
      providerId = req.user._id;
    } else if (req.query.providerId) {
      providerId = req.query.providerId;
    }

    // Auto-generate from templates for the whole month (only for future dates)
    if (providerId) {
      const today = DateTime.now().setZone(DEFAULT_TZ).startOf('day');
      const genStart = startDate < today ? today : startDate;
      if (genStart <= endDate) {
        await generateFromTemplateRange(providerId, genStart, endDate);
      }
    }

    // Build query
    const query = {
      date: {
        $gte: startDate.toUTC().toJSDate(),
        $lte: endDate.toUTC().toJSDate()
      }
    };

    if (req.user.accountType === 'PROVIDER') {
      query.provider = req.user._id;
    } else if (req.query.providerId) {
      query.provider = req.query.providerId;
    }

    const availabilityBlocks = await Availability.find(query).sort({ date: 1 });

    res.json(availabilityBlocks);
  } catch (error) {
    console.error('Error fetching monthly availability:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get available slots for a specific date
router.get('/available/:date', validateAvailabilityInput, async (req, res) => {
  try {
    // Date is already validated and parsed to LA timezone by middleware
    const laDate = req.availabilityDate;
    
    // Get start and end of day in LA time
    const startOfDay = laDate.startOf('day');
    const endOfDay = laDate.endOf('day');

    console.log('Searching for availability between:', 
      startOfDay.toFormat(TIME_FORMATS.ISO_DATETIME),
      'and',
      endOfDay.toFormat(TIME_FORMATS.ISO_DATETIME)
    );

    // Parse duration(s) from request and validate
    let appointmentDuration;
    if (req.query.isMultiSession === 'true' || req.query.sessionDurations) {
      let sessionDurations;
      try {
        sessionDurations = JSON.parse(req.query.sessionDurations);
      } catch (err) {
        console.log('Error parsing sessionDurations:', err.message);
        sessionDurations = [60]; // Default to a single 60-minute session
      }
      
      // Validate sessionDurations is a properly formed array with valid values
      if (!Array.isArray(sessionDurations) || sessionDurations.length === 0) {
        console.log('Invalid or empty sessionDurations - defaulting to 60 minutes');
        sessionDurations = [60]; // Default to a single 60-minute session
      } else {
        // Filter out any invalid durations and replace with defaults
        sessionDurations = sessionDurations.map(d => {
          const parsed = parseInt(d);
          if (!parsed || isNaN(parsed) || parsed < 30 || parsed > 180) {
            console.log(`Invalid session duration: ${d} - defaulting to 60 minutes`);
            return 60; // Default individual session
          }
          return parsed;
        });
      }
      
      // Sum the durations for total appointment duration
      appointmentDuration = sessionDurations.reduce((sum, d) => sum + d, 0);
      
      // Extra validation to ensure we have a reasonable value
      if (appointmentDuration <= 0 || appointmentDuration > 540) { // Max 9 hours (3 sessions of 3 hours)
        console.log(`Invalid total appointment duration: ${appointmentDuration} - defaulting to 60 minutes`);
        appointmentDuration = 60;
        sessionDurations = [60];
      }
    } else {
      appointmentDuration = parseInt(req.query.duration);
      if (!appointmentDuration || appointmentDuration < 30 || appointmentDuration > 180) {
        appointmentDuration = 60;
      }
    }

    const bufferTime = 15;
    const { lat, lng } = req.query;
    const isMultiSession = req.query.isMultiSession === 'true';
    
    console.log('Processing availability request:', {
      appointmentDuration,
      isMultiSession,
      date: laDate.toFormat(TIME_FORMATS.ISO_DATE),
      providerId: req.query.providerId
    });

    // Build query for availability block - must filter by provider
    const availQuery = {
      date: {
        $gte: startOfDay.toUTC().toJSDate(),
        $lt: endOfDay.toUTC().toJSDate()
      }
    };
    
    // If providerId is specified (from client booking form), use that
    if (req.query.providerId) {
      availQuery.provider = req.query.providerId;
    }
    // If user is authenticated and is a provider, use their ID
    else if (req.user && req.user.accountType === 'PROVIDER') {
      availQuery.provider = req.user._id;
    }
    // Otherwise, find ANY availability (for backward compatibility, but this should ideally require providerId)

    // Auto-generate from template if a provider is identified
    const templateProviderId = req.query.providerId || (req.user?.accountType === 'PROVIDER' ? req.user._id : null);
    if (templateProviderId) {
      await generateFromTemplate(templateProviderId, laDate);
    }

    // Find ALL availability blocks for the day (manual + template may coexist)
    const availabilityBlocks = await Availability.find(availQuery).sort({ start: 1 });

    if (availabilityBlocks.length === 0) {
      console.log(`No availability blocks found for date: ${laDate.toFormat(TIME_FORMATS.ISO_DATE)}`);
      return res.status(200).json([]);
    }

    // Get existing bookings for the day
    const bookings = await Booking.find({
      date: {
        $gte: startOfDay.toUTC().toJSDate(),
        $lt: endOfDay.toUTC().toJSDate()
      }
    }).sort({ startTime: 1 });

    console.log('Found bookings:',
      bookings.map(b => `${b.startTime}-${b.endTime}`)
    );

    const clientLocation = {
      lat: parseFloat(lat),
      lng: parseFloat(lng)
    };

    console.log('Availability blocks found:', availabilityBlocks.length);
    availabilityBlocks.forEach((a, i) => {
      console.log(`  Block ${i}: ${DateTime.fromJSDate(a.start).setZone(DEFAULT_TZ).toFormat(TIME_FORMATS.TIME_24H)} - ${DateTime.fromJSDate(a.end).setZone(DEFAULT_TZ).toFormat(TIME_FORMATS.TIME_24H)} (${a.source})`);
    });

    // Import the same validation function used by the booking endpoint
    const { getAvailableTimeSlots } = require('../utils/timeUtils');

    const providerId = req.query.providerId;
    const sessionDurationsArray = isMultiSession && req.query.sessionDurations ?
      JSON.parse(req.query.sessionDurations) :
      [appointmentDuration];

    // Fetch provider's home base for travel calculations
    let homeBase = null;
    if (providerId) {
      const homeLoc = await SavedLocation.findOne({ provider: providerId, isHomeBase: true });
      if (homeLoc) {
        homeBase = { lat: homeLoc.lat, lng: homeLoc.lng };
        console.log(`[Boundary] Provider home base: ${homeLoc.address} (${homeLoc.lat}, ${homeLoc.lng})`);
      } else {
        console.log('[Boundary] No home base found for provider');
      }
    }

    // Fetch blocked times for this date
    const blockedTimes = templateProviderId
      ? await BlockedTime.find({
          provider: templateProviderId,
          localDate: laDate.toFormat(TIME_FORMATS.ISO_DATE)
        })
      : [];

    // Generate slots from ALL availability blocks and merge
    let allSlots = [];
    for (const availability of availabilityBlocks) {
      const slots = await getAvailableTimeSlots(
        availability,
        bookings,
        clientLocation,
        isMultiSession ? sessionDurationsArray : appointmentDuration,
        bufferTime,
        null, // requestedGroupId
        0,    // extraDepartureBuffer
        providerId,
        [],   // addons
        homeBase,
        blockedTimes
      );
      allSlots = allSlots.concat(slots);
    }

    // Deduplicate by ISO string (in case blocks overlap)
    const seenTimes = new Set();
    const availableSlots = allSlots.filter(slot => {
      const key = slot.toISOString();
      if (seenTimes.has(key)) return false;
      seenTimes.add(key);
      return true;
    }).sort((a, b) => a - b);
    
    console.log(`Available slots: ${availableSlots.length} with shared validation logic`);
    
    if (availableSlots.length === 0) {
      console.log('No available slots after validation - returning empty array');
      return res.json([]);
    }
    
    // Format slots for client display
    const formattedSlots = availableSlots.map(slot => {
      return DateTime.fromJSDate(slot, { zone: 'UTC' })
        .setZone(DEFAULT_TZ)
        .toISO({ suppressMilliseconds: true });
    });
    
    console.log('Formatted slot times:', formattedSlots.join(', '));
    
    res.json(formattedSlots);
  } catch (error) {
    console.error('Error in /available/:date route:', error);
    
    // Enhanced error feedback based on error type
    let errorMessage = 'Server error';
    let statusCode = 500;
    
    if (error.message.includes('travel time calculation')) {
      errorMessage = 'Unable to calculate travel times. Please try a different location or time.';
      statusCode = 400;
    } else if (error.message.includes('Google Maps')) {
      errorMessage = 'Maps service temporarily unavailable. Please try again shortly.';
      statusCode = 503;
    } else if (error.message.includes('geocoding')) {
      errorMessage = 'Unable to process location. Please verify the address and try again.';
      statusCode = 400;
    }
    
    res.status(statusCode).json({ 
      message: errorMessage,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Create new availability
router.post('/', ensureAuthenticated, async (req, res) => {
  try {
    console.log('POST /api/availability - User:', req.user.email, 'AccountType:', req.user.accountType);
    console.log('POST /api/availability - Request body:', JSON.stringify(req.body, null, 2));
    console.log('POST /api/availability - Request body type:', typeof req.body);
    console.log('POST /api/availability - Request body keys:', Object.keys(req.body));
    console.log('POST /api/availability - Request headers:', req.headers);
    
    if (!['PROVIDER', 'ADMIN'].includes(req.user.accountType)) {
      console.log('POST /api/availability - Unauthorized account type:', req.user.accountType);
      return res.status(403).json({
        message: 'Only providers or admins can set availability'
      });
    }

    // Parse and validate input
    console.log('POST /api/availability - Raw request body:', req.body);
    
    // Ensure req.body is an object
    let availabilityData = req.body;
    
    // Handle case where req.body might be a string (stringified JSON)
    if (typeof req.body === 'string') {
      try {
        availabilityData = JSON.parse(req.body);
        console.log('POST /api/availability - Parsed string body:', availabilityData);
      } catch (error) {
        console.error('POST /api/availability - Error parsing string body:', error);
        return res.status(400).json({ message: 'Invalid JSON format' });
      }
    }
    
    // Handle form-urlencoded data
    if (req.headers['content-type'] && req.headers['content-type'].includes('application/x-www-form-urlencoded')) {
      console.log('POST /api/availability - Handling form-urlencoded data');
      // No need to do anything special, Express already parsed it into req.body
    }
    
    // Extract fields, handling both direct properties and nested properties
    let date, start, end;
    
    // Try to extract from top-level properties
    if (availabilityData.date) date = availabilityData.date;
    if (availabilityData.start) start = availabilityData.start;
    if (availabilityData.end) end = availabilityData.end;
    
    console.log('POST /api/availability - Extracted values:', { date, start, end });
    
    if (!date || !start || !end) {
      console.log('POST /api/availability - Missing required fields:', { date, start, end });
      console.log('POST /api/availability - Date type:', typeof date);
      console.log('POST /api/availability - Start type:', typeof start);
      console.log('POST /api/availability - End type:', typeof end);
      
      // Try to extract from nested properties if any field is missing
      if (availabilityData.newAvailability) {
        console.log('POST /api/availability - Trying to extract from newAvailability property');
        const nestedData = availabilityData.newAvailability;
        if (!date && nestedData.date) date = nestedData.date;
        if (!start && nestedData.start) start = nestedData.start;
        if (!end && nestedData.end) end = nestedData.end;
      }
      
      // Check again after trying nested properties
      if (!date || !start || !end) {
        return res.status(400).json({
          message: 'Missing required fields',
          details: { date, start, end }
        });
      }
    }

    // Convert and validate date
    const laDate = DateTime.fromISO(date, { zone: DEFAULT_TZ });
    if (!laDate.isValid) {
      console.log('POST /api/availability - Invalid date format:', date);
      return res.status(400).json({ message: 'Invalid date format' });
    }

    // Create start and end DateTime objects in LA timezone
    const startLA = DateTime.fromFormat(
      `${laDate.toFormat('yyyy-MM-dd')} ${start}`,
      'yyyy-MM-dd HH:mm',
      { zone: DEFAULT_TZ }
    );
    const endLA = DateTime.fromFormat(
      `${laDate.toFormat('yyyy-MM-dd')} ${end}`,
      'yyyy-MM-dd HH:mm',
      { zone: DEFAULT_TZ }
    );

    // Validate times
    if (!startLA.isValid || !endLA.isValid) {
      console.log('POST /api/availability - Invalid time format:', { startLA, endLA });
      return res.status(400).json({ message: 'Invalid time format' });
    }

    if (endLA <= startLA) {
      console.log('POST /api/availability - End time not after start time:', { startLA, endLA });
      return res.status(400).json({ message: 'End time must be after start time' });
    }

    // Check for existing availability blocks that overlap with the new one
    const existingBlocks = await Availability.find({
      provider: req.user._id,
      localDate: laDate.toFormat('yyyy-MM-dd'),
      $or: [
        // New block starts during existing block
        {
          start: { $lte: startLA.toJSDate() },
          end: { $gt: startLA.toJSDate() }
        },
        // New block ends during existing block
        {
          start: { $lt: endLA.toJSDate() },
          end: { $gte: endLA.toJSDate() }
        },
        // New block completely contains existing block
        {
          start: { $gte: startLA.toJSDate() },
          end: { $lte: endLA.toJSDate() }
        }
      ]
    });

    if (existingBlocks.length > 0) {
      console.log('POST /api/availability - Overlapping blocks found:', existingBlocks.length);
      return res.status(400).json({
        message: 'This time block overlaps with existing availability',
        conflicts: existingBlocks.map(block => ({
          id: block._id,
          start: DateTime.fromJSDate(block.start).setZone(DEFAULT_TZ).toFormat(TIME_FORMATS.TIME_12H),
          end: DateTime.fromJSDate(block.end).setZone(DEFAULT_TZ).toFormat(TIME_FORMATS.TIME_12H),
          type: block.type
        }))
      });
    }

    console.log('POST /api/availability - Creating new availability object');
    const newAvailability = new Availability({
      provider: req.user._id,
      date: laDate.toJSDate(),
      start: startLA.toJSDate(),
      end: endLA.toJSDate(),
      localDate: laDate.toFormat('yyyy-MM-dd'),
      source: 'manual'
    });

    // Set departure location (anchor) if provided
    const anchorData = availabilityData.anchor;
    if (anchorData?.locationId) {
      const loc = await SavedLocation.findById(anchorData.locationId);
      if (loc && loc.provider.equals(req.user._id)) {
        newAvailability.anchor = {
          locationId: loc._id,
          name: loc.name,
          address: loc.address,
          lat: loc.lat,
          lng: loc.lng,
        };
      }
    } else if (anchorData?.lat && anchorData?.lng) {
      newAvailability.anchor = {
        locationId: null,
        name: anchorData.name || 'Custom Location',
        address: anchorData.address || '',
        lat: anchorData.lat,
        lng: anchorData.lng,
      };
    }
    
    console.log('POST /api/availability - New availability object:', JSON.stringify(newAvailability, null, 2));

    await newAvailability.save();
    console.log('POST /api/availability - Availability saved successfully');
    res.status(201).json(newAvailability);
  } catch (error) {
    console.error('Error creating availability:', error);
    console.error('Error stack:', error.stack);
    if (error.name === 'ValidationError') {
      console.error('Mongoose validation error details:', error.errors);
    }
    res.status(500).json({ message: 'Availability creation failed', error: error.message });
  }
});

// Delete availability block
router.delete('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const availability = await Availability.findById(req.params.id);

    if (!availability) {
      return res.status(404).json({ message: 'Availability not found' });
    }

    // Verify ownership using provider reference
    if (!availability.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Convert availability times to LA timezone for checking
    const availStart = DateTime.fromJSDate(availability.start, { zone: 'UTC' })
      .setZone(DEFAULT_TZ);
    const availEnd = DateTime.fromJSDate(availability.end, { zone: 'UTC' })
      .setZone(DEFAULT_TZ);
    
    // Check for existing bookings that would be affected by deletion
    const laDate = DateTime.fromJSDate(availability.date, { zone: 'UTC' })
      .setZone(DEFAULT_TZ);
    
    const bookings = await Booking.find({
      provider: req.user._id,
      date: {
        $gte: laDate.startOf('day').toUTC().toJSDate(),
        $lt: laDate.endOf('day').toUTC().toJSDate()
      },
      status: { $nin: ['cancelled'] }
    }).populate('client', 'name email');

    // Check if any bookings fall within this availability block
    const affectedBookings = bookings.filter(booking => {
      // Parse booking times
      const bookingStart = DateTime.fromFormat(
        `${laDate.toFormat('yyyy-MM-dd')} ${booking.startTime}`,
        'yyyy-MM-dd HH:mm',
        { zone: DEFAULT_TZ }
      );
      const bookingEnd = DateTime.fromFormat(
        `${laDate.toFormat('yyyy-MM-dd')} ${booking.endTime}`,
        'yyyy-MM-dd HH:mm',
        { zone: DEFAULT_TZ }
      );
      
      // Check if booking overlaps with the availability being deleted
      return (bookingStart >= availStart && bookingEnd <= availEnd);
    });

    if (affectedBookings.length > 0) {
      console.log(`Cannot delete availability - ${affectedBookings.length} bookings would be affected`);
      return res.status(400).json({
        message: 'Cannot delete this availability block as it contains existing bookings',
        conflicts: affectedBookings.map(booking => ({
          id: booking._id,
          time: `${booking.startTime} - ${booking.endTime}`,
          startTime: booking.startTime,
          endTime: booking.endTime,
          client: booking.client ? booking.client.name || booking.recipientInfo?.name || 'Client' : 'Client',
          clientEmail: booking.client ? booking.client.email : booking.recipientInfo?.email,
          status: booking.status
        }))
      });
    }

    // Safe to delete - no bookings affected
    const deletedStart = availability.start;
    const deletedEnd = availability.end;
    const deletedLocalDate = availability.localDate;
    await availability.remove();
    console.log(`Availability block ${req.params.id} deleted successfully`);

    // Un-override Google Calendar blocks that are no longer covered by any remaining availability
    const overriddenBlocks = await BlockedTime.find({
      provider: req.user._id,
      localDate: deletedLocalDate,
      source: 'google_calendar',
      overridden: true,
      start: { $lt: deletedEnd },
      end: { $gt: deletedStart }
    });

    if (overriddenBlocks.length > 0) {
      const remainingAvailability = await Availability.find({
        provider: req.user._id,
        localDate: deletedLocalDate
      });

      for (const bt of overriddenBlocks) {
        const stillCovered = remainingAvailability.some(
          a => a.start < bt.end && a.end > bt.start
        );
        if (!stillCovered) {
          bt.overridden = false;
          await bt.save();
          console.log(`Un-overrode BlockedTime ${bt._id} (no remaining availability covers it)`);
        }
      }
    }

    res.json({ message: 'Availability removed successfully' });
  } catch (error) {
    console.error('Error deleting availability:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update availability block
router.put('/:id', ensureAuthenticated, async (req, res) => {
  try {
    console.log('PUT /api/availability/:id - Request body:', req.body);
    
    // Find the availability block
    const availability = await Availability.findById(req.params.id);

    if (!availability) {
      return res.status(404).json({ message: 'Availability not found' });
    }

    // Verify ownership
    if (!availability.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Extract and validate the updated data
    const { start, end } = req.body;
    
    if (!start || !end) {
      return res.status(400).json({ message: 'Start and end times are required' });
    }

    // Create DateTime objects in LA timezone
    const laDate = DateTime.fromJSDate(availability.date, { zone: 'UTC' })
      .setZone(DEFAULT_TZ);
    
    const startLA = DateTime.fromFormat(
      `${laDate.toFormat('yyyy-MM-dd')} ${start}`,
      'yyyy-MM-dd HH:mm',
      { zone: DEFAULT_TZ }
    );
    
    const endLA = DateTime.fromFormat(
      `${laDate.toFormat('yyyy-MM-dd')} ${end}`,
      'yyyy-MM-dd HH:mm',
      { zone: DEFAULT_TZ }
    );

    // Validate times
    if (!startLA.isValid || !endLA.isValid) {
      return res.status(400).json({ message: 'Invalid time format' });
    }

    if (endLA <= startLA) {
      return res.status(400).json({ message: 'End time must be after start time' });
    }

    // Check for existing bookings that would conflict with the updated
    // availability. Two bugs were lurking here:
    //   1. The query had no provider filter, so it would scan every other
    //      provider's bookings on this date — false positives in a multi-
    //      provider deployment.
    //   2. The conflict filter passed booking.startTime / endTime (which
    //      are "HH:mm" strings per the Booking schema) into
    //      DateTime.fromJSDate, which silently produced invalid DateTimes
    //      so the comparisons always evaluated false. The conflict
    //      detection has effectively never worked.
    const bookings = await Booking.find({
      provider: req.user._id,
      date: {
        $gte: laDate.startOf('day').toUTC().toJSDate(),
        $lt: laDate.endOf('day').toUTC().toJSDate()
      },
      status: { $nin: ['cancelled'] }
    }).populate('client', 'profile.fullName email');

    const dateStr = laDate.toFormat('yyyy-MM-dd');
    const conflicts = bookings.filter(booking => {
      const bookingStart = DateTime.fromFormat(
        `${dateStr} ${booking.startTime}`,
        'yyyy-MM-dd HH:mm',
        { zone: DEFAULT_TZ }
      );
      const bookingEnd = DateTime.fromFormat(
        `${dateStr} ${booking.endTime}`,
        'yyyy-MM-dd HH:mm',
        { zone: DEFAULT_TZ }
      );
      // Conflict when the new window doesn't fully contain the booking.
      return bookingStart < startLA || bookingEnd > endLA;
    });

    if (conflicts.length > 0) {
      return res.status(400).json({
        message: 'This modification would orphan existing bookings',
        conflicts: conflicts.map(booking => ({
          id: booking._id,
          time: `${booking.startTime} - ${booking.endTime}`,
          startTime: booking.startTime,
          endTime: booking.endTime,
          client: booking.client?.profile?.fullName || booking.client?.email || 'Client'
        }))
      });
    }

    // Check for overlapping with other availability blocks
    const existingBlocks = await Availability.find({
      provider: req.user._id,
      localDate: laDate.toFormat('yyyy-MM-dd'),
      _id: { $ne: req.params.id }, // Exclude the current block
      $or: [
        // New block starts during existing block
        {
          start: { $lte: startLA.toJSDate() },
          end: { $gt: startLA.toJSDate() }
        },
        // New block ends during existing block
        {
          start: { $lt: endLA.toJSDate() },
          end: { $gte: endLA.toJSDate() }
        },
        // New block completely contains existing block
        {
          start: { $gte: startLA.toJSDate() },
          end: { $lte: endLA.toJSDate() }
        }
      ]
    });

    if (existingBlocks.length > 0) {
      return res.status(400).json({
        message: 'This time block overlaps with existing availability',
        conflicts: existingBlocks.map(block => ({
          id: block._id,
          start: DateTime.fromJSDate(block.start)
            .setZone(DEFAULT_TZ)
            .toFormat(TIME_FORMATS.TIME_12H),
          end: DateTime.fromJSDate(block.end)
            .setZone(DEFAULT_TZ)
            .toFormat(TIME_FORMATS.TIME_12H),
          type: block.type
        }))
      });
    }

    // Update the availability block
    availability.start = startLA.toUTC().toJSDate();
    availability.end = endLA.toUTC().toJSDate();

    // Save the updated block (this will trigger the pre-save middleware)
    await availability.save();

    res.json(availability);
  } catch (error) {
    console.error('Error updating availability:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PATCH /:id/anchor (Update departure location for a day)
router.patch('/:id/anchor', ensureAuthenticated, async (req, res) => {
  try {
    const availability = await Availability.findById(req.params.id);

    if (!availability) {
      return res.status(404).json({ message: 'Availability not found' });
    }

    if (!availability.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { locationId, name, address, lat, lng } = req.body;

    if (locationId) {
      // Using a saved location
      const loc = await SavedLocation.findById(locationId);
      if (!loc || !loc.provider.equals(req.user._id)) {
        return res.status(404).json({ message: 'Location not found' });
      }
      availability.anchor = {
        locationId: loc._id,
        name: loc.name,
        address: loc.address,
        lat: loc.lat,
        lng: loc.lng,
      };
    } else if (lat && lng) {
      // Using a pin drop / manual coordinates
      availability.anchor = {
        locationId: null,
        name: name || 'Custom Location',
        address: address || '',
        lat,
        lng,
      };
    } else {
      // Clear anchor — revert to home base
      availability.anchor = undefined;
    }

    await availability.save();
    res.json(availability);
  } catch (error) {
    console.error('Error updating availability anchor:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
