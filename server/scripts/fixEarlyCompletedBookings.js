#!/usr/bin/env node
//
// Find bookings that were marked status='completed' BEFORE their
// scheduled start time and revert them to 'confirmed'. Caused by
// provider mistapping the Complete button (mistaking it for "mark
// paid") on the appointment-detail page. Server-side guard now
// prevents new occurrences; this script cleans up the existing data.
//
// Run on Heroku:
//   heroku run node server/scripts/fixEarlyCompletedBookings.js
//
// Reports what it would touch but doesn't write unless --apply is passed:
//   heroku run node server/scripts/fixEarlyCompletedBookings.js --apply

require('dotenv').config();
const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const Booking = require('../models/Booking');

const APPLY = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  // Only consider bookings the dashboard would currently misreport: the
  // start time is in the future (in the booking's own TZ) but status
  // already says 'completed'. Past completed bookings stay as-is —
  // those are legitimate closure events.
  const candidates = await Booking
    .find({ status: 'completed' })
    .select('_id localDate startTime timezone client recipientInfo completedAt')
    .lean();

  const toRevert = [];
  for (const b of candidates) {
    if (!b.localDate || !b.startTime) continue;
    const tz = b.timezone || 'America/Los_Angeles';
    const startsAt = DateTime.fromFormat(
      `${b.localDate} ${b.startTime}`,
      'yyyy-MM-dd HH:mm',
      { zone: tz }
    );
    if (!startsAt.isValid) continue;
    const now = DateTime.now().setZone(tz);
    if (now < startsAt) {
      toRevert.push({
        id: b._id,
        scheduledFor: startsAt.toFormat('ccc LLL d, h:mm a ZZZZ'),
        completedAt: b.completedAt,
      });
    }
  }

  console.log(`Found ${toRevert.length} early-completed booking(s):`);
  for (const r of toRevert) {
    console.log(`  ${r.id}  →  scheduled ${r.scheduledFor}  (completed at ${r.completedAt || 'unknown'})`);
  }

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to revert these to status=confirmed.');
    await mongoose.disconnect();
    return;
  }

  if (toRevert.length === 0) {
    console.log('Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  const ids = toRevert.map(r => r.id);
  const result = await Booking.updateMany(
    { _id: { $in: ids } },
    { $set: { status: 'confirmed' }, $unset: { completedAt: '' } }
  );
  console.log(`Reverted ${result.modifiedCount} booking(s) to status='confirmed'.`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
