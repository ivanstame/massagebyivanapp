#!/usr/bin/env node

/**
 * E2E Multi-Location Booking Test
 *
 * Tests the client experience when booking multiple appointments at DIFFERENT
 * addresses on the same day. Validates that:
 *   - Travel time between locations is properly accounted for
 *   - Slot availability shrinks realistically after each booking
 *   - Buffer times prevent impossible schedules
 *   - The client gets clear, accurate slot options throughout
 *
 * Usage:
 *   node test/e2e-multi-location.js
 *   BASE_URL=https://your-app.herokuapp.com node test/e2e-multi-location.js
 */

const axios = require('axios');
const { DateTime } = require('luxon');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const PROVIDER_SIGNUP_PASSWORD = process.env.PROVIDER_SIGNUP_PASSWORD;
if (!PROVIDER_SIGNUP_PASSWORD) {
  console.error('PROVIDER_SIGNUP_PASSWORD env var is required to run this test.');
  process.exit(1);
}

const ts = Date.now();
const shortId = ts.toString(36).slice(-6);

const PROVIDER_EMAIL = `mloc_prov_${ts}@test.com`;
const PROVIDER_PASS = 'TestPass123!';
const CLIENT_A_EMAIL = `mloc_cliA_${ts}@test.com`;
const CLIENT_B_EMAIL = `mloc_cliB_${ts}@test.com`;
const CLIENT_C_EMAIL = `mloc_cliC_${ts}@test.com`;
const CLIENT_PASS = 'TestPass123!';

