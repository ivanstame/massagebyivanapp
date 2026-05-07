const express = require('express');
const router = express.Router();
const Availability = require('../models/Availability');
const BlockedTime = require('../models/BlockedTime');
const Booking = require('../models/Booking');
const WeeklyTemplate = require('../models/WeeklyTemplate');
const SavedLocation = require('../models/SavedLocation');
const User = require('../models/User');
const { ensureAuthenticated } = require('../middleware/passportMiddleware');
const { validateAvailabilityInput } = require('../middleware/validation');
const { DateTime } = require('luxon');
const { DEFAULT_TZ, TIME_FORMATS } = require('../../src/utils/timeConstants');
const LuxonService = require('../../src/utils/LuxonService');
const { tzForProviderId } = require('../utils/providerTz');

/**
 * Generate availability from weekly template for a specific date and provider.
 * Only creates if no availability exists for that date yet.
 * Returns the created Availability doc, or null if no template applies.
 */
async function generateFromTemplate(providerId, laDate) {
  const localDateStr = laDate.toFormat(TIME_FORMATS.ISO_DATE);

  // Look up template for this day of week (Luxon: 1=Mon..7=Sun, convert to our 0=Sun..6=Sat)
  const luxonWeekday = laDate.weekday; // 1=Mon, 7=Sun
  const dayOfWeek = luxonWeekday === 7 ? 0 : luxonWeekday; // Convert to 0=Sun..6=Sat

  const template = await WeeklyTemplate.findOne({
    provider: providerId,
    dayOfWeek,
    isActive: true
  });
  if (!template) return null;

  // Per-date opt-out — provider explicitly removed this date's occurrence.
  if (Array.isArray(template.exclusions) && template.exclusions.includes(localDateStr)) {
    return null;
  }

  // Check if a template-sourced availability already exists for this date
  const existingTemplate = await Availability.findOne({
    provider: providerId,
    localDate: localDateStr,
    source: 'template'
  });
  if (existingTemplate) return null; // Template already generated for this day

  // Resolve the provider's TZ — template hours like "11:00" are
  // expressed in the provider's local time. Generated Availability
  // doc inherits this TZ.
  const { tzForProviderId } = require('../utils/providerTz');
  const providerTz = await tzForProviderId(providerId);

  // Create availability from template (even if manual blocks exist — they may cover different hours)
  const startLA = DateTime.fromFormat(
    `${localDateStr} ${template.startTime}`,
    'yyyy-MM-dd HH:mm',
    { zone: providerTz }
  );
  const endLA = DateTime.fromFormat(
    `${localDateStr} ${template.endTime}`,
    'yyyy-MM-dd HH:mm',
    { zone: providerTz }
  );

  const availData = {
    provider: providerId,
    timezone: providerTz,
    date: laDate.startOf('day').toUTC().toJSDate(),
    localDate: localDateStr,
    start: startLA.toUTC().toJSDate(),
    end: endLA.toUTC().toJSDate(),
    source: 'template',
    kind: template.kind || 'mobile',
    staticLocation: template.kind === 'static' ? template.staticLocation : null
  };

  // Propagate anchor info if the template has one. Skip for static
  // templates — the day's whole window is the in-studio commitment, so
  // a leftover anchor would render as a "Fixed" overlay on top of the
  // in-studio block. (Defensive in case any historical template still
  // carries both kind=static AND anchor.locationId.)
  if (template.kind !== 'static' && template.anchor && template.anchor.locationId) {
    const loc = await SavedLocation.findById(template.anchor.locationId);
    if (loc) {
      availData.anchor = {
        locationId: loc._id,
        name: loc.name,
        address: loc.address,
        lat: loc.lat,
        lng: loc.lng,
        startTime: template.anchor.startTime,
        endTime: template.anchor.endTime
      };
    }
  }

  const availability = new Availability(availData);
  await availability.save();
  return availability;
}

/**
 * Generate availability from templates for a date range.
 * Skips dates that already have availability.
 */
async function generateFromTemplateRange(providerId, startDate, endDate) {
  const templates = await WeeklyTemplate.find({ provider: providerId, isActive: true });
  if (templates.length === 0) return [];

  // Build a lookup by dayOfWeek
  const templateByDay = {};
  for (const t of templates) {
    templateByDay[t.dayOfWeek] = t;
  }

  // Pre-fetch all anchor locations referenced by templates
  const anchorLocationIds = templates
    .filter(t => t.anchor && t.anchor.locationId)
    .map(t => t.anchor.locationId);
  const anchorLocations = anchorLocationIds.length > 0
    ? await SavedLocation.find({ _id: { $in: anchorLocationIds } })
    : [];
  const locationById = {};
  for (const loc of anchorLocations) {
    locationById[loc._id.toString()] = loc;
  }

  // Get all existing availability in the range. We only need the
  // localDate field to build the existing-dates Set — leaning the
  // query and projecting to a single field shaves serialization /
  // hydration cost on hot path months.
  const existing = await Availability.find({
    provider: providerId,
    localDate: {
      $gte: startDate.toFormat(TIME_FORMATS.ISO_DATE),
      $lte: endDate.toFormat(TIME_FORMATS.ISO_DATE)
    }
  }).select('localDate').lean();
  const existingDates = new Set(existing.map(a => a.localDate));

  // Resolve provider TZ once for the whole range — template hours
  // parse in this TZ and each generated doc inherits it.
  const { tzForProviderId } = require('../utils/providerTz');
  const providerTz = await tzForProviderId(providerId);

  // Generate for each day in range that doesn't have availability yet
  const toCreate = [];
  let current = startDate.startOf('day');
  while (current <= endDate) {
    const localDateStr = current.toFormat(TIME_FORMATS.ISO_DATE);
    const luxonWeekday = current.weekday;
    const dayOfWeek = luxonWeekday === 7 ? 0 : luxonWeekday;

    if (!existingDates.has(localDateStr) && templateByDay[dayOfWeek]) {
      const template = templateByDay[dayOfWeek];

      // Skip dates the provider has explicitly opted out of for this template.
      if (Array.isArray(template.exclusions) && template.exclusions.includes(localDateStr)) {
        current = current.plus({ days: 1 });
        continue;
      }

      const startLA = DateTime.fromFormat(
        `${localDateStr} ${template.startTime}`,
        'yyyy-MM-dd HH:mm',
        { zone: providerTz }
      );
      const endLA = DateTime.fromFormat(
        `${localDateStr} ${template.endTime}`,
        'yyyy-MM-dd HH:mm',
        { zone: providerTz }
      );

      const doc = {
        provider: providerId,
        timezone: providerTz,
        date: current.startOf('day').toUTC().toJSDate(),
        localDate: localDateStr,
        start: startLA.toUTC().toJSDate(),
        end: endLA.toUTC().toJSDate(),
        source: 'template',
        kind: template.kind || 'mobile',
        staticLocation: template.kind === 'static' ? template.staticLocation : null
      };

      // Propagate anchor info. Skip for static templates — see the
      // matching guard in generateFromTemplate above for rationale.
      if (template.kind !== 'static' && template.anchor && template.anchor.locationId) {
        const loc = locationById[template.anchor.locationId.toString()];
        if (loc) {
          doc.anchor = {
            locationId: loc._id,
            name: loc.name,
            address: loc.address,
            lat: loc.lat,
            lng: loc.lng,
            startTime: template.anchor.startTime,
            endTime: template.anchor.endTime
          };
        }
      }

      toCreate.push(doc);
    }
    current = current.plus({ days: 1 });
  }

  if (toCreate.length > 0) {
    // Use insertMany — pre-save hooks won't fire, but we've already computed all fields
    // We need to generate availableSlots manually. Slot HH:MM strings
    // are expressed in the doc's TZ (which is providerTz for these
    // template-sourced rows).
    for (const doc of toCreate) {
      const docTz = doc.timezone || DEFAULT_TZ;
      const startDT = DateTime.fromJSDate(doc.start, { zone: 'UTC' }).setZone(docTz);
      const endDT = DateTime.fromJSDate(doc.end, { zone: 'UTC' }).setZone(docTz);
      const slots = LuxonService.generateTimeSlots(startDT.toISO(), endDT.toISO(), 30, 60, docTz);
      doc.availableSlots = slots.map(slot =>
        DateTime.fromISO(slot.start).setZone(docTz).toFormat(TIME_FORMATS.TIME_24H)
      );
    }
    await Availability.insertMany(toCreate);
  }

  return toCreate;
}

