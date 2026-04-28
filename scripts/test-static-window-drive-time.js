// Smoke test for Phase 2d: static availability windows act as travel
// boundaries for surrounding mobile slots.
//
// Setup:
//   - Provider with home base in Downtown LA
//   - Three availability windows on the same day:
//     a) Mobile 9:00-11:30 AM
//     b) Static 12:00-15:00 at a Pasadena studio
//     c) Mobile 15:30-18:00
//   - Client wants to book a 60-min mobile session at a Pasadena address
//
// Expectations:
//   - Run A (NO static-window-as-boundary): static window contributes
//     no travel constraint to the evening mobile slots, so the first
//     slot opens at 15:30 with zero drive time imposed.
//   - Run B (WITH the wiring — current code): static window's address
//     IS treated as travel origin for adjacent slots, so the first slot
//     opens later (15:30 + 15min buffer + ~4min drive Pasadena→Pasadena
//     + 15min arrival, snapped to the 15-min grid).
//
// Pass criterion: Run B is LATER than Run A. That proves the synthetic
// boundary is being consulted — adding a real travel-origin constraint
// pushes slots back; without it, the system unrealistically lets slots
// start instantly. (See Phase 1's verification for the same shape.)

require('dotenv').config();
const mongoose = require('mongoose');
const { DateTime } = require('luxon');

const User = require('../server/models/User');
const Availability = require('../server/models/Availability');
const SavedLocation = require('../server/models/SavedLocation');
const { getAvailableTimeSlots } = require('../server/utils/timeUtils');

const TEST_TAG = '@avayble-staticwintest.local';
const tagId = Date.now();
const log = (...args) => console.log(...args);

