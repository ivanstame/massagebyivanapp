const { DateTime } = require('luxon');
const axios = require('axios');
const BlockedTime = require('../models/BlockedTime');
const User = require('../models/User');
const gcalService = require('./googleCalendarService');
const { DEFAULT_TZ, TIME_FORMATS } = require('../../src/utils/timeConstants');

// Buffer added to each side of a synced GCal event when materializing the
// BlockedTime range. Zero for events whose location we successfully
// geocoded — the per-booking travel-time engine in timeUtils.js already
// computes drive-time boundaries from the event's actual location, so
// any extra padding here would be double-counted (and would also surface
// as visibly inflated blocks in the provider's day view). Generous 30
// when there's no location, since travel-time math has nothing to anchor
// on and we'd rather over-block than miss a conflict.
const BUFFER_WITH_LOCATION = 0;
const BUFFER_WITHOUT_LOCATION = 30;

// Simple in-memory geocode cache to avoid redundant API calls during a sync run
const geocodeCache = new Map();

// Detect Google OAuth auth failures so we can flip the integration's
// `connected` flag instead of silently looping on a dead refresh
// token. Most relevant in Testing-mode OAuth apps where refresh tokens
// expire after 7 days; also covers the user-revoked-on-Google's-side
// path. We err on the side of disconnecting too eagerly here — false
// positives just prompt a quick reconnect; false negatives mean the
// user thinks GCal is working when it isn't.
function isGcalAuthError(err) {
  if (!err) return false;
  const code = err.code || err.response?.status;
  const msg = String(err.message || '').toLowerCase();
  const data = err.response?.data || {};
  const errStr = String(data.error || data.error_description || '').toLowerCase();
  return (
    code === 401
    || code === 403
    || msg.includes('invalid_grant')
    || msg.includes('invalid grant')
    || msg.includes('invalid_token')
    || errStr.includes('invalid_grant')
    || errStr.includes('invalid_token')
  );
}

// Flip the integration to disconnected and clear tokens so the UI
// surfaces the Reconnect button on next /status hit. Idempotent —
// safe to call multiple times. Logs loudly so the operator sees
// the chain that led to the disconnect.
async function markGcalDisconnected(provider, reason) {
  const gcal = provider.providerProfile?.googleCalendar;
  if (!gcal || gcal.connected === false) return;
  console.warn(`[GCal] Disconnecting ${provider.email} — ${reason}`);
  gcal.connected = false;
  gcal.accessToken = null;
  gcal.refreshToken = null;
  gcal.tokenExpiry = null;
  // Watch channels are now invalid on Google's side anyway; clear so
  // we don't try to stop them with bad tokens on next renewal.
  if (gcal.watchChannels && typeof gcal.watchChannels.clear === 'function') {
    gcal.watchChannels.clear();
  }
  await provider.save();
}

async function geocodeAddress(address) {
  if (!address || !process.env.GOOGLE_MAPS_API_KEY) return null;
  if (geocodeCache.has(address)) return geocodeCache.get(address);

  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: { address, key: process.env.GOOGLE_MAPS_API_KEY }
    });
    if (response.data.status === 'OK' && response.data.results.length > 0) {
      const { lat, lng } = response.data.results[0].geometry.location;
      const result = { lat, lng, address: response.data.results[0].formatted_address };
      geocodeCache.set(address, result);
      return result;
    }
  } catch (err) {
    console.warn(`[GCal] Geocode failed for "${address}":`, err.message);
  }
  geocodeCache.set(address, null);
  return null;
}

// Safeguards against runaway syncing
const MIN_SYNC_INTERVAL_MS = 10 * 1000; // Minimum 10s between syncs for same provider/calendar
const activeSyncs = new Set(); // providerId:calendarId keys currently syncing
const lastSyncAt = new Map(); // providerId:calendarId → timestamp
const syncFailureCount = new Map(); // providerId:calendarId → consecutive failure count
const MAX_CONSECUTIVE_FAILURES = 5;

