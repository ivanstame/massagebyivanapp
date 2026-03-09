// timeUtils.js

const { DateTime } = require('luxon');
const { DEFAULT_TZ, TIME_FORMATS } = require('../../src/utils/timeConstants');
const LuxonService = require('../../src/utils/LuxonService');
const { calculateTravelTime } = require('../services/mapService'); // Adjust the path as necessary
const { validateProviderTravel } = require('../services/mapService');

const laZone = 'America/Los_Angeles';

/**
 * HELPER FUNCTION: Calculate buffer time between bookings based on group ID and location
 *
 * @param {Object} booking1 - First booking
 * @param {Object} booking2 - Second booking
 * @param {number} [defaultBuffer=15] - Default buffer time in minutes
 *                                      TEMPORARY: This default value is used until provider registration
 *                                      captures and stores the desired buffer time per provider.
 * @param {Array} [allBookings=[]] - All bookings for the day
 * @returns {number} - Buffer time in minutes
 */
const calculateBufferBetweenBookings = (booking1, booking2, defaultBuffer = 15, allBookings = []) => {
  // Ensure defaultBuffer is a number to prevent NaN errors in calculations
  const effectiveBuffer = typeof defaultBuffer === 'number' ? defaultBuffer : 15;
  
  // If we don't have two real bookings, just return the default buffer
  if (!booking1 || !booking2) {
    return effectiveBuffer;
  }

  // If both bookings share the same groupId and location, skip the in-between buffer
  if (
    booking1.groupId &&
    booking2.groupId &&
    booking1.groupId === booking2.groupId &&
    booking1.location?.address === booking2.location?.address
  ) {
    return 0;
  }

  // If the first booking is flagged as "last in group," add the accumulated buffer
  if (booking1.groupId && booking1.isLastInGroup && booking1.extraDepartureBuffer) {
    // Count how many bookings share that groupId
    const groupSize = allBookings.filter(b => b.groupId === booking1.groupId).length;
    // Add extra buffer based on group size
    return effectiveBuffer * groupSize + booking1.extraDepartureBuffer;
  }

  // Otherwise, return the default buffer
  return effectiveBuffer;
};

//
// HELPER FUNCTION: Validate a chain of sessions (multi-session wizard scenario)
//
const validateMultiSessionSlot = async (
  startTimeString,      // e.g. "13:00"
  sessionDurations,     // array of durations [90, 60, 120, ...]
  bookings,
  clientLocation,
  earliestTime,         // e.g. 6 (6 AM)
  latestTime            // e.g. 22 (10 PM)
) => {
  console.log('DEBUG: validateMultiSessionSlot checking chain:', { 
    startTimeString, 
    sessionDurations 
  });

  let currentTime = startTimeString;

  for (let i = 0; i < sessionDurations.length; i++) {
    const duration = sessionDurations[i];
    const [hours, minutes] = currentTime.split(':').map(Number);

    // Check if we're still within business hours
    if (hours < earliestTime || hours >= latestTime) {
      return false;
    }

    // Ensure we're on a half-hour boundary
    if (minutes % 30 !== 0) {
      return false;
    }

    // Calculate end time for this session
    const totalMinutes = hours * 60 + minutes + duration;
    const endHours = Math.floor(totalMinutes / 60);
    const endMinutes = totalMinutes % 60;

    // Check if end time is within business hours
    if (endHours >= latestTime) {
      return false;
    }

    // If this is the last session, see if we can fit the combined buffer
    if (i === sessionDurations.length - 1) {
      // Calculate the buffer based on number of sessions
      const bufferMinutes = 15 * (sessionDurations.length - 1);
      const withBufferMinutes = totalMinutes + bufferMinutes;
      const bufferEndHour = Math.floor(withBufferMinutes / 60);
      if (bufferEndHour >= latestTime) {
        return false;
      }
    }

    // Move currentTime to the end of this session (no middle buffer)
    currentTime = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
  }

  // If all sessions fit, return true
  return true;
};

