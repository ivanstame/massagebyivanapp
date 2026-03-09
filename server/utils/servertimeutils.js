// timeUtils.js

const { DateTime } = require('luxon');
const { calculateTravelTime } = require('../services/mapService'); // Adjust the path as necessary

function generateTimeSlots(startTime, endTime, intervalMinutes, appointmentDuration) {
  const slots = [];
  let currentTime = new Date(startTime);
  const appointmentDurationMs = appointmentDuration * 60000;

  while (currentTime <= new Date(endTime.getTime() - appointmentDurationMs)) {
    slots.push(new Date(currentTime));
    currentTime.setMinutes(currentTime.getMinutes() + intervalMinutes);
  }

  return slots;
}

function removeOccupiedSlots(slots, bookings, appointmentDuration, bufferMinutes) {
  const appointmentDurationMs = appointmentDuration * 60000;
  const bufferMs = bufferMinutes * 60000;

  return slots.filter(slot => {
    const slotStart = new Date(slot);
    const slotEnd = new Date(slotStart.getTime() + appointmentDurationMs);

    return !bookings.some(booking => {
      const bookingStart = new Date(`${booking.date.toISOString().split('T')[0]}T${booking.startTime}`);
      const bookingEnd = new Date(`${booking.date.toISOString().split('T')[0]}T${booking.endTime}`);

      const occupiedStart = new Date(bookingStart.getTime() - bufferMs);
      const occupiedEnd = new Date(bookingEnd.getTime() + bufferMs);

      return (slotStart < occupiedEnd && slotEnd > occupiedStart);
    });
  });
}

// async function validateSlots(slots, bookings, clientLocation, appointmentDuration, bufferMinutes, adminEndTime) {
//   const validSlots = [];

//   for (const slot of slots) {
//     let isValid = true;
//     const slotStart = DateTime.fromJSDate(slot);
//     const slotEnd = slotStart.plus({ minutes: appointmentDuration });
//     const slotEndWithBreakdown = slotEnd.plus({ minutes: bufferMinutes });

//     // Find the next booking
//     const nextBooking = bookings.find(booking => 
//       DateTime.fromISO(`${booking.date.toISOString().split('T')[0]}T${booking.startTime}`) > slotStart
//     );

//     if (nextBooking) {
//       const nextBookingStart = DateTime.fromISO(`${nextBooking.date.toISOString().split('T')[0]}T${nextBooking.startTime}`);
//       const nextBookingArrivalTime = nextBookingStart.minus({ minutes: bufferMinutes });

//       try {
//         // Calculate travel time to the next booking
//         const travelTimeMinutes = await calculateTravelTime(clientLocation, nextBooking.location, slotEndWithBreakdown.toJSDate());

//         const arrivalTimeAtNext = slotEndWithBreakdown.plus({ minutes: travelTimeMinutes });

//         if (arrivalTimeAtNext > nextBookingArrivalTime) {
//           isValid = false;
//           continue; // Skip to the next slot
//         }
//       } catch (error) {
//         console.error(`Error calculating travel time for slot at ${slotStart.toISO()}:`, error);
//         isValid = false;
//         continue; // Skip to the next slot
//       }
//     }

//     if (isValid) {
//       validSlots.push(slot);
//     }
//   }

