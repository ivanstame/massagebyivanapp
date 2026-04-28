const express = require('express');
const router = express.Router();
const axios = require('axios');
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
        }
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

// Get provider's clients with booking stats
router.get('/provider/clients', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const clients = await User.find({
      providerId: req.user._id,
      accountType: 'CLIENT'
    }).select('-password');

    // Fetch booking stats for all clients in one query
    const now = new Date();
    const clientIds = clients.map(c => c._id);
    const bookingStats = await Booking.aggregate([
      { $match: { client: { $in: clientIds }, provider: req.user._id } },
      { $group: {
        _id: '$client',
        totalAppointments: { $sum: 1 },
        completedAppointments: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        upcomingAppointments: { $sum: { $cond: [{ $and: [{ $gt: ['$date', now] }, { $ne: ['$status', 'cancelled'] }] }, 1, 0] } },
        lastAppointmentDate: { $max: { $cond: [{ $eq: ['$status', 'completed'] }, '$date', null] } },
        nextAppointmentDate: { $min: { $cond: [{ $and: [{ $gt: ['$date', now] }, { $ne: ['$status', 'cancelled'] }] }, '$date', null] } },
        totalRevenue: { $sum: { $ifNull: ['$pricing.totalPrice', 0] } }
      }}
    ]);

    const statsMap = {};
    bookingStats.forEach(s => { statsMap[s._id.toString()] = s; });

    const enrichedClients = clients.map(c => {
      const obj = c.toObject();
      const s = statsMap[c._id.toString()];
      obj.bookingStats = s ? {
        totalAppointments: s.totalAppointments,
        completedAppointments: s.completedAppointments,
        upcomingAppointments: s.upcomingAppointments,
        lastAppointmentDate: s.lastAppointmentDate,
        nextAppointmentDate: s.nextAppointmentDate,
        totalRevenue: s.totalRevenue
      } : {
        totalAppointments: 0,
        completedAppointments: 0,
        upcomingAppointments: 0,
        lastAppointmentDate: null,
        nextAppointmentDate: null,
        totalRevenue: 0
      };
      return obj;
    });

    res.json(enrichedClients);
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

// Build a client address object + derived formatted string from incoming body.
// Shared by managed-client create/update so storage matches the shape used by
// the rest of the app (profile.address).
function buildAddress(input) {
  if (!input) return null;
  const street = (input.street || '').trim();
  const city = (input.city || '').trim();
  const state = (input.state || '').trim();
  const zip = (input.zip || '').trim();
  const unit = (input.unit || '').trim();
  if (!street && !city && !state && !zip) return null;
  const formatted = `${street}${unit ? ' ' + unit : ''}, ${city}, ${state} ${zip}`
    .replace(/, ,/g, ',').replace(/\s+/g, ' ').trim();
  return { street, unit, city, state, zip, formatted };
}

// Geocode a formatted address string. Returns { lat, lng } or null on failure.
// Non-fatal — managed clients can be created without coords, but bookings for
// them won't have travel-time calculations until an address is resolvable.
async function geocodeIfPossible(addressStr) {
  if (!addressStr || !process.env.GOOGLE_MAPS_API_KEY) return null;
  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: { address: addressStr, key: process.env.GOOGLE_MAPS_API_KEY }
    });
    if (response.data.status === 'OK' && response.data.results.length > 0) {
      const { lat, lng } = response.data.results[0].geometry.location;
      return { lat, lng, formatted: response.data.results[0].formatted_address };
    }
  } catch (err) {
    console.warn('[managed-clients] Geocode failed:', err.message);
  }
  return null;
}

