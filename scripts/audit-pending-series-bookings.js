// Read-only audit: count any future Booking with status='pending'
// that's part of a recurring series. The materializer creates new
// instances as 'confirmed', so any pending series instance is either
// from before that behavior was settled or got demoted by the
// reschedule flow (which has now been fixed). Worth knowing if any
// stragglers exist before deciding whether to auto-promote them.
//
// Run: heroku run node scripts/audit-pending-series-bookings.js -a massagebyivan

require('dotenv').config();
const mongoose = require('mongoose');
const Booking = require('../server/models/Booking');

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
  await mongoose.connect(uri);
  console.log('Connected to MongoDB\n');

  const now = new Date();
  const docs = await Booking.find({
    status: 'pending',
    series: { $ne: null },
    date: { $gte: now },
  })
    .populate('client', 'profile.fullName email')
    .populate('series', '_id status')
    .sort({ date: 1 })
    .lean();

  if (docs.length === 0) {
    console.log('No future pending series bookings — clean.');
  } else {
    console.log(`Found ${docs.length} future pending series booking(s):`);
    for (const b of docs) {
      const name = b.client?.profile?.fullName || b.client?.email || '(unknown)';
      console.log(`  ${b.localDate} ${b.startTime}  ${name}  series=${b.series?._id} (series status=${b.series?.status})`);
    }
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch(err => { console.error('Fatal:', err); process.exit(1); });
