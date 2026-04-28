const express = require('express');
const router = express.Router();
const SavedLocation = require('../models/SavedLocation');
const { ensureAuthenticated } = require('../middleware/passportMiddleware');

// Helpers ---------------------------------------------------------------

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

function buildStaticConfig(input) {
  if (!input || typeof input !== 'object') {
    return { bufferMinutes: 15, useMobilePricing: true, pricing: [] };
  }
  const buffer = Number.isFinite(Number(input.bufferMinutes)) ? Number(input.bufferMinutes) : 15;
  const useMobile = !!input.useMobilePricing;
  return {
    bufferMinutes: Math.max(0, Math.min(120, buffer)),
    useMobilePricing: useMobile,
    pricing: useMobile ? [] : sanitizePricing(input.pricing)
  };
}

// Get all saved locations for the logged-in provider
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Only providers can manage locations' });
    }
    const locations = await SavedLocation.find({ provider: req.user._id })
      .sort({ isHomeBase: -1, name: 1 });
    res.json(locations);
  } catch (error) {
    console.error('Error fetching saved locations:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new saved location
router.post('/', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Only providers can manage locations' });
    }

    const { name, address, lat, lng, isHomeBase, isStaticLocation, staticConfig } = req.body;
    if (!name || !address || lat == null || lng == null) {
      return res.status(400).json({ message: 'name, address, lat, and lng are required' });
    }

    // If setting as home base, unset any existing home base
    if (isHomeBase) {
      await SavedLocation.updateMany(
        { provider: req.user._id, isHomeBase: true },
        { $set: { isHomeBase: false } }
      );
    }

    const location = new SavedLocation({
      provider: req.user._id,
      name,
      address,
      lat,
      lng,
      isHomeBase: !!isHomeBase,
      isStaticLocation: !!isStaticLocation,
      staticConfig: isStaticLocation ? buildStaticConfig(staticConfig) : undefined
    });

    await location.save();
    res.status(201).json(location);
  } catch (error) {
    console.error('Error creating saved location:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a saved location
router.put('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const location = await SavedLocation.findById(req.params.id);
    if (!location) return res.status(404).json({ message: 'Location not found' });
    if (!location.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { name, address, lat, lng, isHomeBase, isStaticLocation, staticConfig } = req.body;

    // If setting as home base, unset any existing home base
    if (isHomeBase && !location.isHomeBase) {
      await SavedLocation.updateMany(
        { provider: req.user._id, isHomeBase: true },
        { $set: { isHomeBase: false } }
      );
    }

    if (name !== undefined) location.name = name;
    if (address !== undefined) location.address = address;
    if (lat != null) location.lat = lat;
    if (lng != null) location.lng = lng;
    if (isHomeBase !== undefined) location.isHomeBase = !!isHomeBase;
    if (isStaticLocation !== undefined) {
      location.isStaticLocation = !!isStaticLocation;
      // Always rewrite the config when the role changes — when toggling
      // off, scrub it; when toggling on, accept the supplied (or default)
      // config.
      if (location.isStaticLocation) {
        location.staticConfig = buildStaticConfig(staticConfig ?? location.staticConfig);
      } else {
        location.staticConfig = undefined;
      }
    } else if (location.isStaticLocation && staticConfig !== undefined) {
      // Role unchanged but config was sent — apply it.
      location.staticConfig = buildStaticConfig(staticConfig);
    }

    await location.save();
    res.json(location);
  } catch (error) {
    console.error('Error updating saved location:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a saved location
router.delete('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const location = await SavedLocation.findById(req.params.id);
    if (!location) return res.status(404).json({ message: 'Location not found' });
    if (!location.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await SavedLocation.findByIdAndDelete(req.params.id);
    res.json({ message: 'Location deleted' });
  } catch (error) {
    console.error('Error deleting saved location:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
