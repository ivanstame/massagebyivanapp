// Smoke test for Phase 1 of the static-location feature.
//
// Proves that adding a location to a BlockedTime actually changes the
// drive-time math for adjacent slots. We do this by running the
// production getAvailableTimeSlots function twice against the same
// setup — once with the block having no location, once with the
// block at a Pasadena address — and comparing the slots that appear
// just after the block ends.
//
// If Phase 1 works, the with-location run should expose slots EARLIER
// after the block (Pasadena → Pasadena ≈ 5min drive) than the no-
// location run (Downtown LA home base → Pasadena ≈ 20-30min drive).
//
// All test docs are tagged with @avayble-blocktest.local so even if
// cleanup fails partway through, the residue can be wiped manually.
//
// Run: heroku run node scripts/test-block-location-drive-time.js -a massagebyivan

require('dotenv').config();
const mongoose = require('mongoose');
const { DateTime } = require('luxon');

const User = require('../server/models/User');
const Availability = require('../server/models/Availability');
const BlockedTime = require('../server/models/BlockedTime');
const SavedLocation = require('../server/models/SavedLocation');
const { getAvailableTimeSlots } = require('../server/utils/timeUtils');

const TEST_TAG = '@avayble-blocktest.local';
const tagId = Date.now();

const log = (...args) => console.log(...args);