function syncKey(providerId, calendarId) {
  return `${providerId}:${calendarId}`;
}

function canStartSync(providerId, calendarId) {
  const key = syncKey(providerId, calendarId);
  // Concurrency: skip if already syncing
  if (activeSyncs.has(key)) {
    console.log(`[GCal] Sync already in progress for ${key}, skipping`);
    return false;
  }
  // Debounce: skip if synced recently
  const last = lastSyncAt.get(key);
  if (last && Date.now() - last < MIN_SYNC_INTERVAL_MS) {
    console.log(`[GCal] Sync debounced for ${key} (last sync ${Date.now() - last}ms ago)`);
    return false;
  }
  // Circuit breaker: skip if too many consecutive failures
  const failures = syncFailureCount.get(key) || 0;
  if (failures >= MAX_CONSECUTIVE_FAILURES) {
    console.warn(`[GCal] Circuit breaker open for ${key} (${failures} failures), skipping`);
    return false;
  }
  return true;
}

function markSyncStart(providerId, calendarId) {
  activeSyncs.add(syncKey(providerId, calendarId));
}

function markSyncEnd(providerId, calendarId, success) {
  const key = syncKey(providerId, calendarId);
  activeSyncs.delete(key);
  lastSyncAt.set(key, Date.now());
  if (success) {
    syncFailureCount.delete(key);
  } else {
    syncFailureCount.set(key, (syncFailureCount.get(key) || 0) + 1);
  }
}

/**
 * Convert a single Google Calendar event into BlockedTime data objects.
 * Multi-day events are split into per-day slices.
 * Returns array of { start, end, localDate, date, googleEventId } objects,
 * or 'DELETE' string for cancelled events.
 */
async function mapEventToBlockedTimes(event) {
  // Cancelled/deleted events → mark for deletion
  if (event.status === 'cancelled') {
    return 'DELETE';
  }

  // Skip "free" events
  if (event.transparency === 'transparent') {
    return [];
  }

  // Geocode event location if present
  let location = null;
  if (event.location) {
    const geo = await geocodeAddress(event.location);
    if (geo) {
      location = { address: geo.address, lat: geo.lat, lng: geo.lng };
    }
  }

  // Buffer depends on whether we have a location (travel time will handle extra for located events)
  const bufferMinutes = location ? BUFFER_WITH_LOCATION : BUFFER_WITHOUT_LOCATION;

  const isAllDay = !!event.start.date;
  const slices = [];

  if (isAllDay) {
    // All-day event: start.date is inclusive, end.date is exclusive
    const startDate = DateTime.fromISO(event.start.date, { zone: DEFAULT_TZ });
    const endDate = DateTime.fromISO(event.end.date, { zone: DEFAULT_TZ });

    let current = startDate;
    while (current < endDate) {
      const dayStart = current.startOf('day');
      const dayEnd = current.set({ hour: 23, minute: 59, second: 59 });
      const localDateStr = current.toFormat(TIME_FORMATS.ISO_DATE);

      slices.push({
        start: dayStart.toUTC().toJSDate(),
        end: dayEnd.toUTC().toJSDate(),
        localDate: localDateStr,
        date: dayStart.toUTC().toJSDate(),
        googleEventId: `${event.id}_${localDateStr}`,
        location
      });

      current = current.plus({ days: 1 });
    }
  } else {
    // Timed event
    const eventStart = DateTime.fromISO(event.start.dateTime).setZone(DEFAULT_TZ);
    const eventEnd = DateTime.fromISO(event.end.dateTime).setZone(DEFAULT_TZ);

    // Apply buffer
    const bufferedStart = eventStart.minus({ minutes: bufferMinutes });
    const bufferedEnd = eventEnd.plus({ minutes: bufferMinutes });

    // Determine all days this event spans
    const startDay = bufferedStart.startOf('day');
    const endDay = bufferedEnd.startOf('day');

    let currentDay = startDay;
    while (currentDay <= endDay) {
      const dayStart = currentDay.startOf('day');
      const dayEnd = currentDay.set({ hour: 23, minute: 59, second: 59 });

      // Clamp to day boundaries
      const sliceStart = DateTime.max(bufferedStart, dayStart);
      const sliceEnd = DateTime.min(bufferedEnd, dayEnd);

      if (sliceStart < sliceEnd) {
        const localDateStr = currentDay.toFormat(TIME_FORMATS.ISO_DATE);
        slices.push({
          start: sliceStart.toUTC().toJSDate(),
          end: sliceEnd.toUTC().toJSDate(),
          localDate: localDateStr,
          date: dayStart.toUTC().toJSDate(),
          googleEventId: `${event.id}_${localDateStr}`,
          location
        });
      }

      currentDay = currentDay.plus({ days: 1 });
    }
  }

  return slices;
}

