// timeUtils.js

const { DateTime } = require('luxon');
const { DEFAULT_TZ, TIME_FORMATS } = require('../../src/utils/timeConstants');
const LuxonService = require('../../src/utils/LuxonService');
const { calculateTravelTime } = require('../services/mapService');

/**
 * HELPER: Calculate buffer between bookings.
 *
 * Two distinct things contribute to the gap between adjacent appointments:
 *   - Travel time:    handled in validateSlotsByBoundary via getCachedTravelTime,
 *                     which returns 0 when both bookings share an address.
 *   - Settle buffer:  the post-session reset (sheets, payment, transition,
 *                     provider catching their breath). Configured per-provider,
 *                     defaults to 15 min. Always applies between any two
 *                     adjacent bookings, including same-address siblings in
 *                     a back-to-back group — there's still a recipient
 *                     hand-off, even when the table doesn't move.
 *
 * The earlier behavior collapsed the buffer to 0 for same-group + same-
 * address pairs, which conflated travel and settle. Keep settle buffer
 * always; trust the boundary engine to zero out travel where appropriate.
 */
const calculateBufferBetweenBookings = (booking1, booking2, defaultBuffer = 15, allBookings = []) => {
  const effectiveBuffer = typeof defaultBuffer === 'number' ? defaultBuffer : 15;
  if (!booking1 || !booking2) return effectiveBuffer;

  // Same-address back-to-back: skip the settle buffer entirely. The
  // 15-min default exists for the provider to wipe down / reset / drive
  // — none of which apply when the next booking is at the same address
  // (couples massage, family back-to-back, "extra hands" upgrades). The
  // provider just continues working with the next person. Per the
  // design rule in plans/packages-v2.md, don't impose a rule the
  // parties didn't ask for. Different-address pairs still get the
  // default; travel time is layered on top by the boundary engine.
  if (isSameLocation(booking1.location, booking2.location)) {
    // Departure-buffer carrier still wins if explicitly set on a chain
    // group's last sibling — that's a deliberate provider override.
    if (booking1.groupId && booking1.isLastInGroup && booking1.extraDepartureBuffer) {
      return booking1.extraDepartureBuffer;
    }
    return 0;
  }

  // Departure-buffer carrier: when the trailing booking flagged extra
  // departure time at the end of a group (e.g. provider needs N×buffer
  // to break down equipment after the last session), preserve that
  // additional time. Rare but kept for parity with existing data.
  if (booking1.groupId && booking1.isLastInGroup && booking1.extraDepartureBuffer) {
    const groupSize = allBookings.filter(b => b.groupId === booking1.groupId).length;
    return effectiveBuffer * groupSize + booking1.extraDepartureBuffer;
  }

  return effectiveBuffer;
};

// Canonical slot grid step. All start times offered to clients are aligned
// to this grid (`:00`, `:15`, `:30`, `:45` for the default 15) regardless
// of the duration mix on the provider's day. Keeping the grid stable lets
// the Distance-Matrix cache (hour-bucketed) cluster cleanly and prevents
// off-grid times like 4:27 PM from landing in the picker.
const SLOT_GRID_MINUTES = 15;

/**
 * Generate candidate slot start times on the canonical 15-min grid within
 * the [startTime, endTime − maxDuration] window. The first slot is snapped
 * UP to the next grid step so weird availability starts (e.g. 14:53) don't
 * leak off-grid candidates.
 */
function generateTimeSlots(startTime, endTime, intervalMinutes, appointmentDuration) {
  let startDT, endDT;
  if (startTime instanceof Date) {
    startDT = DateTime.fromJSDate(startTime).setZone(DEFAULT_TZ);
    endDT = DateTime.fromJSDate(endTime).setZone(DEFAULT_TZ);
  } else {
    startDT = DateTime.fromISO(startTime, { zone: DEFAULT_TZ });
    endDT = DateTime.fromISO(endTime, { zone: DEFAULT_TZ });
  }

  // Snap start UP to the next grid boundary. Idempotent for already-aligned
  // starts (15:00 stays 15:00; 14:53 becomes 15:00).
  const startMin = startDT.hour * 60 + startDT.minute;
  const snappedStartMin = Math.ceil(startMin / SLOT_GRID_MINUTES) * SLOT_GRID_MINUTES;
  if (snappedStartMin !== startMin) {
    startDT = startDT.set({
      hour: Math.floor(snappedStartMin / 60),
      minute: snappedStartMin % 60,
      second: 0,
      millisecond: 0,
    });
  }

  const slots = [];
  let currentSlot = startDT;
  const maxDuration = Array.isArray(appointmentDuration)
    ? Math.max(...appointmentDuration)
    : appointmentDuration;

  while (currentSlot <= endDT.minus({ minutes: maxDuration })) {
    const slotEnd = currentSlot.plus({ minutes: maxDuration });
    if (!LuxonService.checkDSTTransition(currentSlot.toISO(), slotEnd.toISO())) {
      slots.push(currentSlot.toJSDate());
    }
    currentSlot = currentSlot.plus({ minutes: intervalMinutes });
  }

  return slots;
}