const HOME_LAT = 34.0522, HOME_LNG = -118.2437;       // Downtown LA
const STUDIO_LAT = 34.1478, STUDIO_LNG = -118.1445;   // Pasadena
const CLIENT_LAT = 34.1366, CLIENT_LNG = -118.1450;   // Pasadena (near studio)

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
  await mongoose.connect(uri);
  log('Connected to MongoDB\n');

  let provider, homeLoc, studioLoc, mobileMorning, staticWindow, mobileEvening;
  let allPassed = true;
  const failures = [];

  try {
    log('Setup');
    provider = await User.create({
      email: `provider-${tagId}${TEST_TAG}`,
      password: 'test-password-not-used',
      accountType: 'PROVIDER',
      registrationStep: 3,
      profile: { fullName: 'Test Static-Window Provider', phoneNumber: '5555550300' },
      providerProfile: {
        businessName: 'Test',
        trade: 'massage',
        basePricing: [{ duration: 60, price: 120, label: '60 Minutes' }],
      },
    });
    log(`  provider _id: ${provider._id}`);

    homeLoc = await SavedLocation.create({
      provider: provider._id,
      name: 'Home Base', address: '200 N Spring St, Los Angeles, CA 90012',
      lat: HOME_LAT, lng: HOME_LNG, isHomeBase: true,
    });
    log(`  home base: ${homeLoc.address}`);

    studioLoc = await SavedLocation.create({
      provider: provider._id,
      name: 'Pasadena Studio', address: '380 S Lake Ave, Pasadena, CA 91101',
      lat: STUDIO_LAT, lng: STUDIO_LNG,
      isStaticLocation: true,
      staticConfig: { bufferMinutes: 15, useMobilePricing: true, pricing: [] }
    });
    log(`  static location: ${studioLoc.name}`);

    const testDate = DateTime.now().setZone('America/Los_Angeles')
      .plus({ days: 14 }).startOf('day');
    const localDateStr = testDate.toFormat('yyyy-MM-dd');

    // a) mobile morning 9-11:30
    mobileMorning = await Availability.create({
      provider: provider._id,
      date: testDate.toUTC().toJSDate(),
      localDate: localDateStr,
      start: testDate.set({ hour: 9 }).toUTC().toJSDate(),
      end: testDate.set({ hour: 11, minute: 30 }).toUTC().toJSDate(),
      source: 'manual', kind: 'mobile',
    });
    // b) static 12:00-15:00
    staticWindow = await Availability.create({
      provider: provider._id,
      date: testDate.toUTC().toJSDate(),
      localDate: localDateStr,
      start: testDate.set({ hour: 12 }).toUTC().toJSDate(),
      end: testDate.set({ hour: 15 }).toUTC().toJSDate(),
      source: 'manual', kind: 'static', staticLocation: studioLoc._id,
    });
    // c) mobile evening 15:30-18:00
    mobileEvening = await Availability.create({
      provider: provider._id,
      date: testDate.toUTC().toJSDate(),
      localDate: localDateStr,
      start: testDate.set({ hour: 15, minute: 30 }).toUTC().toJSDate(),
      end: testDate.set({ hour: 18 }).toUTC().toJSDate(),
      source: 'manual', kind: 'mobile',
    });
    log(`  ${localDateStr}: mobile 9-11:30, static 12-15 @ Pasadena, mobile 15:30-18:00\n`);

    const clientLocation = { lat: CLIENT_LAT, lng: CLIENT_LNG };
    const homeBase = { lat: HOME_LAT, lng: HOME_LNG };

    // ── Run A: WITHOUT static-window-as-boundary ────────────────────
    log('Run A: evening mobile slots WITHOUT the Phase 2d wiring');
    log('  expected: first slot at 15:30 (no travel imposed by the absent boundary)');
    const slotsA = await getAvailableTimeSlots(
      mobileEvening, [], clientLocation, 60, 15, null, 0,
      provider._id, [], homeBase,
      [] // no static-as-boundary entries
    );
    const sortedA = slotsA
      .map(d => DateTime.fromJSDate(d).setZone('America/Los_Angeles'))
      .sort((a, b) => a - b);
    const firstA = sortedA[0];
    log(`  ${slotsA.length} total slots; first: ${firstA ? firstA.toFormat('HH:mm') : '(none)'}\n`);

    // ── Run B: WITH static-window-as-boundary ───────────────────────
    log('Run B: evening mobile slots WITH the Phase 2d wiring');
    log('  expected: first slot LATER than 15:30 (drive from Pasadena studio + buffers, snapped to grid)');
    // Build the same synthetic boundary the route now constructs.
    const populatedStatic = await Availability.findById(staticWindow._id)
      .populate('staticLocation', 'name address lat lng staticConfig isStaticLocation');
    const staticBoundary = {
      start: populatedStatic.start,
      end: populatedStatic.end,
      overridden: false,
      location: {
        address: populatedStatic.staticLocation.address,
        lat: populatedStatic.staticLocation.lat,
        lng: populatedStatic.staticLocation.lng,
      },
    };
    const slotsB = await getAvailableTimeSlots(
      mobileEvening, [], clientLocation, 60, 15, null, 0,
      provider._id, [], homeBase,
      [staticBoundary]
    );
    const sortedB = slotsB
      .map(d => DateTime.fromJSDate(d).setZone('America/Los_Angeles'))
      .sort((a, b) => a - b);
    const firstB = sortedB[0];
    log(`  ${slotsB.length} total slots; first: ${firstB ? firstB.toFormat('HH:mm') : '(none)'}\n`);

    log('─────────────────────────────────────────────────────────────');
    if (!firstA || !firstB) {
      failures.push('One or both runs returned zero evening slots');
      allPassed = false;
    } else if (firstB > firstA) {
      const deltaMin = Math.round((firstB - firstA) / 60000);
      log(`✓ With Phase 2d, evening slots open ${deltaMin} minutes LATER`);
      log(`  no-boundary:    ${firstA.toFormat('HH:mm')} (no travel imposed)`);
      log(`  with-boundary:  ${firstB.toFormat('HH:mm')} (drive from static studio + buffers)`);
      log('  → static-window addresses are correctly acting as travel origins for adjacent mobile slots.');
    } else if (firstB.toMillis() === firstA.toMillis()) {
      failures.push(
        `Both runs returned the same first evening slot (${firstA.toFormat('HH:mm')}). ` +
        'The synthetic static-window boundary did not influence the slot generator.'
      );
      allPassed = false;
    } else {
      failures.push(
        `Run B returned an EARLIER first slot (${firstB.toFormat('HH:mm')}) than Run A (${firstA.toFormat('HH:mm')}). ` +
        'Adding a travel-origin constraint should push slots back, not pull them forward.'
      );
      allPassed = false;
    }
  } catch (err) {
    allPassed = false;
    failures.push(`Unexpected error: ${err.message}`);
    log('\n✗ Unexpected error during test:', err.message);
    if (err.stack) console.error(err.stack);
  } finally {
    log('\nCleanup');
    try {
      for (const a of [mobileMorning, staticWindow, mobileEvening]) {
        if (a) await Availability.deleteOne({ _id: a._id });
      }
      if (studioLoc) await SavedLocation.deleteOne({ _id: studioLoc._id });
      if (homeLoc) await SavedLocation.deleteOne({ _id: homeLoc._id });
      if (provider) await User.deleteOne({ _id: provider._id });
      log('  scoped deletes done');

      const tagRegex = new RegExp(TEST_TAG.replace('.', '\\.') + '$');
      const sweepUsers = await User.deleteMany({ email: tagRegex });
      log(`  test-tag user sweep: ${sweepUsers.deletedCount} extra removed`);
      if (provider) {
        const sweepLocs = await SavedLocation.deleteMany({ provider: provider._id });
        const sweepAvails = await Availability.deleteMany({ provider: provider._id });
        log(`  test-owner saved-loc sweep:    ${sweepLocs.deletedCount}`);
        log(`  test-owner availability sweep: ${sweepAvails.deletedCount}`);
      }
    } catch (cleanupErr) {
      log(`  ! cleanup error: ${cleanupErr.message}`);
    }

    log('\n─────────────────────────────────────────────────────────────');
    if (allPassed) {
      log('RESULT: ✓ Phase 2d verified — static windows act as travel origins for adjacent mobile slots');
    } else {
      log('RESULT: ✗ FAILURES DETECTED:');
      failures.forEach(f => log(`  - ${f}`));
    }
    await mongoose.disconnect();
    process.exit(allPassed ? 0 : 1);
  }
})();
