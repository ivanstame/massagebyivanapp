// shared/utils/LuxonService.js
const { DateTime, Settings } = require('luxon');
const { DEFAULT_TZ, UTC_TZ, TIME_FORMATS } = require('./timeConstants');

// Default zone for Luxon operations that don't pass an explicit zone.
// IMPORTANT: this is a fallback — any provider/booking-scoped operation
// must pass an explicit TZ instead of relying on this default.
Settings.defaultZone = DEFAULT_TZ;

class LuxonService {
  // Convert JS Date to a DateTime in the given TZ. Default kept for
  // back-compat — pass an explicit tz when you have one.
  static convertToLA(date, timezone = DEFAULT_TZ) {
    return DateTime.fromJSDate(date).setZone(timezone);
  }

  // Format ISO datetime string to display format
  static formatISOToDisplay(isoString, format = TIME_FORMATS.TIME_24H, timezone = DEFAULT_TZ) {
    try {
      // Parse ISO string to DateTime object
      const dt = DateTime.fromISO(isoString, { zone: 'utc' });

      // Validate the DateTime object
      if (!dt.isValid) {
        console.warn('Invalid ISO datetime:', isoString);
        return null;
      }

      // Convert to target timezone and format
      return dt.setZone(timezone).toFormat(format);
    } catch (error) {
      console.error('Error formatting ISO datetime:', error);
      return null;
    }
  }

  // Convert local-time string to UTC DateTime, anchored in `timezone`.
  static convertToUTC(localTimeString, format = TIME_FORMATS.ISO_DATETIME, timezone = DEFAULT_TZ) {
    return DateTime.fromFormat(localTimeString, format, { zone: timezone }).toUTC();
  }

  // Generate time slots anchored in `timezone` with proper DST handling.
  // Slot.start/end are emitted as UTC ISO; localStart/localEnd are
  // formatted in the given TZ (so server callers should pass the
  // block's stored TZ, and client callers should pass the
  // provider/doc's TZ).
  static generateTimeSlots(start, end, intervalMinutes, appointmentDuration = 60, timezone = DEFAULT_TZ) {
    let slots = [];

    // Handle both Date objects and ISO strings
    let current;
    let endDT;

    if (start instanceof Date) {
      current = DateTime.fromJSDate(start).setZone(timezone);
      endDT = DateTime.fromJSDate(end).setZone(timezone);
    } else {
      current = DateTime.fromISO(start, { zone: timezone });
      endDT = DateTime.fromISO(end, { zone: timezone });
    }
    
    // Validate times
    if (!current.isValid || !endDT.isValid) {
      console.error('Invalid date/time objects:', { start, end });
      return [];
    }
    
    // Convert appointment duration to minutes if not already
    const durationMinutes = typeof appointmentDuration === 'number' && appointmentDuration > 0
      ? appointmentDuration
      : 60; // Default to 60 minutes
    
    console.log(`Generating slots from ${current.toFormat('HH:mm')} to ${endDT.toFormat('HH:mm')} with ${durationMinutes} min duration`);
    
    // Ensure we don't create slots that would exceed the end time
    while (current.plus({ minutes: durationMinutes }) <= endDT) {
      const slotEnd = current.plus({ minutes: durationMinutes });

      // Skip slots that would cross DST transitions in this TZ
      if (!this.checkDSTTransition(current.toISO(), slotEnd.toISO(), timezone)) {
        slots.push({
          start: current.toUTC().toISO(),
          end: slotEnd.toUTC().toISO(),
          localStart: current.toFormat(TIME_FORMATS.TIME_12H),
          localEnd: slotEnd.toFormat(TIME_FORMATS.TIME_12H)
        });
      }

      // Move to the next interval
      current = current.plus({ minutes: intervalMinutes });
    }
    
    console.log(`Generated ${slots.length} slots`);
    return slots;
  }

  // Generate and validate multi-session slots
  static generateMultiSessionSlots(
    startTimeLA,       // DateTime
    sessionDurations,  // array of minutes [90, 60, ...]
    bufferMinutes,     // between sessions
    workDayStart,      // number (6 = 6 AM)
    workDayEnd,        // number (22 = 10 PM)
    timezone = DEFAULT_TZ
  ) {
    // Anchor calculations in the given TZ (default LA for back-compat)
    let currentSlot = startTimeLA.setZone(timezone);
    const slots = [];
    let isValid = true;

    // Check each session fits in the work day
    for (const [index, duration] of sessionDurations.entries()) {
      const sessionEnd = currentSlot.plus({ minutes: duration });

      // Check work hours in LA time
      const startHour = currentSlot.hour + currentSlot.minute / 60;
      const endHour = sessionEnd.hour + sessionEnd.minute / 60;

      if (startHour < workDayStart || endHour > workDayEnd) {
        isValid = false;
        break;
      }

      // Check DST consistency
      if (currentSlot.isInDST !== sessionEnd.isInDST) {
        isValid = false;
        break;
      }

      slots.push({
        sessionNumber: index + 1,
        localStart: currentSlot.toFormat(TIME_FORMATS.TIME_12H),
        localEnd: sessionEnd.toFormat(TIME_FORMATS.TIME_12H),
        utcStart: currentSlot.toUTC().toISO(),
        utcEnd: sessionEnd.toUTC().toISO(),
        durationMinutes: duration
      });

      // Add buffer between sessions
      currentSlot = sessionEnd.plus({ minutes: bufferMinutes });
    }

    return {
      isValid,
      slots: isValid ? slots : [],
      validationErrors: isValid ? [] : [
        'SLOT_INVALID_REASON_DST_TRANSITION',
        'SLOT_INVALID_REASON_OUTSIDE_WORK_HOURS'
      ]
    };
  }

