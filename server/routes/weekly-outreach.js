// Weekly Outreach — provider sends a once-a-week SMS to their clients
// summarizing the upcoming week's openings. The provider controls the
// opening + closing line; the day-by-day body is auto-generated from
// real availability + bookings. Rate-limited to 1 send / 7 days so
// accidental double-sends can't happen.
//
// Endpoints
//   GET  /api/weekly-outreach           - template, lastSentAt, recipient counts
//   PUT  /api/weekly-outreach/template  - save opening/closing lines
//   POST /api/weekly-outreach/preview   - assemble the message for a sample client
//   POST /api/weekly-outreach/send      - send to filtered recipients
//
// "Quiet clients" filter: clients whose most recent confirmed/completed
// booking is older than QUIET_WEEKS, OR who have no bookings at all and
// were created more than QUIET_WEEKS ago. The everyday-flow re-engagement
// case the user described.

const express = require('express');
const router = express.Router();
const { DateTime } = require('luxon');
const { ensureAuthenticated } = require('../middleware/passportMiddleware');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Availability = require('../models/Availability');
const smsService = require('../services/smsService');
const { DEFAULT_TZ } = require('../../src/utils/timeConstants');

const RATE_LIMIT_DAYS = 7;
const QUIET_WEEKS = 4;
const BASE_URL = () => process.env.REACT_APP_API_URL || process.env.APP_URL || 'http://localhost:3000';

// ── Helpers ─────────────────────────────────────────────────────────

function startOfNextWeekLA() {
  const now = DateTime.now().setZone(DEFAULT_TZ);
  // Find next Monday (or today if already Monday)
  const daysUntilMon = (8 - now.weekday) % 7 || 7;
  return now.plus({ days: daysUntilMon }).startOf('day');
}

function fmtTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const display = h % 12 || 12;
  return m === 0 ? `${display}${period}` : `${display}:${String(m).padStart(2, '0')}${period}`;
}

// Subtract bookings (each {startTime, endTime}) from a list of free
// windows ([{start, end}] in HH:mm). Returns remaining open ranges.
function subtractBookings(windows, bookings) {
  let remaining = windows.map(w => ({ ...w }));
  for (const b of bookings) {
    const next = [];
    for (const w of remaining) {
      // No overlap
      if (b.endTime <= w.start || b.startTime >= w.end) {
        next.push(w);
        continue;
      }
      // Booking covers entire window
      if (b.startTime <= w.start && b.endTime >= w.end) continue;
      // Booking trims the start
      if (b.startTime <= w.start && b.endTime < w.end) {
        next.push({ start: b.endTime, end: w.end });
        continue;
      }
      // Booking trims the end
      if (b.startTime > w.start && b.endTime >= w.end) {
        next.push({ start: w.start, end: b.startTime });
        continue;
      }
      // Booking splits the middle
      next.push({ start: w.start, end: b.startTime });
      next.push({ start: b.endTime, end: w.end });
    }
    remaining = next;
  }
  // Filter zero-length ranges
  return remaining.filter(r => r.start < r.end);
}

// Build the day-by-day availability text block for the week.
async function buildAvailabilityBody(providerId, weekStart) {
  const lines = [];
  for (let i = 0; i < 7; i++) {
    const dayLA = weekStart.plus({ days: i });
    const localDate = dayLA.toFormat('yyyy-MM-dd');
    const dayLabel = dayLA.toFormat('EEE M/d');

    const blocks = await Availability.find({ provider: providerId, localDate });
    if (blocks.length === 0) continue;  // skip days with no availability

    // Convert blocks to HH:mm windows
    const windows = blocks.map(b => {
      const sLA = DateTime.fromJSDate(b.start, { zone: 'UTC' }).setZone(DEFAULT_TZ);
      const eLA = DateTime.fromJSDate(b.end, { zone: 'UTC' }).setZone(DEFAULT_TZ);
      return { start: sLA.toFormat('HH:mm'), end: eLA.toFormat('HH:mm') };
    }).sort((a, b) => a.start.localeCompare(b.start));

    const dayBookings = await Booking.find({
      provider: providerId,
      localDate,
      status: { $nin: ['cancelled'] }
    }).select('startTime endTime').lean();

    const open = subtractBookings(windows, dayBookings);
    if (open.length === 0) {
      lines.push(`${dayLabel} · booked`);
    } else {
      const ranges = open.map(r => `${fmtTime(r.start)}–${fmtTime(r.end)}`).join(', ');
      lines.push(`${dayLabel} · ${ranges}`);
    }
  }
  return lines.join('\n');
}