/**
 * Remove slots that overlap with existing bookings (including buffer)
 */
function removeOccupiedSlots(slots, bookings, appointmentDuration, bufferMinutes = 15, requestedGroupId = null, clientLocation = null) {
  const effectiveBufferMinutes = typeof bufferMinutes === 'number' ? bufferMinutes : 15;
  const appointmentDurationMs = (Array.isArray(appointmentDuration)
    ? Math.max(...appointmentDuration)
    : appointmentDuration) * 60 * 1000;

  return slots.filter(slot => {
    const slotStart = DateTime.fromJSDate(slot).setZone(DEFAULT_TZ);
    const slotEnd = slotStart.plus({ milliseconds: appointmentDurationMs });

    return !bookings.some(booking => {
      const bookingStart = DateTime.fromFormat(
        `${booking.date.toISOString().split('T')[0]} ${booking.startTime}`,
        'yyyy-MM-dd HH:mm', { zone: DEFAULT_TZ }
      );
      const bookingEnd = DateTime.fromFormat(
        `${booking.date.toISOString().split('T')[0]} ${booking.endTime}`,
        'yyyy-MM-dd HH:mm', { zone: DEFAULT_TZ }
      );

      const buffer = calculateBufferBetweenBookings(
        { groupId: requestedGroupId, location: clientLocation },
        booking, effectiveBufferMinutes, bookings
      );
      const bufferMs = buffer * 60 * 1000;
      const occupiedStart = bookingStart.minus({ milliseconds: bufferMs });
      const occupiedEnd = bookingEnd.plus({ milliseconds: bufferMs });

      return slotStart < occupiedEnd && slotEnd > occupiedStart;
    });
  });
}

/**
 * TRAFFIC PERIODS for LA metro area.
 * Returns a representative departure time and traffic model
 * based on what time of day the travel would occur.
 *
 * Periods:
 *   6:00-9:00 AM  → Morning rush (pessimistic, depart 7:30 AM)
 *   9:00-11:00 AM → Light traffic (best_guess, depart 10:00 AM)
 *   11:00-1:00 PM → Midday (best_guess, depart 12:00 PM)
 *   1:00-4:00 PM  → Light traffic (best_guess, depart 2:30 PM)
 *   4:00-7:00 PM  → Evening rush (pessimistic, depart 5:30 PM)
 *   7:00 PM+      → Evening (best_guess, depart 8:00 PM)
 *   Before 6 AM   → Early (best_guess, depart 5:00 AM)
 */
function getTrafficProfile(minuteOfDay, slotDate) {
  // minuteOfDay = hours * 60 + minutes (from midnight)
  let representativeHour, representativeMinute, model;

  if (minuteOfDay < 360) {        // before 6 AM
    representativeHour = 5; representativeMinute = 0; model = 'best_guess';
  } else if (minuteOfDay < 540) { // 6-9 AM rush
    representativeHour = 7; representativeMinute = 30; model = 'pessimistic';
  } else if (minuteOfDay < 660) { // 9-11 AM light
    representativeHour = 10; representativeMinute = 0; model = 'best_guess';
  } else if (minuteOfDay < 780) { // 11 AM - 1 PM midday
    representativeHour = 12; representativeMinute = 0; model = 'best_guess';
  } else if (minuteOfDay < 960) { // 1-4 PM light
    representativeHour = 14; representativeMinute = 30; model = 'best_guess';
  } else if (minuteOfDay < 1140) { // 4-7 PM rush
    representativeHour = 17; representativeMinute = 30; model = 'pessimistic';
  } else {                         // 7 PM+ evening
    representativeHour = 20; representativeMinute = 0; model = 'best_guess';
  }

  const departureTime = DateTime.fromFormat(
    `${slotDate} ${String(representativeHour).padStart(2, '0')}:${String(representativeMinute).padStart(2, '0')}`,
    'yyyy-MM-dd HH:mm',
    { zone: DEFAULT_TZ }
  ).toJSDate();

  return { departureTime, model };
}

