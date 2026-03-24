const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { ensureAuthenticated } = require('../middleware/passportMiddleware');

// @route   GET /api/join-code/verify/:code
// @desc    Verify a join code and return provider info (public, used during client signup)
// @access  Public
router.get('/verify/:code', async (req, res) => {
  try {
    const code = req.params.code.toLowerCase().trim();

    if (!code || code.length < 3 || code.length > 20) {
      return res.status(400).json({ message: 'Invalid join code format' });
    }

    const provider = await User.findOne({
      joinCode: code,
      accountType: 'PROVIDER'
    }).select('providerProfile.businessName email profile.fullName');

    if (!provider) {
      return res.status(404).json({ message: 'Invalid join code. Please check with your provider.' });
    }

    res.json({
      valid: true,
      provider: {
        id: provider._id,
        businessName: provider.providerProfile?.businessName || '',
        name: provider.profile?.fullName || ''
      }
    });
  } catch (error) {
    console.error('Error verifying join code:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/join-code/check/:code
// @desc    Check if a join code is available (used by providers when setting their code)
// @access  Private (provider only)
router.get('/check/:code', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const code = req.params.code.toLowerCase().trim();

    if (!code || code.length < 3 || code.length > 20) {
      return res.status(400).json({ available: false, message: 'Code must be 3-20 alphanumeric characters' });
    }

    if (!/^[a-z0-9]+$/.test(code)) {
      return res.status(400).json({ available: false, message: 'Code must be alphanumeric only (no spaces or special characters)' });
    }

    const existing = await User.findOne({
      joinCode: code,
      _id: { $ne: req.user._id }
    });

    res.json({
      available: !existing,
      message: existing ? 'This code is already taken' : 'Code is available'
    });
  } catch (error) {
    console.error('Error checking join code:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/join-code
// @desc    Set or update provider's join code
// @access  Private (provider only)
router.put('/', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const { joinCode } = req.body;
    const code = joinCode?.toLowerCase().trim();

    if (!code || code.length < 3 || code.length > 20) {
      return res.status(400).json({ message: 'Join code must be 3-20 characters' });
    }

    if (!/^[a-z0-9]+$/.test(code)) {
      return res.status(400).json({ message: 'Join code must be alphanumeric only' });
    }

    const user = await User.findById(req.user._id);

    // Check 30-day cooldown (skip if never set before)
    if (user.joinCode && user.joinCodeLastChanged) {
      const daysSinceChange = (Date.now() - user.joinCodeLastChanged.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceChange < 30) {
        const daysRemaining = Math.ceil(30 - daysSinceChange);
        return res.status(400).json({
          message: `You can change your join code again in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`
        });
      }
    }

    // Check uniqueness
    const existing = await User.findOne({
      joinCode: code,
      _id: { $ne: req.user._id }
    });

    if (existing) {
      return res.status(400).json({ message: 'This join code is already taken' });
    }

    user.joinCode = code;
    user.joinCodeLastChanged = new Date();
    await user.save();

    res.json({
      message: 'Join code updated successfully',
      joinCode: user.joinCode
    });
  } catch (error) {
    console.error('Error updating join code:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/join-code
// @desc    Get current provider's join code
// @access  Private (provider only)
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const user = await User.findById(req.user._id).select('joinCode joinCodeLastChanged');

    res.json({
      joinCode: user.joinCode || null,
      lastChanged: user.joinCodeLastChanged || null
    });
  } catch (error) {
    console.error('Error fetching join code:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
