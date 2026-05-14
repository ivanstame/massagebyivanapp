const axios = require('axios');
const ical = require('node-ical');
const { DateTime } = require('luxon');
const BlockedTime = require('../models/BlockedTime');
const ExternalCalendarFeed = require('../models/ExternalCalendarFeed');
const { DEFAULT_TZ, TIME_FORMATS } = require('../../src/utils/timeConstants');
const { tzForProviderId } = require('../utils/providerTz');

// Look-ahead window for materializing recurring events. Mirrors the
// GCal sync's 30-day window — anything further out gets picked up on
// subsequent polls as it slides into the window. Limits node-ical's
// RRULE expansion blowing up memory on long-horizon recurrences.
const LOOKAHEAD_DAYS = 90;
const LOOKBEHIND_DAYS = 1; // pick up events that started yesterday and are still relevant

// Concurrency-coalescing map: if two reads both hit the freshness gate
// for the same feed, share one in-flight Promise instead of double-
// fetching.
const inFlightSyncs = new Map(); // feedId → Promise

// Default freshness threshold — reads that hit a feed older than this
// trigger an inline poll. 5 min is well under the Google iCal-poll
// cadence (hours) so polling Jane directly demolishes the lag.
const DEFAULT_STALE_AFTER_MS = 5 * 60 * 1000;

/**
 * Fetch a feed's URL and return raw body + status info. Sends
 * If-None-Match when we have a stored ETag; 304 short-circuits the
 * parse entirely.
 */
async function fetchFeedBody(feed) {
  const headers = {
    'User-Agent': 'Avayble/1.0 (calendar-sync)',
    'Accept': 'text/calendar, application/calendar+xml, text/plain, */*',
  };
  if (feed.etag) headers['If-None-Match'] = feed.etag;

  const response = await axios.get(feed.url, {
    headers,
    timeout: 20000,
    validateStatus: (s) => s < 500, // we'll handle 4xx ourselves
    responseType: 'text',
    transformResponse: [(data) => data], // don't try to JSON.parse
  });

  return {
    status: response.status,
    body: response.data,
    etag: response.headers?.etag || null,
  };
}

/**
 * Parse an iCal body into an array of normalized event slices ready
 * for BlockedTime upsert. Multi-day events are sliced per-day (same
 * pattern as the GCal sync) so a single BlockedTime row covers a
 * single day. Recurring events (RRULE) get expanded by node-ical;
 * exceptions / cancellations are honored.
 */
function parseFeedEvents(body, providerTz) {
  const parsed = ical.sync.parseICS(body);
  const now = DateTime.now().setZone(providerTz);
  const windowStart = now.minus({ days: LOOKBEHIND_DAYS });
  const windowEnd = now.plus({ days: LOOKAHEAD_DAYS });

  const slices = [];

  for (const key of Object.keys(parsed)) {
    const evt = parsed[key];
    if (!evt || evt.type !== 'VEVENT') continue;
    // CANCELLED status — skip (we'd never want to materialize as a block)
    if (evt.status === 'CANCELLED') continue;
    // TRANSP=TRANSPARENT events are "available" / not blocking
    if (evt.transparency === 'TRANSPARENT') continue;

    // node-ical attaches recurrence info on the master event. If
    // there's an `rrule`, expand within the lookahead window.
    let occurrences = [];
    if (evt.rrule) {
      const rangeStart = windowStart.toJSDate();
      const rangeEnd = windowEnd.toJSDate();
      const dates = evt.rrule.between(rangeStart, rangeEnd, true);
      const durationMs = (evt.end?.getTime?.() || evt.start.getTime() + 60 * 60 * 1000)
        - evt.start.getTime();

      for (const occStart of dates) {
        // node-ical exposes EXDATE on `evt.exdate` (object keyed by
        // ISO date) — skip occurrences that are excepted.
        const exKey = occStart.toISOString().slice(0, 10);
        if (evt.exdate && evt.exdate[exKey]) continue;
        // Recurrence exceptions (changed/cancelled single occurrences)
        // appear on `evt.recurrences` keyed by ISO start.
        const recExc = evt.recurrences && evt.recurrences[exKey];
        if (recExc) {
          if (recExc.status === 'CANCELLED') continue;
          occurrences.push({ start: recExc.start, end: recExc.end, uid: evt.uid });
          continue;
        }
        occurrences.push({
          start: occStart,
          end: new Date(occStart.getTime() + durationMs),
          uid: evt.uid,
        });
      }
    } else {
      occurrences.push({ start: evt.start, end: evt.end, uid: evt.uid });
    }

    for (const occ of occurrences) {
      if (!occ.start || !occ.end) continue;
      const startDt = DateTime.fromJSDate(occ.start).setZone(providerTz);
      const endDt = DateTime.fromJSDate(occ.end).setZone(providerTz);
      // Skip events fully outside the lookahead window.
      if (endDt < windowStart || startDt > windowEnd) continue;

      // Slice across days. Most appointments are single-day; this
      // loop trivially handles that. Long all-day events that span
      // multiple days get one slice per day.
      let cursor = startDt.startOf('day');
      const endDay = endDt.startOf('day');

      while (cursor <= endDay) {
        const dayStart = cursor.startOf('day');
        const dayEnd = cursor.set({ hour: 23, minute: 59, second: 59 });
        const sliceStart = DateTime.max(startDt, dayStart);
        const sliceEnd = DateTime.min(endDt, dayEnd);

        if (sliceStart < sliceEnd) {
          const localDate = cursor.toFormat(TIME_FORMATS.ISO_DATE);
          slices.push({
            start: sliceStart.toUTC().toJSDate(),
            end: sliceEnd.toUTC().toJSDate(),
            localDate,
            date: dayStart.toUTC().toJSDate(),
            // UID + localDate makes each per-day slice unique even
            // for multi-day events.
            externalEventId: `${occ.uid}_${localDate}`,
            // For display in tooltips / day view. Optional.
            reason: (evt.summary || '').slice(0, 200),
          });
        }
        cursor = cursor.plus({ days: 1 });
      }
    }
  }

  return slices;
}

