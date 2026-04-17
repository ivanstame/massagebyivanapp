const express = require('express');
const router = express.Router();
const BlockedTime = require('../models/BlockedTime');
const Availability = require('../models/Availability');
const Booking = require('../models/Booking');
const { ensureAuthenticated } = require('../middleware/passportMiddleware');
const { DateTime } = require('luxon');
const { DEFAULT_TZ, TIME_FORMATS } = require('../../src/utils/timeConstants');

// POST / — Create a blocked time
router.post('/', ensureAuthenticated, async (req, res) => {
  try {
    if (!['PROVIDER', 'ADMIN'].includes(req.user.accountType)) {
      return res.status(403).json({ message: 'Only providers can block off time' });
    }

    const { date, start, end } = req.body;
    if (!date || !start || !end) {
      return res.status(400).json({ message: 'date, start, and end are required' });
    }

    // Parse times in LA timezone
    const startLA = DateTime.fromFormat(`${date} ${start}`, 'yyyy-MM-dd HH:mm', { zone: DEFAULT_TZ });
    const endLA = DateTime.fromFormat(`${date} ${end}`, 'yyyy-MM-dd HH:mm', { zone: DEFAULT_TZ });

    if (!startLA.isValid || !endLA.isValid) {
      return res.status(400).json({ message: 'Invalid date or time format' });
    }

    if (endLA <= startLA) {
      return res.status(400).json({ message: 'End time must be after start time' });
    }

    const startUTC = startLA.toUTC().toJSDate();
    const endUTC = endLA.toUTC().toJSDate();
    const providerId = req.user._id;

    // Validate block falls within an existing availability block
    const containingAvailability = await Availability.findOne({
      provider: providerId,
      localDate: date,
      start: { $lte: startUTC },
      end: { $gte: endUTC }
    });

    if (!containingAvailability) {
      return res.status(400).json({
        message: 'Blocked time must fall within an existing availability block'
      });
    }

    // Check for overlapping bookings
    const overlappingBooking = await Booking.findOne({
      provider: providerId,
      status: { $nin: ['cancelled', 'completed'] },
      startTime: { $lt: endUTC },
      endTime: { $gt: startUTC }
    });

    if (overlappingBooking) {
      return res.status(400).json({
        message: 'Cannot block time that overlaps with an existing booking',
        conflicts: [{
          id: overlappingBooking._id,
          startTime: overlappingBooking.startTime,
          endTime: overlappingBooking.endTime
        }]
      });
    }

    // Check for overlapping blocked times
    const overlappingBlock = await BlockedTime.findOne({
      provider: providerId,
      localDate: date,
      start: { $lt: endUTC },
      end: { $gt: startUTC }
    });

    if (overlappingBlock) {
      return res.status(400).json({
        message: 'This time range overlaps with an existing blocked time'
      });
    }

    const blockedTime = new BlockedTime({
      provider: providerId,
      start: startUTC,
      end: endUTC
    });

    await blockedTime.save();
    res.status(201).json(blockedTime);
  } catch (error) {
    console.error('Error creating blocked time:', error);
    res.status(500).json({ message: 'Failed to create blocked time' });
  }
});

// GET /:date — List blocked times for a date
router.get('/:date', ensureAuthenticated, async (req, res) => {
  try {
    const blockedTimes = await BlockedTime.find({
      provider: req.user._id,
      localDate: req.params.date
    }).sort({ start: 1 });

    res.json(blockedTimes);
  } catch (error) {
    console.error('Error fetching blocked times:', error);
    res.status(500).json({ message: 'Failed to fetch blocked times' });
  }
});

// DELETE /:id — Delete a blocked time
router.delete('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const blockedTime = await BlockedTime.findById(req.params.id);

    if (!blockedTime) {
      return res.status(404).json({ message: 'Blocked time not found' });
    }

    if (!blockedTime.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (blockedTime.source === 'google_calendar') {
      return res.status(400).json({
        message: 'Google Calendar synced blocks cannot be deleted manually. Update your Google Calendar or disconnect to remove them.'
      });
    }

    await blockedTime.deleteOne();
    res.json({ message: 'Blocked time removed' });
  } catch (error) {
    console.error('Error deleting blocked time:', error);
    res.status(500).json({ message: 'Failed to delete blocked time' });
  }
});

module.exports = router;
