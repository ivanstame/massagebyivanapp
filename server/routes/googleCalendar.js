const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { ensureAuthenticated } = require('../middleware/passportMiddleware');
const gcalService = require('../services/googleCalendarService');
const gcalSync = require('../services/googleCalendarSync');
const User = require('../models/User');

// GET /oauth/start — Redirect provider to Google consent screen
router.get('/oauth/start', ensureAuthenticated, (req, res) => {
  if (req.user.accountType !== 'PROVIDER') {
    return res.status(403).json({ message: 'Provider access required' });
  }

  const state = crypto.randomBytes(32).toString('hex');
  req.session.googleOAuthState = state;
  req.session.googleOAuthUserId = req.user._id.toString();

  const authUrl = gcalService.getAuthUrl(state);
  res.json({ url: authUrl });
});

// GET /oauth/callback — Exchange code for tokens
router.get('/oauth/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.redirect('/provider/settings?gcal=error&reason=no_code');
    }

    // Verify state for CSRF protection
    if (!req.session.googleOAuthState || state !== req.session.googleOAuthState) {
      return res.redirect('/provider/settings?gcal=error&reason=invalid_state');
    }

    const userId = req.session.googleOAuthUserId;
    delete req.session.googleOAuthState;
    delete req.session.googleOAuthUserId;

    if (!userId) {
      return res.redirect('/provider/settings?gcal=error&reason=no_session');
    }

    // Exchange code for tokens
    const tokens = await gcalService.exchangeCode(code);

    const provider = await User.findById(userId);
    if (!provider) {
      return res.redirect('/provider/settings?gcal=error&reason=user_not_found');
    }

    // Get connected email (non-fatal if it fails)
    let email = null;
    try {
      const oauth2Client = gcalService.buildOAuth2Client();
      oauth2Client.setCredentials(tokens);
      email = await gcalService.getUserEmail(oauth2Client);
    } catch (emailErr) {
      console.warn('[GCal] Could not fetch connected email:', emailErr.message);
    }

    // Store tokens
    provider.providerProfile.googleCalendar = {
      ...provider.providerProfile.googleCalendar,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      connected: true,
      connectedEmail: email,
      syncedCalendarIds: [],
      watchChannels: provider.providerProfile.googleCalendar?.watchChannels || new Map(),
      syncTokens: provider.providerProfile.googleCalendar?.syncTokens || new Map(),
      lastSyncedAt: null
    };
    await provider.save();

    console.log(`[GCal] Provider ${provider.email} connected Google Calendar (${email})`);
    res.redirect('/provider/settings?gcal=success');
  } catch (error) {
    console.error('[GCal] OAuth callback error:', error);
    res.redirect('/provider/settings?gcal=error&reason=token_exchange_failed');
  }
});

// GET /status — Connection status
router.get('/status', ensureAuthenticated, async (req, res) => {
  try {
    const provider = await User.findById(req.user._id);
    const gcal = provider.providerProfile?.googleCalendar;

    if (!gcal || !gcal.connected) {
      return res.json({ connected: false });
    }

    res.json({
      connected: true,
      connectedEmail: gcal.connectedEmail,
      syncedCalendarIds: gcal.syncedCalendarIds || [],
      lastSyncedAt: gcal.lastSyncedAt
    });
  } catch (error) {
    console.error('[GCal] Status error:', error);
    res.status(500).json({ message: 'Failed to get Google Calendar status' });
  }
});

// GET /calendars — List provider's Google calendars
router.get('/calendars', ensureAuthenticated, async (req, res) => {
  try {
    const provider = await User.findById(req.user._id);
    const gcal = provider.providerProfile?.googleCalendar;

    if (!gcal || !gcal.connected) {
      return res.status(400).json({ message: 'Google Calendar not connected' });
    }

    const calendars = await gcalService.listCalendars(provider);
    res.json(calendars);
  } catch (error) {
    console.error('[GCal] List calendars error:', error);
    res.status(500).json({ message: 'Failed to list calendars' });
  }
});

