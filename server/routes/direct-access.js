// server/routes/direct-access.js
// This file provides direct database access routes for workarounds

const express = require('express');
const router = express.Router();
const { ensureAuthenticated, ensureProviderOrAdmin } = require('../middleware/passportMiddleware');
const Availability = require('../models/Availability');
const { DateTime } = require('luxon');
const { DEFAULT_TZ } = require('../../src/utils/timeConstants');
const { tzForProviderId } = require('../utils/providerTz');

// Route to directly add availability
router.post('/add-availability-direct', ensureAuthenticated, ensureProviderOrAdmin, async (req, res) => {
  try {
    console.log('Direct access - Adding availability');
    console.log('User:', req.user.email, 'AccountType:', req.user.accountType);
    
    // Parse the availability data
    let availabilityData;
    try {
      availabilityData = JSON.parse(req.body.availabilityData);
    } catch (error) {
      console.error('Error parsing availability data:', error);
      return res.status(400).json({ message: 'Invalid availability data format' });
    }
    
    console.log('Availability data:', availabilityData);
    
    const { date, start, end, type } = availabilityData;
    
    if (!date || !start || !end || !type) {
      console.log('Missing required fields:', { date, start, end, type });
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
    // Resolve the provider's TZ — this route is provider-only, so the
    // start/end strings are wall-clock in the provider's local zone.
    const providerTz = await tzForProviderId(req.user._id);

    // Convert and validate date
    const laDate = DateTime.fromISO(date, { zone: providerTz });
    if (!laDate.isValid) {
      console.log('Invalid date format:', date);
      return res.status(400).json({ message: 'Invalid date format' });
    }

    // Create start and end DateTime objects in provider's zone
    const startLA = DateTime.fromFormat(
      `${laDate.toFormat('yyyy-MM-dd')} ${start}`,
      'yyyy-MM-dd HH:mm',
      { zone: providerTz }
    );
    const endLA = DateTime.fromFormat(
      `${laDate.toFormat('yyyy-MM-dd')} ${end}`,
      'yyyy-MM-dd HH:mm',
      { zone: providerTz }
    );
    
    // Validate times
    if (!startLA.isValid || !endLA.isValid) {
      console.log('Invalid time format:', { startLA, endLA });
      return res.status(400).json({ message: 'Invalid time format' });
    }
    
    if (endLA <= startLA) {
      console.log('End time not after start time:', { startLA, endLA });
      return res.status(400).json({ message: 'End time must be after start time' });
    }
    
    // Create the availability object
    const newAvailability = new Availability({
      provider: req.user._id,
      date: laDate.toJSDate(),
      start: startLA.toJSDate(),
      end: endLA.toJSDate(),
      type,
      localDate: laDate.toFormat('yyyy-MM-dd'),
      timezone: providerTz,
    });
    
    // Save to database
    await newAvailability.save();
    console.log('Availability created successfully');
    
    // Return success
    res.status(201).json({
      message: 'Availability created successfully',
      availability: newAvailability
    });
  } catch (error) {
    console.error('Error creating availability:', error);
    console.error('Error stack:', error.stack);
    if (error.name === 'ValidationError') {
      console.error('Mongoose validation error details:', error.errors);
    }
    res.status(500).json({ message: 'Availability creation failed', error: error.message });
  }
});

module.exports = router;