function assembleMessage({ template, providerName, firstName, body, bookingLink }) {
  const sub = (s) => (s || '')
    .replace(/\{firstName\}/g, firstName || 'there')
    .replace(/\{providerName\}/g, providerName || '')
    .replace(/\{bookingLink\}/g, bookingLink || '')
    .replace(/\{weekRange\}/g, ''); // placeholder, can wire later

  const opening = sub(template.openingLine || '');
  const closing = sub(template.closingLine || '');

  // Always append TCPA STOP footer for compliance.
  return `${opening}\n\n${body}\n\n${closing}\n\nReply STOP to opt out.`;
}

// Build the recipient list. Returns { all: [...], quiet: [...] } where
// each list is users with smsConsent !== false. "Quiet" = last booking
// older than QUIET_WEEKS, or no bookings + createdAt older than that.
async function getRecipients(providerId) {
  const allClients = await User.find({
    providerId,
    accountType: 'CLIENT',
    smsConsent: { $ne: false },
    'profile.phoneNumber': { $exists: true, $ne: null, $ne: '' }
  }).select('_id email profile.fullName profile.phoneNumber smsConsent createdAt').lean();

  if (allClients.length === 0) return { all: [], quiet: [] };

  // Latest non-cancelled booking date per client
  const latestByClient = await Booking.aggregate([
    { $match: { provider: providerId, status: { $nin: ['cancelled'] } } },
    { $group: { _id: '$client', latest: { $max: '$date' } } }
  ]);
  const latestMap = {};
  for (const row of latestByClient) {
    if (row._id) latestMap[row._id.toString()] = row.latest;
  }

  const cutoff = DateTime.now().setZone(DEFAULT_TZ).minus({ weeks: QUIET_WEEKS }).toJSDate();
  const quiet = allClients.filter(c => {
    const latest = latestMap[c._id.toString()];
    if (latest) return latest < cutoff;
    // No bookings — only count if they've been a client long enough to
    // have plausibly booked by now.
    return c.createdAt && c.createdAt < cutoff;
  });

  return { all: allClients, quiet };
}

// ── Routes ──────────────────────────────────────────────────────────

