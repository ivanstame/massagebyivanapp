// One-shot migration: drop the legacy `anchor` field from every
// Availability and WeeklyTemplate row.
//
// Anchor was a fixed-location sub-window on top of mobile blocks.
// We're ripping the concept out — for a pure mobile day the only
// fixed point is home base, and the anchor's existence kept producing
// surprising visuals and invariants. Static-mode blocks (the whole
// day at a fixed studio) carry the location via `staticLocation`
// instead and are unaffected by this migration.
//
// Run on Heroku:
//   heroku run --app=<app-name> node server/scripts/wipeAnchor.js
//
// Idempotent: re-running finds nothing to update.

require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set'); process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to Mongo');

  const db = mongoose.connection.db;

  const aRes = await db.collection('availabilities').updateMany(
    { anchor: { $exists: true } },
    { $unset: { anchor: '' } }
  );
  console.log(`Availability.anchor unset: ${aRes.modifiedCount} rows`);

  const wRes = await db.collection('weeklytemplates').updateMany(
    { anchor: { $exists: true } },
    { $unset: { anchor: '' } }
  );
  console.log(`WeeklyTemplate.anchor unset: ${wRes.modifiedCount} rows`);

  console.log('Done.');
  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
