const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Booking = require('../models/Booking');
const Availability = require('../models/Availability');
const Invitation = require('../models/Invitation');
const SavedLocation = require('../models/SavedLocation');
const { ensureAuthenticated, ensureAdmin } = require('../middleware/passportMiddleware');

// @route   GET /api/users/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', ensureAuthenticated, async (req, res) => {
  try {
    console.log('Profile request received for user:', req.user.id);
    
    // User is already attached by Passport
    if (!req.user) {
      console.log('User not found in request');
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(req.user.getPublicProfile());
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ message: 'Error fetching profile' });
  }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', ensureAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Different profile updates based on account type
    if (user.accountType === 'PROVIDER') {
      // Update provider profile (business settings)
      if (req.body.providerProfile) {
        user.providerProfile = {
          ...user.providerProfile,
          ...req.body.providerProfile
        };
      }

      // Update basic profile fields — handle both nested (req.body.profile) and
      // root-level fields (from ProfileSetup which sends fullName, phoneNumber, address at root)
      const updateData = req.body;
      const profileUpdate = updateData.profile || {};

      user.profile = {
        ...user.profile,
        fullName: profileUpdate.fullName || updateData.fullName || user.profile.fullName,
        phoneNumber: profileUpdate.phoneNumber || updateData.phoneNumber || user.profile.phoneNumber,
      };

      // Handle address from either root or nested profile
      const newAddress = profileUpdate.address || updateData.address;
      if (newAddress) {
        user.profile.address = {
          ...user.profile.address,
          street: newAddress.street || user.profile.address?.street || '',
          unit: newAddress.unit || user.profile.address?.unit || '',
          city: newAddress.city || user.profile.address?.city || '',
          state: newAddress.state || user.profile.address?.state || '',
          zip: newAddress.zip || user.profile.address?.zip || '',
          formatted: newAddress.formatted || user.profile.address?.formatted || ''
        };
      }

      // Handle allergies/medical from root level (ProfileSetup)
      if (updateData.allergies !== undefined) user.profile.allergies = updateData.allergies;
      if (updateData.medicalConditions !== undefined) user.profile.medicalConditions = updateData.medicalConditions;

      // Handle join code from ProfileSetup
      if (updateData.joinCode) {
        const code = updateData.joinCode.toLowerCase().trim();
        if (code.length >= 3 && code.length <= 20 && /^[a-z0-9]+$/.test(code)) {
          // Check uniqueness
          const existing = await User.findOne({ joinCode: code, _id: { $ne: user._id } });
          if (existing) {
            return res.status(400).json({ message: 'This join code is already taken' });
          }
          user.joinCode = code;
          user.joinCodeLastChanged = new Date();
        }
      }
    } else {
      // Client profile updates - handle both old format (flat structure) and new format
      const updateData = req.body;
      
      user.profile = {
        ...user.profile,
        fullName: updateData.fullName || user.profile.fullName,
        phoneNumber: updateData.phoneNumber || updateData.profile?.phoneNumber || user.profile.phoneNumber,
        address: {
          ...user.profile.address,
          street: updateData.street || updateData.address?.street || user.profile.address?.street || '',
          unit: updateData.unit || updateData.address?.unit || user.profile.address?.unit || '',
          city: updateData.city || updateData.address?.city || user.profile.address?.city || '',
          state: updateData.state || updateData.address?.state || user.profile.address?.state || '',
          zip: updateData.zip || updateData.address?.zip || user.profile.address?.zip || '',
          formatted: updateData.formatted || updateData.address?.formatted || user.profile.address?.formatted || ''
        },
        allergies: updateData.allergies || user.profile.allergies,
        medicalConditions: updateData.medicalConditions || user.profile.medicalConditions
      };
    }

    if (req.body.registrationStep) {
      user.registrationStep = req.body.registrationStep;
    }

    await user.save();
    res.json({ 
      message: 'Profile updated successfully', 
      user: user.getPublicProfile() 
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Error updating profile' });
  }
});