/**
 * Process a batch of Google Calendar events: upsert or delete BlockedTime records.
 */
async function applyEventChanges(providerId, events) {
  let upserted = 0;
  let deleted = 0;
  const upsertedIds = [];

  for (const event of events) {
    const result = await mapEventToBlockedTimes(event);

    if (result === 'DELETE') {
      // Delete all day-slices for this event
      const deleteResult = await BlockedTime.deleteMany({
        provider: providerId,
        googleEventId: { $regex: `^${event.id}_` }
      });
      deleted += deleteResult.deletedCount;
      continue;
    }

    for (const slice of result) {
      await BlockedTime.findOneAndUpdate(
        { provider: providerId, googleEventId: slice.googleEventId },
        {
          $set: {
            provider: providerId,
            start: slice.start,
            end: slice.end,
            localDate: slice.localDate,
            date: slice.date,
            source: 'google_calendar',
            googleEventId: slice.googleEventId,
            location: slice.location || { address: null, lat: null, lng: null }
          }
        },
        { upsert: true, new: true }
      );
      upsertedIds.push(slice.googleEventId);
      upserted++;
    }
  }

  return { upserted, deleted, upsertedIds };
}

/**
 * Run a full sync for a provider's calendar. Fetches all events in the 30-day window,
 * upserts them, then cleans up stale records.
 */
async function runFullSync(provider, calendarIds) {
  const gcal = provider.providerProfile.googleCalendar;
  let totalUpserted = 0;
  let totalDeleted = 0;

  for (const calendarId of calendarIds) {
    if (!canStartSync(provider._id.toString(), calendarId)) {
      continue;
    }
    markSyncStart(provider._id.toString(), calendarId);
    let syncSuccess = false;

    try {
      const { events, nextSyncToken, fullSyncRequired } =
        await gcalService.fetchEvents(provider, calendarId, null);

      if (!events) {
        markSyncEnd(provider._id.toString(), calendarId, false);
        continue;
      }

      const { upserted, upsertedIds } = await applyEventChanges(provider._id, events);
      totalUpserted += upserted;

      // Clean up stale records for this calendar (blocks that no longer exist in Google)
      if (upsertedIds.length > 0) {
        const staleResult = await BlockedTime.deleteMany({
          provider: provider._id,
          source: 'google_calendar',
          googleEventId: { $regex: `^.+_`, $nin: upsertedIds }
        });
        totalDeleted += staleResult.deletedCount;
      } else {
        // No events → delete all google_calendar blocks for this provider
        const staleResult = await BlockedTime.deleteMany({
          provider: provider._id,
          source: 'google_calendar'
        });
        totalDeleted += staleResult.deletedCount;
      }

      // Store sync token
      if (nextSyncToken) {
        gcal.syncTokens.set(calendarId, nextSyncToken);
      }
      syncSuccess = true;
    } catch (err) {
      console.error(`[GCal] Full sync error for provider ${provider.email}, calendar ${calendarId}:`, err.message);
      // If this is a token-class failure, the integration is
      // effectively dead. Disconnect and stop iterating other
      // calendars on the same provider — they'd all 401 too.
      if (isGcalAuthError(err)) {
        await markGcalDisconnected(provider, `full sync auth failure: ${err.message}`);
        markSyncEnd(provider._id.toString(), calendarId, false);
        return;
      }
    } finally {
      markSyncEnd(provider._id.toString(), calendarId, syncSuccess);
    }
  }

  gcal.lastSyncedAt = new Date();
  await provider.save();

  console.log(`[GCal] Full sync complete for ${provider.email}: ${totalUpserted} upserted, ${totalDeleted} stale deleted`);
  return { upserted: totalUpserted, deleted: totalDeleted };
}

