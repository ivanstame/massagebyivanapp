const { DateTime } = require('luxon');
const BlockedTime = require('../models/BlockedTime');
const User = require('../models/User');
const gcalService = require('./googleCalendarService');
const { DEFAULT_TZ, TIME_FORMATS } = require('../../src/utils/timeConstants');

const BUFFER_MINUTES = 15;

/**
 * Convert a single Google Calendar event into BlockedTime data objects.
 * Multi-day events are split into per-day slices.
 * Returns array of { start, end, localDate, date, googleEventId } objects,
 * or 'DELETE' string for cancelled events.
 */
function mapEventToBlockedTimes(event) {
  // Cancelled/deleted events → mark for deletion
  if (event.status === 'cancelled') {
    return 'DELETE';
  }

  // Skip "free" events
  if (event.transparency === 'transparent') {
    return [];
  }

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
        googleEventId: `${event.id}_${localDateStr}`
      });

      current = current.plus({ days: 1 });
    }
  } else {
    // Timed event
    const eventStart = DateTime.fromISO(event.start.dateTime).setZone(DEFAULT_TZ);
    const eventEnd = DateTime.fromISO(event.end.dateTime).setZone(DEFAULT_TZ);

    // Apply buffer
    const bufferedStart = eventStart.minus({ minutes: BUFFER_MINUTES });
    const bufferedEnd = eventEnd.plus({ minutes: BUFFER_MINUTES });

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
          googleEventId: `${event.id}_${localDateStr}`
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
    const result = mapEventToBlockedTimes(event);

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
            googleEventId: slice.googleEventId
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
    try {
      const { events, nextSyncToken, fullSyncRequired } =
        await gcalService.fetchEvents(provider, calendarId, null);

      if (!events) continue;

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
    } catch (err) {
      console.error(`[GCal] Full sync error for provider ${provider.email}, calendar ${calendarId}:`, err.message);
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
async function runIncrementalSync(provider, calendarId) {
  const gcal = provider.providerProfile.googleCalendar;
  const syncToken = gcal.syncTokens.get(calendarId);

  if (!syncToken) {
    console.log(`[GCal] No sync token for provider ${provider.email}, calendar ${calendarId}. Running full sync.`);
    return runFullSync(provider, [calendarId]);
  }

  const { events, nextSyncToken, fullSyncRequired } =
    await gcalService.fetchEvents(provider, calendarId, syncToken);

  if (fullSyncRequired) {
    return runFullSync(provider, [calendarId]);
  }

  if (!events || events.length === 0) {
    if (nextSyncToken) {
      gcal.syncTokens.set(calendarId, nextSyncToken);
      await provider.save();
    }
    return { upserted: 0, deleted: 0 };
  }

  const result = await applyEventChanges(provider._id, events);

  if (nextSyncToken) {
    gcal.syncTokens.set(calendarId, nextSyncToken);
  }
  gcal.lastSyncedAt = new Date();
  await provider.save();

  console.log(`[GCal] Incremental sync for ${provider.email}: ${result.upserted} upserted, ${result.deleted} deleted`);
  return result;
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
async function renewExpiringChannels() {
  const cutoff = new Date(Date.now() + 48 * 60 * 60 * 1000);

  const providers = await User.find({
    'providerProfile.googleCalendar.connected': true
  });

  for (const provider of providers) {
    const gcal = provider.providerProfile.googleCalendar;
    if (!gcal.watchChannels) continue;

    for (const [calendarId, channel] of gcal.watchChannels) {
      if (channel.expiration && channel.expiration < cutoff) {
        try {
          console.log(`[GCal] Renewing expiring channel for ${provider.email}, calendar ${calendarId}`);
          await gcalService.stopWatchChannel(provider, calendarId);
          await gcalService.createWatchChannel(provider, calendarId);
        } catch (err) {
          console.error(`[GCal] Channel renewal failed for ${provider.email}, calendar ${calendarId}:`, err.message);
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
