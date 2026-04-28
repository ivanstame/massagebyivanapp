const express = require('express');
const router = express.Router();
const WeeklyTemplate = require('../models/WeeklyTemplate');
const SavedLocation = require('../models/SavedLocation');
const { ensureAuthenticated } = require('../middleware/passportMiddleware');

// Get all template entries for the logged-in provider (with anchor location populated)
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Only providers can manage templates' });
    }

    const templates = await WeeklyTemplate.find({ provider: req.user._id })
      .populate('anchor.locationId', 'name address lat lng')
      .populate('staticLocation', 'name address lat lng bufferMinutes')
      .sort({ dayOfWeek: 1 });

    res.json(templates);
  } catch (error) {
    console.error('Error fetching weekly templates:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Set/update the full weekly template (bulk upsert)
// Expects body: { days: [{ dayOfWeek, startTime, endTime, isActive }] }
router.put('/', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Only providers can manage templates' });
    }

    const { days } = req.body;
    if (!Array.isArray(days)) {
      return res.status(400).json({ message: 'days must be an array' });
    }

    // Validate each entry
    for (const day of days) {
      if (day.dayOfWeek < 0 || day.dayOfWeek > 6) {
        return res.status(400).json({ message: `Invalid dayOfWeek: ${day.dayOfWeek}` });
      }
      if (day.isActive && (!day.startTime || !day.endTime)) {
        return res.status(400).json({
          message: `Active days require startTime and endTime (day ${day.dayOfWeek})`
        });
      }
      if (day.isActive && day.endTime <= day.startTime) {
        return res.status(400).json({
          message: `End time must be after start time (day ${day.dayOfWeek})`
        });
      }
    }

    // Upsert each day
    const operations = days.map(day => {
      const update = {
        provider: req.user._id,
        dayOfWeek: day.dayOfWeek,
        startTime: day.startTime || '09:00',
        endTime: day.endTime || '17:00',
        isActive: day.isActive !== undefined ? day.isActive : false
      };

      // Include anchor data if provided
      if (day.anchor && day.anchor.locationId) {
        update.anchor = {
          locationId: day.anchor.locationId,
          startTime: day.anchor.startTime || day.startTime || '09:00',
          endTime: day.anchor.endTime || day.endTime || '17:00'
        };
      } else {
        update.anchor = { locationId: null, startTime: null, endTime: null };
      }

      // Static-mode wiring. When kind=static, the day's whole window is
      // a fixed-location commitment; staticLocation must reference a
      // valid StaticLocation owned by the provider (the booking flow
      // populates it when computing slots).
      const incomingKind = day.kind === 'static' ? 'static' : 'mobile';
      update.kind = incomingKind;
      update.staticLocation = incomingKind === 'static' && day.staticLocation
        ? day.staticLocation
        : null;

      return {
        updateOne: {
          filter: { provider: req.user._id, dayOfWeek: day.dayOfWeek },
          update: { $set: update },
          upsert: true
        }
      };
    });

    await WeeklyTemplate.bulkWrite(operations);

    const updated = await WeeklyTemplate.find({ provider: req.user._id })
      .sort({ dayOfWeek: 1 });

    res.json(updated);
  } catch (error) {
    console.error('Error updating weekly template:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