// POST /calendars/select — Select which calendars to sync
router.post('/calendars/select', ensureAuthenticated, async (req, res) => {
  try {
    const { calendarIds } = req.body;
    if (!Array.isArray(calendarIds)) {
      return res.status(400).json({ message: 'calendarIds must be an array' });
    }

    const provider = await User.findById(req.user._id);
    const gcal = provider.providerProfile?.googleCalendar;

    if (!gcal || !gcal.connected) {
      return res.status(400).json({ message: 'Google Calendar not connected' });
    }

    const previousIds = gcal.syncedCalendarIds || [];
    const removedIds = previousIds.filter(id => !calendarIds.includes(id));

    // Stop watch channels for removed calendars
    for (const prevId of removedIds) {
      await gcalService.stopWatchChannel(provider, prevId);
      gcal.syncTokens.delete(prevId);
    }

    // Delete BlockedTime rows that came from removed calendars. Without
    // this, un-syncing a calendar leaves its blocks ghost-blocking the
    // provider's availability with no way to clear them. The
    // googleCalendarId stamp lets us scope the deletion precisely to
    // the calendars being removed.
    if (removedIds.length > 0) {
      const BlockedTime = require('../models/BlockedTime');
      const deleted = await BlockedTime.deleteMany({
        provider: provider._id,
        source: 'google_calendar',
        googleCalendarId: { $in: removedIds },
      });
      console.log(`[GCal] Removed ${deleted.deletedCount} BlockedTime rows from un-synced calendars (${removedIds.join(', ')}) for ${provider.email}`);
    }

    // Set up watch channels for new calendars
    for (const newId of calendarIds) {
      if (!previousIds.includes(newId)) {
        try {
          await gcalService.createWatchChannel(provider, newId);
        } catch (err) {
          console.error(`[GCal] Failed to create watch channel for calendar ${newId}:`, err.message);
        }
      }
    }

    gcal.syncedCalendarIds = calendarIds;
    await provider.save();

    // Trigger full sync for selected calendars
    if (calendarIds.length > 0) {
      // Run sync asynchronously
      gcalSync.runFullSync(provider, calendarIds).catch(err =>
        console.error('[GCal] Initial sync error:', err)
      );
    }

    res.json({ message: 'Calendar selection updated', syncedCalendarIds: calendarIds });
  } catch (error) {
    console.error('[GCal] Calendar select error:', error);
    res.status(500).json({ message: 'Failed to update calendar selection' });
  }
});

// POST /sync — Manual full re-sync
router.post('/sync', ensureAuthenticated, async (req, res) => {
  try {
    const provider = await User.findById(req.user._id);
    const gcal = provider.providerProfile?.googleCalendar;

    if (!gcal || !gcal.connected || !gcal.syncedCalendarIds?.length) {
      return res.status(400).json({ message: 'No calendars configured for sync' });
    }

    const result = await gcalSync.runFullSync(provider, gcal.syncedCalendarIds);
    res.json({ message: 'Sync complete', ...result });
  } catch (error) {
    console.error('[GCal] Manual sync error:', error);
    res.status(500).json({ message: 'Sync failed' });
  }
});

// POST /disconnect — Disconnect Google Calendar
router.post('/disconnect', ensureAuthenticated, async (req, res) => {
  try {
    const provider = await User.findById(req.user._id);
    const gcal = provider.providerProfile?.googleCalendar;

    if (!gcal || !gcal.connected) {
      return res.json({ message: 'Already disconnected' });
    }

    // Stop all watch channels
    for (const calendarId of (gcal.syncedCalendarIds || [])) {
      await gcalService.stopWatchChannel(provider, calendarId);
    }

    // Delete all synced blocked times
    await gcalSync.deleteAllGoogleCalendarBlocks(provider._id);

    // Clear all Google Calendar fields
    provider.providerProfile.googleCalendar = {
      accessToken: null,
      refreshToken: null,
      tokenExpiry: null,
      connected: false,
      connectedEmail: null,
      syncedCalendarIds: [],
      watchChannels: new Map(),
      syncTokens: new Map(),
      lastSyncedAt: null
    };
    await provider.save();

    console.log(`[GCal] Provider ${provider.email} disconnected Google Calendar`);
    res.json({ message: 'Google Calendar disconnected' });
  } catch (error) {
    console.error('[GCal] Disconnect error:', error);
    res.status(500).json({ message: 'Failed to disconnect' });
  }
});

module.exports = router;