/**
 * Run an incremental sync triggered by a webhook.
 */
async function runIncrementalSync(provider, calendarId, retryCount = 0) {
  if (retryCount > 1) {
    console.error(`[GCal] Incremental sync recursion limit hit for ${provider.email}, calendar ${calendarId}`);
    return { upserted: 0, deleted: 0 };
  }

  const gcal = provider.providerProfile.googleCalendar;
  const syncToken = gcal.syncTokens.get(calendarId);

  if (!syncToken) {
    console.log(`[GCal] No sync token for provider ${provider.email}, calendar ${calendarId}. Running full sync.`);
    return runFullSync(provider, [calendarId]);
  }

  if (!canStartSync(provider._id.toString(), calendarId)) {
    return { upserted: 0, deleted: 0 };
  }
  markSyncStart(provider._id.toString(), calendarId);
  let syncSuccess = false;

  try {
    const { events, nextSyncToken, fullSyncRequired } =
      await gcalService.fetchEvents(provider, calendarId, syncToken);

    if (fullSyncRequired) {
      markSyncEnd(provider._id.toString(), calendarId, true);
      return runFullSync(provider, [calendarId]);
    }

    if (!events || events.length === 0) {
      if (nextSyncToken) {
        gcal.syncTokens.set(calendarId, nextSyncToken);
        await provider.save();
      }
      syncSuccess = true;
      return { upserted: 0, deleted: 0 };
    }

    const result = await applyEventChanges(provider._id, events);

    if (nextSyncToken) {
      gcal.syncTokens.set(calendarId, nextSyncToken);
    }
    gcal.lastSyncedAt = new Date();
    await provider.save();

    syncSuccess = true;
    console.log(`[GCal] Incremental sync for ${provider.email}: ${result.upserted} upserted, ${result.deleted} deleted`);
    return result;
  } catch (err) {
    console.error(`[GCal] Incremental sync error for ${provider.email}, calendar ${calendarId}:`, err.message);
    if (isGcalAuthError(err)) {
      await markGcalDisconnected(provider, `incremental sync auth failure: ${err.message}`);
    }
    return { upserted: 0, deleted: 0 };
  } finally {
    markSyncEnd(provider._id.toString(), calendarId, syncSuccess);
  }
}

/**
 * Daily full sync for all connected providers.
 */
async function runDailySync() {
  console.log('[GCal] Starting daily sync...');
  const providers = await User.find({
    'providerProfile.googleCalendar.connected': true,
    'providerProfile.googleCalendar.syncedCalendarIds.0': { $exists: true }
  });

  for (const provider of providers) {
    try {
      await runFullSync(provider, provider.providerProfile.googleCalendar.syncedCalendarIds);
    } catch (err) {
      console.error(`[GCal] Daily sync failed for ${provider.email}:`, err.message);
    }
  }
  console.log(`[GCal] Daily sync complete for ${providers.length} provider(s)`);
}

/**
 * Renew watch channels expiring within 48 hours.
 */
const channelRenewalFailures = new Map(); // providerId:calendarId → consecutive failure count
const MAX_RENEWAL_FAILURES = 3;

