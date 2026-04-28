// One-shot fix for David Rodriguez's missed package redemption.
//
// Background: a 90-min booking was created for David on 2026-04-28 at
// 21:15 ($175 cash, paymentMethod=cash) when it should have been paid
// via his minutes-mode package. The provider-on-behalf booking flow
// wasn't fetching the target client's packages, so the "Use package"
// option never appeared. Code is fixed forward in BookingForm_updated.js
// — this script repairs the orphan booking after the fact.
//
// Concrete actions:
//   1. Locate David's user doc by phone (7149141718) — unambiguous match
//   2. Find his minutes-mode package
//   3. Find his most recent paymentMethod=cash, packageRedemption=null
//      booking (id from logs: 69f147d8f33d11000210c571)
//   4. Update booking: paymentMethod=package, paymentStatus=paid,
//      paidAt=now, packageRedemption.{packagePurchase, redeemedAt}
//   5. Push redemption sub-doc onto the package's redemptions array
//
// Idempotent: if the booking already has a packageRedemption set, exits
// without changes. Run via:
//   heroku run node scripts/repair-david-rodriguez-redemption.js -a massagebyivan

require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../server/models/User');
const Booking = require('../server/models/Booking');
const PackagePurchase = require('../server/models/PackagePurchase');

const TARGET_BOOKING_ID = '69f147d8f33d11000210c571'; // from heroku logs
const DAVID_PHONE = '7149141718';

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
  await mongoose.connect(uri);
  console.log('Connected to MongoDB\n');

  try {
    const david = await User.findOne({
      'profile.phoneNumber': DAVID_PHONE,
      'profile.fullName': /David/i,
      accountType: 'CLIENT',
    });
    if (!david) {
      console.error(`Could not find David Rodriguez by phone ${DAVID_PHONE}`);
      process.exit(1);
    }
    console.log(`Found David: ${david._id} (${david.profile.fullName})`);

    const booking = await Booking.findById(TARGET_BOOKING_ID);
    if (!booking) {
      console.error(`Booking ${TARGET_BOOKING_ID} not found`);
      process.exit(1);
    }
    if (!booking.client.equals(david._id)) {
      console.error(`Booking client ${booking.client} does not match David ${david._id}`);
      process.exit(1);
    }

    if (booking.packageRedemption?.packagePurchase) {
      console.log(`Booking ${booking._id} already has a package redemption — nothing to do.`);
      console.log(`  packagePurchase: ${booking.packageRedemption.packagePurchase}`);
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log(`Booking ${booking._id}: ${booking.duration}min on ${booking.localDate} ${booking.startTime}, paymentMethod=${booking.paymentMethod}`);

    // Find David's minutes-mode package with capacity for the booking
    const packages = await PackagePurchase.find({
      client: david._id,
      provider: booking.provider,
      kind: 'minutes',
      paymentStatus: 'paid',
      cancelledAt: null,
    });

    if (packages.length === 0) {
      console.error('No active minutes-mode packages found for David');
      process.exit(1);
    }

    // Pick the package with enough remaining minutes
    const fit = packages.find(p => p.minutesRemaining >= booking.duration);
    if (!fit) {
      console.error(`No package with ≥${booking.duration} minutes remaining`);
      packages.forEach(p => console.error(`  ${p._id}: ${p.minutesRemaining}/${p.minutesTotal} minutes left`));
      process.exit(1);
    }
    console.log(`Selected package ${fit._id} — ${fit.minutesRemaining}/${fit.minutesTotal} min before, ${fit.minutesRemaining - booking.duration}/${fit.minutesTotal} after`);

    // Atomically push the redemption + capacity check (re-using the
    // production reservePackageCredit-equivalent so we don't blow past
    // the limit if there's any concurrent redemption).
    const updated = await PackagePurchase.findOneAndUpdate(
      {
        _id: fit._id,
        kind: 'minutes',
        paymentStatus: 'paid',
        cancelledAt: null,
        $expr: {
          $gte: [
            {
              $subtract: [
                { $subtract: ['$minutesTotal', { $ifNull: ['$preConsumedMinutes', 0] }] },
                {
                  $sum: {
                    $map: {
                      input: { $filter: { input: '$redemptions', as: 'r', cond: { $eq: ['$$r.returnedAt', null] } } },
                      as: 'r',
                      in: { $ifNull: ['$$r.minutesConsumed', 0] },
                    },
                  },
                },
              ],
            },
            booking.duration,
          ],
        },
      },
      { $push: { redemptions: { booking: booking._id, minutesConsumed: booking.duration, redeemedAt: new Date() } } },
      { new: true }
    );

    if (!updated) {
      console.error('Reservation aggregation failed — capacity check refused');
      process.exit(1);
    }
    console.log(`Package after reservation: ${updated.minutesRemaining}/${updated.minutesTotal} minutes left`);

    booking.paymentMethod = 'package';
    booking.paymentStatus = 'paid';
    booking.paidAt = new Date();
    booking.packageRedemption = {
      packagePurchase: fit._id,
      redeemedAt: new Date(),
    };
    await booking.save();
    console.log(`Booking ${booking._id} updated: paymentMethod=package, redemption attached`);

    console.log('\n✓ Done. David should now show 270/450 minutes remaining.');
  } catch (err) {
    console.error('Fatal:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
})();
