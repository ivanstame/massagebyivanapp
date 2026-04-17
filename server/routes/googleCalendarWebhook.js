const express = require('express');
const router = express.Router();
const User = require('../models/User');
const gcalSync = require('../services/googleCalendarSync');

// POST /webhook — Receive Google Calendar push notifications
router.post('/webhook', async (req, res) => {
  // Verify webhook token
  const token = req.headers['x-goog-channel-token'];
  if (token !== process.env.GOOGLE_WEBHOOK_SECRET) {
    console.warn('[GCal Webhook] Invalid token received');
    return res.status(403).send('Invalid token');
  }

  const resourceState = req.headers['x-goog-resource-state'];
  const channelId = req.headers['x-goog-channel-id'];

  // Handle sync handshake — just acknowledge
  if (resourceState === 'sync') {
    console.log(`[GCal Webhook] Sync handshake received for channel ${channelId}`);
    return res.status(200).send('OK');
  }

  // Respond 200 immediately — process asynchronously
  res.status(200).send('OK');

  // Process the change notification
  setImmediate(async () => {
    try {
      // Find the provider with this channel ID
      const providers = await User.find({
        'providerProfile.googleCalendar.connected': true
      });

      let targetProvider = null;
      let targetCalendarId = null;

      for (const provider of providers) {
        const watchChannels = provider.providerProfile.googleCalendar?.watchChannels;
        if (!watchChannels) continue;

        for (const [calendarId, channel] of watchChannels) {
          if (channel.channelId === channelId) {
            targetProvider = provider;
            targetCalendarId = calendarId;
            break;
          }
        }
        if (targetProvider) break;
      }

      if (!targetProvider) {
        console.warn(`[GCal Webhook] No provider found for channel ${channelId}`);
        return;
      }

      console.log(`[GCal Webhook] Change notification for ${targetProvider.email}, calendar ${targetCalendarId}`);
      await gcalSync.runIncrementalSync(targetProvider, targetCalendarId);
    } catch (err) {
      console.error('[GCal Webhook] Processing error:', err.message);
    }
  });
});

module.exports = router;