// GET / — return template + state (lastSentAt, canSendNow, recipient counts)
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }
    const provider = await User.findById(req.user._id).select('providerProfile.weeklyOutreach providerProfile.businessName profile.fullName');
    const template = provider?.providerProfile?.weeklyOutreach || {};
    const lastSentAt = template.lastSentAt || null;
    const canSendAt = lastSentAt
      ? DateTime.fromJSDate(lastSentAt).plus({ days: RATE_LIMIT_DAYS }).toJSDate()
      : null;
    const canSendNow = !canSendAt || canSendAt <= new Date();

    const { all, quiet } = await getRecipients(req.user._id);

    res.json({
      template: {
        openingLine: template.openingLine || 'Hey {firstName}, quick heads-up on next week:',
        closingLine: template.closingLine || 'Tap to book: {bookingLink}',
      },
      lastSentAt,
      canSendNow,
      canSendAt,
      recipientCounts: { all: all.length, quiet: quiet.length },
      providerName: provider.providerProfile?.businessName || provider.profile?.fullName || '',
    });
  } catch (err) {
    console.error('Weekly outreach state error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /template — save opening + closing line
router.put('/template', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }
    const { openingLine, closingLine } = req.body;
    const update = {};
    if (typeof openingLine === 'string') {
      update['providerProfile.weeklyOutreach.openingLine'] = openingLine.trim().slice(0, 280);
    }
    if (typeof closingLine === 'string') {
      update['providerProfile.weeklyOutreach.closingLine'] = closingLine.trim().slice(0, 280);
    }
    await User.updateOne({ _id: req.user._id }, { $set: update });
    res.json({ message: 'Template saved' });
  } catch (err) {
    console.error('Weekly outreach template save error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /preview — assemble the message for a sample (first eligible) client
//   body: { weekStart?: 'YYYY-MM-DD', filter?: 'all'|'quiet' }
router.post('/preview', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }
    const provider = await User.findById(req.user._id).select('providerProfile profile.fullName');
    const template = provider?.providerProfile?.weeklyOutreach || {};
    const filter = req.body.filter === 'quiet' ? 'quiet' : 'all';

    const weekStart = req.body.weekStart
      ? DateTime.fromISO(req.body.weekStart, { zone: DEFAULT_TZ }).startOf('day')
      : startOfNextWeekLA();

    const { all, quiet } = await getRecipients(req.user._id);
    const recipients = filter === 'quiet' ? quiet : all;
    const sample = recipients[0] || all[0] || null;
    const sampleName = sample?.profile?.fullName?.split(' ')[0] || 'Sarah';

    const body = await buildAvailabilityBody(req.user._id, weekStart);
    const bookingLink = `${BASE_URL()}/book`;
    const providerName = provider.providerProfile?.businessName || provider.profile?.fullName || '';

    const message = assembleMessage({
      template,
      providerName,
      firstName: sampleName,
      body,
      bookingLink,
    });

    res.json({
      message,
      sampleClientName: sampleName,
      weekStart: weekStart.toFormat('yyyy-MM-dd'),
      weekEnd: weekStart.plus({ days: 6 }).toFormat('yyyy-MM-dd'),
      recipientCount: recipients.length,
    });
  } catch (err) {
    console.error('Weekly outreach preview error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /send — actually fire the messages
//   body: { weekStart?: 'YYYY-MM-DD', filter?: 'all'|'quiet' }
router.post('/send', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.accountType !== 'PROVIDER') {
      return res.status(403).json({ message: 'Provider access required' });
    }
    const provider = await User.findById(req.user._id);
    const template = provider?.providerProfile?.weeklyOutreach || {};

    // Rate limit: 7 days since last send
    if (template.lastSentAt) {
      const next = DateTime.fromJSDate(template.lastSentAt).plus({ days: RATE_LIMIT_DAYS });
      if (next > DateTime.now()) {
        return res.status(429).json({
          message: `You can send the next outreach on ${next.setZone(DEFAULT_TZ).toFormat('cccc, LLL d')}.`,
          nextAvailableAt: next.toJSDate(),
        });
      }
    }

    const filter = req.body.filter === 'quiet' ? 'quiet' : 'all';
    const weekStart = req.body.weekStart
      ? DateTime.fromISO(req.body.weekStart, { zone: DEFAULT_TZ }).startOf('day')
      : startOfNextWeekLA();

    const { all, quiet } = await getRecipients(req.user._id);
    const recipients = filter === 'quiet' ? quiet : all;
    if (recipients.length === 0) {
      return res.status(400).json({ message: 'No eligible recipients (active SMS-consenting clients).' });
    }

    const body = await buildAvailabilityBody(req.user._id, weekStart);
    if (!body || body.trim().length === 0) {
      return res.status(400).json({ message: 'No availability set for that week — nothing to share.' });
    }

    const bookingLink = `${BASE_URL()}/book`;
    const providerName = provider.providerProfile?.businessName || provider.profile?.fullName || '';

    let sent = 0;
    let skipped = 0;
    const failures = [];

    // Sequential (avoids hammering SMS gateway). Per-recipient personalization.
    for (const r of recipients) {
      const phone = r.profile?.phoneNumber;
      if (!phone) { skipped++; continue; }
      const firstName = r.profile?.fullName?.split(' ')[0] || 'there';
      const message = assembleMessage({
        template,
        providerName,
        firstName,
        body,
        bookingLink,
      });
      try {
        await smsService.sendSms(phone, message, r);
        sent++;
      } catch (err) {
        failures.push({ id: r._id, error: err.message });
      }
    }

    // Stamp lastSentAt only after at least one send succeeded.
    if (sent > 0) {
      await User.updateOne(
        { _id: req.user._id },
        { $set: { 'providerProfile.weeklyOutreach.lastSentAt': new Date() } }
      );
    }

    res.json({
      sent,
      skipped,
      failed: failures.length,
      nextAvailableAt: DateTime.now().plus({ days: RATE_LIMIT_DAYS }).toJSDate(),
    });
  } catch (err) {
    console.error('Weekly outreach send error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
