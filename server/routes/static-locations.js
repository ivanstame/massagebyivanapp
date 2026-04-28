const express = require('express');
const router = express.Router();
const StaticLocation = require('../models/StaticLocation');
const { ensureAuthenticated } = require('../middleware/passportMiddleware');

// Allowed fields when accepting pricing tiers from the client.
function sanitizePricing(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter(t => t && Number.isFinite(Number(t.duration)) && Number.isFinite(Number(t.price)))
    .map((t, idx) => ({
      duration: Number(t.duration),
      price: Number(t.price),
      label: typeof t.label === 'string' ? t.label.trim().slice(0, 100) : '',
      displayOrder: typeof t.displayOrder === 'number' ? t.displayOrder : idx
    }));
}

// GET / — list active static locations for the provider
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    if (!['PROVIDER', 'ADMIN'].includes(req.user.accountType)) {
      return res.status(403).json({ message: 'Provider access required' });
    }
    const locations = await StaticLocation.find({
      provider: req.user._id,
      archivedAt: null
    }).sort({ name: 1 });
    res.json(locations);
  } catch (error) {
    console.error('Error fetching static locations:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST / — create a static location
router.post('/', ensureAuthenticated, async (req, res) => {
  try {
    if (!['PROVIDER', 'ADMIN'].includes(req.user.accountType)) {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const { name, address, lat, lng, bufferMinutes, useMobilePricing, pricing } = req.body;
    if (!name || !address || lat == null || lng == null) {
      return res.status(400).json({ message: 'name, address, lat, and lng are required' });
    }

    const location = new StaticLocation({
      provider: req.user._id,
      name: String(name).trim().slice(0, 100),
      address: String(address).trim(),
      lat: Number(lat),
      lng: Number(lng),
      bufferMinutes: Number.isFinite(Number(bufferMinutes)) ? Number(bufferMinutes) : 15,
      useMobilePricing: !!useMobilePricing,
      pricing: useMobilePricing ? [] : sanitizePricing(pricing)
    });

    await location.save();
    res.status(201).json(location);
  } catch (error) {
    console.error('Error creating static location:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /:id — update an existing static location
router.put('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const location = await StaticLocation.findById(req.params.id);
    if (!location) return res.status(404).json({ message: 'Location not found' });
    if (!location.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { name, address, lat, lng, bufferMinutes, useMobilePricing, pricing } = req.body;
    if (name !== undefined) location.name = String(name).trim().slice(0, 100);
    if (address !== undefined) location.address = String(address).trim();
    if (lat !== undefined) location.lat = Number(lat);
    if (lng !== undefined) location.lng = Number(lng);
    if (bufferMinutes !== undefined && Number.isFinite(Number(bufferMinutes))) {
      location.bufferMinutes = Math.max(0, Math.min(120, Number(bufferMinutes)));
    }
    if (useMobilePricing !== undefined) {
      location.useMobilePricing = !!useMobilePricing;
      if (location.useMobilePricing) {
        // Clear stored overrides — they'd be ignored anyway, but it
        // keeps the document honest about what's authoritative.
        location.pricing = [];
      }
    }
    if (!location.useMobilePricing && pricing !== undefined) {
      location.pricing = sanitizePricing(pricing);
    }

    await location.save();
    res.json(location);
  } catch (error) {
    console.error('Error updating static location:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /:id — soft-delete (archive) a static location. We don't hard-
// delete because future Availability blocks and historical Bookings may
// reference it; archiving keeps those references resolvable while
// hiding the location from the create-availability picker.
router.delete('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const location = await StaticLocation.findById(req.params.id);
    if (!location) return res.status(404).json({ message: 'Location not found' });
    if (!location.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    location.archivedAt = new Date();
    await location.save();
    res.json({ message: 'Location archived' });
  } catch (error) {
    console.error('Error archiving static location:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
