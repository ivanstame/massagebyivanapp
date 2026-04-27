const express = require('express');
const router = express.Router();
const BlockedTime = require('../models/BlockedTime');
const Booking = require('../models/Booking');
const { ensureAuthenticated } = require('../middleware/passportMiddleware');
const { DateTime } = require('luxon');
const { DEFAULT_TZ } = require('../../src/utils/timeConstants');

// POST / — Create a blocked time
//
// Blocks live INDEPENDENTLY of availability — they're a "do not book me"
// signal that suppresses slots wherever it lands, whether or not the
// provider has set availability on that day. This matches how Google
// Calendar–synced blocks already work and means a provider can mark a day
// off (or part of a day) without first having to declare working hours.
//
// Modes:
//   - allDay: true               — midnight-to-midnight LA on `date`
//   - explicit start/end (HH:mm) — within a single LA day
//
// Optional `reason` is a short human-readable note shown in the day view.
router.post('/', ensureAuthenticated, async (req, res) => {
  try {
    if (!['PROVIDER', 'ADMIN'].includes(req.user.accountType)) {
      return res.status(403).json({ message: 'Only providers can block off time' });
    }

    const { date, start, end, allDay, reason } = req.body;
    if (!date) {
      return res.status(400).json({ message: 'date is required' });
    }

    let startLA, endLA;
    if (allDay) {
      // Midnight to one minute before next midnight, both in LA. Clean
      // single-day boundary that won't accidentally bleed into the
      // adjacent day's slot pool.
      startLA = DateTime.fromFormat(`${date} 00:00`, 'yyyy-MM-dd HH:mm', { zone: DEFAULT_TZ });
      endLA = DateTime.fromFormat(`${date} 23:59`, 'yyyy-MM-dd HH:mm', { zone: DEFAULT_TZ });
    } else {
      if (!start || !end) {
        return res.status(400).json({ message: 'start and end are required when not allDay' });
      }
      startLA = DateTime.fromFormat(`${date} ${start}`, 'yyyy-MM-dd HH:mm', { zone: DEFAULT_TZ });
      endLA = DateTime.fromFormat(`${date} ${end}`, 'yyyy-MM-dd HH:mm', { zone: DEFAULT_TZ });
    }

    if (!startLA.isValid || !endLA.isValid) {
      return res.status(400).json({ message: 'Invalid date or time format' });
    }
    if (endLA <= startLA) {
      return res.status(400).json({ message: 'End time must be after start time' });
    }

    const startUTC = startLA.toUTC().toJSDate();
    const endUTC = endLA.toUTC().toJSDate();
    const providerId = req.user._id;

    // Bookings that already exist still take precedence — refuse to block
    // a time the provider has already promised to a client.
    const overlappingBooking = await Booking.findOne({
      provider: providerId,
      localDate: date,
      status: { $nin: ['cancelled', 'completed'] },
      startTime: { $lt: endLA.toFormat('HH:mm') },
      endTime: { $gt: startLA.toFormat('HH:mm') }
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

    // Two manual blocks shouldn't overlap on the same day — collapse them
    // into one or reject. We reject so the provider sees the conflict
    // explicitly rather than having state silently merged.
    const overlappingManual = await BlockedTime.findOne({
      provider: providerId,
      localDate: date,
      source: 'manual',
      start: { $lt: endUTC },
      end: { $gt: startUTC }
    });
    if (overlappingManual) {
      return res.status(400).json({
        message: 'This time range overlaps with an existing blocked time'
      });
    }

    const blockedTime = new BlockedTime({
      provider: providerId,
      start: startUTC,
      end: endUTC,
      allDay: !!allDay,
      reason: reason ? String(reason).trim().slice(0, 200) : ''
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

// PUT /:id/override — Toggle override on a Google Calendar blocked time
router.put('/:id/override', ensureAuthenticated, async (req, res) => {
  try {
    const { overridden } = req.body;
    if (typeof overridden !== 'boolean') {
      return res.status(400).json({ message: 'overridden must be a boolean' });
    }

    const blockedTime = await BlockedTime.findById(req.params.id);
    if (!blockedTime) {
      return res.status(404).json({ message: 'Blocked time not found' });
    }
    if (!blockedTime.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (blockedTime.source !== 'google_calendar') {
      return res.status(400).json({ message: 'Override only applies to Google Calendar blocks' });
    }

    blockedTime.overridden = overridden;
    await blockedTime.save();
    res.json(blockedTime);
  } catch (error) {
    console.error('Error updating override:', error);
    res.status(500).json({ message: 'Failed to update override' });
  }
});

module.exports = router;
