const express = require('express');
const router = express.Router();
const { DateTime } = require('luxon');
const WeeklyTemplate = require('../models/WeeklyTemplate');
const SavedLocation = require('../models/SavedLocation');
const Availability = require('../models/Availability');
const { DEFAULT_TZ, TIME_FORMATS } = require('../../src/utils/timeConstants');
const { ensureAuthenticated } = require('../middleware/passportMiddleware');

// Get all template entries for the logged-in provider
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Only providers can manage templates' });
    }

    const templates = await WeeklyTemplate.find({ provider: req.user._id })
      .populate('staticLocation', 'name address lat lng staticConfig isStaticLocation')
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

      // Static-mode wiring. When kind=static, the day's whole window is
      // a fixed-location commitment; staticLocation must reference a
      // valid StaticLocation owned by the provider (the booking flow
      // populates it when computing slots).
      const incomingKind = day.kind === 'static' ? 'static' : 'mobile';
      update.kind = incomingKind;
      update.staticLocation = incomingKind === 'static' && day.staticLocation
        ? day.staticLocation
        : null;

      // Anchor was removed — explicitly $unset on every save so any
      // legacy row carrying the field gets cleaned up on next write
      // even if the migration script wasn't run.
      return {
        updateOne: {
          filter: { provider: req.user._id, dayOfWeek: day.dayOfWeek },
          update: { $set: update, $unset: { anchor: '' } },
          upsert: true
        }
      };
    });

    await WeeklyTemplate.bulkWrite(operations);

    // Invalidate already-generated Availability rows for today + future
    // so they regenerate from the new template on next view. Without
    // this, the day-generator's "if exists, skip" guard makes new
    // template hours invisible on dates the user/server has already
    // touched. Past dates are left alone (historical record); manual
    // edits (source: 'manual') survive — only template-sourced rows
    // are blown away.
    //
    // "Today" is the provider's local today — a Chicago provider's
    // "today" boundary is Chicago midnight, not always-LA midnight.
    const { tzForProviderId } = require('../utils/providerTz');
    const providerTz = await tzForProviderId(req.user._id);
    const todayLA = DateTime.now().setZone(providerTz).toFormat(TIME_FORMATS.ISO_DATE);
    await Availability.deleteMany({
      provider: req.user._id,
      source: 'template',
      localDate: { $gte: todayLA },
    });

    const updated = await WeeklyTemplate.find({ provider: req.user._id })
      .sort({ dayOfWeek: 1 });

    res.json(updated);
  } catch (error) {
    console.error('Error updating weekly template:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