  // Remove occupied slots. Each booking is parsed in its own stored TZ
  // (booking.timezone) — falls back to `timezone` for legacy rows.
  static removeOccupiedSlots(slots, bookings, clientLocation, appointmentDuration, bufferTime, timezone = DEFAULT_TZ) {
    if (!Array.isArray(slots) || slots.length === 0) {
      console.log('No slots to filter - returning empty array');
      return [];
    }

    // Ensure appointmentDuration is a valid number
    const duration = typeof appointmentDuration === 'number' && appointmentDuration > 0
      ? appointmentDuration
      : 60; // Default to 60 minutes if invalid

    // Ensure bufferTime is a valid number
    const buffer = typeof bufferTime === 'number' && bufferTime > 0
      ? bufferTime
      : 15; // Default to 15 minute buffer if invalid

    const availableSlots = [];

    slots.forEach(slot => {
      try {
        // Slot UTC times stay UTC; only the wall-clock display zone changes
        const slotStartLA = DateTime.fromISO(slot.start, { zone: 'utc' }).setZone(timezone);
        const slotEndLA = slotStartLA.plus({ minutes: duration });

        // Skip this slot if it spans a DST transition in this TZ
        if (this.checkDSTTransition(slotStartLA.toISO(), slotEndLA.toISO(), timezone)) {
          console.log(`Skipping slot at ${slotStartLA.toFormat(TIME_FORMATS.TIME_24H)} - spans DST transition`);
          return;
        }

        // Check against existing bookings
        let conflict = false;

        if (Array.isArray(bookings) && bookings.length > 0) {
          conflict = bookings.some(booking => {
            try {
              // Each booking carries its own TZ (snapshotted at creation)
              const bookingTz = booking.timezone || timezone;
              const bookingStartLA = booking.startTime instanceof Date
                ? DateTime.fromJSDate(booking.startTime).setZone(bookingTz)
                : DateTime.fromFormat(`${booking.date.toISOString().split('T')[0]} ${booking.startTime}`, 'yyyy-MM-dd HH:mm', { zone: bookingTz });

              const bookingEndLA = booking.endTime instanceof Date
                ? DateTime.fromJSDate(booking.endTime).setZone(bookingTz)
                : DateTime.fromFormat(`${booking.date.toISOString().split('T')[0]} ${booking.endTime}`, 'yyyy-MM-dd HH:mm', { zone: bookingTz });

              const adjustedBookingStart = bookingStartLA.minus({ minutes: buffer });
              const adjustedBookingEnd = bookingEndLA.plus({ minutes: buffer });

              return slotStartLA < adjustedBookingEnd && slotEndLA > adjustedBookingStart;
            } catch (err) {
              console.error('Error checking booking conflict:', err);
              return true; // Assume conflict on error to be safe
            }
          });
        }

        if (!conflict) {
          availableSlots.push(slot);
        }
      } catch (err) {
        console.error('Error processing slot:', err);
        // Skip this slot on error
      }
    });

    return availableSlots;
  }

  // Validate date range stays within the same wall-clock day in `timezone`.
  static validateSameDay(startUTC, endUTC, timezone = DEFAULT_TZ) {
    const startLA = DateTime.fromISO(startUTC).setZone(timezone);
    const endLA = DateTime.fromISO(endUTC).setZone(timezone);
    return startLA.hasSame(endLA, 'day');
  }

  // Check if a date range crosses DST transition in `timezone`. Phoenix
  // never observes DST, so this is a no-op there; LA/NY/Chicago observe
  // it on the same dates so the answer is consistent across them.
  static checkDSTTransition(startUTC, endUTC, timezone = DEFAULT_TZ) {
    const startLA = DateTime.fromISO(startUTC).setZone(timezone);
    const endLA = DateTime.fromISO(endUTC).setZone(timezone);
    return startLA.isInDST !== endLA.isInDST;
  }
}

module.exports = LuxonService;