/**
 * Apply parsed slices to BlockedTime: upsert each, then sweep stale
 * rows for this feed that aren't in the upsertedIds set. Same shape
 * as the GCal sync's applyEventChanges for consistency.
 */
async function applyFeedSlices(feedId, providerId, providerTz, slices) {
  const upsertedIds = [];

  for (const slice of slices) {
    await BlockedTime.findOneAndUpdate(
      {
        externalCalendarFeed: feedId,
        externalEventId: slice.externalEventId,
      },
      {
        $set: {
          provider: providerId,
          start: slice.start,
          end: slice.end,
          localDate: slice.localDate,
          date: slice.date,
          source: 'external_ical',
          externalCalendarFeed: feedId,
          externalEventId: slice.externalEventId,
          timezone: providerTz,
          reason: slice.reason,
        },
      },
      { upsert: true, new: true }
    );
    upsertedIds.push(slice.externalEventId);
  }

  // Sweep stale rows scoped to THIS feed only — anything we have on
  // file from a previous poll that isn't in the current upserted set
  // got cancelled or moved out of the lookahead window upstream.
  const sweep = await BlockedTime.deleteMany({
    externalCalendarFeed: feedId,
    externalEventId: { $nin: upsertedIds },
  });

  return { upserted: upsertedIds.length, deleted: sweep.deletedCount };
}

/**
 * Sync a single feed end-to-end: fetch, parse, apply. Returns stats.
 * Marks success / failure on the feed doc for UI surfacing.
 */
async function syncFeed(feed) {
  const providerTz = await tzForProviderId(feed.provider);

  try {
    const { status, body, etag } = await fetchFeedBody(feed);

    // 304 Not Modified — feed unchanged since last poll, skip parse.
    if (status === 304) {
      feed.lastFetchedAt = new Date();
      feed.lastSuccessfulFetchAt = new Date();
      feed.lastFetchError = { message: null, occurredAt: null };
      await feed.save();
      return { upserted: 0, deleted: 0, unchanged: true };
    }

    if (status >= 400) {
      throw new Error(`HTTP ${status} fetching feed`);
    }

    const slices = parseFeedEvents(body, providerTz);
    const result = await applyFeedSlices(feed._id, feed.provider, providerTz, slices);

    feed.lastFetchedAt = new Date();
    feed.lastSuccessfulFetchAt = new Date();
    feed.lastFetchError = { message: null, occurredAt: null };
    if (etag) feed.etag = etag;
    feed.eventCount = slices.length;
    await feed.save();

    console.log(`[ExternalIcal] Synced feed "${feed.name}" (${feed.provider}): ${result.upserted} upserted, ${result.deleted} stale deleted`);
    return result;
  } catch (err) {
    console.error(`[ExternalIcal] Sync failed for "${feed.name}" (${feed.provider}): ${err.message}`);
    feed.lastFetchedAt = new Date();
    feed.lastFetchError = { message: err.message || 'Unknown sync error', occurredAt: new Date() };
    await feed.save();
    return { upserted: 0, deleted: 0, error: err.message };
  }
}