/**
 * Check if two locations are effectively the same place (within ~200m)
 */
function isSameLocation(loc1, loc2) {
  if (!loc1?.lat || !loc2?.lat || !loc1?.lng || !loc2?.lng) return false;
  const latDiff = Math.abs(loc1.lat - loc2.lat);
  const lngDiff = Math.abs(loc1.lng - loc2.lng);
  return latDiff < 0.002 && lngDiff < 0.002; // ~200m
}

/**
 * Get travel time between two locations with traffic-aware caching.
 *
 * Cache is keyed by coords + traffic period so that a 7 AM route (rush hour)
 * gets a different result than a 10 AM route (light traffic) for the same pair.
 * Reverse direction reuse only happens within the same traffic period.
 *
 * @param {Object} from - { lat, lng }
 * @param {Object} to - { lat, lng }
 * @param {number} travelMinuteOfDay - approximate minute-of-day when travel occurs
 * @param {string} slotDate - 'yyyy-MM-dd' date string for building departure time
 * @param {string} providerId
 * @param {Map} routeCache - shared cache for this request
 */
async function getCachedTravelTime(from, to, travelMinuteOfDay, slotDate, providerId, routeCache) {
  if (isSameLocation(from, to)) {
    return 0;
  }

  if (!from?.lat || !from?.lng || !to?.lat || !to?.lng ||
      isNaN(from.lat) || isNaN(from.lng) || isNaN(to.lat) || isNaN(to.lng)) {
    console.log('[Travel] Invalid coords, returning 0');
    return 0;
  }

  const { departureTime, model } = getTrafficProfile(travelMinuteOfDay, slotDate);

  // Cache key includes traffic model so rush hour ≠ light traffic
  const coordKey = `${from.lat.toFixed(3)},${from.lng.toFixed(3)}→${to.lat.toFixed(3)},${to.lng.toFixed(3)}`;
  const key = `${coordKey}@${model}`;

  if (routeCache.has(key)) {
    return routeCache.get(key);
  }

  // Check reverse direction within same traffic period
  const reverseCoordKey = `${to.lat.toFixed(3)},${to.lng.toFixed(3)}→${from.lat.toFixed(3)},${from.lng.toFixed(3)}`;
  const reverseKey = `${reverseCoordKey}@${model}`;
  if (routeCache.has(reverseKey)) {
    const reverseTime = routeCache.get(reverseKey);
    routeCache.set(key, reverseTime);
    return reverseTime;
  }

  try {
    const travelMin = await calculateTravelTime(from, to, departureTime, providerId, model);
    routeCache.set(key, travelMin);
    console.log(`[Travel] ${coordKey} @${model}: ${travelMin} min`);
    return travelMin;
  } catch (err) {
    console.error(`[Travel] API error for ${coordKey}: ${err.message}`);
    return 0;
  }
}

/**
 * BOUNDARY-BASED SLOT VALIDATION
 *
 * Instead of making an API call per slot, this calculates time-window boundaries
 * for each gap in the provider's day, then filters slots by those windows.
 *
 * For a day with N bookings, this makes at most N+1 API calls (one per unique
 * route pair) instead of up to 20 calls (one per slot).
 *
 * The commitments for the day are: [home/anchor, booking1, booking2, ..., end-of-day]
 * For each gap between commitments, we calculate:
 *   - earliestStart: when provider can arrive at client after previous commitment
 *   - latestStart: latest the massage can start and still reach next commitment
 * Then we filter: only offer slots where slotStart >= earliestStart AND slotStart <= latestStart
 */
