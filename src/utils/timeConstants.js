// export const DEFAULT_TZ = 'America/Los_Angeles';
// export const UTC_TZ = 'UTC';

// export const TIME_FORMATS = {
//   ISO_DATE: 'yyyy-MM-dd',
//   ISO_DATETIME: "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
//   TIME_12H: 'h:mm a',
//   TIME_24H: 'HH:mm',
//   HUMAN_DATE: 'MMMM d, yyyy'
// };

// export const DST_TRANSITIONS = {
//   SPRING_2023: '2023-03-12',
//   FALL_2023: '2023-11-05'
// };

// src/utils/timeConstants.js

// DEFAULT_TZ is the SYSTEM fallback for legacy data without a stored
// timezone field, NOT a directive to render in LA. Every parse/format
// of a specific booking/availability/blocked-time should pull TZ from
// the doc itself via tzOf(), only falling back to DEFAULT_TZ when the
// doc lacks one.
const DEFAULT_TZ = 'America/Los_Angeles';
const UTC_TZ = 'UTC';

// Read a doc's stored IANA timezone with a sane fallback. Use this in
// every place a Booking/Availability/BlockedTime/RecurringSeries gets
// formatted on the client. Treat the return as the source of truth for
// that doc's wall clock — never replace with the viewer's local TZ.
//
// Accepted shapes:
//   - A timestamped doc:     { timezone: 'America/...' }
//   - A doc with populated provider: { provider: { providerProfile: { timezone } } }
//   - The auth user object:  { providerProfile: { timezone } }
function tzOf(doc, fallback = DEFAULT_TZ) {
  if (!doc) return fallback;
  const tz =
    doc.timezone
    || doc.provider?.providerProfile?.timezone
    || doc.providerProfile?.timezone
    || null;
  return typeof tz === 'string' && tz.length > 0 ? tz : fallback;
}

const TIME_FORMATS = {
  ISO_DATE: 'yyyy-MM-dd',
  ISO_DATETIME: "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
  TIME_12H: 'h:mm a',
  TIME_24H: 'HH:mm',
  HUMAN_DATE: 'MMMM d, yyyy'
};

module.exports = {
  DEFAULT_TZ,
  UTC_TZ,
  TIME_FORMATS,
  tzOf,
};