// Get specific client details
router.get('/provider/clients/:clientId', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const client = await User.findOne({
      _id: req.params.clientId,
      providerId: req.user._id
    });

    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }

    res.json(client.getPublicProfile());
  } catch (error) {
    console.error('Error fetching client details:', error);
    res.status(500).json({ message: 'Error fetching client details' });
  }
});

// Get provider's clients
router.get('/provider/clients', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const clients = await User.find({ 
      providerId: req.user._id,
      accountType: 'CLIENT'
    }).select('-password');

    res.json(clients);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ message: 'Error fetching clients' });
  }
});

// Invite client
router.post('/provider/invite', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const { email } = req.body;
    
    // Check if user already exists
    let client = await User.findByEmail(email);
    if (client) {
      return res.status(400).json({ 
        message: 'Email already registered' 
      });
    }

    // Create invitation token
    const inviteToken = crypto.randomBytes(32).toString('hex');
    
    // Store invitation
    const invitation = new Invitation({
      email,
      provider: req.user._id,
      token: inviteToken,
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });

    await invitation.save();

    // Send invitation email (implement email service)
    
    res.status(200).json({ 
      message: 'Invitation sent successfully' 
    });
  } catch (error) {
    console.error('Error sending invitation:', error);
    res.status(500).json({ message: 'Error sending invitation' });
  }
});

// Update client notes
router.patch('/provider/clients/:clientId/notes', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const { notes } = req.body;
    if (typeof notes !== 'string') {
      return res.status(400).json({ message: 'Notes must be a string' });
    }

    const client = await User.findOne({
      _id: req.params.clientId,
      providerId: req.user._id
    });

    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }

    // Initialize clientProfile if it doesn't exist
    if (!client.clientProfile) {
      client.clientProfile = {
        notes: '',
        preferences: {},
        stats: {
          totalAppointments: 0,
          upcomingAppointments: 0,
          completedAppointments: 0,
          totalRevenue: 0
        }
      };
    }

    // Update the notes
    client.clientProfile.notes = notes;
    await client.save();

    res.json({
      message: 'Client notes updated successfully',
      notes: client.clientProfile.notes
    });
  } catch (error) {
    console.error('Error updating client notes:', error);
    res.status(500).json({ message: 'Error updating client notes' });
  }
});

// Remove client from provider
router.delete('/provider/clients/:clientId', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const client = await User.findOne({
      _id: req.params.clientId,
      providerId: req.user._id
    });

    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }

    // Remove provider association
    client.providerId = null;
    await client.save();

    res.json({ message: 'Client removed successfully' });
  } catch (error) {
    console.error('Error removing client:', error);
    res.status(500).json({ message: 'Error removing client' });
  }
});

