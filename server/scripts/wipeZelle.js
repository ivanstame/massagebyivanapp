#!/usr/bin/env node
//
// Convert every 'zelle' payment-method reference in the database to
// 'paymentApp'. Zelle was its own enum value; folded into the generic
// 'paymentApp' bucket since they overlap and the dedicated entry was
// extra clutter on the booking form.
//
// Touches:
//   - Booking.paymentMethod === 'zelle' → 'paymentApp'
//   - Booking.sessionPayments[].method === 'zelle' → 'paymentApp'
//   - RecurringSeries.paymentMethod === 'zelle' → 'paymentApp'
//   - RecurringSeries.additionalSessions[].paymentMethod === 'zelle' → 'paymentApp'
//   - User.providerProfile.acceptedPaymentMethods: drop 'zelle', add 'paymentApp'
//
// Run on Heroku:
//   heroku run node server/scripts/wipeZelle.js

require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const bRes1 = await db.collection('bookings').updateMany(
    { paymentMethod: 'zelle' },
    { $set: { paymentMethod: 'paymentApp' } }
  );
  console.log(`Booking.paymentMethod 'zelle' → 'paymentApp': ${bRes1.modifiedCount} rows`);

  const bRes2 = await db.collection('bookings').updateMany(
    { 'sessionPayments.method': 'zelle' },
    { $set: { 'sessionPayments.$[elem].method': 'paymentApp' } },
    { arrayFilters: [{ 'elem.method': 'zelle' }] }
  );
  console.log(`Booking.sessionPayments.method 'zelle' → 'paymentApp': ${bRes2.modifiedCount} rows`);

  const rRes1 = await db.collection('recurringseries').updateMany(
    { paymentMethod: 'zelle' },
    { $set: { paymentMethod: 'paymentApp' } }
  );
  console.log(`RecurringSeries.paymentMethod 'zelle' → 'paymentApp': ${rRes1.modifiedCount} rows`);

  const rRes2 = await db.collection('recurringseries').updateMany(
    { 'additionalSessions.paymentMethod': 'zelle' },
    { $set: { 'additionalSessions.$[elem].paymentMethod': 'paymentApp' } },
    { arrayFilters: [{ 'elem.paymentMethod': 'zelle' }] }
  );
  console.log(`RecurringSeries.additionalSessions.paymentMethod 'zelle' → 'paymentApp': ${rRes2.modifiedCount} rows`);

  // Provider acceptedPaymentMethods: pull 'zelle', addToSet 'paymentApp'
  // (so providers who only accepted Zelle still have a valid method).
  const uPull = await db.collection('users').updateMany(
    { 'providerProfile.acceptedPaymentMethods': 'zelle' },
    { $pull: { 'providerProfile.acceptedPaymentMethods': 'zelle' } }
  );
  console.log(`User.acceptedPaymentMethods: removed 'zelle' from ${uPull.modifiedCount} provider(s)`);

  const uAdd = await db.collection('users').updateMany(
    {
      accountType: 'PROVIDER',
      'providerProfile.acceptedPaymentMethods': { $ne: 'paymentApp' },
    },
    { $addToSet: { 'providerProfile.acceptedPaymentMethods': 'paymentApp' } }
  );
  console.log(`User.acceptedPaymentMethods: added 'paymentApp' to ${uAdd.modifiedCount} provider(s)`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
