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
async function mapEventToBlockedTimes(event, providerTz = DEFAULT_TZ) {
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
    // All-day event: start.date is inclusive, end.date is exclusive.
    // "All day" is anchored to the provider's TZ — a Chicago provider's
    // all-day event blocks Chicago midnight-to-midnight, not LA's.
    const startDate = DateTime.fromISO(event.start.date, { zone: providerTz });
    const endDate = DateTime.fromISO(event.end.date, { zone: providerTz });

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
    // Timed event. event.start.dateTime is an ISO string with offset
    // ("2026-05-09T15:00:00-05:00") — the absolute instant is correct
    // regardless of TZ. We zone to the provider's TZ so day-slice
    // bucketing and localDate strings reflect the provider's calendar
    // perception. event.start.timeZone (Google's IANA name on the
    // event) is informational; provider TZ wins for sync output.
    const eventStart = DateTime.fromISO(event.start.dateTime).setZone(providerTz);
    const eventEnd = DateTime.fromISO(event.end.dateTime).setZone(providerTz);

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
 * `calendarId` is stamped onto each upserted BlockedTime so the per-calendar
 * stale-cleanup can scope to one calendar at a time without nuking entries
 * belonging to a different synced calendar on the same provider.
 */
async function applyEventChanges(providerId, events, calendarId = null) {
  let upserted = 0;
  let deleted = 0;
  const upsertedIds = [];

  // Resolve provider TZ once for this batch so each event uses the
  // same TZ for day-slicing.
  const { tzForProviderId } = require('../utils/providerTz');
  const providerTz = await tzForProviderId(providerId);

  for (const event of events) {
    const result = await mapEventToBlockedTimes(event, providerTz);

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
            googleCalendarId: calendarId,
            timezone: providerTz,
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

// ─── ensureFreshGcalSync ──────────────────────────────────────────────
//
// The freshness gate. Every read path that depends on GCal-sourced
// BlockedTime should await this BEFORE querying the cache. It either
// no-ops (cache is fresh or provider has no GCal) or runs an inline
// sync and waits for it.
//
// Why this exists: the daily/webhook-driven sync has multiple silent
// failure modes (expired watch channels, dropped webhooks, auth
// flaps). Trusting the cache without proof has caused real client
// cancellations. The gate makes the cache structurally incapable of
// lying — anything stale gets refreshed before being served.
//
// Concurrency: if two requests for the same provider both find the
// cache stale, they share ONE in-flight sync via a per-provider
// Promise. Otherwise we'd hammer Google with N parallel calls every
// time a hot provider's cache went stale.
const DEFAULT_STALE_AFTER_MS = 2 * 60 * 1000; // 2 minutes
const inFlightFreshness = new Map(); // providerId → Promise

async function ensureFreshGcalSync(providerId, opts = {}) {
  const staleAfterMs = opts.staleAfterMs || DEFAULT_STALE_AFTER_MS;
  const key = String(providerId);

  // Coalesce concurrent requests: if a freshness check is already in
  // flight for this provider, await its result rather than starting
  // a parallel sync.
  if (inFlightFreshness.has(key)) {
    return inFlightFreshness.get(key);
  }

  const promise = (async () => {
    // Cheap projected lookup — read only what we need to decide.
    const provider = await User.findById(providerId).select(
      'email providerProfile.googleCalendar'
    );
    if (!provider) {
      return { connected: false, reason: 'provider-not-found' };
    }
    const gcal = provider.providerProfile?.googleCalendar;
    if (!gcal || !gcal.connected || !gcal.syncedCalendarIds?.length) {
      return { connected: false };
    }

    // Fresh? Bail. Most reads hit this branch.
    const lastOk = gcal.lastSuccessfulSyncAt
      ? gcal.lastSuccessfulSyncAt.getTime()
      : 0;
    if (Date.now() - lastOk < staleAfterMs) {
      return { connected: true, fresh: true, lastSuccessfulSyncAt: gcal.lastSuccessfulSyncAt };
    }

    // Stale. Run a full sync inline and await it.
    try {
      const result = await runFullSync(provider, gcal.syncedCalendarIds);
      return {
        connected: true,
        fresh: true,
        synced: true,
        upserted: result?.upserted || 0,
        deleted: result?.deleted || 0,
      };
    } catch (err) {
      console.error(`[GCal] ensureFresh inline sync failed for ${provider.email}: ${err.message}`);
      // Surface the error on the doc so the UI can show it.
      try {
        provider.providerProfile.googleCalendar.lastSyncError = {
          message: err.message || 'Unknown sync error',
          occurredAt: new Date(),
        };
        await provider.save();
      } catch (saveErr) {
        console.error('[GCal] Failed to record lastSyncError:', saveErr.message);
      }
      // Auth failures: integration is dead, flip to disconnected so
      // the UI prompts a reconnect.
      if (isGcalAuthError(err)) {
        await markGcalDisconnected(provider, `ensureFresh auth failure: ${err.message}`);
      }
      return {
        connected: gcal.connected,
        fresh: false,
        error: err.message,
      };
    }
  })();

  inFlightFreshness.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlightFreshness.delete(key);
  }
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

      const { upserted, upsertedIds } = await applyEventChanges(provider._id, events, calendarId);
      totalUpserted += upserted;

      // Clean up stale records for THIS calendar only — blocks that no
      // longer exist in this Google calendar. Scoping by
      // googleCalendarId is the fix for the cross-calendar deletion
      // bug: previously the cleanup looked at every google_calendar
      // BlockedTime for the provider, so syncing a second calendar
      // would erase the first calendar's still-valid entries.
      //
      // Backward compat: include `null` calendarId in the scope so
      // entries created before this field existed (and are stamped
      // null) get cleaned up by whichever calendar has them in its
      // current upserted set. Once each calendar has run a fresh
      // sync after this deploy, all rows have the field populated
      // and the null branch becomes a no-op.
      const cleanupScope = {
        provider: provider._id,
        source: 'google_calendar',
        $or: [
          { googleCalendarId: calendarId },
          { googleCalendarId: null },
        ],
      };
      if (upsertedIds.length > 0) {
        const staleResult = await BlockedTime.deleteMany({
          ...cleanupScope,
          googleEventId: { $nin: upsertedIds },
        });
        totalDeleted += staleResult.deletedCount;
      } else {
        // No events → delete this calendar's google_calendar blocks
        const staleResult = await BlockedTime.deleteMany(cleanupScope);
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

  const now = new Date();
  gcal.lastSyncedAt = now;
  // lastSuccessfulSyncAt is the freshness anchor that ensureFreshGcalSync
  // reads. Stamp it whenever the sync loop completes without aborting
  // (per-calendar fetches may have failed individually, but the
  // overall provider sync didn't bail). Clear lastSyncError on the
  // same path so a recovered integration stops nagging the UI.
  gcal.lastSuccessfulSyncAt = now;
  gcal.lastSyncError = { message: null, occurredAt: null };
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

    const result = await applyEventChanges(provider._id, events, calendarId);

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
 * Start the Google Calendar scheduler (hourly background sync +
 * channel renewal). The ensureFreshGcalSync gate is the primary
 * freshness mechanism on hot read paths; this background loop just
 * keeps the cache warm for providers who aren't being actively read.
 *
 * Was a daily 3AM sync; switched to hourly because daily-only created
 * a 24-hour blind spot whenever webhooks were dropped. Hourly + the
 * read-path freshness gate together mean the cache is never stale for
 * long, and never trusted past 2 minutes on the path of any read.
 */
function startGoogleCalendarScheduler() {
  if (!process.env.GOOGLE_CLIENT_ID) {
    console.log('[GCal] Google Calendar integration not configured (no GOOGLE_CLIENT_ID). Scheduler not started.');
    return;
  }

  // Hourly background sync. The freshness gate on every read path
  // catches stale data within 2 minutes regardless; this hourly loop
  // is the "keep the cache warm" pass so most read paths hit a fresh
  // cache and bypass the inline sync.
  const HOURLY_MS = 60 * 60 * 1000;
  setInterval(() => {
    runDailySync().catch(err => console.error('[GCal] Hourly sync error:', err));
  }, HOURLY_MS);

  // Initial sync 60 seconds after boot — gives the rest of the app
  // time to settle, then a fresh pull so the first reads after a
  // deploy don't trigger a thundering herd of inline syncs.
  setTimeout(() => {
    runDailySync().catch(err => console.error('[GCal] Initial sync error:', err));
  }, 60 * 1000);

  // Channel renewal every 12 hours
  setInterval(() => {
    renewExpiringChannels().catch(err => console.error('[GCal] Channel renewal error:', err));
  }, 12 * 60 * 60 * 1000);

  // Initial channel renewal check
  renewExpiringChannels().catch(err => console.error('[GCal] Initial channel renewal error:', err));

  console.log('[GCal] Scheduler started (hourly background sync + 12h channel renewal)');
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
  deleteAllGoogleCalendarBlocks,
  ensureFreshGcalSync,
};
