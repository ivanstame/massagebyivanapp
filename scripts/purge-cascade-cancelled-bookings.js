// One-shot cleanup. Before the series-cancellation rework, ending a
// recurring series soft-cancelled every future occurrence as a Booking
// row with status='cancelled'. Those rows are now structural noise: the
// series doc itself records the cancellation, the individual rows add
// nothing.
//
// This script finds all RecurringSeries where status='cancelled' and
// hard-deletes any Booking still pointing at them that:
//   - is also status='cancelled' (was killed by the cascade), AND
//   - is dated >= the series cancelledAt minus 1 day (was a future
//     occurrence at the time the series was killed, not a real past
//     event the client actually attended/individually cancelled).
//
// Run via: heroku run node scripts/purge-cascade-cancelled-bookings.js
//
// Safe to run multiple times — idempotent. Prints a per-series report.

require('dotenv').config();
const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const RecurringSeries = require('../server/models/RecurringSeries');
const Booking = require('../server/models/Booking');
const PackagePurchase = require('../server/models/PackagePurchase');

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB.');

  const cancelledSeries = await RecurringSeries.find({ status: 'cancelled' });
  console.log(`Found ${cancelledSeries.length} cancelled series.`);

  let totalDeleted = 0;
  for (const s of cancelledSeries) {
    if (!s.cancelledAt) {
      console.log(`  - Series ${s._id}: no cancelledAt — skipping (can't safely classify rows).`);
      continue;
    }
    const cancelDayMinus1 = DateTime.fromJSDate(s.cancelledAt)
      .setZone('America/Los_Angeles')
      .minus({ days: 1 })
      .toFormat('yyyy-MM-dd');

    const cascadeRows = await Booking.find({
      series: s._id,
      status: 'cancelled',
      localDate: { $gte: cancelDayMinus1 },
    });

    if (cascadeRows.length === 0) {
      console.log(`  - Series ${s._id}: nothing to clean.`);
      continue;
    }

    for (const b of cascadeRows) {
      // Pull any orphaned package redemptions pointing at this booking.
      if (b.packageRedemption?.packagePurchase) {
        await PackagePurchase.updateOne(
          { _id: b.packageRedemption.packagePurchase },
          { $pull: { redemptions: { booking: b._id } } }
        );
      }
      await Booking.deleteOne({ _id: b._id });
      totalDeleted += 1;
    }
    const ds = DateTime.fromJSDate(s.cancelledAt)
      .setZone('America/Los_Angeles')
      .toFormat('yyyy-MM-dd');
    console.log(`  - Series ${s._id} (cancelled ${ds}): deleted ${cascadeRows.length} cascade rows.`);
  }

  console.log(`\nDone. Hard-deleted ${totalDeleted} cascade-cancelled booking rows.`);
  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