// Update provider profile settings
router.put('/provider/settings', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const user = await User.findById(req.user._id);
    const { settings } = req.body;

    // Update provider profile settings (businessName, scheduling, etc)
    user.providerProfile = {
      ...user.providerProfile,
      ...settings
    };

    // Clean up: remove bufferTime from scheduling if it exists (since we removed it from UI)
    if (user.providerProfile.scheduling) {
      delete user.providerProfile.scheduling.bufferTime;
    }

    // Remove address from providerProfile — it belongs in profile.address
    delete user.providerProfile.address;

    // Update phone number if provided
    if (settings.phoneNumber !== undefined) {
      user.profile = {
        ...user.profile,
        phoneNumber: settings.phoneNumber
      };
    }

    // Update address if provided
    if (settings.address) {
      user.profile.address = {
        ...user.profile.address,
        street: settings.address.street || user.profile.address?.street || '',
        unit: settings.address.unit || user.profile.address?.unit || '',
        city: settings.address.city || user.profile.address?.city || '',
        state: settings.address.state || user.profile.address?.state || '',
        zip: settings.address.zip || user.profile.address?.zip || '',
        formatted: settings.address.formatted || user.profile.address?.formatted || ''
      };

      // Auto-sync: geocode and create/update "Home" saved location
      const addressStr = [
        settings.address.street,
        settings.address.city,
        settings.address.state,
        settings.address.zip
      ].filter(Boolean).join(', ');

      if (addressStr.trim()) {
        try {
          // Geocode the address
          const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addressStr)}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
          const geocodeRes = await fetch(geocodeUrl);
          const geocodeData = await geocodeRes.json();

          if (geocodeData.results && geocodeData.results.length > 0) {
            const { lat, lng } = geocodeData.results[0].geometry.location;
            const formattedAddress = geocodeData.results[0].formatted_address;

            // Store formatted address
            user.profile.address.formatted = formattedAddress;

            // Find existing home base or create one
            let homeLocation = await SavedLocation.findOne({
              provider: user._id,
              isHomeBase: true
            });

            if (homeLocation) {
              // Update existing home base
              homeLocation.name = 'Home';
              homeLocation.address = formattedAddress;
              homeLocation.lat = lat;
              homeLocation.lng = lng;
              await homeLocation.save();
            } else {
              // Create new home base
              await SavedLocation.create({
                provider: user._id,
                name: 'Home',
                address: formattedAddress,
                lat,
                lng,
                isHomeBase: true
              });
            }
          }
        } catch (geocodeErr) {
          // Non-fatal: address saves even if geocoding fails
          console.error('Geocoding error during settings sync:', geocodeErr.message);
        }
      }
    }

    await user.save();
    res.json({
      message: 'Provider settings updated',
      settings: user.providerProfile,
      profile: user.profile
    });
  } catch (error) {
    console.error('Error updating provider settings:', error);
    res.status(500).json({ message: 'Error updating settings' });
  }
});

// Get provider services (addons + base pricing) — for booking flow
router.get('/provider/:providerId/services', async (req, res) => {
  try {
    const provider = await User.findOne({
      _id: req.params.providerId,
      accountType: 'PROVIDER'
    });
    if (!provider) {
      return res.status(404).json({ message: 'Provider not found' });
    }

    res.json({
      basePricing: provider.providerProfile?.basePricing || [],
      addons: (provider.providerProfile?.addons || []).filter(a => a.isActive)
    });
  } catch (error) {
    console.error('Error fetching provider services:', error);
    res.status(500).json({ message: 'Error fetching provider services' });
  }
});

// Update provider services (addons + base pricing)
router.put('/provider/services', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const user = await User.findById(req.user._id);
    const { basePricing, addons } = req.body;

    if (basePricing) {
      // Validate pricing entries
      for (const entry of basePricing) {
        if (!entry.duration || entry.duration < 30 || entry.duration > 180) {
          return res.status(400).json({ message: `Invalid duration: ${entry.duration}. Must be 30-180 minutes.` });
        }
        if (entry.price == null || entry.price < 0) {
          return res.status(400).json({ message: 'Price must be a positive number' });
        }
      }
      user.providerProfile.basePricing = basePricing;
    }

    if (addons) {
      // Validate addon entries
      for (const addon of addons) {
        if (!addon.name || addon.name.trim().length === 0) {
          return res.status(400).json({ message: 'Add-on name is required' });
        }
        if (addon.price == null || addon.price < 0) {
          return res.status(400).json({ message: `Invalid price for add-on "${addon.name}"` });
        }
      }
      user.providerProfile.addons = addons;
    }

    await user.save();
    res.json({
      message: 'Services updated',
      basePricing: user.providerProfile.basePricing,
      addons: user.providerProfile.addons
    });
  } catch (error) {
    console.error('Error updating provider services:', error);
    res.status(500).json({ message: 'Error updating services' });
  }
});

// Get provider info for booking (accessible route)
router.get('/provider/:providerId', async (req, res) => {
  try {
    console.log('Fetching provider info for providerId:', req.params.providerId);
    
    const provider = await User.findOne({
      _id: req.params.providerId,
      accountType: 'PROVIDER'
    }).select('-password'); // Exclude password but include everything else

    if (!provider) {
      console.log('Provider not found for ID:', req.params.providerId);
      return res.status(404).json({ message: 'Provider not found' });
    }

    console.log('Provider found with full data');
    console.log('Provider business name:', provider.providerProfile?.businessName);
    console.log('Full providerProfile:', provider.providerProfile);
    
    // Return the full provider object (minus password)
    res.json(provider);
  } catch (error) {
    console.error('Error fetching provider info:', error);
    res.status(500).json({ message: 'Error fetching provider info' });
  }
});