//
// Generate time slots in half-hour increments
//
function generateTimeSlots(startTime, endTime, intervalMinutes, appointmentDuration) {
  // Handle both Date objects and ISO strings
  let startDT, endDT;
  
  if (startTime instanceof Date) {
    startDT = DateTime.fromJSDate(startTime).setZone(DEFAULT_TZ);
    endDT = DateTime.fromJSDate(endTime).setZone(DEFAULT_TZ);
  } else {
    startDT = DateTime.fromISO(startTime, { zone: DEFAULT_TZ });
    endDT = DateTime.fromISO(endTime, { zone: DEFAULT_TZ });
  }
  
  console.log(`Generating time slots from ${startDT.toFormat('HH:mm')} to ${endDT.toFormat('HH:mm')}`);
  
  const slots = [];
  let currentSlot = startDT;

  // If appointmentDuration is an array (multi-session), use the longest duration
  const maxDuration = Array.isArray(appointmentDuration) 
    ? Math.max(...appointmentDuration) 
    : appointmentDuration;

  while (currentSlot <= endDT.minus({ minutes: maxDuration })) {
    // Skip slots that would create appointments spanning DST transitions
    const slotEnd = currentSlot.plus({ minutes: maxDuration });
    if (!LuxonService.checkDSTTransition(
      currentSlot.toISO(), 
      slotEnd.toISO()
    )) {
      slots.push(currentSlot.toJSDate());
    }

    currentSlot = currentSlot.plus({ minutes: intervalMinutes });
  }

  return slots;
}

//
// Remove occupied slots (considering buffer on both ends)
//
/**
 * Remove occupied slots considering buffer on both ends
 *
 * @param {Array} slots - Array of potential time slots
 * @param {Array} bookings - Existing bookings for the day
 * @param {number|Array} appointmentDuration - Duration in minutes or array of durations for multi-session
 * @param {number} [bufferMinutes=15] - Buffer time between appointments in minutes
 * @param {string} [requestedGroupId=null] - Group ID for multi-session bookings
 * @param {Object} [clientLocation=null] - Client's location coordinates and address
 * @returns {Array} - Array of available time slots after removing occupied ones
 */
function removeOccupiedSlots(
  slots,
  bookings,
  appointmentDuration,
  bufferMinutes = 15, // Default to 15 minutes if not provided
  requestedGroupId = null,
  clientLocation = null
) {
  // Ensure bufferMinutes is a number to prevent NaN errors in calculations
  const effectiveBufferMinutes = typeof bufferMinutes === 'number' ? bufferMinutes : 15;
  // If appointmentDuration is an array, use the longest duration as a baseline
  const appointmentDurationMs = Array.isArray(appointmentDuration)
    ? Math.max(...appointmentDuration) * 60 * 1000
    : appointmentDuration * 60 * 1000;

  return slots.filter(slot => {
    // Convert slot to Luxon DateTime in LA timezone
    const slotStart = DateTime.fromJSDate(slot).setZone(DEFAULT_TZ);
    const slotEnd = slotStart.plus({ milliseconds: appointmentDurationMs });

    return !bookings.some(booking => {
      // Convert booking times to Luxon DateTime in LA timezone
      const bookingStart = DateTime.fromFormat(
        `${booking.date.toISOString().split('T')[0]} ${booking.startTime}`,
        'yyyy-MM-dd HH:mm',
        { zone: DEFAULT_TZ }
      );
      const bookingEnd = DateTime.fromFormat(
        `${booking.date.toISOString().split('T')[0]} ${booking.endTime}`,
        'yyyy-MM-dd HH:mm',
        { zone: DEFAULT_TZ }
      );

      // Calculate dynamic buffer based on booking context
      const buffer = calculateBufferBetweenBookings(
        { groupId: requestedGroupId, location: clientLocation },
        booking,
        effectiveBufferMinutes,
        bookings
      );

      const bufferMs = buffer * 60 * 1000;
      const occupiedStart = bookingStart.minus({ milliseconds: bufferMs });
      const occupiedEnd = bookingEnd.plus({ milliseconds: bufferMs });

      // Check if slot overlaps with occupied time (including buffer)
      return slotStart < occupiedEnd && slotEnd > occupiedStart;
    });
  });
}

