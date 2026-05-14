const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/passportMiddleware');
const ExternalCalendarFeed = require('../models/ExternalCalendarFeed');
const BlockedTime = require('../models/BlockedTime');
const feedService = require('../services/externalCalendarFeedService');
const { audit } = require('../utils/auditLog');

// All routes here are provider-only. Clients have no use for the
// feature.
function ensureProvider(req, res) {
  if (req.user.accountType !== 'PROVIDER') {
    res.status(403).json({ message: 'Provider access required' });
    return false;
  }
  return true;
}

// GET / — List provider's feeds (active + paused).
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    if (!ensureProvider(req, res)) return;
    const feeds = await ExternalCalendarFeed.find({ provider: req.user._id })
      .sort({ createdAt: 1 })
      .lean();
    res.json(feeds);
  } catch (err) {
    console.error('Error listing external calendar feeds:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST / — Add a new feed. Validates the URL is reachable and parses
// as iCal before saving. Triggers an immediate sync so the provider
// sees events appear within seconds.
router.post('/', ensureAuthenticated, async (req, res) => {
  try {
    if (!ensureProvider(req, res)) return;
    const { name, url } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: 'Name is required' });
    if (!url || !url.trim()) return res.status(400).json({ message: 'URL is required' });
    if (!/^https?:\/\//i.test(url.trim())) {
      return res.status(400).json({ message: 'URL must start with http:// or https://' });
    }

    // Validate URL up front — fail fast with a clear message rather
    // than silently saving a broken feed.
    let validation;
    try {
      validation = await feedService.validateFeedUrl(url.trim());
    } catch (err) {
      return res.status(400).json({
        message: `Couldn't read that feed — ${err.message}`,
      });
    }

    const feed = await ExternalCalendarFeed.create({
      provider: req.user._id,
      name: name.trim(),
      url: url.trim(),
      isActive: true,
    });

    audit({
      userId: req.user._id,
      action: 'create', resource: 'external_calendar_feed',
      resourceId: feed._id,
      details: { name: feed.name, eventCount: validation.eventCount },
      req,
    });

    // Fire initial sync in the background — don't make the request
    // wait, but log any failure for diagnostics.
    feedService.syncFeed(feed).catch(err =>
      console.error('[ExternalIcal] Initial sync error after create:', err.message)
    );

    res.status(201).json({ ...feed.toObject(), validatedEventCount: validation.eventCount });
  } catch (err) {
    console.error('Error creating external calendar feed:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /:id — Toggle isActive or rename. Provider can pause a feed
// without losing the URL.
router.patch('/:id', ensureAuthenticated, async (req, res) => {
  try {
    if (!ensureProvider(req, res)) return;
    const feed = await ExternalCalendarFeed.findById(req.params.id);
    if (!feed) return res.status(404).json({ message: 'Feed not found' });
    if (!feed.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const { name, isActive } = req.body;
    if (typeof name === 'string') feed.name = name.trim().slice(0, 100);
    if (typeof isActive === 'boolean') feed.isActive = isActive;
    await feed.save();
    res.json(feed);
  } catch (err) {
    console.error('Error updating external calendar feed:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /:id/refresh — Manual re-sync for one feed. The 5-min poller
// is the primary mechanism; this is for "I just added an appointment
// in Jane, show me NOW."
router.post('/:id/refresh', ensureAuthenticated, async (req, res) => {
  try {
    if (!ensureProvider(req, res)) return;
    const feed = await ExternalCalendarFeed.findById(req.params.id);
    if (!feed) return res.status(404).json({ message: 'Feed not found' });
    if (!feed.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const result = await feedService.syncFeed(feed);
    res.json({ message: 'Refreshed', ...result, feed: feed.toObject() });
  } catch (err) {
    console.error('Error refreshing external calendar feed:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /:id — Remove the feed AND its blocked-time rows. Without
// the BlockedTime cleanup, the events would ghost-block the provider's
// availability with no way to clear them.
router.delete('/:id', ensureAuthenticated, async (req, res) => {
  try {
    if (!ensureProvider(req, res)) return;
    const feed = await ExternalCalendarFeed.findById(req.params.id);
    if (!feed) return res.status(404).json({ message: 'Feed not found' });
    if (!feed.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const deletedBlocks = await BlockedTime.deleteMany({
      externalCalendarFeed: feed._id,
    });
    await feed.deleteOne();
    audit({
      userId: req.user._id,
      action: 'delete', resource: 'external_calendar_feed',
      resourceId: feed._id,
      details: { name: feed.name, deletedBlocks: deletedBlocks.deletedCount },
      req,
    });
    res.json({ message: 'Feed removed', deletedBlocks: deletedBlocks.deletedCount });
  } catch (err) {
    console.error('Error deleting external calendar feed:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
