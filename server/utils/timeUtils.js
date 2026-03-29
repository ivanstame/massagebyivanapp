// timeUtils.js

const { DateTime } = require('luxon');
const { DEFAULT_TZ, TIME_FORMATS } = require('../../src/utils/timeConstants');
const LuxonService = require('../../src/utils/LuxonService');
const { calculateTravelTime } = require('../services/mapService');

/**
 * HELPER: Calculate buffer time between bookings based on group ID and location
 */
const calculateBufferBetweenBookings = (booking1, booking2, defaultBuffer = 15, allBookings = []) => {
  const effectiveBuffer = typeof defaultBuffer === 'number' ? defaultBuffer : 15;
  if (!booking1 || !booking2) return effectiveBuffer;

  if (
    booking1.groupId && booking2.groupId &&
    booking1.groupId === booking2.groupId &&
    booking1.location?.address === booking2.location?.address
  ) {
    return 0;
  }

  if (booking1.groupId && booking1.isLastInGroup && booking1.extraDepartureBuffer) {
    const groupSize = allBookings.filter(b => b.groupId === booking1.groupId).length;
    return effectiveBuffer * groupSize + booking1.extraDepartureBuffer;
  }

  return effectiveBuffer;
};

/**
 * Generate time slots in 30-minute increments
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

    // --- Calculate earliest start (when can provider arrive at client?) ---
    let earliestMinute;
    if (prev) {
      // Travel occurs right after previous booking ends
      const travelMinuteOfDay = prev.endMinute + effectiveBuffer;
      const travelFromPrev = await getCachedTravelTime(
        prev.location, clientLocation, travelMinuteOfDay, slotDate, providerId, routeCache
      );
      earliestMinute = prev.endMinute + effectiveBuffer + travelFromPrev + arrivalBuffer;
      console.log(`[Boundary] After booking ending ${prev.endMinute}: +${effectiveBuffer}buf +${travelFromPrev}travel +${arrivalBuffer}arrival = earliest ${earliestMinute}`);
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
      latestMinute = next.startMinute - arrivalBuffer - travelToNext - effectiveBuffer - duration;
      console.log(`[Boundary] Before booking at ${next.startMinute}: -${arrivalBuffer}arrival -${travelToNext}travel -${effectiveBuffer}buf -${duration}dur = latest ${latestMinute}`);
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
  homeBase = null // { lat, lng } — provider's home/anchor location
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

  // Step 1: Generate all possible 30-min slots
  const slots = generateTimeSlots(startTime, endTime, 30, appointmentDuration);
  console.log(`[Slots] Generated ${slots.length} base slots`);

  // Step 2: Remove slots occupied by existing bookings
  const slotsAfterOccupied = removeOccupiedSlots(
    slots, bookings, appointmentDuration,
    effectiveBufferMinutes, requestedGroupId, clientLocation
  );
  console.log(`[Slots] ${slotsAfterOccupied.length} slots after removing occupied`);

  // Step 3: Use availability's own anchor if it has one, otherwise use provided homeBase
  const effectiveHome = (adminAvailability.anchor?.lat)
    ? { lat: adminAvailability.anchor.lat, lng: adminAvailability.anchor.lng }
    : homeBase;

  // Step 4: Validate by travel-time boundaries (efficient — few API calls)
  const validSlots = await validateSlotsByBoundary(
    slotsAfterOccupied,
    bookings,
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