// Create a provider-managed client profile. The resulting User has no password
// and cannot log in; the provider owns and edits it.
router.post('/managed-clients', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const { firstName, lastName, phoneNumber, email, address, notes, smsConsent } = req.body;
    if (!firstName || !firstName.trim()) {
      return res.status(400).json({ message: 'First name is required' });
    }
    if (!lastName || !lastName.trim()) {
      return res.status(400).json({ message: 'Last name is required' });
    }

    const fullName = `${firstName.trim()} ${lastName.trim()}`;

    const addressObj = buildAddress(address);
    if (addressObj) {
      const geo = await geocodeIfPossible(addressObj.formatted);
      if (geo) addressObj.formatted = geo.formatted;
    }

    // Email uniqueness: if provider supplied one, make sure it isn't already
    // in use (prevents silently shadowing a registered client's login).
    if (email && email.trim()) {
      const existing = await User.findByEmail(email.trim());
      if (existing) {
        return res.status(400).json({ message: 'An account with that email already exists' });
      }
    }

    const managed = new User({
      accountType: 'CLIENT',
      isManaged: true,
      managedBy: req.user._id,
      providerId: req.user._id,
      smsConsent: !!smsConsent,
      profile: {
        fullName,
        phoneNumber: phoneNumber ? phoneNumber.trim() : '',
        address: addressObj || undefined,
      },
      clientProfile: {
        notes: notes || '',
        preferences: {},
        stats: {
          totalAppointments: 0,
          upcomingAppointments: 0,
          completedAppointments: 0,
          totalRevenue: 0,
        },
      },
      ...(email && email.trim() ? { email: email.trim().toLowerCase() } : {}),
    });

    await managed.save();
    res.status(201).json(managed.getPublicProfile());
  } catch (err) {
    console.error('Error creating managed client:', err);
    res.status(500).json({ message: 'Error creating client', error: err.message });
  }
});

// Update a managed client's profile. Registered clients edit their own
// profile via PUT /profile; managed clients never log in, so the provider
// edits them through this endpoint.
router.patch('/managed-clients/:id', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const managed = await User.findOne({
      _id: req.params.id,
      isManaged: true,
      managedBy: req.user._id,
    });
    if (!managed) {
      return res.status(404).json({ message: 'Managed client not found' });
    }

    const { firstName, lastName, phoneNumber, email, address, smsConsent } = req.body;

    if (firstName || lastName) {
      const [curFirst, ...rest] = (managed.profile?.fullName || '').split(' ');
      const curLast = rest.join(' ');
      const nextFirst = (firstName ?? curFirst ?? '').trim();
      const nextLast = (lastName ?? curLast ?? '').trim();
      managed.profile = {
        ...managed.profile,
        fullName: `${nextFirst} ${nextLast}`.trim(),
      };
    }

    if (phoneNumber !== undefined) {
      managed.profile = { ...managed.profile, phoneNumber: phoneNumber || '' };
    }

    if (email !== undefined) {
      if (email) {
        const existing = await User.findOne({
          email: email.trim().toLowerCase(),
          _id: { $ne: managed._id },
        });
        if (existing) {
          return res.status(400).json({ message: 'An account with that email already exists' });
        }
        managed.email = email.trim().toLowerCase();
      } else {
        managed.email = undefined;
      }
    }

    if (address !== undefined) {
      const addressObj = buildAddress(address);
      if (addressObj) {
        const geo = await geocodeIfPossible(addressObj.formatted);
        if (geo) addressObj.formatted = geo.formatted;
      }
      managed.profile = { ...managed.profile, address: addressObj || undefined };
    }

    if (smsConsent !== undefined) {
      managed.smsConsent = !!smsConsent;
    }

    await managed.save();
    res.json(managed.getPublicProfile());
  } catch (err) {
    console.error('Error updating managed client:', err);
    res.status(500).json({ message: 'Error updating client', error: err.message });
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

    if (client.isManaged) {
      // Managed clients have no life outside the provider — hard delete them
      // along with their bookings rather than leaving orphaned records.
      await Booking.deleteMany({ client: client._id });
      await User.findByIdAndDelete(client._id);
      return res.json({ message: 'Managed client deleted' });
    }

    // Registered client: remove provider association, preserve the user.
    client.providerId = null;
    await client.save();

    res.json({ message: 'Client removed successfully' });
  } catch (error) {
    console.error('Error removing client:', error);
    res.status(500).json({ message: 'Error removing client' });
  }
});

