import { DateTime } from 'luxon';
import { DEFAULT_TZ } from './timeConstants';

// Caller can pass a `timezone` (typically tzOf(booking)) so the day
// of week is computed in the booking's TZ instead of always-LA.

// Build an sms: deep link that opens the user's SMS app with a pre-
// filled message asking the provider about a standing appointment.
//
// Returns null when the provider has no phone on file — without a
// recipient the link is meaningless. Callers should hide their UI
// when this returns null rather than showing a dead link.
//
// Per the design rule in plans/packages-v2.md ("facilitate, don't
// replace"), the request lives in the real-world SMS thread between
// client and provider — Avayble doesn't manufacture an in-app inbox
// for the provider to triage. The provider has the conversation, then
// adds the standing appointment via the existing v1 standing-
// appointment tools when they're ready.
//
// Inputs:
//   providerPhone — required, string (any format the SMS app accepts)
//   providerName — used for greeting ("Hi Ivan —"); falls back to "there"
//   clientName — optional; if present, adds "This is X." to the body
//   date — JS Date OR ISO string OR yyyy-MM-dd; supplies day-of-week
//   time — optional, either "HH:mm" or a display string ("2:00 PM");
//          when omitted, derived from date
//   duration — minutes; defaults to 60 if omitted
export function buildStandingRequestSmsLink({
  providerPhone,
  providerName,
  clientName,
  date,
  time,
  duration,
  timezone = DEFAULT_TZ,
}) {
  if (!providerPhone) return null;

  let dt = null;
  if (date) {
    dt = date instanceof Date
      ? DateTime.fromJSDate(date).setZone(timezone)
      : DateTime.fromISO(String(date), { zone: timezone });
    if (!dt.isValid) {
      // Try yyyy-MM-dd as a last resort (Booking.localDate shape).
      dt = DateTime.fromFormat(String(date), 'yyyy-MM-dd', { zone: timezone });
    }
  }

  const dayOfWeek = dt && dt.isValid ? dt.toFormat('cccc') : null;
  let timeStr = null;
  if (time) {
    if (typeof time === 'string' && /^\d{2}:\d{2}$/.test(time)) {
      timeStr = DateTime.fromFormat(time, 'HH:mm').toFormat('h:mm a');
    } else {
      timeStr = String(time);
    }
  } else if (dt && dt.isValid) {
    timeStr = dt.toFormat('h:mm a');
  }

  const greetingName = providerName ? providerName.split(' ')[0] : 'there';
  const fromLine = clientName ? ` This is ${clientName}.` : '';

  // Specific (post-booking) version uses the booking's day/time as a
  // concrete proposal. Generic (no booking context) version is a
  // conversation starter — the provider proposes the cadence back.
  let body;
  if (dayOfWeek && timeStr) {
    const minutes = duration || 60;
    body =
      `Hi ${greetingName} —${fromLine} I'd like to set up a standing appointment ` +
      `for every ${dayOfWeek} at ${timeStr} (${minutes} min). Does that work?`;
  } else {
    body =
      `Hi ${greetingName} —${fromLine} I'd like to set up a regular standing ` +
      `appointment with you. What day and time would work?`;
  }

  return `sms:${providerPhone}?&body=${encodeURIComponent(body)}`;
}
