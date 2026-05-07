// Resolve a provider's IANA timezone for time-math operations.
//
// EVERY route or service that does date/time work for a specific
// provider should funnel through here, never read DEFAULT_TZ directly
// for business logic. DEFAULT_TZ stays as the system fallback (when
// no provider is in scope, e.g. unauthenticated public endpoints).
//
// The accepted shapes mirror what call sites typically already have
// in hand:
//
//   1. A populated user/provider Mongoose doc — pass it directly.
//   2. A providerId only — we'll fetch and cache (caller-supplied
//      cache optional; in-request scoping is the caller's job).
//   3. A booking/availability/series doc that .populate'd 'provider'
//      with timezone — also accepted.
//
// Always returns a non-empty IANA string. Never throws on a missing
// provider — falls back to DEFAULT_TZ. Booking-level decisions
// shouldn't crash because the provider doc was unexpectedly missing
// in some edge case; render in LA and let monitoring flag it.

const { DEFAULT_TZ } = require('../../src/utils/timeConstants');

const FALLBACK_TZ = DEFAULT_TZ; // 'America/Los_Angeles'

let User;
function lazyUser() {
  if (!User) User = require('../models/User');
  return User;
}

// Synchronous resolver — pass it a doc you already have. No DB hit.
// Use this in hot paths where you've already populated the provider.
function tzForProviderDoc(doc) {
  if (!doc) return FALLBACK_TZ;
  // doc could be a User doc, or a Booking/Availability with `provider`
  // populated. Walk both shapes.
  const tz =
    doc?.providerProfile?.timezone
    || doc?.provider?.providerProfile?.timezone
    || null;
  return typeof tz === 'string' && tz.length > 0 ? tz : FALLBACK_TZ;
}

// Async resolver — when only a providerId is in scope. Issues a
// projected lookup. Cheap (one indexed query, single field), but
// callers in tight loops should prefer the sync variant + populate
// up front.
async function tzForProviderId(providerId) {
  if (!providerId) return FALLBACK_TZ;
  try {
    const u = await lazyUser()
      .findById(providerId)
      .select('providerProfile.timezone')
      .lean();
    return tzForProviderDoc(u);
  } catch {
    return FALLBACK_TZ;
  }
}

module.exports = {
  FALLBACK_TZ,
  tzForProviderDoc,
  tzForProviderId,
};