async function validateSlotsByBoundary(
  slots,
  bookings,
  clientLocation,
  appointmentDuration,
  bufferMinutes,
  availEndTime, // Date object — end of availability block
  providerId,
  homeBase     // { lat, lng } or null
) {
  const effectiveBuffer = typeof bufferMinutes === 'number' ? bufferMinutes : 15;
  const duration = Array.isArray(appointmentDuration) ? Math.max(...appointmentDuration) : appointmentDuration;
  const arrivalBuffer = 15; // provider arrives 15 min early

  // Route cache for this request — prevents duplicate API calls
  const routeCache = new Map();

  // Sort bookings by start time
  const sortedBookings = [...bookings].sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Get availability end as DateTime
  const availEnd = DateTime.fromJSDate(availEndTime).setZone(DEFAULT_TZ);

  // Get slot date from first slot (they're all the same day)
  if (slots.length === 0) return [];
  const slotDate = DateTime.fromJSDate(slots[0]).setZone(DEFAULT_TZ).toFormat('yyyy-MM-dd');

  // Build commitment list: each has { location, startMinute, endMinute }
  // Minutes are from midnight for easy comparison
  const toMinutes = (dt) => dt.hour * 60 + dt.minute;

  const commitments = sortedBookings.map(b => {
    const bStart = DateTime.fromFormat(`${slotDate} ${b.startTime}`, 'yyyy-MM-dd HH:mm', { zone: DEFAULT_TZ });
    const bEnd = DateTime.fromFormat(`${slotDate} ${b.endTime}`, 'yyyy-MM-dd HH:mm', { zone: DEFAULT_TZ });
    return {
      location: b.location,
      startMinute: toMinutes(bStart),
      endMinute: toMinutes(bEnd),
      startDT: bStart,
      endDT: bEnd
    };
  });

  // Build the list of valid time windows
  const windows = [];

  console.log(`[Boundary] Building windows for ${commitments.length} bookings, duration=${duration}min`);

  for (let i = 0; i <= commitments.length; i++) {
    const prev = i > 0 ? commitments[i - 1] : null;
    const next = i < commitments.length ? commitments[i] : null;

    // Same-address back-to-back: provider is already at the client's
    // location, so settle + arrival buffer both collapse to 0. Travel
    // time will also be 0 (getCachedTravelTime short-circuits same-
    // location), so the slot can land flush against the previous
    // booking's end. This is the "couples massage booked in two
    // transactions" case the user asked about.
    const prevSameAddress = prev && isSameLocation(prev.location, clientLocation);
    const nextSameAddress = next && isSameLocation(next.location, clientLocation);
    const bufferFromPrev = prevSameAddress ? 0 : effectiveBuffer;
    const arrivalFromPrev = prevSameAddress ? 0 : arrivalBuffer;
    const bufferToNext = nextSameAddress ? 0 : effectiveBuffer;
    const arrivalToNext = nextSameAddress ? 0 : arrivalBuffer;

    // --- Calculate earliest start (when can provider arrive at client?) ---
    let earliestMinute;
    if (prev) {
      // Travel occurs right after previous booking ends
      const travelMinuteOfDay = prev.endMinute + bufferFromPrev;
      const travelFromPrev = await getCachedTravelTime(
        prev.location, clientLocation, travelMinuteOfDay, slotDate, providerId, routeCache
      );
      earliestMinute = prev.endMinute + bufferFromPrev + travelFromPrev + arrivalFromPrev;
      console.log(`[Boundary] After booking ending ${prev.endMinute}: +${bufferFromPrev}buf +${travelFromPrev}travel +${arrivalFromPrev}arrival = earliest ${earliestMinute}${prevSameAddress ? ' (same-address, no settle/arrival)' : ''}`);
    } else if (homeBase?.lat && homeBase?.lng) {
      // First gap: provider leaves home to arrive at client
      // Availability start = earliest they're willing to begin work
      // They leave home at (availStart - arrivalBuffer - travelFromHome)
      const firstSlotDT = DateTime.fromJSDate(slots[0]).setZone(DEFAULT_TZ);
      const firstSlotMinute = toMinutes(firstSlotDT);
      // Travel occurs before the first slot — estimate departure around that time
      const travelMinuteOfDay = Math.max(0, firstSlotMinute - arrivalBuffer - 30);
      const travelFromHome = await getCachedTravelTime(
        homeBase, clientLocation, travelMinuteOfDay, slotDate, providerId, routeCache
      );
      // Earliest = first slot in the availability block (provider leaves home whenever needed)
      // No constraint beyond what's already in the generated slots
      earliestMinute = firstSlotMinute;
      console.log(`[Boundary] From home: travel=${travelFromHome}min, earliest=${earliestMinute}`);
    } else {
      const firstSlotDT = DateTime.fromJSDate(slots[0]).setZone(DEFAULT_TZ);
      earliestMinute = toMinutes(firstSlotDT);
    }

    // --- Calculate latest start (latest slot that still gets provider to next commitment) ---
    let latestMinute;
    if (next) {
      // Travel occurs after massage ends: slotStart + duration + buffer
      // Estimate travel time at the midpoint of when it would occur
      const estimatedDepartureMinute = next.startMinute - 60; // rough estimate
      const travelToNext = await getCachedTravelTime(
        clientLocation, next.location, Math.max(0, estimatedDepartureMinute), slotDate, providerId, routeCache
      );
      latestMinute = next.startMinute - arrivalToNext - travelToNext - bufferToNext - duration;
      console.log(`[Boundary] Before booking at ${next.startMinute}: -${arrivalToNext}arrival -${travelToNext}travel -${bufferToNext}buf -${duration}dur = latest ${latestMinute}${nextSameAddress ? ' (same-address, no settle/arrival)' : ''}`);
    } else {
      latestMinute = toMinutes(availEnd) - duration;
      console.log(`[Boundary] End of day: avail ends ${toMinutes(availEnd)}, latest start=${latestMinute}`);
    }

    if (earliestMinute <= latestMinute) {
      windows.push({ earliestMinute, latestMinute });
      const fmtMin = (m) => `${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`;
      console.log(`[Boundary] Window ${i}: ${fmtMin(earliestMinute)} - ${fmtMin(latestMinute)}`);
    } else {
      console.log(`[Boundary] Window ${i}: NO VALID SLOTS (earliest ${earliestMinute} > latest ${latestMinute})`);
    }
  }

  // Filter slots by windows
  const validSlots = slots.filter(slot => {
    const slotDT = DateTime.fromJSDate(slot).setZone(DEFAULT_TZ);
    const slotMinute = toMinutes(slotDT);
    return windows.some(w => slotMinute >= w.earliestMinute && slotMinute <= w.latestMinute);
  });

  console.log(`[Boundary] ${validSlots.length} valid slots from ${slots.length} candidates using ${routeCache.size} API calls`);
  return validSlots;
}

