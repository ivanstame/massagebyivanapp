// middleware/validation.js
const { DateTime } = require('luxon');
const { DEFAULT_TZ, TIME_FORMATS } = require('../../src/utils/timeConstants');
const LuxonService = require('../../src/utils/LuxonService');

const validateTimeFormat = (timeStr) => {
  return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeStr);
};

// Best-effort TZ for synchronous middleware. For provider-owned resources
// (the user is creating their own availability, etc.) prefer their TZ;
// otherwise fall back to DEFAULT_TZ. Routes downstream still resolve the
// authoritative TZ asynchronously when persisting.
const tzFromReq = (req) =>
  req?.user?.providerProfile?.timezone || DEFAULT_TZ;

const validateBookingInput = (req, res, next) => {
  try {
    const { date, time, duration, location } = req.body;
    const errors = [];

    const reqTz = tzFromReq(req);
    // Validate date format
    const bookingDate = DateTime.fromISO(date, { zone: reqTz });
    if (!bookingDate.isValid) {
      errors.push('Invalid date format. Use YYYY-MM-DD');
    }

    // Validate time format
    if (!validateTimeFormat(time)) {
      errors.push('Invalid time format. Use HH:MM (24-hour format)');
    }

    // Validate duration
    if (!duration || duration < 30 || duration > 180) {
      errors.push('Duration must be between 30 and 180 minutes');
    }

    // For multi-session bookings
    if (req.body.groupId) {
      const { sessionDurations } = req.body;
      if (!Array.isArray(sessionDurations) || sessionDurations.length === 0) {
        errors.push('Session durations must be provided for multi-session booking');
      } else {
        // Validate each session duration
        sessionDurations.forEach((dur, index) => {
          if (!dur || dur < 30 || dur > 180) {
            errors.push(`Invalid duration for session ${index + 1}`);
          }
        });

        // Check for DST transitions in multi-session blocks
        const startDT = DateTime.fromFormat(`${date} ${time}`, 'yyyy-MM-dd HH:mm', { zone: reqTz });
        const totalDuration = sessionDurations.reduce((sum, dur) => sum + dur, 0);
        const endDT = startDT.plus({ minutes: totalDuration });

        if (LuxonService.checkDSTTransition(startDT.toISO(), endDT.toISO())) {
          errors.push('Multi-session booking cannot span DST transition');
        }
      }
    }

    // Validate location
    if (!location || !location.lat || !location.lng || !location.address) {
      errors.push('Complete location information is required');
    } else {
      if (location.lat < -90 || location.lat > 90) {
        errors.push('Invalid latitude');
      }
      if (location.lng < -180 || location.lng > 180) {
        errors.push('Invalid longitude');
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors: errors
      });
    }

    // Add validated and parsed date/time to request
    req.bookingDateTime = DateTime.fromFormat(`${date} ${time}`, 'yyyy-MM-dd HH:mm', { zone: reqTz });
    next();
  } catch (error) {
    console.error('Validation error:', error);
    res.status(400).json({
      success: false,
      errors: ['Invalid booking data']
    });
  }
};

const validateAvailabilityInput = (req, res, next) => {
  try {
    console.log('validateAvailabilityInput - Method:', req.method);
    console.log('validateAvailabilityInput - Body:', JSON.stringify(req.body, null, 2));
    console.log('validateAvailabilityInput - Params:', JSON.stringify(req.params, null, 2));

    const reqTz = tzFromReq(req);

    if (req.method === 'GET') {
      const { date } = req.params;
      const availabilityDate = DateTime.fromISO(date, { zone: reqTz });
      if (!availabilityDate.isValid) {
        console.log('validateAvailabilityInput - Invalid date format for GET:', date);
        return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD' });
      }
      req.availabilityDate = availabilityDate;
      return next();
    }
    
    // Handle case where req.body might be a string (stringified JSON)
    let availabilityData = req.body;
    if (typeof req.body === 'string') {
      try {
        availabilityData = JSON.parse(req.body);
        console.log('validateAvailabilityInput - Parsed string body:', availabilityData);
        // Update req.body to use the parsed object for downstream handlers
        req.body = availabilityData;
      } catch (error) {
        console.error('validateAvailabilityInput - Error parsing string body:', error);
        return res.status(400).json({ message: 'Invalid JSON format' });
      }
    }
    
    const { date, start, end } = availabilityData;
    console.log('validateAvailabilityInput - Extracted values:', { date, start, end });
    
    const errors = [];
    // Validate required fields are present
    if (!date) errors.push('Date is required');
    if (!start) errors.push('Start time is required');
    if (!end) errors.push('End time is required');
    
    // If any required fields are missing, return early
    if (errors.length > 0) {
      console.log('validateAvailabilityInput - Missing required fields:', errors);
      return res.status(400).json({
        success: false,
        errors: errors
      });
    }
    
    // Validate date format
    const availabilityDate = DateTime.fromISO(date, { zone: reqTz });
    if (!availabilityDate.isValid) {
      console.log('validateAvailabilityInput - Invalid date format:', date);
      errors.push('Invalid date format. Use YYYY-MM-DD');
    }
    // Validate time formats
    if (!validateTimeFormat(start)) {
      console.log('validateAvailabilityInput - Invalid start time format:', start);
      errors.push('Invalid start time format. Use HH:MM');
    }
    if (!validateTimeFormat(end)) {
      console.log('validateAvailabilityInput - Invalid end time format:', end);
      errors.push('Invalid end time format. Use HH:MM');
    }
    // Validate times are in the same day
    if (start && end && date && validateTimeFormat(start) && validateTimeFormat(end)) {
      const startDT = DateTime.fromFormat(`${date} ${start}`, 'yyyy-MM-dd HH:mm', { zone: reqTz });
      const endDT = DateTime.fromFormat(`${date} ${end}`, 'yyyy-MM-dd HH:mm', { zone: reqTz });
      if (!startDT.isValid || !endDT.isValid) {
        console.log('validateAvailabilityInput - Invalid datetime combination:', { date, start, end });
        errors.push('Invalid date/time combination');
      } else {
        if (!startDT.hasSame(endDT, 'day')) {
          console.log('validateAvailabilityInput - Times not in same day:', { startDT, endDT });
          errors.push('Start and end times must be within the same day');
        }
        if (endDT <= startDT) {
          console.log('validateAvailabilityInput - End time not after start time:', { startDT, endDT });
          errors.push('End time must be after start time');
        }
      }
    }
    
    if (errors.length > 0) {
      console.log('validateAvailabilityInput - Validation errors:', errors);
      return res.status(400).json({
        success: false,
        errors: errors
      });
    }
    
    // Add validated date to request
    req.availabilityDate = availabilityDate;
    console.log('validateAvailabilityInput - Validation successful');
    next();
  } catch (error) {
    console.error('Validation error:', error);
    console.error('Validation error stack:', error.stack);
    console.error('Request body:', req.body);
    res.status(400).json({
      success: false,
      errors: ['Invalid availability data'],
      details: error.message
    });
  }
};

module.exports = {
  validateBookingInput,
  validateAvailabilityInput
};
