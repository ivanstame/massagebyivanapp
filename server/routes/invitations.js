// const express = require('express');
// const router = express.Router();
// const crypto = require('crypto');
// const { ensureAuthenticated } = require('../middleware/passportMiddleware');
// const Invitation = require('../models/Invitation');
// const User = require('../models/User');

// // Create invitation
// router.post('/', ensureAuthenticated, async (req, res) => {
//   try {
//     const { email } = req.body;
    
//     // Check if user already exists
//     let user = await User.findOne({ email: email.toLowerCase() });
//     if (user) {
//       return res.status(400).json({ message: 'User already exists' });
//     }

//     // Create invitation token
//     const token = crypto.randomBytes(32).toString('hex');
    
//     // Store invitation
//     const invitation = new Invitation({
//       provider: req.user._id,
//       email,
//       token,
//       expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
//     });

//     await invitation.save();
    
//     // Return the created invitation with token for testing
//     res.status(201).json({
//       email,
//       code: token,
//       createdAt: invitation.createdAt,
//       expires: invitation.expires,
//       status: 'PENDING'
//     });
//   } catch (error) {
//     console.error('Error creating invitation:', error);
//     res.status(500).json({ message: 'Error creating invitation' });
//   }
// });

// // Get all invitations for provider
// router.get('/', ensureAuthenticated, async (req, res) => {
//   try {
//     const invitations = await Invitation.find({ 
//       provider: req.user._id,
//       status: 'PENDING'
//     });
//     res.json(invitations);
//   } catch (error) {
//     console.error('Error fetching invitations:', error);
//     res.status(500).json({ message: 'Error fetching invitations' });
//   }
// });

// module.exports = router;
// invitations.js

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Invitation = require('../models/Invitation');
const User = require('../models/User');
const { ensureAuthenticated } = require('../middleware/passportMiddleware');

// Create test invitation
router.post('/', ensureAuthenticated, async (req, res) => {
  try {
    const { email } = req.body;
    
    // Provider check
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Only providers can create invitations' });
    }

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Check for existing pending invitation
    const existingInvite = await Invitation.findOne({
      email,
      status: 'PENDING'
    });
    if (existingInvite) {
      return res.status(200).json({
        status: 'exists',
        email: existingInvite.email,
        code: existingInvite.token,
        expiresAt: existingInvite.expires,
        message: 'Invitation already exists for this email'
      });
    }

    // Create invitation with debugging info
    const invitation = new Invitation({
      provider: req.user._id,
      email,
      token: crypto.randomBytes(16).toString('hex'),
      status: 'PENDING',
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      _debug: {
        createdBy: req.user.email,
        timestamp: new Date()
      }
    });

    await invitation.save();
    
    // Return invitation details for testing
    res.status(201).json({
      status: 'created',
      email,
      code: invitation.token,
      expiresAt: invitation.expires,
      providerId: req.user._id,
      message: 'Invitation created successfully'
    });
  } catch (error) {
    console.error('Error creating test invitation:', error);
    res.status(500).json({ message: 'Failed to create invitation', error: error.message });
  }
});

// Get all test invitations for provider (with status)
router.get('/provider', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const invitations = await Invitation.find({
      provider: req.user._id,
      status: 'PENDING'  // Only show pending invitations
    })
      .select('email token status expires createdAt _debug')
      .sort('-createdAt');

    res.json(invitations);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching invitations' });
  }
});

// Verify invitation before registration
router.get('/verify/:token', async (req, res) => {
  try {
    const invitation = await Invitation.findOne({
      token: req.params.token,
      status: 'PENDING',
      expires: { $gt: new Date() }
    }).populate('provider', 'email providerProfile.businessName');

    if (!invitation) {
      return res.status(404).json({ 
        valid: false,
        message: 'Invalid or expired invitation' 
      });
    }

    res.json({
      valid: true,
      email: invitation.email,
      provider: {
        id: invitation.provider._id,
        businessName: invitation.provider.providerProfile.businessName
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error verifying invitation' });
  }
});

// Mark invitation as accepted (called after successful registration)
router.post('/accept/:token', async (req, res) => {
  try {
    const invitation = await Invitation.findOne({
      token: req.params.token,
      status: 'PENDING'
    });

    if (!invitation) {
      return res.status(404).json({ message: 'Invalid invitation' });
    }

    invitation.status = 'ACCEPTED';
    await invitation.save();

    res.json({ message: 'Invitation accepted' });
  } catch (error) {
    res.status(500).json({ message: 'Error accepting invitation' });
  }
});

// DEBUG: Clear expired test invitations
router.delete('/cleanup', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const result = await Invitation.deleteMany({
      provider: req.user._id,
      $or: [
        { expires: { $lt: new Date() } },
        { status: 'ACCEPTED' }
      ]
    });

    res.json({ 
      message: 'Cleanup complete',
      deleted: result.deletedCount
    });
  } catch (error) {
    res.status(500).json({ message: 'Error during cleanup' });
  }
});

module.exports = router;