/**
 * Main function: get available time slots for booking
 */
async function getAvailableTimeSlots(
  adminAvailability,
  bookings,
  clientLocation,
  appointmentDuration,
  bufferMinutes = 15,
  requestedGroupId = null,
  extraDepartureBuffer = 0,
  providerId = null,
  addons = [],
  homeBase = null, // { lat, lng } — provider's home/anchor location
  blockedTimes = [] // BlockedTime documents for this date
) {
  const effectiveBufferMinutes = typeof bufferMinutes === 'number' ? bufferMinutes : 15;

  // Parse availability start/end times
  let availabilityDateLA, startTime, endTime;
  availabilityDateLA = DateTime.fromJSDate(adminAvailability.date).setZone(DEFAULT_TZ).startOf('day');

  if (adminAvailability.start instanceof Date) {
    startTime = DateTime.fromJSDate(adminAvailability.start).setZone(DEFAULT_TZ).toJSDate();
  } else if (typeof adminAvailability.start === 'string') {
    const startDT = DateTime.fromFormat(
      `${availabilityDateLA.toFormat('yyyy-MM-dd')} ${adminAvailability.start}`,
      'yyyy-MM-dd HH:mm', { zone: DEFAULT_TZ }
    );
    if (!startDT.isValid) return [];
    startTime = startDT.toJSDate();
  } else {
    return [];
  }

  if (adminAvailability.end instanceof Date) {
    endTime = DateTime.fromJSDate(adminAvailability.end).setZone(DEFAULT_TZ).toJSDate();
  } else if (typeof adminAvailability.end === 'string') {
    const endDT = DateTime.fromFormat(
      `${availabilityDateLA.toFormat('yyyy-MM-dd')} ${adminAvailability.end}`,
      'yyyy-MM-dd HH:mm', { zone: DEFAULT_TZ }
    );
    if (!endDT.isValid) return [];
    endTime = endDT.toJSDate();
  } else {
    return [];
  }

  // Step 1: Generate candidate slots on the canonical 15-min grid.
  // Boundary validation (Step 4) filters them down to legal options.
  // The dense grid means clients see :15/:45 fallbacks when bookings shift
  // the day off the :00/:30 cadence — Distance-Matrix cost is unchanged
  // because the cache is hour-bucketed, not minute-bucketed.
  const slots = generateTimeSlots(startTime, endTime, SLOT_GRID_MINUTES, appointmentDuration);
  console.log(`[Slots] Generated ${slots.length} base slots (${SLOT_GRID_MINUTES}-min grid)`);

  // Static availability has no per-slot drive time inside its window —
  // the buffer comes from the StaticLocation's turnover time and there's
  // no Distance Matrix call to make. Override the caller-supplied buffer
  // with the location's bufferMinutes so adjacent in-studio bookings
  // respect the room's actual reset cadence.
  const isStaticWindow = adminAvailability.kind === 'static';
  const staticBuffer = adminAvailability.staticLocation?.staticConfig?.bufferMinutes;
  const slotBuffer = isStaticWindow && Number.isFinite(staticBuffer)
    ? staticBuffer
    : effectiveBufferMinutes;

  // Step 2: Remove slots occupied by existing bookings
  const slotsAfterOccupied = removeOccupiedSlots(
    slots, bookings, appointmentDuration,
    slotBuffer, requestedGroupId, clientLocation
  );
  console.log(`[Slots] ${slotsAfterOccupied.length} slots after removing occupied`);

  // Step 2.5: Remove slots that fall within blocked time ranges
  const maxDuration = Array.isArray(appointmentDuration)
    ? Math.max(...appointmentDuration)
    : appointmentDuration;
  const effectiveBlockedTimes = blockedTimes.filter(bt => !bt.overridden);
  const slotsAfterBlocked = effectiveBlockedTimes.length > 0
    ? slotsAfterOccupied.filter(slot => {
        const slotStart = slot.getTime();
        const slotEnd = slotStart + maxDuration * 60 * 1000;
        return !effectiveBlockedTimes.some(bt => {
          const btStart = bt.start.getTime();
          const btEnd = bt.end.getTime();
          return slotStart < btEnd && slotEnd > btStart;
        });
      })
    : slotsAfterOccupied;
  if (effectiveBlockedTimes.length > 0) {
    console.log(`[Slots] ${slotsAfterBlocked.length} slots after removing blocked times`);
  }

  // Static window short-circuit: clients come to the provider's
  // location, no per-slot drive math, no Distance Matrix calls. Just
  // return what's left after occupied + blocked filtering.
  if (isStaticWindow) {
    console.log(`[Slots] Static window — returning ${slotsAfterBlocked.length} slots without travel validation`);
    return slotsAfterBlocked;
  }

  // Step 3: Use availability's own anchor if it has one, otherwise use provided homeBase
  const effectiveHome = (adminAvailability.anchor?.lat)
    ? { lat: adminAvailability.anchor.lat, lng: adminAvailability.anchor.lng }
    : homeBase;

  // Convert blocked times WITH location into booking-shaped objects
  // so they participate in travel time boundary calculations
  // Skip overridden blocks (provider has said to ignore them)
  const blockedTimesWithLocation = blockedTimes
    .filter(bt => !bt.overridden && bt.location?.lat && bt.location?.lng)
    .map(bt => {
      const btStart = DateTime.fromJSDate(bt.start).setZone(DEFAULT_TZ);
      const btEnd = DateTime.fromJSDate(bt.end).setZone(DEFAULT_TZ);
      return {
        startTime: btStart.toFormat('HH:mm'),
        endTime: btEnd.toFormat('HH:mm'),
        location: { lat: bt.location.lat, lng: bt.location.lng, address: bt.location.address },
        _isBlockedTime: true
      };
    });

  const bookingsAndBlockedWithLoc = [...bookings, ...blockedTimesWithLocation];

  // Step 4: Validate by travel-time boundaries (efficient — few API calls)
  const validSlots = await validateSlotsByBoundary(
    slotsAfterBlocked,
    bookingsAndBlockedWithLoc,
    clientLocation,
    appointmentDuration,
    effectiveBufferMinutes,
    endTime,
    providerId,
    effectiveHome
  );

  return validSlots;
}

module.exports = {
  getAvailableTimeSlots,
  generateTimeSlots,
  removeOccupiedSlots,
  validateSlotsByBoundary,
  calculateBufferBetweenBookings
};
