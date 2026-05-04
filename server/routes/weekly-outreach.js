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
const BlockedTime = require('../models/BlockedTime');
const smsService = require('../services/smsService');
const { DEFAULT_TZ } = require('../../src/utils/timeConstants');

const RATE_LIMIT_DAYS = 7;
const QUIET_WEEKS = 4;
const BASE_URL = () => process.env.REACT_APP_API_URL || process.env.APP_URL || 'http://localhost:3000';

// ── Helpers ─────────────────────────────────────────────────────────

// Default outreach window: today + next 6 days. Provider's mental
// model when sending on a Monday is "this week's openings", not "next
// week's" — and on later weekdays it naturally rolls forward into
// next week. Always 7 days from today.
function startOfWeekLA() {
  return DateTime.now().setZone(DEFAULT_TZ).startOf('day');
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
// Per-block subtraction so each window keeps its kind (mobile vs
// in-studio) and we can label in-studio openings with the location
// name in the SMS — clients need to know they're being invited to
// a different location than the usual mobile visit.
//
// Returns { body, diagnostic } — the SMS text plus a per-day
// breakdown of what was found and what was subtracted. The frontend
// surfaces the diagnostic in a "Show details" panel so the provider
// can verify their bookings are being reflected.
async function buildAvailabilityBody(providerId, weekStart) {
  const diagnostic = [];
  // Cross-day section accumulator. Keys: 'mobile' or 'static:<name>'.
  // Each section keeps its own ordered list of day entries and a
  // header label for rendering.
  const sections = new Map();
  const ensureSection = (key, header) => {
    if (!sections.has(key)) sections.set(key, { header, days: [] });
    return sections.get(key);
  };

  // Minimum useful gap between bookings — anything shorter than the
  // provider's shortest service can't be booked, so advertising it as
  // "open" just makes the message look broken (15-min slivers between
  // back-to-backs, etc). Default 60 if no pricing tiers configured.
  const provider = await User.findById(providerId).select('providerProfile.basePricing').lean();
  const tiers = provider?.providerProfile?.basePricing || [];
  const minDuration = tiers.length > 0
    ? Math.min(...tiers.map(t => t.duration).filter(Number.isFinite))
    : 60;
  const minRangeMin = Number.isFinite(minDuration) && minDuration > 0 ? minDuration : 60;

  const rangeMinutes = (r) => {
    const [sh, sm] = r.start.split(':').map(Number);
    const [eh, em] = r.end.split(':').map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
  };

  for (let i = 0; i < 7; i++) {
    const dayLA = weekStart.plus({ days: i });
    const localDate = dayLA.toFormat('yyyy-MM-dd');
    const dayLabel = dayLA.toFormat('EEE M/d');

    const blocks = await Availability.find({ provider: providerId, localDate })
      .populate('staticLocation', 'name');
    if (blocks.length === 0) {
      diagnostic.push({ localDate, dayLabel, hasAvailability: false });
      continue;  // skip days with no availability
    }

    const dayBookings = await Booking.find({
      provider: providerId,
      localDate,
      status: { $nin: ['cancelled'] }
    })
      .select('startTime endTime status client location')
      .populate('client', 'profile.fullName email')
      .lean();

    // BlockedTime rows include manually-blocked time AND Google-Calendar-
    // synced events (which is how the provider's Peters/Jane appointments
    // arrive). Treat them the same as bookings for subtraction purposes,
    // skipping any the provider has explicitly overridden.
    const dayBlocks = await BlockedTime.find({
      provider: providerId,
      localDate,
      overridden: { $ne: true }
    }).select('start end source reason').lean();
    const blockedRanges = dayBlocks.map(bt => {
      const sLA = DateTime.fromJSDate(bt.start, { zone: 'UTC' }).setZone(DEFAULT_TZ);
      const eLA = DateTime.fromJSDate(bt.end, { zone: 'UTC' }).setZone(DEFAULT_TZ);
      return {
        startTime: sLA.toFormat('HH:mm'),
        endTime: eLA.toFormat('HH:mm'),
        source: bt.source || 'manual',
        reason: bt.reason || '',
      };
    });
    // For each availability block, subtract overlapping
    // bookings + blocked-times, then format remaining open ranges
    // with kind/location info.
    const sortedBlocks = blocks.slice().sort((a, b) => a.start - b.start);
    // Open ranges accumulated by group key — "mobile" for in-home,
    // "static:<location name>" for in-studio. Lets a day with two
    // in-studio openings at Peter's render as one labeled group
    // ("1:15pm-2:30pm, 4:15pm-5:30pm — Peter's Chiropractic")
    // rather than repeating the parenthetical on every range.
    const groups = []; // [{ key, label, ranges: [{start,end}] }]
    const groupIdx = new Map();
    const pushGroup = (key, label, range) => {
      if (!groupIdx.has(key)) {
        groupIdx.set(key, groups.length);
        groups.push({ key, label, ranges: [] });
      }
      groups[groupIdx.get(key)].ranges.push(range);
    };
    const dayWindows = [];

    // Cross-location drive buffer (minutes). When a booking sits at a
    // different address than the block's anchor / static location, the
    // provider needs travel time before AND after — otherwise the
    // outreach claims openings that require teleporting.
    const CROSS_LOCATION_BUFFER_MIN = 30;

    // Add minutes to an HH:mm string (clamped to [00:00, 23:59]).
    const shiftHHMM = (hhmm, deltaMin) => {
      const [h, m] = hhmm.split(':').map(Number);
      const t = Math.max(0, Math.min(24 * 60 - 1, h * 60 + m + deltaMin));
      return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    };

    for (const block of sortedBlocks) {
      const sLA = DateTime.fromJSDate(block.start, { zone: 'UTC' }).setZone(DEFAULT_TZ);
      const eLA = DateTime.fromJSDate(block.end, { zone: 'UTC' }).setZone(DEFAULT_TZ);
      const window = { start: sLA.toFormat('HH:mm'), end: eLA.toFormat('HH:mm') };

      // Anchor location for this block — Home/Studio if static, anchor
      // SavedLocation if mobile-with-anchor. Used to decide which
      // bookings need a cross-location drive buffer.
      const anchorLat = block.staticLocation?.lat ?? block.anchor?.lat ?? null;
      const anchorLng = block.staticLocation?.lng ?? block.anchor?.lng ?? null;
      const hasAnchor = Number.isFinite(anchorLat) && Number.isFinite(anchorLng);

      const isCrossLocation = (b) => {
        if (!hasAnchor) return false;
        if (!Number.isFinite(b.location?.lat) || !Number.isFinite(b.location?.lng)) return false;
        // ~110m tolerance — same-building / GPS variance counts as same.
        const dLat = Math.abs(b.location.lat - anchorLat);
        const dLng = Math.abs(b.location.lng - anchorLng);
        return dLat > 0.001 || dLng > 0.001;
      };

      // Build occupancy list specific to this block: bookings with
      // cross-location buffers applied where needed, plus blocked-times.
      const blockBookingsOccupied = dayBookings.map(b => ({
        startTime: isCrossLocation(b) ? shiftHHMM(b.startTime, -CROSS_LOCATION_BUFFER_MIN) : b.startTime,
        endTime: isCrossLocation(b) ? shiftHHMM(b.endTime, CROSS_LOCATION_BUFFER_MIN) : b.endTime,
      }));
      const occupiedForBlock = [...blockBookingsOccupied, ...blockedRanges];
      const blockOccupied = occupiedForBlock.filter(b =>
        b.startTime < window.end && b.endTime > window.start
      );
      const openRaw = subtractBookings([window], blockOccupied);
      // Drop slivers shorter than the provider's shortest offering —
      // unbookable in practice.
      const open = openRaw.filter(r => rangeMinutes(r) >= minRangeMin);

      // In-studio is signalled either by kind='static' + staticLocation
      // OR by a populated anchor (older hybrid blocks store the studio
      // location on the anchor instead). Both should label as in-studio.
      const isStatic = (block.kind === 'static' && block.staticLocation)
        || !!block.anchor?.locationId;
      const locationName = isStatic
        ? (block.staticLocation?.name || block.anchor?.name || 'Studio')
        : null;

      dayWindows.push({
        windowStart: window.start,
        windowEnd: window.end,
        kind: isStatic ? 'static' : 'mobile',
        locationName,
        openRanges: open.map(o => ({ start: o.start, end: o.end })),
      });

      if (open.length === 0) continue;

      const groupKey = isStatic ? `static:${locationName}` : 'mobile';
      for (const r of open) {
        pushGroup(groupKey, isStatic ? `in-studio at ${locationName}` : 'in-home', r);
      }
    }

    // Push this day's per-section data into the cross-day accumulator.
    // Each group becomes a `{ dayLabel, ranges }` entry under its
    // section key.
    for (const g of groups) {
      const header = g.key === 'mobile' ? 'In-home (mobile):' : `In-studio at ${g.label.replace(/^in-studio at /, '')}:`;
      const sec = ensureSection(g.key, header);
      sec.days.push({
        dayLabel,
        ranges: g.ranges.map(r => `${fmtTime(r.start)}–${fmtTime(r.end)}`).join(', '),
      });
    }

    diagnostic.push({
      localDate,
      dayLabel,
      hasAvailability: true,
      bookings: dayBookings.map(b => ({
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        clientName: b.client?.profile?.fullName || b.client?.email || 'Unknown',
      })),
      blockedTimes: blockedRanges,
      windows: dayWindows,
    });

  }

  // Assemble the SMS body from sections. Mobile (in-home) first since
  // that's the default service for most clients, then in-studio
  // sections alphabetically by location. Each section gets a header
  // and a blank line before the next.
  const orderedSections = [];
  if (sections.has('mobile')) orderedSections.push(sections.get('mobile'));
  const staticKeys = [...sections.keys()].filter(k => k !== 'mobile').sort();
  for (const k of staticKeys) orderedSections.push(sections.get(k));

  const sectionTexts = orderedSections.map(sec => {
    const dayLines = sec.days.map(d => `${d.dayLabel} · ${d.ranges}`).join('\n');
    return `${sec.header}\n${dayLines}`;
  });

  // If nothing across the week is bookable, return a single line so
  // the send route can short-circuit ("nothing to share").
  const body = sectionTexts.length > 0
    ? sectionTexts.join('\n\n')
    : '';
  return { body, diagnostic };
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

// Build the recipient list — one annotated list of every active client
// with SMS consent and a phone number, each tagged with their last
// booking date and a derived isQuiet flag (last booking older than
// QUIET_WEEKS, or no booking + created longer ago than that). The
// front-end uses this to render per-client checkboxes with quick-select
// shortcuts.
async function getRecipients(providerId) {
  const allClients = await User.find({
    providerId,
    accountType: 'CLIENT',
    smsConsent: { $ne: false },
    'profile.phoneNumber': { $exists: true, $ne: null, $ne: '' }
  }).select('_id email profile.fullName profile.phoneNumber smsConsent createdAt').lean();

  if (allClients.length === 0) return [];

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

  return allClients
    .map(c => {
      const lastBookingAt = latestMap[c._id.toString()] || null;
      const isQuiet = lastBookingAt
        ? lastBookingAt < cutoff
        : !!(c.createdAt && c.createdAt < cutoff);
      return {
        _id: c._id,
        fullName: c.profile?.fullName || c.email,
        firstName: c.profile?.fullName?.split(' ')[0] || 'there',
        phoneNumber: c.profile?.phoneNumber,
        lastBookingAt,
        isQuiet,
      };
    })
    .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
}

// Filter the recipients list down to the set the caller wants:
//   - clientIds: [...] — explicit per-client selection (preferred)
//   - filter: 'all' | 'quiet' — fallback presets
function selectRecipients(allRecipients, body) {
  if (Array.isArray(body.clientIds) && body.clientIds.length > 0) {
    const idSet = new Set(body.clientIds.map(String));
    return allRecipients.filter(r => idSet.has(String(r._id)));
  }
  if (body.filter === 'quiet') return allRecipients.filter(r => r.isQuiet);
  return allRecipients;
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

    const recipients = await getRecipients(req.user._id);

    res.json({
      template: {
        openingLine: template.openingLine || 'Hey {firstName}, quick heads-up on this week:',
        closingLine: template.closingLine || 'Tap to book: {bookingLink}',
      },
      lastSentAt,
      canSendNow,
      canSendAt,
      recipients, // [{ _id, fullName, firstName, phoneNumber, lastBookingAt, isQuiet }]
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

    const weekStart = req.body.weekStart
      ? DateTime.fromISO(req.body.weekStart, { zone: DEFAULT_TZ }).startOf('day')
      : startOfWeekLA();

    const allRecipients = await getRecipients(req.user._id);
    const recipients = selectRecipients(allRecipients, req.body);
    const sample = recipients[0] || allRecipients[0] || null;
    const sampleName = sample?.firstName || 'Sarah';

    const { body, diagnostic } = await buildAvailabilityBody(req.user._id, weekStart);
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
      diagnostic,
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

    const weekStart = req.body.weekStart
      ? DateTime.fromISO(req.body.weekStart, { zone: DEFAULT_TZ }).startOf('day')
      : startOfWeekLA();

    const allRecipients = await getRecipients(req.user._id);
    const recipients = selectRecipients(allRecipients, req.body);
    if (recipients.length === 0) {
      return res.status(400).json({ message: 'No recipients selected.' });
    }

    const { body } = await buildAvailabilityBody(req.user._id, weekStart);
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
      if (!r.phoneNumber) { skipped++; continue; }
      const message = assembleMessage({
        template,
        providerName,
        firstName: r.firstName,
        body,
        bookingLink,
      });
      try {
        // smsService.sendSms's third arg is the user object for SMS-consent
        // re-check; we already pre-filtered by smsConsent !== false in
        // getRecipients, but pass it for the inside-the-service safety check.
        await smsService.sendSms(r.phoneNumber, message, { _id: r._id, smsConsent: true });
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
