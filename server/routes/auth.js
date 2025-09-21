const express = require('express');
const router = express.Router();
const passport = require('passport');
const User = require('../models/User');
const Invitation = require('../models/Invitation');
const { ensureAuthenticated, ensureGuest } = require('../middleware/passportMiddleware');

// @route   POST api/auth/register
// @desc    Register user and handle invitation if provided
// @access  Public
router.post('/register', ensureGuest, async (req, res) => {
  try {
    const { email, password, accountType } = req.body;
    const invitationToken = req.body.invitationToken || req.body.invitationCode;

    if (!['PROVIDER', 'CLIENT'].includes(accountType)) {
      return res.status(400).json({ message: 'Invalid account type' });
    }

    if (accountType === 'PROVIDER') {
      const providerPassword = req.body.providerPassword;
      const expectedPassword = process.env.PROVIDER_SIGNUP_PASSWORD;
      
      console.log('Provider sign-up attempt:', {
        providedPassword: providerPassword,
        expectedPassword: expectedPassword,
        envVarSet: !!process.env.PROVIDER_SIGNUP_PASSWORD
      });
      
      if (!providerPassword || providerPassword !== expectedPassword) {
        return res.status(400).json({ message: 'Invalid provider access password' });
      }
    }

    let user = await User.findByEmail(email);
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    let providerId = null;

    if (accountType === 'CLIENT' && invitationToken) {
      // Handle invitation if provided, but it's no longer required
      const invitation = await Invitation.findOne({
        token: invitationToken,
        status: 'PENDING',
        expires: { $gt: new Date() }
      });

      if (invitation) {
        if (process.env.NODE_ENV !== 'development' && 
            invitation.email.toLowerCase() !== email.toLowerCase()) {
          return res.status(400).json({ message: 'Email does not match invitation' });
        }

        providerId = invitation.provider;
      }
      // If no invitation token provided or invalid, providerId remains null
    }

    user = new User({ 
      email, 
      password,
      accountType,
      providerId,
      registrationStep: 1,
      ...(accountType === 'PROVIDER' ? {
        providerProfile: {
          businessName: req.body.businessName || '',
          subscription: {
            plan: 'BASIC',
            status: 'ACTIVE',
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          }
        }
      } : {})
    });
    
    await user.save();

    if (user.accountType === 'PROVIDER' && !user.providerId) {
      user.providerId = user._id;
      await user.save();
    }
    
    if (accountType === 'CLIENT' && invitationToken) {
      await Invitation.findOneAndUpdate(
        { token: invitationToken },
        { status: 'ACCEPTED' }
      );
    }
    
    req.login(user, async (err) => {
      if (err) {
        return res.status(500).json({ message: 'Registration successful but login failed' });
      }

      // Explicitly save the session to ensure it's persisted
      req.session.save(async (saveErr) => {
        if (saveErr) {
          console.error('Session save error:', saveErr);
          return res.status(500).json({ message: 'Registration successful but session save failed' });
        }

        try {
          const userData = user.getPublicProfile();
          let providerInfo = null;
          
          if (accountType === 'CLIENT' && providerId) {
            userData.providerId = providerId;
            const provider = await User.findById(providerId)
              .select('providerProfile.businessName email');
            if (provider) {
              providerInfo = {
                businessName: provider.providerProfile.businessName,
                email: provider.email
              };
            }
          }

          return res.status(201).json({
            message: 'Registration successful',
            user: userData,
            provider: providerInfo
          });
        } catch (error) {
          console.error('Error fetching provider info:', error);
          return res.status(500).json({ message: 'Error completing registration' });
        }
      });
    });

  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// @route   POST api/auth/login
// @desc    Authenticate user & create session
// @access  Public
router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      console.error('Login error:', err);
      return res.status(500).json({ message: 'Login error occurred' });
    }

    if (!user) {
      return res.status(401).json({ message: info.message || 'Invalid credentials' });
    }

    req.login(user, (err) => {
      if (err) {
        console.error('Session creation error:', err);
        return res.status(500).json({ message: 'Error creating session' });
      }

      const userData = user.getPublicProfile();
      if (user.accountType === 'CLIENT' && user.providerId) {
        userData.providerId = user.providerId;
      }

      return res.json({
        message: 'Login successful',
        user: userData
      });
    });
  })(req, res, next);
});

// @route   POST api/auth/logout
// @desc    Logout user & destroy session
// @access  Private
router.post('/logout', ensureAuthenticated, (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ message: 'Error during logout' });
    }

    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction error:', err);
        return res.status(500).json({ message: 'Error clearing session' });
      }

      res.json({ message: 'Logged out successfully' });
    });
  });
});

// @route   GET api/auth/current-user
// @desc    Get current user's data with provider info if client
// @access  Private
router.get('/current-user', ensureAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let userData = user.getPublicProfile();
    if (user.accountType === 'CLIENT' && user.providerId) {
      const provider = await User.findById(user.providerId)
        .select('providerProfile.businessName email');
      
      if (provider) {
        userData.provider = {
          id: provider._id,
          businessName: provider.providerProfile.businessName,
          email: provider.email
        };
      }
    }

    res.json({ user: userData });
  } catch (err) {
    console.error('Error fetching current user:', err);
    res.status(500).json({ message: 'Error fetching user data' });
  }
});

// @route   GET api/auth/check-session
// @desc    Check if user's session is valid and return provider info if client
// @access  Public
router.get('/check-session', async (req, res) => {
  if (req.isAuthenticated()) {
    try {
      const user = await User.findById(req.user._id);
      if (!user) {
        return res.json({ isAuthenticated: false, user: null });
      }

      let userData = user.getPublicProfile();

      if (user.accountType === 'CLIENT' && user.providerId) {
        const provider = await User.findById(user.providerId)
          .select('providerProfile.businessName email');
        
        if (provider) {
          userData.provider = {
            id: provider._id,
            businessName: provider.providerProfile.businessName,
            email: provider.email
          };
        }
      }

      res.json({
        isAuthenticated: true,
        user: userData
      });
    } catch (error) {
      console.error('Session check error:', error);
      res.status(500).json({ message: 'Error checking session' });
    }
  } else {
    res.json({ isAuthenticated: false, user: null });
  }
});

module.exports = router;