// Coordinates that make the drive-time delta obvious.
//   Home base: Downtown LA (City Hall area)
//   Block location: South Lake Ave, Pasadena
//   Client location: ~1 mile from the block location, also in Pasadena
const HOME_LAT = 34.0522, HOME_LNG = -118.2437;
const BLOCK_LAT = 34.1478, BLOCK_LNG = -118.1445;
const CLIENT_LAT = 34.1366, CLIENT_LNG = -118.1450;

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }
  await mongoose.connect(uri);
  log('Connected to MongoDB\n');

  let provider, homeLoc, availability, block;
  let allPassed = true;
  const failures = [];

  try {
    // ── Setup ───────────────────────────────────────────────────────
    log('Setup');
    provider = await User.create({
      email: `provider-${tagId}${TEST_TAG}`,
      password: 'test-password-not-used',
      accountType: 'PROVIDER',
      registrationStep: 3,
      profile: {
        fullName: 'Test Block-Location Provider',
        phoneNumber: '5555550200',
      },
      providerProfile: {
        businessName: 'Test Block-Location Practice',
        trade: 'massage',
        basePricing: [{ duration: 60, price: 120, label: '60 Minutes' }],
      },
    });
    log(`  provider _id: ${provider._id}`);

    homeLoc = await SavedLocation.create({
      provider: provider._id,
      name: 'Home Base',
      address: '200 N Spring St, Los Angeles, CA 90012',
      lat: HOME_LAT,
      lng: HOME_LNG,
      isHomeBase: true,
    });
    log(`  home base: ${homeLoc.address}`);

    // Pick a date 14 days out so it's in the open booking window.
    const testDate = DateTime.now().setZone('America/Los_Angeles')
      .plus({ days: 14 }).startOf('day');
    const localDateStr = testDate.toFormat('yyyy-MM-dd');

    const availStart = testDate.set({ hour: 9 });
    const availEnd = testDate.set({ hour: 18 });
    availability = await Availability.create({
      provider: provider._id,
      date: testDate.toUTC().toJSDate(),
      localDate: localDateStr,
      start: availStart.toUTC().toJSDate(),
      end: availEnd.toUTC().toJSDate(),
      source: 'manual',
    });
    log(`  availability: ${localDateStr} 09:00-18:00 LA`);

    // Block 12:00-14:00 LA on the same day. Start with NO location.
    const blockStart = testDate.set({ hour: 12 });
    const blockEnd = testDate.set({ hour: 14 });
    block = await BlockedTime.create({
      provider: provider._id,
      start: blockStart.toUTC().toJSDate(),
      end: blockEnd.toUTC().toJSDate(),
      reason: 'Test block (no location)',
      source: 'manual',
    });
    log(`  block: ${localDateStr} 12:00-14:00 (no location yet)\n`);

    const clientLocation = { lat: CLIENT_LAT, lng: CLIENT_LNG, address: '380 S Lake Ave, Pasadena, CA 91101' };
    const homeBase = { lat: HOME_LAT, lng: HOME_LNG };

    // ── Run A: block has NO location ─────────────────────────────────
    log('Run A: block has NO location → drive-time falls back to home base');
    log('  expected: first slot after block is delayed by LA→Pasadena drive (~25min)');
    const slotsA = await getAvailableTimeSlots(
      availability, [], clientLocation, 60, 15, null, 0,
      provider._id, [], homeBase,
      [await BlockedTime.findById(block._id)] // re-fetch fresh
    );
    const afterBlockA = slotsA
      .map(d => DateTime.fromJSDate(d).setZone('America/Los_Angeles'))
      .filter(dt => dt.hour >= 14)
      .sort((a, b) => a - b);
    const firstAfterA = afterBlockA[0];
    log(`  ${slotsA.length} total slots`);
    log(`  first slot after 14:00: ${firstAfterA ? firstAfterA.toFormat('HH:mm') : '(none)'}\n`);

    // ── Run B: block has a Pasadena location ─────────────────────────
    log('Run B: same block + Pasadena location → drive-time uses block address');
    log('  expected: first slot after block is much sooner (Pasadena→Pasadena ~5min)');
    await BlockedTime.updateOne(
      { _id: block._id },
      {
        $set: {
          location: {
            address: '380 S Lake Ave, Pasadena, CA 91101',
            lat: BLOCK_LAT,
            lng: BLOCK_LNG,
          },
        },
      }
    );
    const slotsB = await getAvailableTimeSlots(
      availability, [], clientLocation, 60, 15, null, 0,
      provider._id, [], homeBase,
      [await BlockedTime.findById(block._id)] // re-fetch fresh
    );
    const afterBlockB = slotsB
      .map(d => DateTime.fromJSDate(d).setZone('America/Los_Angeles'))
      .filter(dt => dt.hour >= 14)
      .sort((a, b) => a - b);
    const firstAfterB = afterBlockB[0];
    log(`  ${slotsB.length} total slots`);
    log(`  first slot after 14:00: ${firstAfterB ? firstAfterB.toFormat('HH:mm') : '(none)'}\n`);

    // ── Verdict ──────────────────────────────────────────────────────
    log('─────────────────────────────────────────────────────────────');
    if (!firstAfterA || !firstAfterB) {
      failures.push('One or both runs returned zero slots after the block — slot generator may have rejected the day entirely');
      allPassed = false;
    } else if (firstAfterB < firstAfterA) {
      log(`✓ With-location run unlocks slots EARLIER by ${Math.round((firstAfterA - firstAfterB) / 60000)} minutes`);
      log('  → BlockedTime.location is correctly being used as a drive-time origin.');
    } else if (firstAfterB.toMillis() === firstAfterA.toMillis()) {
      failures.push(
        `Both runs returned the same first-after-block slot (${firstAfterA.toFormat('HH:mm')}). ` +
        'Either Distance Matrix returned identical times for both routes (unlikely), ' +
        'or the slot generator is not consulting BlockedTime.location.'
      );
      allPassed = false;
    } else {
      failures.push(
        `With-location run returned a LATER first slot (${firstAfterB.toFormat('HH:mm')}) ` +
        `than no-location (${firstAfterA.toFormat('HH:mm')}). This is backwards.`
      );
      allPassed = false;
    }

    // Also surface slot counts as a sanity hint
    if (slotsB.length > slotsA.length) {
      log(`  bonus: with-location run also exposed ${slotsB.length - slotsA.length} more bookable slots overall`);
    }

  } catch (err) {
    allPassed = false;
    failures.push(`Unexpected error: ${err.message}`);
    log('\n✗ Unexpected error during test:', err.message);
    if (err.stack) console.error(err.stack);
  } finally {
    log('\nCleanup');
    try {
      if (block) {
        await BlockedTime.deleteOne({ _id: block._id });
        log(`  block deleted:        ${block._id}`);
      }
      if (availability) {
        await Availability.deleteOne({ _id: availability._id });
        log(`  availability deleted: ${availability._id}`);
      }
      if (homeLoc) {
        await SavedLocation.deleteOne({ _id: homeLoc._id });
        log(`  home base deleted:    ${homeLoc._id}`);
      }
      if (provider) {
        await User.deleteOne({ _id: provider._id });
        log(`  provider deleted:     ${provider._id}`);
      }

      // Belt-and-suspenders sweep — strictly scoped to test-tagged users.
      const tagRegex = new RegExp(TEST_TAG.replace('.', '\\.') + '$');
      const sweepUsers = await User.deleteMany({ email: tagRegex });
      log(`  test-tag user sweep:  ${sweepUsers.deletedCount} extra removed`);
      if (provider) {
        const sweepLocs = await SavedLocation.deleteMany({ provider: provider._id });
        const sweepBlocks = await BlockedTime.deleteMany({ provider: provider._id });
        const sweepAvails = await Availability.deleteMany({ provider: provider._id });
        log(`  test-owner saved-loc sweep:    ${sweepLocs.deletedCount}`);
        log(`  test-owner blocked-time sweep: ${sweepBlocks.deletedCount}`);
        log(`  test-owner availability sweep: ${sweepAvails.deletedCount}`);
      }
    } catch (cleanupErr) {
      log(`  ! cleanup error: ${cleanupErr.message}`);
    }

    log('\n─────────────────────────────────────────────────────────────');
    if (allPassed) {
      log('RESULT: ✓ Phase 1 verified — block location influences drive-time math');
    } else {
      log('RESULT: ✗ FAILURES DETECTED:');
      failures.forEach(f => log(`  - ${f}`));
    }
    await mongoose.disconnect();
    process.exit(allPassed ? 0 : 1);
  }
})();