// Get availability blocks for a specific date
router.get('/blocks/:date', ensureAuthenticated, async (req, res) => {
  try {
    // Accept a providerId query param so clients can read their assigned
    // provider's availability shape (the booking form uses this to decide
    // whether to ask for an address — purely-static days don't need one).
    let providerId = req.user._id;
    if (req.user.accountType === 'CLIENT') {
      providerId = req.query.providerId || req.user.providerId;
    } else if (req.query.providerId) {
      providerId = req.query.providerId;
    }
    if (!providerId) {
      return res.json([]);
    }
    const laDate = DateTime.fromISO(req.params.date, { zone: DEFAULT_TZ });

    // Auto-generate from template if no availability exists for this date
    await generateFromTemplate(providerId, laDate);

    // Lazy-extend any active recurring series whose materialization
    // window has fallen behind the requested date. Means open-ended
    // standing appointments keep populating forward without needing a
    // cron job, and the provider doesn't have to manually re-extend.
    try {
      const recurringSeriesRouter = require('./recurring-series');
      if (recurringSeriesRouter.lazyExtendForProvider) {
        await recurringSeriesRouter.lazyExtendForProvider(providerId, laDate.toJSDate());
      }
    } catch (extErr) {
      console.error('Standing-appointment lazy-extend failed:', extErr.message);
    }

    const blocks = await Availability.find({
      provider: providerId,
      localDate: laDate.toFormat(TIME_FORMATS.ISO_DATE)
    }).populate('staticLocation', 'name address lat lng staticConfig isStaticLocation');

    res.json(blocks);
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({ message: 'Error fetching availability' });
  }
});

// Constants for the month-viability filter. Mirror the values used by
// the slot generator so a "viable" day here matches what /available
// would actually offer.
const MONTH_MIN_DURATION = 30;   // smallest bookable session per Booking schema
const MONTH_SETTLE_BUFFER = 15;  // matches SETTLE_BUFFER in chainBookingService.js

// Pure helper: subtract a sorted, merged list of [start,end] excluded
// ranges from a single window. Returns the gap intervals (free time)
// inside the window. Inputs and outputs are minute-of-day numbers.
function subtractRanges(window, excluded) {
  const free = [];
  let cursor = window.start;
  for (const ex of excluded) {
    if (ex.end <= cursor) continue;          // entirely before cursor
    if (ex.start >= window.end) break;       // entirely after window
    if (ex.start > cursor) free.push({ start: cursor, end: Math.min(ex.start, window.end) });
    cursor = Math.max(cursor, ex.end);
    if (cursor >= window.end) break;
  }
  if (cursor < window.end) free.push({ start: cursor, end: window.end });
  return free;
}

// Sort + merge overlapping/touching ranges into a clean list.
function mergeRanges(ranges) {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const cur = sorted[i];
    if (cur.start <= last.end) last.end = Math.max(last.end, cur.end);
    else out.push(cur);
  }
  return out;
}

// Convert a UTC Date to "minutes since local midnight" in the given TZ.
function jsDateToLocalMin(d, tz = DEFAULT_TZ) {
  const dt = DateTime.fromJSDate(d).setZone(tz);
  return dt.hour * 60 + dt.minute;
}