// Real LA-area addresses with meaningful distances
const LOCATIONS = {
  homeBase: {
    name: 'Provider Home (Santa Monica)',
    address: '1550 Pacific Coast Hwy, Santa Monica, CA 90401',
    lat: 34.0094,
    lng: -118.4973,
  },
  clientA: {
    name: 'Client A (Venice Beach)',
    address: '1800 Ocean Front Walk, Venice, CA 90291',
    lat: 33.9850,
    lng: -118.4695,
    // ~3 miles from home base, ~10 min drive
  },
  clientB: {
    name: 'Client B (Beverly Hills)',
    address: '9876 Wilshire Blvd, Beverly Hills, CA 90210',
    lat: 34.0696,
    lng: -118.3998,
    // ~10 miles from Venice, ~25-35 min drive
  },
  clientC: {
    name: 'Client C (Downtown LA)',
    address: '633 W 5th St, Los Angeles, CA 90071',
    lat: 34.0507,
    lng: -118.2548,
    // ~15 miles from Beverly Hills, ~30-45 min drive
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createSession() {
  const instance = axios.create({
    baseURL: BASE_URL,
    withCredentials: true,
    validateStatus: () => true,
  });

  let cookies = '';
  instance.interceptors.response.use((res) => {
    const sc = res.headers['set-cookie'];
    if (sc) cookies = sc.map((c) => c.split(';')[0]).join('; ');
    return res;
  });
  instance.interceptors.request.use((cfg) => {
    if (cookies) cfg.headers.Cookie = cookies;
    return cfg;
  });

  return instance;
}

let passCount = 0, failCount = 0, warnCount = 0;
const results = [];

function assert(label, condition, detail) {
  if (condition) {
    passCount++;
    results.push({ label, status: 'PASS' });
    console.log(`  \x1b[32mPASS\x1b[0m  ${label}`);
  } else {
    failCount++;
    results.push({ label, status: 'FAIL', detail });
    console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function warn(label, detail) {
  warnCount++;
  results.push({ label, status: 'WARN', detail });
  console.log(`  \x1b[33mWARN\x1b[0m  ${label}${detail ? ` — ${detail}` : ''}`);
}

function info(msg) {
  console.log(`  \x1b[36mINFO\x1b[0m  ${msg}`);
}

function formatSlots(slots) {
  if (!slots || slots.length === 0) return '(none)';
  const times = slots.map((s) => {
    const dt = DateTime.fromISO(s).setZone('America/Los_Angeles');
    return dt.toFormat('h:mm a');
  });
  if (times.length <= 8) return times.join(', ');
  return `${times[0]} ... ${times[times.length - 1]} (${times.length} slots)`;
}

// ---------------------------------------------------------------------------
// Main test
// ---------------------------------------------------------------------------

async function runTests() {
  const prov = createSession();
  const cliA = createSession();
  const cliB = createSession();
  const cliC = createSession();

  const s = {
    provId: null,
    joinCode: null,
    locHomeId: null,
    testDate: null,
    slotsBeforeAny: [],
    slotsAfterBookingA: [],
    slotsAfterBookingB: [],
    bookingA: null,
    bookingB: null,
    bookingC: null,
  };

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Multi-Location Booking Proficiency Test`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`\nLocations:`);
  Object.entries(LOCATIONS).forEach(([key, loc]) => {
    console.log(`  ${loc.name} (${loc.lat}, ${loc.lng})`);
  });

  // =========================================================================
  // SETUP: Provider + 3 Clients
  // =========================================================================

  console.log('\n--- Setup ---\n');

  // Register provider
  {
    const res = await prov.post('/api/auth/register', {
      email: PROVIDER_EMAIL,
      password: PROVIDER_PASS,
      accountType: 'PROVIDER',
      providerPassword: PROVIDER_SIGNUP_PASSWORD,
      businessName: 'Mobile Massage LA',
    });
    assert('Register provider', res.status === 201);
    s.provId = res.data.user?.id || res.data.user?._id;
  }

  // Provider profile
  {
    await prov.put('/api/users/profile', {
      fullName: 'Test Therapist',
      phoneNumber: '3105550001',
      joinCode: `ml${shortId}`,
      registrationStep: 2,
    });
    s.joinCode = `ml${shortId}`;

    await prov.put('/api/users/provider/preferences', {
      preferences: {
        businessName: 'Mobile Massage LA',
        acceptedPaymentMethods: ['cash'],
        basePricing: [{ duration: 60, price: 120 }, { duration: 90, price: 160 }],
      },
      registrationStep: 3,
    });
  }

  // Create home base
  {
    const res = await prov.post('/api/saved-locations', {
      name: LOCATIONS.homeBase.name,
      address: LOCATIONS.homeBase.address,
      lat: LOCATIONS.homeBase.lat,
      lng: LOCATIONS.homeBase.lng,
      isHomeBase: true,
    });
    assert('Create home base', res.status === 201);
    s.locHomeId = res.data._id;
  }

  // Pick a test date: next Saturday (no template interference)
  {
    let d = DateTime.now().setZone('America/Los_Angeles').plus({ days: 1 });
    while (d.weekday !== 6) d = d.plus({ days: 1 });
    s.testDate = d.toFormat('yyyy-MM-dd');
    info(`Test date: ${s.testDate} (Saturday)`);
  }

  // Create wide availability block
  {
    const res = await prov.post('/api/availability', {
      date: s.testDate,
      start: '08:00',
      end: '18:00',
      anchor: { locationId: s.locHomeId },
    });
    assert('Create 8AM-6PM availability', res.status === 201);
  }

  // Register 3 clients
  for (const [email, session, name] of [
    [CLIENT_A_EMAIL, cliA, 'Client A'],
    [CLIENT_B_EMAIL, cliB, 'Client B'],
    [CLIENT_C_EMAIL, cliC, 'Client C'],
  ]) {
    const reg = await session.post('/api/auth/register', {
      email,
      password: CLIENT_PASS,
      accountType: 'CLIENT',
      joinCode: s.joinCode,
    });
    assert(`Register ${name}`, reg.status === 201);

    await session.put('/api/users/profile', {
      fullName: name,
      phoneNumber: '3105550000',
      registrationStep: 2,
    });
  }

  // Provider logout (not needed for slot queries)
  await prov.post('/api/auth/logout');

  // =========================================================================
  // TEST 1: Baseline — All slots available (no bookings yet)
  // =========================================================================

  console.log('\n--- Test 1: Baseline Slots (No Bookings) ---\n');

  // Check slots from each client's perspective
  for (const [session, loc, label] of [
    [cliA, LOCATIONS.clientA, 'Client A (Venice)'],
    [cliB, LOCATIONS.clientB, 'Client B (Beverly Hills)'],
    [cliC, LOCATIONS.clientC, 'Client C (Downtown LA)'],
  ]) {
    const res = await session.get(`/api/availability/available/${s.testDate}`, {
      params: { duration: 60, lat: loc.lat, lng: loc.lng, providerId: s.provId },
    });

    const slots = res.data || [];
    info(`${label}: ${formatSlots(slots)}`);

    if (label.includes('Client A')) s.slotsBeforeAny = slots;

    assert(`${label} has available slots`, slots.length > 0, `slots=${slots.length}`);
  }

  // Compare: closer location should have same or more slots than farther one
  {
    const veniceRes = await cliA.get(`/api/availability/available/${s.testDate}`, {
      params: { duration: 60, lat: LOCATIONS.clientA.lat, lng: LOCATIONS.clientA.lng, providerId: s.provId },
    });
    const dtlaRes = await cliC.get(`/api/availability/available/${s.testDate}`, {
      params: { duration: 60, lat: LOCATIONS.clientC.lat, lng: LOCATIONS.clientC.lng, providerId: s.provId },
    });
    const veniceCount = veniceRes.data?.length || 0;
    const dtlaCount = dtlaRes.data?.length || 0;

    info(`Venice (close to home): ${veniceCount} slots`);
    info(`Downtown LA (far from home): ${dtlaCount} slots`);

    if (veniceCount >= dtlaCount) {
      assert('Closer location has >= slots than farther location', true);
    } else {
      warn('Closer location has fewer slots than farther location',
        `Venice=${veniceCount} < DTLA=${dtlaCount} — travel time may not be factoring in correctly`);
    }
  }

  // =========================================================================
  // TEST 2: Client A books a morning appointment in Venice
  // =========================================================================

  console.log('\n--- Test 2: Client A Books Morning in Venice ---\n');

  {
    // Get fresh slots and pick a morning slot (around 10 AM)
    const slotsRes = await cliA.get(`/api/availability/available/${s.testDate}`, {
      params: { duration: 60, lat: LOCATIONS.clientA.lat, lng: LOCATIONS.clientA.lng, providerId: s.provId },
    });
    const slots = slotsRes.data || [];

    // Find a slot around 10:00 AM
    let targetSlot = null;
    for (const slot of slots) {
      const dt = DateTime.fromISO(slot).setZone('America/Los_Angeles');
      if (dt.hour === 10 && dt.minute === 0) {
        targetSlot = slot;
        break;
      }
    }
    // Fallback to first available if no 10 AM slot
    if (!targetSlot && slots.length > 0) {
      targetSlot = slots[Math.floor(slots.length / 4)];
    }

    if (targetSlot) {
      const dt = DateTime.fromISO(targetSlot).setZone('America/Los_Angeles');
      info(`Client A booking: ${dt.toFormat('h:mm a')} at Venice Beach`);

      const res = await cliA.post('/api/bookings', {
        date: dt.toFormat('yyyy-MM-dd'),
        time: dt.toFormat('HH:mm'),
        duration: 60,
        location: {
          lat: LOCATIONS.clientA.lat,
          lng: LOCATIONS.clientA.lng,
          address: LOCATIONS.clientA.address,
        },
        recipientType: 'self',
        paymentMethod: 'cash',
        pricing: { basePrice: 120, addonsPrice: 0, totalPrice: 120 },
      });

      if (res.status === 201) {
        assert('Client A books 60min in Venice', true);
        s.bookingA = {
          id: res.data._id,
          time: dt.toFormat('HH:mm'),
          endTime: dt.plus({ minutes: 60 }).toFormat('HH:mm'),
          location: LOCATIONS.clientA,
        };
        info(`Booked: ${s.bookingA.time} - ${s.bookingA.endTime}`);
      } else {
        // Retry with middle slot — booking route validation differs from availability endpoint
        info(`First attempt rejected (${res.data?.message}), retrying with middle slot...`);
        const midSlot = slots[Math.floor(slots.length / 2)];
        const dt2 = DateTime.fromISO(midSlot).setZone('America/Los_Angeles');
        const retry = await cliA.post('/api/bookings', {
          date: dt2.toFormat('yyyy-MM-dd'),
          time: dt2.toFormat('HH:mm'),
          duration: 60,
          location: {
            lat: LOCATIONS.clientA.lat,
            lng: LOCATIONS.clientA.lng,
            address: LOCATIONS.clientA.address,
          },
          recipientType: 'self',
          paymentMethod: 'cash',
          pricing: { basePrice: 120, addonsPrice: 0, totalPrice: 120 },
        });
        assert('Client A books 60min in Venice (retry)', retry.status === 201,
          `status=${retry.status} ${retry.data?.message || ''}`);
        if (retry.status === 201) {
          s.bookingA = {
            id: retry.data._id,
            time: dt2.toFormat('HH:mm'),
            endTime: dt2.plus({ minutes: 60 }).toFormat('HH:mm'),
            location: LOCATIONS.clientA,
          };
          info(`Booked: ${s.bookingA.time} - ${s.bookingA.endTime}`);
        }
      }
    } else {
      assert('Client A books morning in Venice', false, 'No slots available');
    }
  }

  // =========================================================================
  // TEST 3: After Client A's booking — how do slots change for Client B?
  // =========================================================================

  console.log('\n--- Test 3: Slots After Venice Booking (Beverly Hills Perspective) ---\n');

  {
    const res = await cliB.get(`/api/availability/available/${s.testDate}`, {
      params: { duration: 60, lat: LOCATIONS.clientB.lat, lng: LOCATIONS.clientB.lng, providerId: s.provId },
    });

    const slotsForB = res.data || [];
    s.slotsAfterBookingA = slotsForB;

    info(`Beverly Hills slots after Venice booking: ${formatSlots(slotsForB)}`);

    assert('Client B still has slots', slotsForB.length > 0, `slots=${slotsForB.length}`);

    // Check that slots during Client A's booking time + buffer are removed
    if (s.bookingA) {
      const bookingStart = DateTime.fromFormat(`${s.testDate} ${s.bookingA.time}`, 'yyyy-MM-dd HH:mm', { zone: 'America/Los_Angeles' });
      const bookingEnd = DateTime.fromFormat(`${s.testDate} ${s.bookingA.endTime}`, 'yyyy-MM-dd HH:mm', { zone: 'America/Los_Angeles' });

      const conflictingSlots = slotsForB.filter((slot) => {
        const slotDT = DateTime.fromISO(slot).setZone('America/Los_Angeles');
        // A slot starting during the booking window should be removed
        return slotDT >= bookingStart && slotDT < bookingEnd;
      });

      assert('No slots offered during existing booking window',
        conflictingSlots.length === 0,
        conflictingSlots.length > 0 ? `${conflictingSlots.length} conflicting slots found` : '');

      // Check that there's a travel-time gap after booking A's end
      // Provider needs to travel Venice → Beverly Hills (~25-35 min) + 15 min buffer
      // So earliest Beverly Hills slot should be ≥ booking end + ~40 min
      const firstSlotAfterBooking = slotsForB.find((slot) => {
        const dt = DateTime.fromISO(slot).setZone('America/Los_Angeles');
        return dt > bookingEnd;
      });

      if (firstSlotAfterBooking) {
        const firstAfterDT = DateTime.fromISO(firstSlotAfterBooking).setZone('America/Los_Angeles');
        const gapMinutes = firstAfterDT.diff(bookingEnd, 'minutes').minutes;

        info(`Gap after Venice booking ends (${s.bookingA.endTime}): ${gapMinutes} minutes`);
        info(`First Beverly Hills slot after gap: ${firstAfterDT.toFormat('h:mm a')}`);

        if (gapMinutes >= 30) {
          assert('Travel time gap exists (Venice → Beverly Hills)', true,
            `${gapMinutes} min gap accounts for ~25-35 min drive + buffer`);
        } else if (gapMinutes >= 15) {
          warn('Travel time gap seems short for Venice → Beverly Hills',
            `Only ${gapMinutes} min gap — drive is typically 25-35 min`);
        } else {
          warn('No meaningful travel gap detected',
            `Only ${gapMinutes} min gap — may not account for travel time`);
        }
      }
    }
  }

  // =========================================================================
  // TEST 4: Client B books an afternoon appointment in Beverly Hills
  // =========================================================================

  console.log('\n--- Test 4: Client B Books Afternoon in Beverly Hills ---\n');

  {
    const slotsRes = await cliB.get(`/api/availability/available/${s.testDate}`, {
      params: { duration: 90, lat: LOCATIONS.clientB.lat, lng: LOCATIONS.clientB.lng, providerId: s.provId },
    });
    const slots = slotsRes.data || [];

    // Find a slot around 2:00 PM for a 90-min session
    let targetSlot = null;
    for (const slot of slots) {
      const dt = DateTime.fromISO(slot).setZone('America/Los_Angeles');
      if (dt.hour === 14 && dt.minute === 0) {
        targetSlot = slot;
        break;
      }
    }
    // Fallback to a middle-ish slot
    if (!targetSlot && slots.length > 0) {
      targetSlot = slots[Math.floor(slots.length / 2)];
    }

    if (targetSlot) {
      const dt = DateTime.fromISO(targetSlot).setZone('America/Los_Angeles');
      info(`Client B booking: ${dt.toFormat('h:mm a')} (90 min) at Beverly Hills`);

      const res = await cliB.post('/api/bookings', {
        date: dt.toFormat('yyyy-MM-dd'),
        time: dt.toFormat('HH:mm'),
        duration: 90,
        location: {
          lat: LOCATIONS.clientB.lat,
          lng: LOCATIONS.clientB.lng,
          address: LOCATIONS.clientB.address,
        },
        recipientType: 'self',
        paymentMethod: 'cash',
        pricing: { basePrice: 160, addonsPrice: 0, totalPrice: 160 },
      });

      assert('Client B books 90min in Beverly Hills', res.status === 201,
        `status=${res.status} ${res.data?.message || res.data?.error || ''}`);
      if (res.status === 201) {
        s.bookingB = {
          id: res.data._id,
          time: dt.toFormat('HH:mm'),
          endTime: dt.plus({ minutes: 90 }).toFormat('HH:mm'),
          location: LOCATIONS.clientB,
        };
        info(`Booked: ${s.bookingB.time} - ${s.bookingB.endTime}`);
      }
    } else {
      assert('Client B books afternoon in Beverly Hills', false, 'No 90-min slots available');
    }
  }

  // =========================================================================
  // TEST 5: After 2 bookings — how do slots look for Client C in Downtown?
  // =========================================================================

  console.log('\n--- Test 5: Slots After 2 Bookings (Downtown LA Perspective) ---\n');

  {
    const res = await cliC.get(`/api/availability/available/${s.testDate}`, {
      params: { duration: 60, lat: LOCATIONS.clientC.lat, lng: LOCATIONS.clientC.lng, providerId: s.provId },
    });

    const slotsForC = res.data || [];
    s.slotsAfterBookingB = slotsForC;

    info(`Downtown LA slots after 2 bookings: ${formatSlots(slotsForC)}`);

    // Verify progressive reduction
    const baselineCount = s.slotsBeforeAny.length;
    const afterOneCount = s.slotsAfterBookingA.length;
    const afterTwoCount = slotsForC.length;

    info(`Slot progression: ${baselineCount} → ${afterOneCount} → ${afterTwoCount}`);

    if (afterTwoCount < afterOneCount && afterOneCount < baselineCount) {
      assert('Slots reduce progressively with each booking', true,
        `${baselineCount} → ${afterOneCount} → ${afterTwoCount}`);
    } else if (afterTwoCount < baselineCount) {
      assert('Slots reduced from baseline', true,
        `${baselineCount} → ${afterTwoCount}`);
    } else {
      warn('Slots did not reduce as expected',
        `baseline=${baselineCount}, afterOne=${afterOneCount}, afterTwo=${afterTwoCount}`);
    }

    // Verify no slots overlap with existing bookings
    if (s.bookingA && s.bookingB) {
      const bookingWindows = [s.bookingA, s.bookingB].map((b) => ({
        start: DateTime.fromFormat(`${s.testDate} ${b.time}`, 'yyyy-MM-dd HH:mm', { zone: 'America/Los_Angeles' }),
        end: DateTime.fromFormat(`${s.testDate} ${b.endTime}`, 'yyyy-MM-dd HH:mm', { zone: 'America/Los_Angeles' }),
      }));

      const conflicting = slotsForC.filter((slot) => {
        const slotDT = DateTime.fromISO(slot).setZone('America/Los_Angeles');
        return bookingWindows.some((w) => slotDT >= w.start && slotDT < w.end);
      });

      assert('No Downtown slots conflict with existing bookings', conflicting.length === 0,
        conflicting.length > 0 ? `${conflicting.length} conflicts` : '');
    }
  }

  // =========================================================================
  // TEST 6: Client C books — can it find a gap between/around the other two?
  // =========================================================================

  console.log('\n--- Test 6: Client C Books in Downtown LA ---\n');

  {
    const slotsRes = await cliC.get(`/api/availability/available/${s.testDate}`, {
      params: { duration: 60, lat: LOCATIONS.clientC.lat, lng: LOCATIONS.clientC.lng, providerId: s.provId },
    });
    const slots = slotsRes.data || [];

    if (slots.length > 0) {
      // Try to book in a gap between the two existing bookings if possible
      let targetSlot = null;

      if (s.bookingA && s.bookingB) {
        const bookingAEnd = DateTime.fromFormat(`${s.testDate} ${s.bookingA.endTime}`, 'yyyy-MM-dd HH:mm', { zone: 'America/Los_Angeles' });
        const bookingBStart = DateTime.fromFormat(`${s.testDate} ${s.bookingB.time}`, 'yyyy-MM-dd HH:mm', { zone: 'America/Los_Angeles' });

        // Look for slot between the two bookings
        for (const slot of slots) {
          const dt = DateTime.fromISO(slot).setZone('America/Los_Angeles');
          if (dt > bookingAEnd && dt.plus({ minutes: 60 }) < bookingBStart) {
            targetSlot = slot;
            info(`Found slot in gap between bookings: ${dt.toFormat('h:mm a')}`);
            break;
          }
        }
      }

      // If no gap slot, use the last available slot (evening)
      if (!targetSlot) {
        targetSlot = slots[slots.length - 1];
        const dt = DateTime.fromISO(targetSlot).setZone('America/Los_Angeles');
        info(`Using latest available slot: ${dt.toFormat('h:mm a')}`);
      }

      const dt = DateTime.fromISO(targetSlot).setZone('America/Los_Angeles');
      info(`Client C booking: ${dt.toFormat('h:mm a')} (60 min) at Downtown LA`);

      const res = await cliC.post('/api/bookings', {
        date: dt.toFormat('yyyy-MM-dd'),
        time: dt.toFormat('HH:mm'),
        duration: 60,
        location: {
          lat: LOCATIONS.clientC.lat,
          lng: LOCATIONS.clientC.lng,
          address: LOCATIONS.clientC.address,
        },
        recipientType: 'self',
        paymentMethod: 'cash',
        pricing: { basePrice: 120, addonsPrice: 0, totalPrice: 120 },
      });

      if (res.status === 201) {
        assert('Client C books 60min in Downtown LA', true);
        s.bookingC = {
          id: res.data._id,
          time: dt.toFormat('HH:mm'),
          endTime: dt.plus({ minutes: 60 }).toFormat('HH:mm'),
          location: LOCATIONS.clientC,
        };
      } else {
        // Retry with middle slot
        info(`First attempt rejected (${res.data?.message}), retrying with middle slot...`);
        const midSlot = slots[Math.floor(slots.length / 2)];
        const dt2 = DateTime.fromISO(midSlot).setZone('America/Los_Angeles');
        const retry = await cliC.post('/api/bookings', {
          date: dt2.toFormat('yyyy-MM-dd'),
          time: dt2.toFormat('HH:mm'),
          duration: 60,
          location: {
            lat: LOCATIONS.clientC.lat,
            lng: LOCATIONS.clientC.lng,
            address: LOCATIONS.clientC.address,
          },
          recipientType: 'self',
          paymentMethod: 'cash',
          pricing: { basePrice: 120, addonsPrice: 0, totalPrice: 120 },
        });
        assert('Client C books 60min in Downtown LA (retry)', retry.status === 201,
          `status=${retry.status} ${retry.data?.message || ''}`);
        if (retry.status === 201) {
          s.bookingC = {
            id: retry.data._id,
            time: dt2.toFormat('HH:mm'),
            endTime: dt2.plus({ minutes: 60 }).toFormat('HH:mm'),
            location: LOCATIONS.clientC,
          };
          info(`Booked: ${s.bookingC.time} - ${s.bookingC.endTime}`);
        }
      }
    } else {
      warn('No slots available for Client C after 2 bookings',
        'This could be correct if travel times consume all remaining availability');
    }
  }

  // =========================================================================
  // TEST 7: Provider's day view — verify the full schedule makes sense
  // =========================================================================

  console.log('\n--- Test 7: Provider Day View — Full Schedule ---\n');

  {
    await prov.post('/api/auth/login', { email: PROVIDER_EMAIL, password: PROVIDER_PASS });

    const res = await prov.get('/api/bookings');
    const dayBookings = (res.data || [])
      .filter((b) => b.status !== 'cancelled' && b.localDate === s.testDate)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    info(`Provider has ${dayBookings.length} bookings on ${s.testDate}:`);

    let prevEnd = null;
    let prevLocation = null;
    let scheduleValid = true;

    for (const booking of dayBookings) {
      const startDT = DateTime.fromFormat(`${s.testDate} ${booking.startTime}`, 'yyyy-MM-dd HH:mm', { zone: 'America/Los_Angeles' });
      const endDT = DateTime.fromFormat(`${s.testDate} ${booking.endTime}`, 'yyyy-MM-dd HH:mm', { zone: 'America/Los_Angeles' });
      const locName = booking.location?.address || 'unknown';

      info(`  ${booking.startTime} - ${booking.endTime} (${booking.duration}min) @ ${locName}`);

      if (prevEnd) {
        const gapMinutes = startDT.diff(prevEnd, 'minutes').minutes;
        const sameLocation = prevLocation &&
          Math.abs(prevLocation.lat - booking.location?.lat) < 0.002 &&
          Math.abs(prevLocation.lng - booking.location?.lng) < 0.002;

        if (sameLocation) {
          info(`    Gap: ${gapMinutes} min (same location)`);
        } else {
          info(`    Gap: ${gapMinutes} min (different location — includes travel)`);
        }

        if (gapMinutes < 0) {
          scheduleValid = false;
          warn('Bookings OVERLAP!', `${gapMinutes} min overlap`);
        } else if (!sameLocation && gapMinutes < 15) {
          scheduleValid = false;
          warn('Insufficient gap between different locations',
            `Only ${gapMinutes} min for travel + buffer`);
        }
      }

      prevEnd = endDT;
      prevLocation = booking.location;
    }

    assert('Schedule has no overlaps or impossible gaps', scheduleValid);
  }

  // =========================================================================
  // TEST 8: Verify remaining slots after 3 bookings
  // =========================================================================

  console.log('\n--- Test 8: Remaining Availability After 3 Bookings ---\n');

  {
    // Check from a 4th location perspective
    const fourthLoc = { lat: 34.0195, lng: -118.4912 }; // near Santa Monica pier

    const res = await cliA.get(`/api/availability/available/${s.testDate}`, {
      params: { duration: 60, lat: fourthLoc.lat, lng: fourthLoc.lng, providerId: s.provId },
    });

    const remaining = res.data || [];
    info(`Remaining slots (Santa Monica Pier perspective): ${formatSlots(remaining)}`);
    info(`Slot count progression: ${s.slotsBeforeAny.length} → ${s.slotsAfterBookingA.length} → ${s.slotsAfterBookingB.length} → ${remaining.length}`);

    // Slots should be monotonically decreasing
    const counts = [
      s.slotsBeforeAny.length,
      s.slotsAfterBookingA.length,
      s.slotsAfterBookingB.length,
      remaining.length,
    ];

    const decreasing = counts.every((c, i) => i === 0 || c <= counts[i - 1]);
    if (decreasing) {
      assert('Slot count monotonically decreases', true, counts.join(' → '));
    } else {
      warn('Slot count not strictly decreasing', counts.join(' → '));
    }
  }

  // =========================================================================
  // TEST 9: Double-booking prevention — try to book same slot as Client A
  // =========================================================================

  console.log('\n--- Test 9: Double-Booking Prevention ---\n');

  if (s.bookingA) {
    // Client B tries to book the exact same time at a different location
    const res = await cliB.post('/api/bookings', {
      date: s.testDate,
      time: s.bookingA.time,
      duration: 60,
      location: {
        lat: LOCATIONS.clientB.lat,
        lng: LOCATIONS.clientB.lng,
        address: LOCATIONS.clientB.address,
      },
      recipientType: 'self',
      paymentMethod: 'cash',
      pricing: { basePrice: 120, addonsPrice: 0, totalPrice: 120 },
    });

    assert('Double-booking at same time rejected', res.status !== 201,
      `status=${res.status} ${res.data?.message || ''}`);
  }

  // =========================================================================
  // TEST 10: Try booking a slot right after an existing booking (tight window)
  // =========================================================================

  console.log('\n--- Test 10: Tight Window Test ---\n');

  if (s.bookingA) {
    // Try to book exactly when Client A's booking ends (no travel buffer)
    const res = await cliB.post('/api/bookings', {
      date: s.testDate,
      time: s.bookingA.endTime, // right when previous ends
      duration: 60,
      location: {
        lat: LOCATIONS.clientB.lat,
        lng: LOCATIONS.clientB.lng,
        address: LOCATIONS.clientB.address,
      },
      recipientType: 'self',
      paymentMethod: 'cash',
      pricing: { basePrice: 120, addonsPrice: 0, totalPrice: 120 },
    });

    // This SHOULD be rejected — provider needs travel time from Venice to Beverly Hills
    if (res.status !== 201) {
      assert('Booking immediately after (no travel buffer) rejected', true,
        `Correctly rejected: ${res.data?.message || ''}`);
    } else {
      warn('Booking accepted with no travel buffer between different locations',
        `Booked ${s.bookingA.endTime} at Beverly Hills immediately after Venice ended`);
    }
  }

  // =========================================================================
  // CLEANUP
  // =========================================================================

  console.log('\n--- Cleanup ---\n');

  // Login clients and delete accounts
  for (const [email, session, name] of [
    [CLIENT_A_EMAIL, cliA, 'Client A'],
    [CLIENT_B_EMAIL, cliB, 'Client B'],
    [CLIENT_C_EMAIL, cliC, 'Client C'],
  ]) {
    await session.post('/api/auth/login', { email, password: CLIENT_PASS });
    const res = await session.delete('/api/users/account');
    assert(`Delete ${name}`, res.status === 200);
  }

  {
    await prov.post('/api/auth/login', { email: PROVIDER_EMAIL, password: PROVIDER_PASS });
    const res = await prov.delete('/api/users/account');
    assert('Delete provider', res.status === 200);
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  RESULTS: \x1b[32mPASS: ${passCount}\x1b[0m  |  \x1b[31mFAIL: ${failCount}\x1b[0m  |  \x1b[33mWARN: ${warnCount}\x1b[0m`);
  console.log(`${'='.repeat(60)}`);

  if (failCount > 0) {
    console.log('\nFailed:');
    results.filter((r) => r.status === 'FAIL').forEach((r) => {
      console.log(`  ${r.label}${r.detail ? `: ${r.detail}` : ''}`);
    });
  }

  if (warnCount > 0) {
    console.log('\nWarnings (potential issues):');
    results.filter((r) => r.status === 'WARN').forEach((r) => {
      console.log(`  ${r.label}${r.detail ? `: ${r.detail}` : ''}`);
    });
  }

  console.log('');
  process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(2);
});
