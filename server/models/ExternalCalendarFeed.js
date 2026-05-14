const mongoose = require('mongoose');

// A provider-subscribed iCal feed (RFC 5545) from an external system —
// Jane, SimplePractice, Acuity, etc. We poll the URL on a schedule and
// upsert each event as a BlockedTime so it blocks Avayble availability
// the same way Google Calendar events do.
//
// Why a separate path from Google Calendar:
//   - Practice-management tools (Jane in particular) only publish iCal
//     feeds outbound, not OAuth push.
//   - Going Jane → iCal → Google polls → Avayble pulls means waiting
//     for Google to refresh subscriptions (8-24h). Polling Jane
//     directly cuts that to 5 minutes.
//   - Generalizes to any system that publishes iCal — future-proofs
//     against the next Jane-like situation.
//
// Authentication: most iCal feeds (Jane, SimplePractice, etc.) are
// public-but-tokenized — the URL itself contains a long random token
// that serves as the auth. We just HTTP GET. No additional credentials.
const ExternalCalendarFeedSchema = new mongoose.Schema({
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  // Human-readable label shown in the UI ("Jane Appointments",
  // "Acuity Personal", etc.). Provider's choice.
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  // The iCal feed URL. Validated server-side at creation by attempting
  // a fetch + parse; rejected if the response doesn't look like iCal.
  // Tokenized URLs are stable across polls so we store as-is.
  url: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2048,
  },
  // When the last fetch attempt finished — success OR failure. For
  // operator/log visibility only; readers should use lastSuccessful
  // FetchAt to decide freshness.
  lastFetchedAt: { type: Date, default: null },
  // When the last fetch SUCCEEDED. Freshness gate compares against
  // this — failed attempts don't reset it.
  lastSuccessfulFetchAt: { type: Date, default: null },
  // Most recent fetch failure. Cleared on next success. Surfaced in
  // the Provider Settings UI so a quiet failure can't hide.
  lastFetchError: {
    message: { type: String, default: null },
    occurredAt: { type: Date, default: null },
  },
  // HTTP ETag from the last successful fetch — we send it as
  // If-None-Match on the next poll so the server can 304 us if
  // nothing changed. Skips parse work entirely on unchanged feeds.
  etag: { type: String, default: null },
  // Event count from the last successful sync. UI display only.
  eventCount: { type: Number, default: 0 },
  // Soft-disable toggle — provider can pause a feed without removing
  // it. Paused feeds don't poll and their BlockedTime records stay
  // intact.
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

ExternalCalendarFeedSchema.index({ provider: 1, isActive: 1 });

module.exports = mongoose.model('ExternalCalendarFeed', ExternalCalendarFeedSchema);
