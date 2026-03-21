const express = require('express');
const router = express.Router();
const WeeklyTemplate = require('../models/WeeklyTemplate');
const { ensureAuthenticated } = require('../middleware/passportMiddleware');

// Get all template entries for the logged-in provider
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Only providers can manage templates' });
    }

    const templates = await WeeklyTemplate.find({ provider: req.user._id })
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
    const operations = days.map(day => ({
      updateOne: {
        filter: { provider: req.user._id, dayOfWeek: day.dayOfWeek },
        update: {
          $set: {
            provider: req.user._id,
            dayOfWeek: day.dayOfWeek,
            startTime: day.startTime || '09:00',
            endTime: day.endTime || '17:00',
            isActive: day.isActive !== undefined ? day.isActive : false
          }
        },
        upsert: true
      }
    }));

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