// Convert "HH:mm" string to minutes-of-day.
function hhmmToMin(s) {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

// Get availability block spans for a month
router.get('/month/:year/:month', ensureAuthenticated, async (req, res) => {
  try {
    const { year, month } = req.params;

    // Determine the provider ID first so we can anchor the month
    // boundaries in their TZ — Availability.date is stored at the
    // block's-TZ midnight, so an LA-anchored bound misses Chicago/NY
    // rows.
    let providerId;
    if (req.user.accountType === 'PROVIDER') {
      providerId = req.user._id;
    } else if (req.query.providerId) {
      providerId = req.query.providerId;
    }
    const providerTz = providerId ? await tzForProviderId(providerId) : DEFAULT_TZ;

    const startDate = DateTime.fromObject(
      { year: parseInt(year), month: parseInt(month), day: 1 },
      { zone: providerTz }
    );
    const endDate = startDate.endOf('month');

    // Auto-generate from templates for the whole month (only for future dates)
    if (providerId) {
      const today = DateTime.now().setZone(providerTz).startOf('day');
      const genStart = startDate < today ? today : startDate;
      if (genStart <= endDate) {
        await generateFromTemplateRange(providerId, genStart, endDate);
      }
    }

    // Build query
    const query = {
      date: {
        $gte: startDate.toUTC().toJSDate(),
        $lte: endDate.toUTC().toJSDate()
      }
    };

    if (req.user.accountType === 'PROVIDER') {
      query.provider = req.user._id;
    } else if (req.query.providerId) {
      query.provider = req.query.providerId;
    }

    // Without a provider scope the response is meaningless (and the
    // booking/block queries below would otherwise fan out to every
    // provider's data). Bail with an empty list — matches the
    // pre-filter behavior, which also returned nothing useful here.
    if (!query.provider) {
      return res.json([]);
    }

    // Fetch availability + bookings + blocks for the month in parallel.
    // Need the full window times to compute viability — projecting to
    // just `date localDate` like the old endpoint did would force a
    // second round-trip per row.
    const [availabilityRows, bookingRows, blockedRows] = await Promise.all([
      Availability.find(query)
        .select('date localDate start end timezone')
        .lean()
        .sort({ date: 1 }),
      Booking.find({
        provider: query.provider,
        date: query.date,
        status: { $ne: 'cancelled' },
      })
        .select('localDate startTime endTime')
        .lean(),
      BlockedTime.find({
        provider: query.provider,
        date: query.date,
        $or: [{ overridden: { $ne: true } }, { overridden: { $exists: false } }],
      })
        .select('localDate start end timezone')
        .lean(),
    ]);

    // Group bookings + blocks by localDate as minute-of-day excluded ranges.
    const excludedByDate = new Map();
    const pushExcluded = (localDate, range) => {
      if (!excludedByDate.has(localDate)) excludedByDate.set(localDate, []);
      excludedByDate.get(localDate).push(range);
    };
    for (const b of bookingRows) {
      pushExcluded(b.localDate, { start: hhmmToMin(b.startTime), end: hhmmToMin(b.endTime) });
    }
    for (const b of blockedRows) {
      const blockTz = b.timezone || providerTz;
      pushExcluded(b.localDate, {
        start: jsDateToLocalMin(b.start, blockTz),
        end: jsDateToLocalMin(b.end, blockTz),
      });
    }

    // Per-day viability check: extend each excluded range by SETTLE_BUFFER
    // on each side, clamp to the availability window, merge, then subtract
    // from the window. A booking of MIN_DURATION fits iff any resulting
    // free interval is at least MIN_DURATION long. That captures the
    // user's case (Friday 12-5:30 chopped into back-to-back blocks with a
    // single 30-min gap — the gap can't fit a booking once you account
    // for the buffer the slot generator would require around it).
    const viableByDate = new Map();
    for (const a of availabilityRows) {
      if (viableByDate.get(a.localDate)) continue;  // already proven viable
      const blockTz = a.timezone || providerTz;
      const winStart = jsDateToLocalMin(a.start, blockTz);
      const winEnd = jsDateToLocalMin(a.end, blockTz);
      const raw = excludedByDate.get(a.localDate) || [];
      const buffered = raw
        .map(r => ({
          start: Math.max(winStart, r.start - MONTH_SETTLE_BUFFER),
          end: Math.min(winEnd, r.end + MONTH_SETTLE_BUFFER),
        }))
        .filter(r => r.start < r.end);
      const merged = mergeRanges(buffered);
      const free = subtractRanges({ start: winStart, end: winEnd }, merged);
      const viable = free.some(f => (f.end - f.start) >= MONTH_MIN_DURATION);
      if (viable) viableByDate.set(a.localDate, true);
    }

    // Return one row per viable date in the same shape the frontend was
    // already deduping on (`{ date, localDate }`).
    const response = availabilityRows
      .filter(a => viableByDate.get(a.localDate))
      .map(a => ({ date: a.date, localDate: a.localDate }));

    res.json(response);
  } catch (error) {
    console.error('Error fetching monthly availability:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get available slots for a specific date
router.get('/available/:date', validateAvailabilityInput, async (req, res) => {
  try {
    // The middleware parsed :date in DEFAULT_TZ for format validation.
    // The day-boundary math below must run in the *target* provider's
    // TZ — Availability.date is stamped at the block's-TZ midnight,
    // so an LA-anchored window misses Chicago/NY/Phoenix blocks
    // entirely. Resolve the provider id first, then their TZ, then
    // re-parse the requested date string in that TZ.
    const targetProviderId = req.query.providerId
      || (req.user?.accountType === 'PROVIDER' ? req.user._id : null);
    const providerTz = targetProviderId
      ? await tzForProviderId(targetProviderId)
      : DEFAULT_TZ;

    const dateStr = req.params.date;
    const laDate = DateTime.fromISO(dateStr, { zone: providerTz });

    // Get start and end of day in the provider's TZ
    const startOfDay = laDate.startOf('day');
    const endOfDay = laDate.endOf('day');

    console.log('Searching for availability between:',
      startOfDay.toFormat(TIME_FORMATS.ISO_DATETIME),
      'and',
      endOfDay.toFormat(TIME_FORMATS.ISO_DATETIME),
      `(tz=${providerTz})`
    );

    // Parse duration(s) from request and validate
    let appointmentDuration;
    if (req.query.isMultiSession === 'true' || req.query.sessionDurations) {
      let sessionDurations;
      try {
        sessionDurations = JSON.parse(req.query.sessionDurations);
      } catch (err) {
        console.log('Error parsing sessionDurations:', err.message);
        sessionDurations = [60]; // Default to a single 60-minute session
      }
      
      // Validate sessionDurations is a properly formed array with valid values
      if (!Array.isArray(sessionDurations) || sessionDurations.length === 0) {
        console.log('Invalid or empty sessionDurations - defaulting to 60 minutes');
        sessionDurations = [60]; // Default to a single 60-minute session
      } else {
        // Filter out any invalid durations and replace with defaults
        sessionDurations = sessionDurations.map(d => {
          const parsed = parseInt(d);
          if (!parsed || isNaN(parsed) || parsed < 30 || parsed > 180) {
            console.log(`Invalid session duration: ${d} - defaulting to 60 minutes`);
            return 60; // Default individual session
          }
          return parsed;
        });
      }
      
      // Sum the durations for total appointment duration
      appointmentDuration = sessionDurations.reduce((sum, d) => sum + d, 0);
      
      // Extra validation to ensure we have a reasonable value
      if (appointmentDuration <= 0 || appointmentDuration > 540) { // Max 9 hours (3 sessions of 3 hours)
        console.log(`Invalid total appointment duration: ${appointmentDuration} - defaulting to 60 minutes`);
        appointmentDuration = 60;
        sessionDurations = [60];
      }
    } else {
      appointmentDuration = parseInt(req.query.duration);
      // The 180-min ceiling here was the per-session schema cap, baked
      // in when this endpoint only served single-booking queries. The
      // back-to-back chain flow asks for slot windows fitting the WHOLE
      // chain (e.g. 255 min for two 120s + a 15-min buffer), which used
      // to silently fall back to 60 — making the slot picker return
      // single-booking-sized windows that then failed at /bulk.
      // Ceiling matched to the multi-session path's 540-min cap so both
      // query shapes have parity.
      if (!appointmentDuration || appointmentDuration < 30 || appointmentDuration > 540) {
        if (req.query.duration && (appointmentDuration < 30 || appointmentDuration > 540)) {
          console.warn(`/api/availability/available received out-of-range duration=${req.query.duration}; defaulting to 60`);
        }
        appointmentDuration = 60;
      }
    }

    const bufferTime = 15;
    const { lat, lng } = req.query;
    const isMultiSession = req.query.isMultiSession === 'true';
    
    console.log('Processing availability request:', {
      appointmentDuration,
      isMultiSession,
      date: laDate.toFormat(TIME_FORMATS.ISO_DATE),
      providerId: req.query.providerId
    });

    // Build query for availability block - must filter by provider
    const availQuery = {
      date: {
        $gte: startOfDay.toUTC().toJSDate(),
        $lt: endOfDay.toUTC().toJSDate()
      }
    };
    
    // Provider scope was already resolved above (targetProviderId) — reuse.
    if (targetProviderId) {
      availQuery.provider = targetProviderId;
    }
    // Otherwise, find ANY availability (for backward compatibility, but this should ideally require providerId)

    // Auto-generate from template if a provider is identified
    const templateProviderId = targetProviderId;
    if (templateProviderId) {
      await generateFromTemplate(templateProviderId, laDate);
    }

    // Find ALL availability blocks for the day (manual + template may
    // coexist). Populate the static-location ref so the slot generator
    // can read its buffer + the API response can carry pricing/address.
    const availabilityBlocks = await Availability.find(availQuery)
      .populate('staticLocation', 'name address lat lng staticConfig isStaticLocation')
      .sort({ start: 1 });

    if (availabilityBlocks.length === 0) {
      console.log(`No availability blocks found for date: ${laDate.toFormat(TIME_FORMATS.ISO_DATE)}`);
      return res.status(200).json([]);
    }

    // Get existing bookings for the day. Two filters that were missing:
    //   - provider scope: without it, this query returned every other
    //     provider's bookings on the same date, silently blocking slots
    //     this provider was actually free for.
    //   - status filter: cancelled bookings are still in the DB (soft
    //     delete), but they shouldn't block new ones from being booked
    //     into the same slot.
    const bookings = availQuery.provider
      ? await Booking.find({
          provider: availQuery.provider,
          date: {
            $gte: startOfDay.toUTC().toJSDate(),
            $lt: endOfDay.toUTC().toJSDate()
          },
          status: { $ne: 'cancelled' }
        }).sort({ startTime: 1 })
      : [];

    console.log('Found bookings:',
      bookings.map(b => `${b.startTime}-${b.endTime}`)
    );

    const clientLocation = {
      lat: parseFloat(lat),
      lng: parseFloat(lng)
    };

    console.log('Availability blocks found:', availabilityBlocks.length);
    availabilityBlocks.forEach((a, i) => {
      const blockTz = a.timezone || DEFAULT_TZ;
      console.log(`  Block ${i}: ${DateTime.fromJSDate(a.start).setZone(blockTz).toFormat(TIME_FORMATS.TIME_24H)} - ${DateTime.fromJSDate(a.end).setZone(blockTz).toFormat(TIME_FORMATS.TIME_24H)} (${a.source}, ${blockTz})`);
    });

    // Import the same validation function used by the booking endpoint
    const { getAvailableTimeSlots } = require('../utils/timeUtils');

    const providerId = req.query.providerId;
    const sessionDurationsArray = isMultiSession && req.query.sessionDurations ?
      JSON.parse(req.query.sessionDurations) :
      [appointmentDuration];

    // Fetch provider's home base for travel calculations
    let homeBase = null;
    if (providerId) {
      const homeLoc = await SavedLocation.findOne({ provider: providerId, isHomeBase: true });
      if (homeLoc) {
        homeBase = { lat: homeLoc.lat, lng: homeLoc.lng };
        console.log(`[Boundary] Provider home base: ${homeLoc.address} (${homeLoc.lat}, ${homeLoc.lng})`);
      } else {
        console.log('[Boundary] No home base found for provider');
      }
    }

    // Fetch the provider's same-address-turnover preference. Drives
    // whether the slot picker treats same-address back-to-back as
    // flush (false) or with a 15-min cleanup gap (true). Default is
    // true (added in User schema) so an unset/legacy field reads as
    // ON — matches the buffer-on convention most providers expect.
    let forceBufferForProvider = false;
    if (providerId) {
      const providerForBuffer = await User.findById(providerId)
        .select('providerProfile.sameAddressTurnoverBuffer').lean();
      // Strict-true check so an explicitly-false setting defeats the
      // schema default; undefined/null falls back to the schema default.
      forceBufferForProvider = providerForBuffer?.providerProfile?.sameAddressTurnoverBuffer !== false;
    }

    // Fetch blocked times for this date
    const blockedTimes = templateProviderId
      ? await BlockedTime.find({
          provider: templateProviderId,
          localDate: laDate.toFormat(TIME_FORMATS.ISO_DATE)
        })
      : [];

    // Build synthetic travel boundaries from any static-availability
    // windows on this day. The slot generator already treats blocked-
    // times-with-location as travel boundaries; static windows have
    // the exact same effect on adjacent mobile slots — a mobile
    // booking right before/after the static window must include drive
    // time to/from the studio's address, not the provider's home base.
    // We feed these into the mobile slot generator so the math falls
    // out naturally.
    const staticBoundaries = availabilityBlocks
      .filter(a => a.kind === 'static' && a.staticLocation && a.staticLocation.lat != null && a.staticLocation.lng != null)
      .map(a => ({
        start: a.start,
        end: a.end,
        overridden: false,
        location: {
          address: a.staticLocation.address,
          lat: a.staticLocation.lat,
          lng: a.staticLocation.lng,
        },
        _isStaticWindow: true, // tag for debugging only
      }));

    // Generate slots from ALL availability blocks and merge. Each slot
    // carries kind + (when static) location + pricing override info, so
    // the booking form can adapt UI per-slot without a second round trip.
    let enrichedSlots = []; // [{ time: Date, kind, location?, pricing?, useMobilePricing? }]
    for (const availability of availabilityBlocks) {
      const isStaticWindow = availability.kind === 'static';
      // Mobile windows include OTHER static windows as boundaries.
      // Static windows skip travel validation entirely (handled inside
      // getAvailableTimeSlots) so the extras would be unused — keep
      // the list empty there to avoid unnecessary slot filtering.
      const extraBoundaries = isStaticWindow
        ? []
        : staticBoundaries.filter(b => b.start.getTime() !== availability.start.getTime());

      const slots = await getAvailableTimeSlots(
        availability,
        bookings,
        clientLocation,
        isMultiSession ? sessionDurationsArray : appointmentDuration,
        bufferTime,
        null, // requestedGroupId
        0,    // extraDepartureBuffer
        providerId,
        [],   // addons
        homeBase,
        [...blockedTimes, ...extraBoundaries],
        // forceBuffer: provider's per-account preference (User
        // .providerProfile.sameAddressTurnoverBuffer). Re-enables the
        // 15-min settle buffer for same-address back-to-back bookings
        // when ON; leaves them flush when OFF (sheet-sharing couples,
        // etc.).
        { forceBuffer: forceBufferForProvider }
      );

      const isStatic = availability.kind === 'static' && availability.staticLocation;
      for (const time of slots) {
        if (isStatic) {
          const sl = availability.staticLocation;
          const cfg = sl.staticConfig || {};
          enrichedSlots.push({
            time,
            kind: 'static',
            location: {
              id: sl._id,
              name: sl.name,
              address: sl.address,
              lat: sl.lat,
              lng: sl.lng,
            },
            useMobilePricing: cfg.useMobilePricing !== false,
            pricing: cfg.useMobilePricing === false && Array.isArray(cfg.pricing)
              ? cfg.pricing
              : null,
            bufferMinutes: Number.isFinite(cfg.bufferMinutes) ? cfg.bufferMinutes : 15,
          });
        } else {
          enrichedSlots.push({ time, kind: 'mobile' });
        }
      }
    }

    // Deduplicate by ISO time. When two windows produce the same slot
    // time (rare — overlapping windows), keep the first occurrence; the
    // sort by start above means earlier-windowed slots win.
    const seenTimes = new Set();
    const availableSlots = enrichedSlots.filter(s => {
      const key = s.time.toISOString();
      if (seenTimes.has(key)) return false;
      seenTimes.add(key);
      return true;
    }).sort((a, b) => a.time - b.time);

    console.log(`Available slots: ${availableSlots.length} with shared validation logic`);

    if (availableSlots.length === 0) {
      console.log('No available slots after validation - returning empty array');
      return res.json([]);
    }

    // Format slots for client display. Each slot is an object so the
    // client can render in-studio vs mobile slots distinctly.
    // Slot ISO strings carry the offset, so emit them in the provider's
    // TZ — clients then render with `setZone(providerTz)` and the wall
    // clock matches what the provider sees.
    const formattedSlots = availableSlots.map(s => ({
      time: DateTime.fromJSDate(s.time, { zone: 'UTC' })
        .setZone(providerTz)
        .toISO({ suppressMilliseconds: true }),
      kind: s.kind,
      ...(s.kind === 'static' && {
        location: s.location,
        useMobilePricing: s.useMobilePricing,
        pricing: s.pricing,
        bufferMinutes: s.bufferMinutes,
      }),
    }));
    
    console.log('Formatted slot times:', formattedSlots.join(', '));
    
    res.json(formattedSlots);
  } catch (error) {
    console.error('Error in /available/:date route:', error);
    
    // Enhanced error feedback based on error type
    let errorMessage = 'Server error';
    let statusCode = 500;
    
    if (error.message.includes('travel time calculation')) {
      errorMessage = 'Unable to calculate travel times. Please try a different location or time.';
      statusCode = 400;
    } else if (error.message.includes('Google Maps')) {
      errorMessage = 'Maps service temporarily unavailable. Please try again shortly.';
      statusCode = 503;
    } else if (error.message.includes('geocoding')) {
      errorMessage = 'Unable to process location. Please verify the address and try again.';
      statusCode = 400;
    }
    
    res.status(statusCode).json({ 
      message: errorMessage,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Create new availability
router.post('/', ensureAuthenticated, async (req, res) => {
  try {
    console.log('POST /api/availability - User:', req.user.email, 'AccountType:', req.user.accountType);
    console.log('POST /api/availability - Request body:', JSON.stringify(req.body, null, 2));
    console.log('POST /api/availability - Request body type:', typeof req.body);
    console.log('POST /api/availability - Request body keys:', Object.keys(req.body));
    console.log('POST /api/availability - Request headers:', req.headers);
    
    if (!['PROVIDER', 'ADMIN'].includes(req.user.accountType)) {
      console.log('POST /api/availability - Unauthorized account type:', req.user.accountType);
      return res.status(403).json({
        message: 'Only providers or admins can set availability'
      });
    }

    // Parse and validate input
    console.log('POST /api/availability - Raw request body:', req.body);
    
    // Ensure req.body is an object
    let availabilityData = req.body;
    
    // Handle case where req.body might be a string (stringified JSON)
    if (typeof req.body === 'string') {
      try {
        availabilityData = JSON.parse(req.body);
        console.log('POST /api/availability - Parsed string body:', availabilityData);
      } catch (error) {
        console.error('POST /api/availability - Error parsing string body:', error);
        return res.status(400).json({ message: 'Invalid JSON format' });
      }
    }
    
    // Handle form-urlencoded data
    if (req.headers['content-type'] && req.headers['content-type'].includes('application/x-www-form-urlencoded')) {
      console.log('POST /api/availability - Handling form-urlencoded data');
      // No need to do anything special, Express already parsed it into req.body
    }
    
    // Extract fields, handling both direct properties and nested properties
    let date, start, end;
    
    // Try to extract from top-level properties
    if (availabilityData.date) date = availabilityData.date;
    if (availabilityData.start) start = availabilityData.start;
    if (availabilityData.end) end = availabilityData.end;
    
    console.log('POST /api/availability - Extracted values:', { date, start, end });
    
    if (!date || !start || !end) {
      console.log('POST /api/availability - Missing required fields:', { date, start, end });
      console.log('POST /api/availability - Date type:', typeof date);
      console.log('POST /api/availability - Start type:', typeof start);
      console.log('POST /api/availability - End type:', typeof end);
      
      // Try to extract from nested properties if any field is missing
      if (availabilityData.newAvailability) {
        console.log('POST /api/availability - Trying to extract from newAvailability property');
        const nestedData = availabilityData.newAvailability;
        if (!date && nestedData.date) date = nestedData.date;
        if (!start && nestedData.start) start = nestedData.start;
        if (!end && nestedData.end) end = nestedData.end;
      }
      
      // Check again after trying nested properties
      if (!date || !start || !end) {
        return res.status(400).json({
          message: 'Missing required fields',
          details: { date, start, end }
        });
      }
    }

    // Resolve provider TZ — manually-added availability blocks get
    // stamped with the provider's current TZ.
    const { tzForProviderId } = require('../utils/providerTz');
    const providerTz = await tzForProviderId(req.user._id);

    // Convert and validate date in the provider's TZ
    const laDate = DateTime.fromISO(date, { zone: providerTz });
    if (!laDate.isValid) {
      console.log('POST /api/availability - Invalid date format:', date);
      return res.status(400).json({ message: 'Invalid date format' });
    }

    // Create start and end DateTime objects in provider TZ
    const startLA = DateTime.fromFormat(
      `${laDate.toFormat('yyyy-MM-dd')} ${start}`,
      'yyyy-MM-dd HH:mm',
      { zone: providerTz }
    );
    const endLA = DateTime.fromFormat(
      `${laDate.toFormat('yyyy-MM-dd')} ${end}`,
      'yyyy-MM-dd HH:mm',
      { zone: providerTz }
    );

    // Validate times
    if (!startLA.isValid || !endLA.isValid) {
      console.log('POST /api/availability - Invalid time format:', { startLA, endLA });
      return res.status(400).json({ message: 'Invalid time format' });
    }

    if (endLA <= startLA) {
      console.log('POST /api/availability - End time not after start time:', { startLA, endLA });
      return res.status(400).json({ message: 'End time must be after start time' });
    }

    // Check for existing availability blocks that overlap with the new one
    const existingBlocks = await Availability.find({
      provider: req.user._id,
      localDate: laDate.toFormat('yyyy-MM-dd'),
      $or: [
        // New block starts during existing block
        {
          start: { $lte: startLA.toJSDate() },
          end: { $gt: startLA.toJSDate() }
        },
        // New block ends during existing block
        {
          start: { $lt: endLA.toJSDate() },
          end: { $gte: endLA.toJSDate() }
        },
        // New block completely contains existing block
        {
          start: { $gte: startLA.toJSDate() },
          end: { $lte: endLA.toJSDate() }
        }
      ]
    });

    if (existingBlocks.length > 0) {
      console.log('POST /api/availability - Overlapping blocks found:', existingBlocks.length);
      return res.status(400).json({
        message: 'This time block overlaps with existing availability',
        conflicts: existingBlocks.map(block => {
          const blockTz = block.timezone || DEFAULT_TZ;
          return {
            id: block._id,
            start: DateTime.fromJSDate(block.start).setZone(blockTz).toFormat(TIME_FORMATS.TIME_12H),
            end: DateTime.fromJSDate(block.end).setZone(blockTz).toFormat(TIME_FORMATS.TIME_12H),
            type: block.type
          };
        })
      });
    }

    console.log('POST /api/availability - Creating new availability object');
    const incomingKind = availabilityData.kind === 'static' ? 'static' : 'mobile';
    const newAvailability = new Availability({
      provider: req.user._id,
      timezone: providerTz,
      date: laDate.toJSDate(),
      start: startLA.toJSDate(),
      end: endLA.toJSDate(),
      localDate: laDate.toFormat('yyyy-MM-dd'),
      source: 'manual',
      kind: incomingKind,
      // Caller is responsible for sending a valid StaticLocation _id when
      // kind=static. We don't fail the request if the id is bogus — the
      // ref will just dangle and the booking flow can warn.
      staticLocation: incomingKind === 'static' && availabilityData.staticLocation
        ? availabilityData.staticLocation
        : null
    });

    // Set departure location (anchor) if provided. Static blocks never
    // get an anchor — the day's whole window IS the in-studio commitment,
    // so a stray departure location would render as a "Fixed" overlay on
    // top of the in-studio block. Belt for the modal's suspenders.
    if (incomingKind === 'mobile') {
      const anchorData = availabilityData.anchor;
      if (anchorData?.locationId) {
        const loc = await SavedLocation.findById(anchorData.locationId);
        if (loc && loc.provider.equals(req.user._id)) {
          newAvailability.anchor = {
            locationId: loc._id,
            name: loc.name,
            address: loc.address,
            lat: loc.lat,
            lng: loc.lng,
          };
        }
      } else if (anchorData?.lat && anchorData?.lng) {
        newAvailability.anchor = {
          locationId: null,
          name: anchorData.name || 'Custom Location',
          address: anchorData.address || '',
          lat: anchorData.lat,
          lng: anchorData.lng,
        };
      }
    }
    
    console.log('POST /api/availability - New availability object:', JSON.stringify(newAvailability, null, 2));

    await newAvailability.save();
    console.log('POST /api/availability - Availability saved successfully');
    res.status(201).json(newAvailability);
  } catch (error) {
    console.error('Error creating availability:', error);
    console.error('Error stack:', error.stack);
    if (error.name === 'ValidationError') {
      console.error('Mongoose validation error details:', error.errors);
    }
    res.status(500).json({ message: 'Availability creation failed', error: error.message });
  }
});

// Delete availability block
router.delete('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const availability = await Availability.findById(req.params.id);

    if (!availability) {
      return res.status(404).json({ message: 'Availability not found' });
    }

    // Verify ownership using provider reference
    if (!availability.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Use the block's stored TZ (snapshot at creation) so a provider
    // who later changed their TZ doesn't shift the bounds of an old
    // block when deleting.
    const availTz = availability.timezone || DEFAULT_TZ;
    const availStart = DateTime.fromJSDate(availability.start, { zone: 'UTC' })
      .setZone(availTz);
    const availEnd = DateTime.fromJSDate(availability.end, { zone: 'UTC' })
      .setZone(availTz);

    // Check for existing bookings that would be affected by deletion
    const laDate = DateTime.fromJSDate(availability.date, { zone: 'UTC' })
      .setZone(availTz);

    const bookings = await Booking.find({
      provider: req.user._id,
      date: {
        $gte: laDate.startOf('day').toUTC().toJSDate(),
        $lt: laDate.endOf('day').toUTC().toJSDate()
      },
      status: { $nin: ['cancelled'] }
    }).populate('client', 'name email');

    // Check if any bookings fall within this availability block.
    // Each booking is parsed in its own TZ — if a booking pre-dates the
    // tz field, fall back to the block's TZ.
    const affectedBookings = bookings.filter(booking => {
      const bookingTz = booking.timezone || availTz;
      const bookingStart = DateTime.fromFormat(
        `${booking.localDate} ${booking.startTime}`,
        'yyyy-MM-dd HH:mm',
        { zone: bookingTz }
      );
      const bookingEnd = DateTime.fromFormat(
        `${booking.localDate} ${booking.endTime}`,
        'yyyy-MM-dd HH:mm',
        { zone: bookingTz }
      );

      // Check if booking overlaps with the availability being deleted
      return (bookingStart >= availStart && bookingEnd <= availEnd);
    });

    if (affectedBookings.length > 0) {
      console.log(`Cannot delete availability - ${affectedBookings.length} bookings would be affected`);
      return res.status(400).json({
        message: 'Cannot delete this availability block as it contains existing bookings',
        conflicts: affectedBookings.map(booking => ({
          id: booking._id,
          time: `${booking.startTime} - ${booking.endTime}`,
          startTime: booking.startTime,
          endTime: booking.endTime,
          client: booking.client ? booking.client.name || booking.recipientInfo?.name || 'Client' : 'Client',
          clientEmail: booking.client ? booking.client.email : booking.recipientInfo?.email,
          status: booking.status
        }))
      });
    }

    // Safe to delete - no bookings affected
    const deletedStart = availability.start;
    const deletedEnd = availability.end;
    const deletedLocalDate = availability.localDate;
    const deletedSource = availability.source;
    await availability.remove();
    console.log(`Availability block ${req.params.id} deleted successfully`);

    // If this was a template-derived occurrence, record the date as an
    // exclusion on the template so it doesn't get re-materialized on the
    // next page load. Equivalent to iCal's EXDATE — the provider's intent
    // is "skip this specific date", not "drop the whole weekly rule".
    if (deletedSource === 'template') {
      try {
        const luxonWeekday = laDate.weekday;
        const dayOfWeek = luxonWeekday === 7 ? 0 : luxonWeekday;
        await WeeklyTemplate.updateOne(
          { provider: req.user._id, dayOfWeek },
          { $addToSet: { exclusions: deletedLocalDate } }
        );
      } catch (exclusionErr) {
        console.error('Failed to record template exclusion:', exclusionErr.message);
      }
    }

    // Un-override Google Calendar blocks that are no longer covered by any remaining availability
    const overriddenBlocks = await BlockedTime.find({
      provider: req.user._id,
      localDate: deletedLocalDate,
      source: 'google_calendar',
      overridden: true,
      start: { $lt: deletedEnd },
      end: { $gt: deletedStart }
    });

    if (overriddenBlocks.length > 0) {
      const remainingAvailability = await Availability.find({
        provider: req.user._id,
        localDate: deletedLocalDate
      });

      for (const bt of overriddenBlocks) {
        const stillCovered = remainingAvailability.some(
          a => a.start < bt.end && a.end > bt.start
        );
        if (!stillCovered) {
          bt.overridden = false;
          await bt.save();
          console.log(`Un-overrode BlockedTime ${bt._id} (no remaining availability covers it)`);
        }
      }
    }

    res.json({ message: 'Availability removed successfully' });
  } catch (error) {
    console.error('Error deleting availability:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update availability block
router.put('/:id', ensureAuthenticated, async (req, res) => {
  try {
    console.log('PUT /api/availability/:id - Request body:', req.body);
    
    // Find the availability block
    const availability = await Availability.findById(req.params.id);

    if (!availability) {
      return res.status(404).json({ message: 'Availability not found' });
    }

    // Verify ownership
    if (!availability.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // PUT only adjusts the time window. Anything else in the body —
    // kind, staticLocation, anchor, source, etc. — is ignored on
    // purpose: switching the mode of a live block requires the same
    // anchor/static cleanup that template save and POST create apply,
    // and we don't want to half-do that here. Mode changes should
    // delete + recreate. (The modal's current "spread the whole block,
    // override start/end" pattern is fine because of this — extra
    // fields land in req.body but never get written back.)
    //
    // Extract and validate the updated data.
    const { start, end } = req.body;
    
    if (!start || !end) {
      return res.status(400).json({ message: 'Start and end times are required' });
    }

    // Use the block's stored TZ for parsing — the block lives in
    // its own timezone, not whatever the server defaults to. This
    // also avoids retroactively shifting a block when the provider
    // changes their TZ later.
    const blockTz = availability.timezone || DEFAULT_TZ;
    const laDate = DateTime.fromJSDate(availability.date, { zone: 'UTC' })
      .setZone(blockTz);

    const startLA = DateTime.fromFormat(
      `${laDate.toFormat('yyyy-MM-dd')} ${start}`,
      'yyyy-MM-dd HH:mm',
      { zone: blockTz }
    );

    const endLA = DateTime.fromFormat(
      `${laDate.toFormat('yyyy-MM-dd')} ${end}`,
      'yyyy-MM-dd HH:mm',
      { zone: blockTz }
    );

    // Validate times
    if (!startLA.isValid || !endLA.isValid) {
      return res.status(400).json({ message: 'Invalid time format' });
    }

    if (endLA <= startLA) {
      return res.status(400).json({ message: 'End time must be after start time' });
    }

    // Check for existing bookings that would conflict with the updated
    // availability. Two bugs were lurking here:
    //   1. The query had no provider filter, so it would scan every other
    //      provider's bookings on this date — false positives in a multi-
    //      provider deployment.
    //   2. The conflict filter passed booking.startTime / endTime (which
    //      are "HH:mm" strings per the Booking schema) into
    //      DateTime.fromJSDate, which silently produced invalid DateTimes
    //      so the comparisons always evaluated false. The conflict
    //      detection has effectively never worked.
    const bookings = await Booking.find({
      provider: req.user._id,
      date: {
        $gte: laDate.startOf('day').toUTC().toJSDate(),
        $lt: laDate.endOf('day').toUTC().toJSDate()
      },
      status: { $nin: ['cancelled'] }
    }).populate('client', 'profile.fullName email');

    const dateStr = laDate.toFormat('yyyy-MM-dd');

    // Scope conflict check to bookings that were INSIDE the current
    // block's window — those are the ones this modify can orphan.
    // Days frequently have multiple availability blocks (a morning
    // mobile window, an afternoon in-studio window, etc) plus
    // bookings sit at their own start/end times. The previous filter
    // checked every booking on the day against the new window,
    // flagging perfectly-contained bookings from a different block
    // as "orphaned by this modify" — false positives that blocked
    // legitimate edits (e.g., "expand my Saturday block earlier" got
    // rejected because of an unrelated booking later in the day).
    const oldStartLA = DateTime.fromJSDate(availability.start).setZone(blockTz);
    const oldEndLA = DateTime.fromJSDate(availability.end).setZone(blockTz);

    // Compute orphan candidates for OBSERVABILITY only — log them so
    // we can spot data inconsistencies, but don't block the modify.
    // The previous hard-block produced repeated false 400s on
    // perfectly-safe edits (template anchor edits, slight start-shift
    // changes, etc.). The provider sees their bookings on the day
    // schedule and can handle any actually-affected ones manually;
    // the platform shouldn't unilaterally refuse the edit. Bookings
    // whose absolute start/end times don't change as a result of
    // this modify are by definition "not affected."
    const candidates = bookings
      .map(booking => {
        const bookingTz = booking.timezone || blockTz;
        const bookingStart = DateTime.fromFormat(
          `${dateStr} ${booking.startTime}`,
          'yyyy-MM-dd HH:mm',
          { zone: bookingTz }
        );
        const bookingEnd = DateTime.fromFormat(
          `${dateStr} ${booking.endTime}`,
          'yyyy-MM-dd HH:mm',
          { zone: bookingTz }
        );
        const overlapsOld = bookingStart < oldEndLA && bookingEnd > oldStartLA;
        const wasContained = bookingStart >= oldStartLA && bookingEnd <= oldEndLA;
        const isContained = bookingStart >= startLA && bookingEnd <= endLA;
        return { booking, bookingStart, bookingEnd, overlapsOld, wasContained, isContained };
      });

    const wouldOrphan = candidates.filter(c => c.wasContained && !c.isContained);
    if (wouldOrphan.length > 0) {
      console.warn(
        `[Availability PUT] ${wouldOrphan.length} booking(s) would fall outside the new window — proceeding (advisory only):`,
        wouldOrphan.map(c => ({
          id: String(c.booking._id),
          time: `${c.booking.startTime}-${c.booking.endTime}`,
          tz: c.booking.timezone || blockTz,
          client: c.booking.client?.profile?.fullName || c.booking.client?.email || 'Client',
        }))
      );
    }

    // Check for overlapping with other availability blocks
    const existingBlocks = await Availability.find({
      provider: req.user._id,
      localDate: laDate.toFormat('yyyy-MM-dd'),
      _id: { $ne: req.params.id }, // Exclude the current block
      $or: [
        // New block starts during existing block
        {
          start: { $lte: startLA.toJSDate() },
          end: { $gt: startLA.toJSDate() }
        },
        // New block ends during existing block
        {
          start: { $lt: endLA.toJSDate() },
          end: { $gte: endLA.toJSDate() }
        },
        // New block completely contains existing block
        {
          start: { $gte: startLA.toJSDate() },
          end: { $lte: endLA.toJSDate() }
        }
      ]
    });

    if (existingBlocks.length > 0) {
      return res.status(400).json({
        message: 'This time block overlaps with existing availability',
        conflicts: existingBlocks.map(block => ({
          id: block._id,
          start: DateTime.fromJSDate(block.start)
            .setZone(DEFAULT_TZ)
            .toFormat(TIME_FORMATS.TIME_12H),
          end: DateTime.fromJSDate(block.end)
            .setZone(DEFAULT_TZ)
            .toFormat(TIME_FORMATS.TIME_12H),
          type: block.type
        }))
      });
    }

    // Diagnostic — log every availability row for this date BEFORE
    // we save. If there's more than one row (e.g., a manual row +
    // a template row), the user might be modifying one while
    // viewing another, which would explain "save succeeds but UI
    // shows old time." This logs the whole picture so we can see
    // what's actually in the DB for the day.
    const beforeRows = await Availability.find({
      provider: req.user._id,
      localDate: laDate.toFormat('yyyy-MM-dd'),
    }).select('_id start end source kind').lean();
    console.log(`[Availability PUT] BEFORE save — ${beforeRows.length} rows for ${laDate.toFormat('yyyy-MM-dd')}:`, JSON.stringify(beforeRows.map(r => ({
      _id: String(r._id),
      start: r.start.toISOString(),
      end: r.end.toISOString(),
      source: r.source,
      kind: r.kind,
    }))));
    console.log(`[Availability PUT] modifying id=${req.params.id}, target start=${start}, end=${end}`);

    // Update the availability block
    availability.start = startLA.toUTC().toJSDate();
    availability.end = endLA.toUTC().toJSDate();

    // Anchor reconciliation. Template-derived mobile rows can carry
    // a fixed-location anchor (a sub-window inside the day where the
    // provider works at a specific saved location). When the parent
    // window changes, the anchor must follow — otherwise the day
    // schedule renders the anchor at its OLD times while the parent
    // shifted, producing a "second window behind the fixed one"
    // visual artifact and a data inconsistency.
    //
    // Clip the anchor to [new start, new end]. If the resulting
    // window has zero or negative width (anchor falls completely
    // outside the new parent), drop the anchor entirely.
    if (availability.anchor && availability.anchor.startTime && availability.anchor.endTime) {
      const newStartMin = startLA.hour * 60 + startLA.minute;
      const newEndMin = endLA.hour * 60 + endLA.minute;
      const [aSh, aSm] = availability.anchor.startTime.split(':').map(Number);
      const [aEh, aEm] = availability.anchor.endTime.split(':').map(Number);
      const aStartMin = aSh * 60 + aSm;
      const aEndMin = aEh * 60 + aEm;

      const clippedStart = Math.max(aStartMin, newStartMin);
      const clippedEnd = Math.min(aEndMin, newEndMin);

      if (clippedEnd <= clippedStart) {
        // Anchor doesn't fit at all in the new window — drop it.
        availability.anchor = {
          locationId: null, name: null, address: null,
          lat: null, lng: null,
          startTime: null, endTime: null,
        };
        console.log(`[Availability PUT] anchor dropped — fell outside new window`);
      } else if (clippedStart !== aStartMin || clippedEnd !== aEndMin) {
        const fmt = (m) => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
        availability.anchor.startTime = fmt(clippedStart);
        availability.anchor.endTime = fmt(clippedEnd);
        availability.markModified('anchor');
        console.log(`[Availability PUT] anchor clipped to ${fmt(clippedStart)}-${fmt(clippedEnd)}`);
      }
    }

    // Save the updated block (this will trigger the pre-save middleware)
    await availability.save();

    // Diagnostic: log what we actually persisted so we can compare
    // against what the client sees on next fetch.
    console.log(`[Availability PUT] saved id=${availability._id} provider=${availability.provider} localDate=${availability.localDate} start=${availability.start.toISOString()} end=${availability.end.toISOString()} source=${availability.source}`);

    // After save, log all rows again so we can see if anything else
    // changed (or didn't) on the same date.
    const afterRows = await Availability.find({
      provider: req.user._id,
      localDate: laDate.toFormat('yyyy-MM-dd'),
    }).select('_id start end source kind').lean();
    console.log(`[Availability PUT] AFTER save — ${afterRows.length} rows for ${laDate.toFormat('yyyy-MM-dd')}:`, JSON.stringify(afterRows.map(r => ({
      _id: String(r._id),
      start: r.start.toISOString(),
      end: r.end.toISOString(),
      source: r.source,
      kind: r.kind,
    }))));

    res.json(availability);
  } catch (error) {
    console.error('Error updating availability:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PATCH /:id/anchor (Update departure location for a day)
router.patch('/:id/anchor', ensureAuthenticated, async (req, res) => {
  try {
    const availability = await Availability.findById(req.params.id);

    if (!availability) {
      return res.status(404).json({ message: 'Availability not found' });
    }

    if (!availability.provider.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Anchor only applies to mobile days. A static window's location
    // commitment IS the studio; storing a separate departure anchor would
    // surface as a "Fixed" overlay on top of the in-studio block.
    if (availability.kind === 'static') {
      return res.status(400).json({
        message: 'Cannot set a departure anchor on an in-studio (static) block. Anchor only applies to mobile availability.'
      });
    }

    const { locationId, name, address, lat, lng } = req.body;

    if (locationId) {
      // Using a saved location
      const loc = await SavedLocation.findById(locationId);
      if (!loc || !loc.provider.equals(req.user._id)) {
        return res.status(404).json({ message: 'Location not found' });
      }
      availability.anchor = {
        locationId: loc._id,
        name: loc.name,
        address: loc.address,
        lat: loc.lat,
        lng: loc.lng,
      };
    } else if (lat && lng) {
      // Using a pin drop / manual coordinates
      availability.anchor = {
        locationId: null,
        name: name || 'Custom Location',
        address: address || '',
        lat,
        lng,
      };
    } else {
      // Clear anchor — revert to home base
      availability.anchor = undefined;
    }

    await availability.save();
    res.json(availability);
  } catch (error) {
    console.error('Error updating availability anchor:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
