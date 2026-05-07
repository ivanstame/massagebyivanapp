// One-shot migration: rewrite every Venmo-tagged value across the
// data model so the corresponding enums can be tightened to remove
// 'venmo' entirely.
//
// Coverage:
//   - Booking.paymentMethod === 'venmo' → 'cash'
//   - Booking.sessionPayments[].method === 'venmo' → 'cash'
//     (sessions-mode chains; per-session payment method)
//   - RecurringSeries.paymentMethod === 'venmo' → 'cash'
//   - RecurringSeries.sessions[].paymentMethod === 'venmo' → 'cash'
//   - User.providerProfile.acceptedPaymentMethods filter out 'venmo'
//   - User.providerProfile.venmoHandle → unset
//
// 'cash' chosen as the rewrite target because it represents "paid
// outside the platform" — closest semantic match to what a Venmo
// payment actually was. Counts/stats stay accurate; the booking just
// looks like a cash payment now.
//
// Run on Heroku:
//   heroku run --app=<app-name> node server/scripts/wipeVenmo.js
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

  // Use the raw collection driver so this works regardless of any
  // post-deploy enum tightening on the Mongoose schemas. The script
  // is meant to run BEFORE the schema removes 'venmo' from the enum
  // OR alongside it — either way, raw $set bypasses validation.
  const db = mongoose.connection.db;

  // Bookings
  const bRes1 = await db.collection('bookings').updateMany(
    { paymentMethod: 'venmo' },
    { $set: { paymentMethod: 'cash' } }
  );
  console.log(`Booking.paymentMethod 'venmo' → 'cash': ${bRes1.modifiedCount} rows`);

  const bRes2 = await db.collection('bookings').updateMany(
    { 'sessionPayments.method': 'venmo' },
    { $set: { 'sessionPayments.$[elem].method': 'cash' } },
    { arrayFilters: [{ 'elem.method': 'venmo' }] }
  );
  console.log(`Booking.sessionPayments.method 'venmo' → 'cash': ${bRes2.modifiedCount} rows`);

  // Recurring series
  const rRes1 = await db.collection('recurringseries').updateMany(
    { paymentMethod: 'venmo' },
    { $set: { paymentMethod: 'cash' } }
  );
  console.log(`RecurringSeries.paymentMethod 'venmo' → 'cash': ${rRes1.modifiedCount} rows`);

  const rRes2 = await db.collection('recurringseries').updateMany(
    { 'sessions.paymentMethod': 'venmo' },
    { $set: { 'sessions.$[elem].paymentMethod': 'cash' } },
    { arrayFilters: [{ 'elem.paymentMethod': 'venmo' }] }
  );
  console.log(`RecurringSeries.sessions.paymentMethod 'venmo' → 'cash': ${rRes2.modifiedCount} rows`);

  // Provider profiles
  const uRes1 = await db.collection('users').updateMany(
    { 'providerProfile.acceptedPaymentMethods': 'venmo' },
    { $pull: { 'providerProfile.acceptedPaymentMethods': 'venmo' } }
  );
  console.log(`User.providerProfile.acceptedPaymentMethods drop 'venmo': ${uRes1.modifiedCount} rows`);

  const uRes2 = await db.collection('users').updateMany(
    { 'providerProfile.venmoHandle': { $exists: true } },
    { $unset: { 'providerProfile.venmoHandle': '' } }
  );
  console.log(`User.providerProfile.venmoHandle removed: ${uRes2.modifiedCount} rows`);

  console.log('Done.');
  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