async function renewExpiringChannels() {
  const cutoff = new Date(Date.now() + 48 * 60 * 60 * 1000);

  const providers = await User.find({
    'providerProfile.googleCalendar.connected': true
  });

  for (const provider of providers) {
    const gcal = provider.providerProfile.googleCalendar;
    if (!gcal.watchChannels) continue;

    for (const [calendarId, channel] of gcal.watchChannels) {
      const renewalKey = `${provider._id}:${calendarId}`;
      if (channel.expiration && channel.expiration < cutoff) {
        const failures = channelRenewalFailures.get(renewalKey) || 0;
        if (failures >= MAX_RENEWAL_FAILURES) {
          console.warn(`[GCal] Channel renewal circuit breaker open for ${renewalKey}, skipping`);
          continue;
        }
        try {
          console.log(`[GCal] Renewing expiring channel for ${provider.email}, calendar ${calendarId}`);
          await gcalService.stopWatchChannel(provider, calendarId);
          await gcalService.createWatchChannel(provider, calendarId);
          channelRenewalFailures.delete(renewalKey);
        } catch (err) {
          // Auth-class failure: refresh token is dead. Don't retry —
          // mark the integration disconnected and bail. The provider
          // sees a Reconnect prompt on next /status and re-links in
          // a few seconds. Without this, the channel quietly expires
          // and sync stays "connected: true" but functionally dead.
          if (isGcalAuthError(err)) {
            await markGcalDisconnected(provider, `channel renewal auth failure: ${err.message}`);
            channelRenewalFailures.delete(renewalKey);
            break; // no point trying other calendars; tokens are bad
          }
          channelRenewalFailures.set(renewalKey, failures + 1);
          console.error(`[GCal] Channel renewal failed for ${provider.email}, calendar ${calendarId} (failure ${failures + 1}/${MAX_RENEWAL_FAILURES}):`, err.message);
        }
      }
    }
  }
}

/**
 * Start the Google Calendar scheduler (daily sync + channel renewal).
 */
function startGoogleCalendarScheduler() {
  if (!process.env.GOOGLE_CLIENT_ID) {
    console.log('[GCal] Google Calendar integration not configured (no GOOGLE_CLIENT_ID). Scheduler not started.');
    return;
  }

  // Schedule daily sync at 3 AM LA time
  const scheduleNext3AM = () => {
    const now = DateTime.now().setZone(DEFAULT_TZ);
    let next3AM = now.set({ hour: 3, minute: 0, second: 0, millisecond: 0 });
    if (now >= next3AM) {
      next3AM = next3AM.plus({ days: 1 });
    }
    const msUntil = next3AM.toMillis() - now.toMillis();

    setTimeout(() => {
      runDailySync().catch(err => console.error('[GCal] Daily sync error:', err));
      // Schedule again for tomorrow
      setInterval(() => {
        runDailySync().catch(err => console.error('[GCal] Daily sync error:', err));
      }, 24 * 60 * 60 * 1000);
    }, msUntil);

    console.log(`[GCal] Daily sync scheduled for ${next3AM.toFormat('yyyy-MM-dd HH:mm')} LA time (in ${Math.round(msUntil / 60000)} minutes)`);
  };

  scheduleNext3AM();

  // Channel renewal every 12 hours
  setInterval(() => {
    renewExpiringChannels().catch(err => console.error('[GCal] Channel renewal error:', err));
  }, 12 * 60 * 60 * 1000);

  // Initial channel renewal check
  renewExpiringChannels().catch(err => console.error('[GCal] Initial channel renewal error:', err));

  console.log('[GCal] Scheduler started');
}

/**
 * Delete all Google Calendar blocked times for a provider.
 */
async function deleteAllGoogleCalendarBlocks(providerId) {
  const result = await BlockedTime.deleteMany({
    provider: providerId,
    source: 'google_calendar'
  });
  console.log(`[GCal] Deleted ${result.deletedCount} Google Calendar blocks for provider ${providerId}`);
  return result.deletedCount;
}

module.exports = {
  mapEventToBlockedTimes,
  applyEventChanges,
  runFullSync,
  runIncrementalSync,
  runDailySync,
  renewExpiringChannels,
  startGoogleCalendarScheduler,
  deleteAllGoogleCalendarBlocks
};