//   return validSlots;
// }
async function validateSlots(slots, bookings, clientLocation, appointmentDuration, bufferMinutes, adminEndTime) {
  console.log('Validating slots with parameters:', {
    slotsCount: slots.length,
    bookingsCount: bookings.length,
    clientLocation,
    appointmentDuration,
    bufferMinutes,
    adminEndTime
  });

  const validSlots = [];

  for (const slot of slots) {
    console.log(`\nValidating slot: ${slot.toISOString()}`);
    let isValid = true;
    const slotStart = DateTime.fromJSDate(slot);
    const slotEnd = slotStart.plus({ minutes: appointmentDuration });
    const slotEndWithBreakdown = slotEnd.plus({ minutes: bufferMinutes });

    console.log('Slot details:', {
      start: slotStart.toISO(),
      end: slotEnd.toISO(),
      endWithBreakdown: slotEndWithBreakdown.toISO()
    });

    // Find the previous and next bookings
    const prevBooking = bookings.reverse().find(booking => 
      DateTime.fromISO(`${booking.date.toISOString().split('T')[0]}T${booking.endTime}`) <= slotStart
    );
    const nextBooking = bookings.find(booking => 
      DateTime.fromISO(`${booking.date.toISOString().split('T')[0]}T${booking.startTime}`) > slotStart
    );

    console.log('Adjacent bookings:', {
      prevBooking: prevBooking ? `${prevBooking.date.toISOString().split('T')[0]}T${prevBooking.endTime}` : 'None',
      nextBooking: nextBooking ? `${nextBooking.date.toISOString().split('T')[0]}T${nextBooking.startTime}` : 'None'
    });

    if (prevBooking) {
      const prevBookingEnd = DateTime.fromISO(`${prevBooking.date.toISOString().split('T')[0]}T${prevBooking.endTime}`);
      // Use 'pessimistic' traffic model for arrival validation - better to be conservative
      const travelTimeFromPrev = await calculateTravelTime(
        prevBooking.location,
        clientLocation,
        prevBookingEnd.plus({ minutes: bufferMinutes }).toJSDate(),
        undefined,  // providerId not available in this context
        'pessimistic'
      );

      console.log('Travel time from previous booking:', travelTimeFromPrev, 'minutes');

      const requiredArrivalTime = slotStart.minus({ minutes: 15 });
      const actualArrivalTime = prevBookingEnd.plus({ minutes: bufferMinutes + travelTimeFromPrev });

      if (actualArrivalTime > requiredArrivalTime) {
        console.log('Slot invalid: Not enough time to arrive 15 minutes before appointment start');
        console.log('Required arrival time:', requiredArrivalTime.toISO());
        console.log('Actual arrival time:', actualArrivalTime.toISO());
        isValid = false;
        continue;
      }
    }

    if (nextBooking) {
      const nextBookingStart = DateTime.fromISO(`${nextBooking.date.toISOString().split('T')[0]}T${nextBooking.startTime}`);
      const requiredDepartureTime = nextBookingStart.minus({ minutes: 15 + bufferMinutes });

      console.log('Next booking details:', {
        start: nextBookingStart.toISO(),
        requiredDepartureTime: requiredDepartureTime.toISO()
      });

      try {
        // Use 'best_guess' traffic model for departure validation - realistic but not overly conservative
        const travelTimeToNext = await calculateTravelTime(
          clientLocation,
          nextBooking.location,
          slotEndWithBreakdown.toJSDate(),
          undefined,  // providerId not available in this context
          'best_guess'
        );

        console.log('Travel time to next booking:', travelTimeToNext, 'minutes');

        const actualDepartureTime = slotEndWithBreakdown;

        if (actualDepartureTime.plus({ minutes: travelTimeToNext }) > requiredDepartureTime) {
          console.log('Slot invalid: Not enough time to reach next booking 15 minutes before it starts');
          console.log('Required departure time:', requiredDepartureTime.toISO());
          console.log('Actual departure time:', actualDepartureTime.toISO());
          isValid = false;
          continue;
        }
      } catch (error) {
        console.error(`Error calculating travel time for slot at ${slotStart.toISO()}:`, error);
        isValid = false;
        continue;
      }
    }

    if (isValid) {
      console.log('Slot is valid');
      validSlots.push(slot);
    }
  }

  console.log(`Validation complete. ${validSlots.length} valid slots found.`);
  return validSlots;
}

async function getAvailableTimeSlots(adminAvailability, bookings, clientLocation, appointmentDuration, bufferMinutes) {
  console.log('Generating slots for:', adminAvailability, 'Duration:', appointmentDuration, 'Buffer:', bufferMinutes);

  const startTime = new Date(`${adminAvailability.date.toISOString().split('T')[0]}T${adminAvailability.start}`);
  const endTime = new Date(`${adminAvailability.date.toISOString().split('T')[0]}T${adminAvailability.end}`);

  const slots = generateTimeSlots(startTime, endTime, 30, appointmentDuration);

  console.log('Generated slots:', slots.map(s => s.toTimeString().slice(0, 5)));

  const slotsAfterOccupied = removeOccupiedSlots(slots, bookings, appointmentDuration, bufferMinutes);

  console.log('Slots after removing occupied:', slotsAfterOccupied.map(s => s.toTimeString().slice(0, 5)));

  const validSlots = await validateSlots(
    slotsAfterOccupied, 
    bookings, 
    clientLocation, 
    appointmentDuration, 
    bufferMinutes,
    endTime
  );

  console.log('Valid slots after travel time check:', validSlots.map(s => s.toTimeString().slice(0, 5)));

  return validSlots;
}

module.exports = {
  getAvailableTimeSlots,
  generateTimeSlots,
  removeOccupiedSlots,
  validateSlots
};