// Get provider public profile
router.get('/provider/:providerId/profile', async (req, res) => {
  try {
    console.log('Fetching provider profile for providerId:', req.params.providerId);
    
    const provider = await User.findOne({
      _id: req.params.providerId,
      accountType: 'PROVIDER'
    }).select('-password'); // Exclude password but include everything else

    if (!provider) {
      console.log('Provider not found for ID:', req.params.providerId);
      return res.status(404).json({ message: 'Provider not found' });
    }

    console.log('Provider found:', provider);
    console.log('Provider business name:', provider.providerProfile?.businessName);
    console.log('Full providerProfile:', JSON.stringify(provider.providerProfile, null, 2));
    
    // Return the full provider object (minus password)
    res.json(provider);
  } catch (error) {
    console.error('Error fetching provider profile:', error);
    res.status(500).json({ message: 'Error fetching provider profile' });
  }
});

// @route   GET /api/users/:id
// @desc    Get user by ID (Admin only)
// @access  Admin
router.get('/:id', ensureAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user.getPublicProfile());
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Error fetching user' });
  }
});

// @route   GET /api/users
// @desc    Get all users (Admin only)
// @access  Admin
router.get('/', ensureAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
});

router.put('/treatment-preferences', ensureAuthenticated, async (req, res) => {
  try {
    console.log('Treatment preferences update request received:', req.body);

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      {
        $set: {
          'profile.treatmentPreferences': req.body.preferences,
          registrationStep: 3  // Update to final step
        }
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ 
      message: 'Treatment preferences updated successfully',
      user: updatedUser.getPublicProfile()
    });
  } catch (error) {
    console.error('Error updating treatment preferences:', error);
    res.status(500).json({ message: 'Error updating treatment preferences' });
  }
});

// @route   PUT /api/users/provider/preferences
// @desc    Update provider business preferences
// @access  Private
router.put('/provider/preferences', ensureAuthenticated, async (req, res) => {
  try {
    console.log('Provider preferences update request received:', req.body);

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    // Update provider preferences
    user.providerProfile = {
      ...user.providerProfile,
      ...req.body.preferences
    };

    // Clean up: remove bufferTime from scheduling if it exists (since we removed it from UI)
    if (user.providerProfile.scheduling) {
      delete user.providerProfile.scheduling.bufferTime;
    }

    // Update registration step to complete onboarding
    if (req.body.registrationStep) {
      user.registrationStep = req.body.registrationStep;
    }

    await user.save();

    res.json({ 
      message: 'Provider preferences updated successfully',
      user: user.getPublicProfile()
    });
  } catch (error) {
    console.error('Error updating provider preferences:', error);
    res.status(500).json({ message: 'Error updating provider preferences' });
  }
});

// @route   DELETE /api/users/account
// @desc    Delete user account
// @access  Private
router.delete('/account', ensureAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Provider-specific cleanup
    if (user.accountType === 'PROVIDER') {
      // Delete all bookings for this provider
      await Booking.deleteMany({ provider: req.user.id });
      
      // Delete all availability blocks for this provider
      await Availability.deleteMany({ provider: req.user.id });
      
      // Delete all invitations from this provider
      await Invitation.deleteMany({ provider: req.user.id });
      
      // Remove provider association from all clients
      await User.updateMany(
        { providerId: req.user.id },
        { $set: { providerId: null } }
      );
    } else if (user.accountType === 'CLIENT') {
      // Client-specific cleanup (if any)
      // For now, just remove any bookings for this client
      await Booking.deleteMany({ client: req.user.id });
    }

    // Delete the user
    await User.findByIdAndDelete(req.user.id);

    // Logout the user
    req.logout((err) => {
      if (err) {
        console.error('Error during logout after account deletion:', err);
      }
    });

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ message: 'Error deleting account' });
  }
});

module.exports = router;