/**
 * Validate-only fetch: used when a provider is ADDING a new feed.
 * Confirms the URL is reachable AND parses as iCal. Returns sample
 * stats so the UI can show "X events found" before saving.
 */
async function validateFeedUrl(url) {
  const response = await axios.get(url, {
    headers: { 'User-Agent': 'Avayble/1.0 (calendar-sync)', 'Accept': 'text/calendar, */*' },
    timeout: 15000,
    responseType: 'text',
    transformResponse: [(data) => data],
  });
  if (response.status >= 400) {
    throw new Error(`Feed URL returned HTTP ${response.status}`);
  }
  // node-ical parses any sufficiently iCal-shaped body without
  // throwing — verify we got actual events out.
  const parsed = ical.sync.parseICS(response.data);
  const eventCount = Object.values(parsed).filter(o => o?.type === 'VEVENT').length;
  if (!response.data.includes('BEGIN:VCALENDAR')) {
    throw new Error('Response does not look like an iCal feed');
  }
  return { eventCount };
}

/**
 * Freshness gate — same pattern as ensureFreshGcalSync. Wrap every
 * read path that consumes BlockedTime so external feeds get
 * refreshed before being trusted past the stale threshold.
 *
 * Concurrent reads for the same provider share one inline sync via
 * the in-flight Promise map.
 */
async function ensureFreshExternalFeeds(providerId, opts = {}) {
  const staleAfterMs = opts.staleAfterMs || DEFAULT_STALE_AFTER_MS;

  const feeds = await ExternalCalendarFeed.find({
    provider: providerId,
    isActive: true,
  });
  if (feeds.length === 0) return { feedsChecked: 0 };

  const now = Date.now();
  const stale = feeds.filter(f => {
    const last = f.lastSuccessfulFetchAt ? f.lastSuccessfulFetchAt.getTime() : 0;
    return now - last >= staleAfterMs;
  });
  if (stale.length === 0) return { feedsChecked: feeds.length, fresh: true };

  await Promise.all(stale.map(async (feed) => {
    const key = String(feed._id);
    if (inFlightSyncs.has(key)) return inFlightSyncs.get(key);
    const promise = syncFeed(feed).finally(() => inFlightSyncs.delete(key));
    inFlightSyncs.set(key, promise);
    return promise;
  }));

  return { feedsChecked: feeds.length, syncedNow: stale.length };
}

/**
 * Background poller — runs every N minutes, syncs every active feed
 * in the system. Keeps caches warm so most read paths hit fresh
 * data and never trigger the inline sync.
 */
async function runScheduledSync() {
  const feeds = await ExternalCalendarFeed.find({ isActive: true });
  if (feeds.length === 0) return;
  console.log(`[ExternalIcal] Scheduled sync running over ${feeds.length} feed(s)`);
  for (const feed of feeds) {
    try {
      await syncFeed(feed);
    } catch (err) {
      console.error(`[ExternalIcal] Scheduled sync error for ${feed.name}:`, err.message);
    }
  }
}

/**
 * Boot the scheduler. Polls every 5 min. The freshness gate on read
 * paths catches anything staler than that within ~5 min anyway.
 */
function startExternalCalendarScheduler() {
  const FIVE_MIN_MS = 5 * 60 * 1000;
  // Initial sync 90s after boot so the rest of the app stabilizes
  // first; nothing depends on this being instant.
  setTimeout(() => {
    runScheduledSync().catch(err => console.error('[ExternalIcal] Initial sync error:', err));
  }, 90 * 1000);
  setInterval(() => {
    runScheduledSync().catch(err => console.error('[ExternalIcal] Scheduled sync error:', err));
  }, FIVE_MIN_MS);
  console.log('[ExternalIcal] Scheduler started (5 min polling)');
}

module.exports = {
  syncFeed,
  validateFeedUrl,
  ensureFreshExternalFeeds,
  runScheduledSync,
  startExternalCalendarScheduler,
};
