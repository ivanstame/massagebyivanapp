const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const passport = require('passport');
const User = require('../models/User');
const Invitation = require('../models/Invitation');
const { ensureAuthenticated, ensureGuest } = require('../middleware/passportMiddleware');
const { sendPasswordResetEmail } = require('../utils/email');

// Brute-force guard for the provider-signup password gate. The endpoint
// exists to keep the literal out of the client bundle; without a limiter
// it'd be trivially guessable since the password is shared. 5/15min/IP
// is harsh by design — providers paste this once.
const providerSignupVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'Too many attempts. Please wait 15 minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// @route   POST /api/auth/verify-provider-signup-password
// @desc    Confirm the shared provider-signup password without storing it
//          in the client bundle. The same password is re-validated on the
//          actual /register call below; this is purely a UX gate so the
//          provider sees the error before filling out the rest of the
//          signup form.
// @access  Public (rate-limited)
router.post('/verify-provider-signup-password', providerSignupVerifyLimiter, (req, res) => {
  const expected = process.env.PROVIDER_SIGNUP_PASSWORD;
  if (!expected) {
    console.error('PROVIDER_SIGNUP_PASSWORD env var is not set');
    return res.status(500).json({ message: 'Provider signup is not configured on this server.' });
  }
  const supplied = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
  if (supplied && supplied === expected) {
    return res.json({ ok: true });
  }
  return res.status(400).json({ message: 'Invalid provider access password' });
});

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

      // Log only the outcome — earlier versions logged the typed and
      // expected passwords in plaintext, which leaks credentials into
      // Heroku log history.
      const ok = providerPassword && providerPassword === expectedPassword;
      console.log(`Provider sign-up attempt for ${email}: ${ok ? 'accepted' : 'rejected'}`);

      if (!ok) {
        return res.status(400).json({ message: 'Invalid provider access password' });
      }
    }

    let user = await User.findByEmail(email);
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    let providerId = null;

    // Handle join code for clients (preferred method)
    const joinCode = req.body.joinCode;
    if (accountType === 'CLIENT' && joinCode) {
      const provider = await User.findOne({
        joinCode: joinCode.toLowerCase().trim(),
        accountType: 'PROVIDER'
      });

      if (provider) {
        providerId = provider._id;
      } else {
        return res.status(400).json({ message: 'Invalid join code. Please check with your provider.' });
      }
    }

    // Fall back to invitation token if no join code
    if (accountType === 'CLIENT' && !providerId && invitationToken) {
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

// @route   POST api/auth/forgot-password
// @desc    Send password reset email
// @access  Public
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findByEmail(email);

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
    }

    // Generate a secure random token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Save hashed token and expiry (1 hour) to user
    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    // Send email with the unhashed token (user receives this)
    try {
      await sendPasswordResetEmail(user.email, resetToken);
    } catch (emailErr) {
      console.error('Failed to send reset email:', emailErr);
      // Clear the token since the email failed
      user.passwordResetToken = null;
      user.passwordResetExpires = null;
      await user.save();
      return res.status(500).json({ message: 'Failed to send reset email. Please try again later.' });
    }

    res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST api/auth/reset-password
// @desc    Reset password using token
// @access  Public
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // Hash the token from the URL to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    // Set new password (will be hashed by the pre-save hook)
    user.password = password;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    res.json({ message: 'Password has been reset successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