//
// Validate slots for final availability check
//
/**
 * Validate time slots for final availability check
 *
 * @param {Array} slots - Array of potential time slots
 * @param {Array} bookings - Existing bookings for the day
 * @param {Object} clientLocation - Client's location coordinates and address
 * @param {number|Array} appointmentDuration - Duration in minutes or array of durations for multi-session
 * @param {number} [bufferMinutes=15] - Buffer time between appointments in minutes
 * @param {Date} adminEndTime - End time of provider's availability
 * @param {string} [requestedGroupId=null] - Group ID for multi-session bookings
 * @param {number} [extraDepartureBuffer=0] - Additional buffer time for departure
 * @param {string} [providerId=null] - Provider ID for validation
 * @returns {Promise<Array>} - Array of valid time slots
 */
async function validateSlots(
  slots,
  bookings,
  clientLocation,
  appointmentDuration,
  bufferMinutes = 15, // Default to 15 minutes if not provided
  adminEndTime,
  requestedGroupId = null,
  extraDepartureBuffer = 0,
  providerId = null
) {
  // Ensure bufferMinutes is a number to prevent NaN errors in calculations
  const effectiveBufferMinutes = typeof bufferMinutes === 'number' ? bufferMinutes : 15;
  
  const validSlots = [];
  
  // Limit the number of slots to validate to prevent excessive API calls
  const MAX_SLOTS_TO_VALIDATE = 20;
  const slotsToProcess = slots.slice(0, MAX_SLOTS_TO_VALIDATE);
  
  console.log(`Validating ${slotsToProcess.length} slots (limited from ${slots.length} total slots)`);

  for (const slot of slotsToProcess) {
    let isValid = true;
    const slotStart = DateTime.fromJSDate(slot);
    
    console.log('Validating slot:', {
      localTime: DateTime.fromJSDate(slot).setZone('America/Los_Angeles').toString(),
      utcTime: slot.toISOString(),
      bookingStart: DateTime.fromJSDate(slot).setZone('America/Los_Angeles').toString(),
      utcBookingStart: slot.toISOString()
    });

    // Branch for multi-session arrays
    if (Array.isArray(appointmentDuration)) {
      const canFitChain = await validateMultiSessionSlot(
        slotStart.toFormat('HH:mm'),
        appointmentDuration,
        bookings,
        clientLocation,
        6,   // earliest hour
        22   // latest hour
      );
      if (!canFitChain) isValid = false;
    } 
    // Single-session branch
    else {
      const slotEnd = slotStart.plus({ minutes: appointmentDuration });
      const reversedBookings = [...bookings].reverse();
      const prevBooking = reversedBookings.find(booking =>
        DateTime.fromISO(`${booking.date.toISOString().split('T')[0]}T${booking.endTime}`) <= slotStart
      );
      const nextBooking = bookings.find(booking =>
        DateTime.fromISO(`${booking.date.toISOString().split('T')[0]}T${booking.startTime}`) > slotStart
      );

      // Check service area if provider specified
      if (providerId && isValid) {
        try {
          console.log('Validating provider travel with providerId:', providerId);
          
          // Validate travel from previous booking
          if (prevBooking) {
            try {
              const travelValid = await validateProviderTravel(
                prevBooking.location,
                clientLocation,
                providerId
              );
              if (!travelValid) {
                console.log('[Single-Session] Slot invalid: outside provider service area from previous booking');
                isValid = false;
                continue;
              }
            } catch (validationError) {
              console.error(`[Single-Session] Error validating travel from previous booking: ${validationError.message}`);
              // Don't invalidate the slot due to validation errors
              console.log('Continuing despite validation error from previous booking');
            }
          }

          // Validate travel to next booking
          if (nextBooking) {
            try {
              const travelValid = await validateProviderTravel(
                clientLocation,
                nextBooking.location,
                providerId
              );
              if (!travelValid) {
                console.log('[Single-Session] Slot invalid: outside provider service area to next booking');
                isValid = false;
                continue;
              }
            } catch (validationError) {
              console.error(`[Single-Session] Error validating travel to next booking: ${validationError.message}`);
              // Don't invalidate the slot due to validation errors
              console.log('Continuing despite validation error to next booking');
            }
          }
        } catch (error) {
          console.error(`[Single-Session] Error in overall validation process for slot: ${slotStart.toISO()}`, error);
          // Don't invalidate the slot due to validation errors
          console.log('Continuing despite overall validation error');
        }
      }

      // Check arrival buffer from previous booking
      if (prevBooking && isValid) {
        const prevBookingEnd = DateTime.fromISO(
          `${prevBooking.date.toISOString().split('T')[0]}T${prevBooking.endTime}`
        );
        // Use 'pessimistic' traffic model for arrival validation - better to be conservative
        const travelTimeFromPrev = await calculateTravelTime(
          prevBooking.location,
          clientLocation,
          prevBookingEnd.plus({ minutes: effectiveBufferMinutes }).toJSDate(),
          providerId,
          'pessimistic'
        ).catch(error => {
          console.error(`[Single-Session] Error calculating travel time from previous booking: ${error.message}`);
          throw new Error(`Travel time calculation failed: ${error.message}`);
        });

        const requiredArrivalTime = slotStart.minus({ minutes: 15 });
        const actualArrivalTime = prevBookingEnd.plus({
          minutes: effectiveBufferMinutes + travelTimeFromPrev
        });

        if (actualArrivalTime > requiredArrivalTime) {
          console.log('[Single-Session] Slot invalid: not enough time to arrive 15 mins before start');
          isValid = false;
        }
      }

      // Check departure buffer to next booking
      if (nextBooking && isValid) {
        const dynamicBuffer = calculateBufferBetweenBookings(
          { groupId: requestedGroupId, location: clientLocation },
          nextBooking,
          effectiveBufferMinutes,
          bookings
        );
        const slotEndWithBuffer = slotEnd.plus({ minutes: dynamicBuffer });
        const nextBookingStart = DateTime.fromISO(
          `${nextBooking.date.toISOString().split('T')[0]}T${nextBooking.startTime}`
        );
        const requiredDepartureTime = nextBookingStart.minus({ minutes: 15 });

        try {
          // Use 'best_guess' traffic model for departure validation - realistic but not overly conservative
          const travelTimeToNext = await calculateTravelTime(
            clientLocation,
            nextBooking.location,
            slotEndWithBuffer.toJSDate(),
            providerId,
            'best_guess'
          ).catch(error => {
            console.error(`[Single-Session] Error calculating travel time to next booking: ${error.message}`);
            throw new Error(`Travel time calculation failed: ${error.message}`);
          });
          const actualDepartureTime = slotEndWithBuffer.plus({ minutes: travelTimeToNext });
          if (actualDepartureTime > requiredDepartureTime) {
            console.log('[Single-Session] Slot invalid: not enough time to reach next booking 15 mins before');
            isValid = false;
          }
        } catch (error) {
          console.error(`[Single-Session] Error calculating travel time for slot: ${slotStart.toISO()}`, error);
          isValid = false;
        }
      }
    }

    if (isValid) {
      console.log('Slot is valid:', slotStart.toISO());
      validSlots.push(slot);
    }
  }

  return validSlots;
}

