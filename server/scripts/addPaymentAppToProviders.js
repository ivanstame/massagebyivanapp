#!/usr/bin/env node
//
// Add 'paymentApp' to every existing provider's acceptedPaymentMethods
// list so the new generic-payment-app option (Zelle, Venmo, Cash App,
// etc.) becomes selectable on the booking form. Skips providers who
// already have it.
//
// New providers get it via the schema default — this script only
// matters for existing rows (Ivan, Jordie, etc).
//
// Run on Heroku:
//   heroku run node server/scripts/addPaymentAppToProviders.js

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const result = await User.updateMany(
    {
      accountType: 'PROVIDER',
      'providerProfile.acceptedPaymentMethods': { $ne: 'paymentApp' },
    },
    {
      $addToSet: { 'providerProfile.acceptedPaymentMethods': 'paymentApp' },
    }
  );

  console.log(`Added 'paymentApp' to ${result.modifiedCount} provider(s).`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
