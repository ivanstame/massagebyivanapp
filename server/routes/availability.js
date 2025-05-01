// routes/availability.js
// const express = require('express');
// const router = express.Router();
// const Availability = require('../models/Availability');
// const Booking = require('../models/Booking');
// const { ensureAuthenticated } = require('../middleware/passportMiddleware');
// const { validateAvailabilityInput } = require('../middleware/validation');
// const { DateTime } = require('luxon');
// const { DEFAULT_TZ, TIME_FORMATS } = require('../utils/timeConstants');
// const LuxonService = require('../utils/LuxonService');
const express = require('express');
const router = express.Router();
const Availability = require('../models/Availability');
const Booking = require('../models/Booking');
const { ensureAuthenticated } = require('../middleware/passportMiddleware');
const { validateAvailabilityInput } = require('../middleware/validation');
const { DateTime } = require('luxon');
const { DEFAULT_TZ, TIME_FORMATS } = require('../../src/utils/timeConstants');
const LuxonService = require('../../src/utils/LuxonService');

// Get availability blocks for a specific date
router.get('/blocks/:date', ensureAuthenticated, async (req, res) => {
  try {
    const providerId = req.user._id;
    const laDate = DateTime.fromISO(req.params.date, { zone: DEFAULT_TZ });

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

    const availabilityBlocks = await Availability.find({
      date: {
        $gte: startDate.toUTC().toJSDate(),
        $lte: endDate.toUTC().toJSDate()
      }
    }).sort({ date: 1 });

    res.json(availabilityBlocks);
  } catch (error) {
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
      date: laDate.toFormat(TIME_FORMATS.ISO_DATE)
    });

    // Find availability block for the day
    const availability = await Availability.findOne({ 
      date: {
        $gte: startOfDay.toUTC().toJSDate(),
        $lt: endOfDay.toUTC().toJSDate()
      }
    });

    if (!availability) {
      console.log(`No availability blocks found for date: ${laDate.toFormat(TIME_FORMATS.ISO_DATE)}`);
      return res.status(200).json([]);  // Return empty array instead of 404 error
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

    console.log('Availability Found:', {
      date: laDate.toFormat(TIME_FORMATS.ISO_DATE),
      start: DateTime.fromJSDate(availability.start).setZone(DEFAULT_TZ).toFormat(TIME_FORMATS.TIME_24H),
      end: DateTime.fromJSDate(availability.end).setZone(DEFAULT_TZ).toFormat(TIME_FORMATS.TIME_24H),
      appointmentDuration,
      sessionDurations: req.query.sessionDurations || 'none'
    });

    // Import the same validation function used by the booking endpoint
    const { getAvailableTimeSlots } = require('../utils/timeUtils');
    
    // Generate available slots using the same method as booking validation
    const providerId = req.query.providerId;
    const sessionDurationsArray = isMultiSession && req.query.sessionDurations ?
      JSON.parse(req.query.sessionDurations) :
      [appointmentDuration];
    
    // Parse add-ons if provided
    let addons = [];
    if (req.query.addons) {
      try {
        addons = JSON.parse(req.query.addons);
        console.log('Parsed add-ons:', addons);
      } catch (err) {
        console.error('Error parsing add-ons:', err);
        // Continue without add-ons if parsing fails
      }
    }
    
    // Get available slots using the shared validation function
    const availableSlots = await getAvailableTimeSlots(
      availability,
      bookings,
      clientLocation,
      isMultiSession ? sessionDurationsArray : appointmentDuration,
      bufferTime,
      null, // requestedGroupId
      0,    // extraDepartureBuffer
      providerId,
      addons // Pass add-ons to the function
    );
    
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
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message
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
      localDate: laDate.toFormat('yyyy-MM-dd')
    });
    
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

    await availability.remove();
    res.json({ message: 'Availability removed' });
  } catch (error) {
    console.error('Error deleting availability:', error);
    res.status(500).json({ message: 'Server error' });
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

    // Check for existing bookings that would conflict with the updated availability
    const bookings = await Booking.find({
      date: {
        $gte: laDate.startOf('day').toUTC().toJSDate(),
        $lt: laDate.endOf('day').toUTC().toJSDate()
      }
    });

    // Check for conflicts with existing bookings
    const conflicts = bookings.filter(booking => {
      const bookingStart = DateTime.fromJSDate(booking.startTime, { zone: 'UTC' })
        .setZone(DEFAULT_TZ);
      const bookingEnd = DateTime.fromJSDate(booking.endTime, { zone: 'UTC' })
        .setZone(DEFAULT_TZ);
      
      // If the booking starts before the new end time and ends after the new start time,
      // there's a conflict
      return (bookingStart < endLA && bookingEnd > startLA);
    });

    if (conflicts.length > 0) {
      return res.status(400).json({
        message: 'This modification conflicts with existing bookings',
        conflicts: conflicts.map(booking => ({
          id: booking._id,
          time: DateTime.fromJSDate(booking.startTime)
            .setZone(DEFAULT_TZ)
            .toFormat(TIME_FORMATS.TIME_12H),
          client: booking.clientName || 'Client'
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

module.exports = router;
