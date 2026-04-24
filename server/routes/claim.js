const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const ClaimToken = require('../models/ClaimToken');
const { ensureAuthenticated } = require('../middleware/passportMiddleware');

const TOKEN_TTL_DAYS = 7;
const MIN_PASSWORD_LENGTH = 6;

// Base URL used in the generated claim URL. In prod we want the app's own
// host (whatever served this request) so the link works without env config;
// locally we fall back to the CRA dev-server origin.
function claimBaseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.NODE_ENV === 'production') {
    return `${req.protocol}://${req.get('host')}`;
  }
  return 'http://localhost:3000';
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// Mask an email/phone for the "is this you?" preview on the claim page.
// Shows enough for the claimant to recognize without fully disclosing.
function maskEmail(email) {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const maskedLocal = local.length <= 2
    ? local[0] + '*'
    : local[0] + '*'.repeat(Math.max(1, local.length - 2)) + local.slice(-1);
  return `${maskedLocal}@${domain}`;
}

function maskPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 4) return null;
  return '•••-•••-' + digits.slice(-4);
}

// Provider generates a claim link for one of their managed clients. Any
// existing unused tokens for that client are invalidated so we never have
// multiple live links floating around.
router.post('/generate/:managedClientId', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }

    const managed = await User.findOne({
      _id: req.params.managedClientId,
      isManaged: true,
      managedBy: req.user._id,
    });
    if (!managed) {
      return res.status(404).json({ message: 'Managed client not found' });
    }

    // Invalidate any prior unused tokens for this client.
    await ClaimToken.deleteMany({
      managedClient: managed._id,
      usedAt: null,
    });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    await ClaimToken.create({
      tokenHash,
      managedClient: managed._id,
      createdBy: req.user._id,
      expiresAt,
    });

    const url = `${claimBaseUrl(req)}/claim/${rawToken}`;

    res.status(201).json({
      url,
      expiresAt,
      clientName: managed.profile?.fullName || 'Your client',
      clientPhone: managed.profile?.phoneNumber || null,
      clientEmail: managed.email || null,
    });
  } catch (err) {
    console.error('Error generating claim link:', err);
    res.status(500).json({ message: 'Failed to generate claim link' });
  }
});

// Public preview. Shown to the claimant before they submit so they can see
// which account they're about to take over (name + masked contact info) and
// confirm it's actually them. Does NOT modify anything.
router.get('/:token', async (req, res) => {
  try {
    const tokenHash = hashToken(req.params.token);
    const record = await ClaimToken.findOne({ tokenHash })
      .populate('managedClient')
      .populate('createdBy', 'profile.fullName providerProfile.businessName email');

    if (!record) {
      return res.status(404).json({ message: 'This claim link is invalid or has expired.' });
    }
    if (record.usedAt) {
      return res.status(410).json({ message: 'This claim link has already been used.' });
    }
    if (record.expiresAt < new Date()) {
      return res.status(410).json({ message: 'This claim link has expired. Ask your provider for a new one.' });
    }

    const client = record.managedClient;
    if (!client || !client.isManaged) {
      // The managed client was deleted, or already claimed via another flow.
      return res.status(410).json({ message: 'This claim link is no longer valid.' });
    }

    const provider = record.createdBy || {};
    res.json({
      clientName: client.profile?.fullName || 'Your account',
      clientEmail: maskEmail(client.email),
      clientPhone: maskPhone(client.profile?.phoneNumber),
      clientAddress: client.profile?.address?.formatted || null,
      needsEmail: !client.email,
      providerName:
        provider.profile?.fullName ||
        provider.providerProfile?.businessName ||
        provider.email ||
        'Your provider',
      expiresAt: record.expiresAt,
    });
  } catch (err) {
    console.error('Error loading claim token:', err);
    res.status(500).json({ message: 'Error loading claim link' });
  }
});

// Redeem the claim. Flips isManaged to false, sets the password, optionally
// updates email + SMS consent, logs the user in so the next request lands
// them in the app authenticated.
router.post('/:token', async (req, res) => {
  try {
    const { password, email, smsConsent } = req.body;

    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      });
    }

    const tokenHash = hashToken(req.params.token);
    const record = await ClaimToken.findOne({ tokenHash });

    if (!record) {
      return res.status(404).json({ message: 'This claim link is invalid or has expired.' });
    }
    if (record.usedAt) {
      return res.status(410).json({ message: 'This claim link has already been used.' });
    }
    if (record.expiresAt < new Date()) {
      return res.status(410).json({ message: 'This claim link has expired. Ask your provider for a new one.' });
    }

    const user = await User.findById(record.managedClient);
    if (!user || !user.isManaged) {
      return res.status(410).json({ message: 'This claim link is no longer valid.' });
    }

    // If the claimant wants to set or update an email, verify it's not
    // already in use by another account. We don't force email — they can
    // claim with just a password — but if they set one it must be unique.
    if (email && email.trim()) {
      const normalized = email.trim().toLowerCase();
      const existing = await User.findOne({ email: normalized, _id: { $ne: user._id } });
      if (existing) {
        return res.status(400).json({ message: 'That email is already in use.' });
      }
      user.email = normalized;
    } else if (!user.email) {
      return res.status(400).json({
        message: 'Please enter an email address so you can log in later.',
      });
    }

    user.password = password; // pre-save hook hashes
    user.isManaged = false;
    // Keep managedBy populated as a provenance record — lets the provider
    // (or a future audit) see who originally created this account.
    // providerId stays the same so the client-provider relationship is
    // preserved and bookings/availability queries keep working.
    user.smsConsent = !!smsConsent;

    await user.save();

    // Single-use: mark redeemed so this token can't be used again.
    record.usedAt = new Date();
    await record.save();

    // Invalidate any other outstanding tokens for this client (belt-and-
    // suspenders — the generate endpoint already clears them, but if the
    // provider regenerated between preview and submit we clean up here too).
    await ClaimToken.deleteMany({
      managedClient: user._id,
      usedAt: null,
      _id: { $ne: record._id },
    });

    // Log them in so the next request is authenticated.
    req.login(user, (err) => {
      if (err) {
        console.error('Session creation error on claim:', err);
        return res.status(500).json({ message: 'Account claimed but login failed. Please log in manually.' });
      }
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('Session save error on claim:', saveErr);
          return res.status(500).json({ message: 'Account claimed but session save failed. Please log in manually.' });
        }
        res.json({
          message: 'Account claimed successfully',
          user: user.getPublicProfile(),
        });
      });
    });
  } catch (err) {
    console.error('Error redeeming claim token:', err);
    res.status(500).json({ message: 'Failed to claim account' });
  }
});

module.exports = router;
