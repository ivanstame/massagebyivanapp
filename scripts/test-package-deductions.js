// End-to-end smoke test for package credit deductions.
//
// Creates a throwaway provider + client, mints a 4-session comped
// 60-minute package for the client, simulates 4 bookings (each
// reserving a credit through the production reservePackageCredit
// service the real /api/bookings route uses), and prints the
// package state after each redemption. Then attempts a 5th
// reservation and expects it to fail (capacity exhausted).
//
// All test docs are tagged with the TEST_TAG email suffix so even if
// cleanup fails partway through, the residue can be wiped manually
// with: db.users.deleteMany({ email: /@avayble-pkgtest\.local$/ })
//
// Run: heroku run node scripts/test-package-deductions.js -a massagebyivan

require('dotenv').config();
const mongoose = require('mongoose');
const { DateTime } = require('luxon');

const User = require('../server/models/User');
const PackagePurchase = require('../server/models/PackagePurchase');
const Booking = require('../server/models/Booking');
const { reservePackageCredit } = require('../server/services/packageReservation');

const TEST_TAG = '@avayble-pkgtest.local';
const tagId = Date.now();

const log = (...args) => console.log(...args);
const pad = s => String(s).padStart(2, ' ');

// Bookings need start/end times — we space them across 4 distinct
// future days so the unique index on (provider, date, time) doesn't bite.
function nextWeekday(offsetDays) {
  return DateTime.now().setZone('America/Los_Angeles')
    .plus({ days: 7 + offsetDays }).startOf('day').set({ hour: 14 });
}

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  log('Connected to MongoDB\n');

  let provider, client, pkg;
  const bookingIds = [];
  let allPassed = true;
  const failures = [];

  try {
    // ── Step 1: provider ─────────────────────────────────────────────
    log('Step 1: create test provider');
    provider = await User.create({
      email: `provider-${tagId}${TEST_TAG}`,
      password: 'test-password-not-used',
      accountType: 'PROVIDER',
      registrationStep: 3,
      profile: {
        fullName: 'Test Provider',
        phoneNumber: '5555550100',
        address: {
          street: '100 Test Way',
          city: 'Los Angeles',
          state: 'CA',
          zip: '90001',
          formatted: '100 Test Way, Los Angeles, CA 90001'
        }
      },
      providerProfile: {
        businessName: 'Test Practice',
        trade: 'massage',
        basePricing: [
          { duration: 60, price: 120, label: '60 Minutes' },
          { duration: 90, price: 165, label: '90 Minutes' }
        ],
        acceptedPaymentMethods: ['cash', 'card']
      }
    });
    log(`  provider _id: ${provider._id}`);
    log(`  email:        ${provider.email}\n`);

    // ── Step 2: client ───────────────────────────────────────────────
    log('Step 2: create test client linked to provider');
    client = await User.create({
      email: `client-${tagId}${TEST_TAG}`,
      password: 'test-password-not-used',
      accountType: 'CLIENT',
      registrationStep: 3,
      providerId: provider._id,
      profile: {
        fullName: 'Test Client',
        phoneNumber: '5555550101',
        address: {
          street: '200 Test Way',
          city: 'Los Angeles',
          state: 'CA',
          zip: '90001',
          formatted: '200 Test Way, Los Angeles, CA 90001'
        }
      }
    });
    log(`  client _id: ${client._id}`);
    log(`  email:      ${client.email}\n`);

    // ── Step 3: comped 4-session package ─────────────────────────────
    log('Step 3: provider grants client a comped 4-session 60-min package');
    pkg = await PackagePurchase.create({
      provider: provider._id,
      client: client._id,
      name: 'Test 4×60 comped pack',
      kind: 'sessions',
      sessionsTotal: 4,
      sessionDuration: 60,
      price: 0,
      paymentMethod: 'comped',
      paymentStatus: 'paid',
      paidAt: new Date(),
      purchasedAt: new Date(),
      redemptions: []
    });
    log(`  package _id:        ${pkg._id}`);
    log(`  sessionsTotal:      ${pkg.sessionsTotal}`);
    log(`  sessionsUsed:       ${pkg.sessionsUsed}`);
    log(`  sessionsRemaining:  ${pkg.sessionsRemaining}\n`);

    // ── Step 4: 4 redeem-and-book cycles ─────────────────────────────
    log('Step 4: simulate 4 sequential bookings, each redeeming a credit');
    log('─────────────────────────────────────────────────────────────');
    const expectedRemaining = [3, 2, 1, 0];

    for (let i = 0; i < 4; i++) {
      const slot = nextWeekday(i);
      const bookingId = new mongoose.Types.ObjectId();

      const reserved = await reservePackageCredit({
        packageId: pkg._id,
        clientId: client._id,
        providerId: provider._id,
        duration: 60,
        bookingId,
      });

      if (!reserved) {
        failures.push(`Booking ${i + 1}: reservation returned null`);
        allPassed = false;
        log(`  booking ${pad(i + 1)} ✗ reservation FAILED`);
        continue;
      }

      const booking = await Booking.create({
        _id: bookingId,
        provider: provider._id,
        client: client._id,
        date: slot.toUTC().toJSDate(),
        localDate: slot.toFormat('yyyy-MM-dd'),
        startTime: slot.toFormat('HH:mm'),
        endTime: slot.plus({ minutes: 60 }).toFormat('HH:mm'),
        duration: 60,
        location: {
          lat: 34.05, lng: -118.24,
          address: '200 Test Way, Los Angeles, CA 90001'
        },
        pricing: { basePrice: 0, addonsPrice: 0, totalPrice: 0 },
        paymentMethod: 'package',
        paymentStatus: 'paid',
        paidAt: new Date(),
        packageRedemption: {
          packagePurchase: pkg._id,
          redeemedAt: new Date()
        },
        bookedBy: { name: 'Test Client', userId: client._id }
      });
      bookingIds.push(booking._id);

      // Re-fetch package to read the virtuals against fresh state
      const fresh = await PackagePurchase.findById(pkg._id);
      const ok = fresh.sessionsRemaining === expectedRemaining[i];
      if (!ok) {
        failures.push(
          `Booking ${i + 1}: expected sessionsRemaining=${expectedRemaining[i]}, ` +
          `got ${fresh.sessionsRemaining}`
        );
        allPassed = false;
      }

      log(
        `  booking ${pad(i + 1)} ${ok ? '✓' : '✗'} ` +
        `${slot.toFormat('ccc LLL d HH:mm')}  →  ` +
        `used=${fresh.sessionsUsed}/${fresh.sessionsTotal}  ` +
        `remaining=${fresh.sessionsRemaining}` +
        (ok ? '' : `  (expected ${expectedRemaining[i]})`)
      );
    }

    // ── Step 5: 5th attempt should fail (capacity exhausted) ─────────
    log('\nStep 5: attempt a 5th reservation — expected to FAIL');
    const overflowAttempt = await reservePackageCredit({
      packageId: pkg._id,
      clientId: client._id,
      providerId: provider._id,
      duration: 60,
      bookingId: new mongoose.Types.ObjectId(),
    });

    if (overflowAttempt === null) {
      log('  ✓ 5th reservation correctly rejected (returned null)');
    } else {
      failures.push('5th reservation succeeded — capacity check broken');
      allPassed = false;
      log('  ✗ 5th reservation should have FAILED but returned a doc');
    }

    // ── Step 6: minutes-mode package — variable duration deductions ─
    log('\n─────────────────────────────────────────────────────────────');
    log('Step 6: mint a 300-minute pack and exercise variable durations');
    const minutesPkg = await PackagePurchase.create({
      provider: provider._id,
      client: client._id,
      name: 'Test 300-minute pool',
      kind: 'minutes',
      minutesTotal: 300,
      price: 0,
      paymentMethod: 'comped',
      paymentStatus: 'paid',
      paidAt: new Date(),
      purchasedAt: new Date(),
      redemptions: []
    });
    log(`  package _id:        ${minutesPkg._id}`);
    log(`  minutesTotal:       ${minutesPkg.minutesTotal}`);
    log(`  minutesUsed:        ${minutesPkg.minutesUsed}`);
    log(`  minutesRemaining:   ${minutesPkg.minutesRemaining}\n`);

    // Sequence: 75 → 225, 60 → 165, 90 → 75, 75 → 0
    const minutesPlan = [
      { minutes: 75, expectedRemaining: 225 },
      { minutes: 60, expectedRemaining: 165 },
      { minutes: 90, expectedRemaining: 75 },
      { minutes: 75, expectedRemaining: 0 },
    ];

    for (let i = 0; i < minutesPlan.length; i++) {
      const { minutes, expectedRemaining } = minutesPlan[i];
      // Offset further out to avoid colliding with the sessions-mode bookings
      const slot = nextWeekday(i + 4);
      const bookingId = new mongoose.Types.ObjectId();

      const reserved = await reservePackageCredit({
        packageId: minutesPkg._id,
        clientId: client._id,
        providerId: provider._id,
        duration: minutes,
        bookingId,
      });

      if (!reserved) {
        failures.push(`Minutes booking ${i + 1} (${minutes}min): reservation returned null`);
        allPassed = false;
        log(`  booking ${pad(i + 1)} ✗ ${minutes}min reservation FAILED`);
        continue;
      }

      const booking = await Booking.create({
        _id: bookingId,
        provider: provider._id,
        client: client._id,
        date: slot.toUTC().toJSDate(),
        localDate: slot.toFormat('yyyy-MM-dd'),
        startTime: slot.toFormat('HH:mm'),
        endTime: slot.plus({ minutes }).toFormat('HH:mm'),
        duration: minutes,
        location: {
          lat: 34.05, lng: -118.24,
          address: '200 Test Way, Los Angeles, CA 90001'
        },
        pricing: { basePrice: 0, addonsPrice: 0, totalPrice: 0 },
        paymentMethod: 'package',
        paymentStatus: 'paid',
        paidAt: new Date(),
        packageRedemption: {
          packagePurchase: minutesPkg._id,
          redeemedAt: new Date()
        },
        bookedBy: { name: 'Test Client', userId: client._id }
      });
      bookingIds.push(booking._id);

      const fresh = await PackagePurchase.findById(minutesPkg._id);
      const ok = fresh.minutesRemaining === expectedRemaining;
      if (!ok) {
        failures.push(
          `Minutes booking ${i + 1} (${minutes}min): expected remaining=${expectedRemaining}, ` +
          `got ${fresh.minutesRemaining}`
        );
        allPassed = false;
      }

      log(
        `  booking ${pad(i + 1)} ${ok ? '✓' : '✗'} ` +
        `${pad(minutes)}min  →  ` +
        `used=${fresh.minutesUsed}/${fresh.minutesTotal}  ` +
        `remaining=${fresh.minutesRemaining}` +
        (ok ? '' : `  (expected ${expectedRemaining})`)
      );
    }

    // ── Step 7: insufficient-capacity guard for minutes-mode ────────
    log('\nStep 7: try to book 60 minutes against an empty pool — expected to FAIL');
    const minOverflow = await reservePackageCredit({
      packageId: minutesPkg._id,
      clientId: client._id,
      providerId: provider._id,
      duration: 60,
      bookingId: new mongoose.Types.ObjectId(),
    });
    if (minOverflow === null) {
      log('  ✓ 60-min reservation correctly rejected (pool exhausted)');
    } else {
      failures.push('Minutes overflow reservation succeeded — capacity check broken');
      allPassed = false;
      log('  ✗ 60-min reservation should have FAILED but returned a doc');
    }

    // ── Step 8: partial-capacity edge — 90 min against 75 remaining ─
    log('\nStep 8: refresh pool to 75 remaining, try to book 90 — expected to FAIL');
    // Roll back the most recent redemption (the 75-min one) to put the pool
    // back at 75 remaining without re-creating the package.
    const lastRedemption = (await PackagePurchase.findById(minutesPkg._id))
      .redemptions.slice(-1)[0];
    await PackagePurchase.updateOne(
      { _id: minutesPkg._id },
      { $pull: { redemptions: { _id: lastRedemption._id } } }
    );
    // Also delete that booking from the cleanup queue (it's orphaned now)
    const orphanBookingId = lastRedemption.booking;
    await Booking.deleteOne({ _id: orphanBookingId });
    bookingIds.splice(bookingIds.indexOf(orphanBookingId), 1);

    const refreshed = await PackagePurchase.findById(minutesPkg._id);
    log(`  pool restored: remaining=${refreshed.minutesRemaining}`);
    const partialOverflow = await reservePackageCredit({
      packageId: minutesPkg._id,
      clientId: client._id,
      providerId: provider._id,
      duration: 90,
      bookingId: new mongoose.Types.ObjectId(),
    });
    if (partialOverflow === null) {
      log('  ✓ 90-min reservation correctly rejected (only 75 remaining)');
    } else {
      failures.push('Partial-capacity reservation succeeded — should have failed');
      allPassed = false;
      log('  ✗ 90-min reservation should have FAILED but returned a doc');
    }

    // And the 75 should still succeed at exactly the boundary
    const exactFit = await reservePackageCredit({
      packageId: minutesPkg._id,
      clientId: client._id,
      providerId: provider._id,
      duration: 75,
      bookingId: new mongoose.Types.ObjectId(),
    });
    if (exactFit) {
      log('  ✓ 75-min reservation succeeded at exact boundary');
      // Cleanup will sweep this redemption via the package delete
    } else {
      failures.push('Boundary reservation (75 of 75) failed — should have succeeded');
      allPassed = false;
      log('  ✗ 75-min reservation should have SUCCEEDED');
    }

  } catch (err) {
    allPassed = false;
    failures.push(`Unexpected error: ${err.message}`);
    log('\n✗ Unexpected error during test:', err.message);
    if (err.stack) console.error(err.stack);
  } finally {
    // ── Cleanup ─────────────────────────────────────────────────────
    log('\nCleanup: removing all test data');
    try {
      if (bookingIds.length > 0) {
        const r = await Booking.deleteMany({ _id: { $in: bookingIds } });
        log(`  bookings deleted:  ${r.deletedCount}`);
      }
      if (pkg) {
        await PackagePurchase.deleteOne({ _id: pkg._id });
        log(`  package deleted:   ${pkg._id}`);
      }
      if (client) {
        await User.deleteOne({ _id: client._id });
        log(`  client deleted:    ${client._id}`);
      }
      if (provider) {
        await User.deleteOne({ _id: provider._id });
        log(`  provider deleted:  ${provider._id}`);
      }

      // Belt and suspenders — sweep anything else tagged. Strictly
      // scoped: only docs whose email matches the test tag, or whose
      // provider/client matches one of the test user IDs we created
      // this run. Never an unconstrained deleteMany.
      const tagRegex = new RegExp(TEST_TAG.replace('.', '\\.') + '$');
      const sweepUsers = await User.deleteMany({ email: tagRegex });
      log(`  test-tag user sweep: ${sweepUsers.deletedCount} extra removed`);

      const ownerIds = [
        ...(client ? [client._id] : []),
        ...(provider ? [provider._id] : [])
      ];
      if (ownerIds.length > 0) {
        const sweepBookings = await Booking.deleteMany({
          $or: [
            { client: { $in: ownerIds } },
            { provider: { $in: ownerIds } }
          ]
        });
        const sweepPkgs = await PackagePurchase.deleteMany({
          $or: [
            { client: { $in: ownerIds } },
            { provider: { $in: ownerIds } }
          ]
        });
        log(`  test-owner booking sweep: ${sweepBookings.deletedCount} extra removed`);
        log(`  test-owner package sweep: ${sweepPkgs.deletedCount} extra removed`);
      }
    } catch (cleanupErr) {
      log(`  ! cleanup error: ${cleanupErr.message}`);
    }

    log('\n─────────────────────────────────────────────────────────────');
    if (allPassed) {
      log('RESULT: ✓ ALL CHECKS PASSED — package deductions working correctly');
    } else {
      log('RESULT: ✗ FAILURES DETECTED:');
      failures.forEach(f => log(`  - ${f}`));
    }

    await mongoose.disconnect();
    process.exit(allPassed ? 0 : 1);
  }
})();