// Update just the Venmo handle. Split from the full settings PUT so the
// settings UI can have an inline Save button next to the Venmo field rather
// than making the provider scroll down to the global Save.
router.patch('/provider/venmo-handle', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const user = await User.findById(req.user._id);

    // Normalize: trim, strip leading @, empty -> null so the Mongoose sparse
    // unique index stays happy.
    const raw = String(req.body.venmoHandle || '').trim().replace(/^@+/, '');
    const next = raw.length ? raw : null;

    if (next !== null && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,29}$/.test(next)) {
      return res.status(400).json({
        message: 'Venmo handle may only contain letters, numbers, dashes, and underscores (max 30).'
      });
    }
    // Pure-numeric "handles" are almost always a user ID pasted from a QR
    // share link — reject so the provider sees an error instead of saving
    // something that won't resolve on Venmo.
    if (next !== null && /^\d+$/.test(next)) {
      return res.status(400).json({
        message: 'That looks like a Venmo user ID, not a handle. Copy your @handle from your Venmo profile instead of the share link.'
      });
    }

    user.providerProfile.venmoHandle = next;

    // Keep acceptedPaymentMethods in sync so clients only see Venmo as an
    // option when a handle is actually on file. Mirror of the global
    // settings PUT's behavior.
    const methods = new Set(user.providerProfile.acceptedPaymentMethods || ['cash']);
    if (next) {
      methods.add('venmo');
    } else {
      methods.delete('venmo');
    }
    user.providerProfile.acceptedPaymentMethods = Array.from(methods);

    await user.save();

    res.json({
      venmoHandle: user.providerProfile.venmoHandle,
      acceptedPaymentMethods: user.providerProfile.acceptedPaymentMethods,
    });
  } catch (err) {
    console.error('Error updating Venmo handle:', err);
    res.status(500).json({ message: 'Failed to update Venmo handle' });
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

    // Normalize venmoHandle: strip leading '@' and whitespace; empty => null
    if (settings.venmoHandle !== undefined) {
      const raw = String(settings.venmoHandle || '').trim().replace(/^@+/, '');
      settings.venmoHandle = raw.length ? raw : null;
    }

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

    // Sync acceptedPaymentMethods with venmoHandle presence so clients see Venmo
    // as an option exactly when the provider has a handle configured.
    const currentMethods = new Set(user.providerProfile.acceptedPaymentMethods || ['cash']);
    if (user.providerProfile.venmoHandle) {
      currentMethods.add('venmo');
    } else {
      currentMethods.delete('venmo');
    }
    user.providerProfile.acceptedPaymentMethods = Array.from(currentMethods);

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
      addons: (provider.providerProfile?.addons || []).filter(a => a.isActive),
      acceptedPaymentMethods: provider.providerProfile?.acceptedPaymentMethods || ['cash'],
      venmoHandle: provider.providerProfile?.venmoHandle || null
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
    const { basePricing, addons, acceptedPaymentMethods } = req.body;

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

    if (acceptedPaymentMethods) {
      const validMethods = ['cash', 'zelle', 'venmo', 'card'];
      const filtered = acceptedPaymentMethods.filter(m => validMethods.includes(m));
      if (filtered.length === 0) {
        return res.status(400).json({ message: 'At least one valid payment method is required' });
      }
      user.providerProfile.acceptedPaymentMethods = filtered;
    }

    await user.save();
    res.json({
      message: 'Services updated',
      basePricing: user.providerProfile.basePricing,
      addons: user.providerProfile.addons,
      acceptedPaymentMethods: user.providerProfile.acceptedPaymentMethods
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
    const incoming = req.body.preferences || {};
    const allowedPressure = ['light', 'medium', 'firm', 'deep'];
    const sanitized = {
      pressure: allowedPressure.includes(incoming.pressure) ? incoming.pressure : 'medium',
      focusAreas: Array.isArray(incoming.focusAreas) ? incoming.focusAreas.filter(a => typeof a === 'string') : [],
      avoidAreas: Array.isArray(incoming.avoidAreas) ? incoming.avoidAreas.filter(a => typeof a === 'string') : [],
      oilSensitivities: typeof incoming.oilSensitivities === 'string' ? incoming.oilSensitivities.trim().slice(0, 500) : '',
      notes: typeof incoming.notes === 'string' ? incoming.notes.trim().slice(0, 2000) : ''
    };

    const update = {
      'profile.treatmentPreferences': sanitized
    };
    if (req.body.registrationStep) {
      update.registrationStep = req.body.registrationStep;
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $set: update },
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