//
// The main function to retrieve open slots
//
/**
 * Get available time slots for booking
 *
 * @param {Object} adminAvailability - The provider's availability for the day
 * @param {Array} bookings - Existing bookings for the day
 * @param {Object} clientLocation - Client's location coordinates and address
 * @param {number|Array} appointmentDuration - Duration in minutes or array of durations for multi-session
 * @param {number} [bufferMinutes=15] - Buffer time between appointments in minutes
 *                                      TEMPORARY: This default value is used until provider registration
 *                                      captures and stores the desired buffer time per provider.
 *                                      Should be replaced with provider-specific value in the future.
 * @param {string} [requestedGroupId=null] - Group ID for multi-session bookings
 * @param {number} [extraDepartureBuffer=0] - Additional buffer time for departure
 * @param {string} [providerId=null] - Provider ID for validation
 * @param {Array} [addons=[]] - Array of add-ons that might add extra time to the appointment
 * @returns {Promise<Array>} - Array of available time slots
 */
async function getAvailableTimeSlots(
  adminAvailability,
  bookings,
  clientLocation,
  appointmentDuration,
  bufferMinutes = 15, // Default to 15 minutes if not provided
  requestedGroupId = null,
  extraDepartureBuffer = 0,
  providerId = null,
  addons = []
) {
  // Ensure bufferMinutes is a number to prevent NaN errors in calculations
  const effectiveBufferMinutes = typeof bufferMinutes === 'number' ? bufferMinutes : 15;
  
  console.log('DEBUG: getAvailableTimeSlots invoked with:', {
    adminAvailability,
    appointmentDuration,
    bufferMinutes: effectiveBufferMinutes,
    requestedGroupId,
    extraDepartureBuffer,
    addons
  });
  console.log('DEBUG: is Array?', Array.isArray(appointmentDuration));
  
  // Calculate extra time from add-ons
  let extraTimeFromAddons = 0;
  if (addons && addons.length > 0) {
    extraTimeFromAddons = addons.reduce((total, addon) => {
      return total + (addon.extraTime || 0);
    }, 0);
    
    console.log('DEBUG: Extra time from add-ons:', extraTimeFromAddons);
    
    // Add extra time to appointment duration
    if (!Array.isArray(appointmentDuration) && extraTimeFromAddons > 0) {
      appointmentDuration += extraTimeFromAddons;
      console.log('DEBUG: Updated appointment duration with add-ons:', appointmentDuration);
    }
  }

  // Handle different types of Availability objects
  // Ensure we always get proper DateTime objects for date, start, and end
  let availabilityDateLA, startTime, endTime;
  
  // Get the date in LA timezone
  availabilityDateLA = DateTime.fromJSDate(adminAvailability.date)
    .setZone('America/Los_Angeles')
    .startOf('day');
  
  // Get start time in LA timezone
  if (adminAvailability.start instanceof Date) {
    // If it's a Date object, convert to DateTime
    startTime = DateTime.fromJSDate(adminAvailability.start).setZone('America/Los_Angeles').toJSDate();
  } else if (typeof adminAvailability.start === 'string') {
    // If it's a string (HH:mm format), create a DateTime for it
    const startDT = DateTime.fromFormat(
      `${availabilityDateLA.toFormat('yyyy-MM-dd')} ${adminAvailability.start}`,
      'yyyy-MM-dd HH:mm',
      { zone: 'America/Los_Angeles' }
    );
    if (!startDT.isValid) {
      console.error('Invalid start time:', adminAvailability.start);
      return []; // Return no slots if time is invalid
    }
    startTime = startDT.toJSDate();
  } else {
    console.error('Start time is in an unexpected format:', adminAvailability.start);
    return []; // Return no slots if time format is unrecognized
  }
  
  // Get end time in LA timezone
  if (adminAvailability.end instanceof Date) {
    // If it's a Date object, convert to DateTime
    endTime = DateTime.fromJSDate(adminAvailability.end).setZone('America/Los_Angeles').toJSDate();
  } else if (typeof adminAvailability.end === 'string') {
    // If it's a string (HH:mm format), create a DateTime for it
    const endDT = DateTime.fromFormat(
      `${availabilityDateLA.toFormat('yyyy-MM-dd')} ${adminAvailability.end}`,
      'yyyy-MM-dd HH:mm',
      { zone: 'America/Los_Angeles' }
    );
    if (!endDT.isValid) {
      console.error('Invalid end time:', adminAvailability.end);
      return []; // Return no slots if time is invalid
    }
    endTime = endDT.toJSDate();
  } else {
    console.error('End time is in an unexpected format:', adminAvailability.end);
    return []; // Return no slots if time format is unrecognized
  }

  const slots = generateTimeSlots(startTime, endTime, 30, appointmentDuration);
  console.log('DEBUG: generated base slots:', slots.map(s => s.toTimeString().slice(0,5)));

  const slotsAfterOccupied = removeOccupiedSlots(
    slots,
    bookings,
    appointmentDuration,
    effectiveBufferMinutes,
    requestedGroupId,
    clientLocation
  );
  console.log('DEBUG: slotsAfterOccupied:', slotsAfterOccupied.map(s => s.toTimeString().slice(0,5)));

  const validSlots = await validateSlots(
    slotsAfterOccupied,
    bookings,
    clientLocation,
    appointmentDuration,
    effectiveBufferMinutes,
    endTime,
    requestedGroupId,
    extraDepartureBuffer,
    providerId
  ).catch(error => {
    console.error('Error validating slots:', error);
    throw error; // Re-throw to be handled by the caller
  });

  console.log('DEBUG: validSlots after travel time check:', validSlots.map(s => s.toTimeString().slice(0,5)));

  return validSlots;
}

module.exports = {
  getAvailableTimeSlots,
  generateTimeSlots,
  removeOccupiedSlots,
  validateSlots,
  calculateBufferBetweenBookings
};
