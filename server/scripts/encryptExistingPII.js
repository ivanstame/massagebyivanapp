// One-shot migration: encrypt the PII fields on every existing User
// row that's still plaintext. Safe to re-run — encryption is
// idempotent (already-encrypted values pass through).
//
// Run on Heroku:
//   heroku run --app=<app-name> node server/scripts/encryptExistingPII.js
//
// Run locally (against MONGODB_URI in .env):
//   node server/scripts/encryptExistingPII.js
//
// Required env: MONGODB_URI, FIELD_ENCRYPTION_KEY.

require('dotenv').config();
const mongoose = require('mongoose');
const { isEncrypted } = require('../utils/fieldCrypto');

(async () => {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set'); process.exit(1);
  }
  if (!process.env.FIELD_ENCRYPTION_KEY) {
    console.error('FIELD_ENCRYPTION_KEY not set'); process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to Mongo');

  const User = require('../models/User');

  // The five string fields wired with set/get in the schema. Listed
  // by dot-path so we can read raw + check + re-set in a loop.
  const ENCRYPTED_FIELDS = [
    'providerProfile.googleCalendar.accessToken',
    'providerProfile.googleCalendar.refreshToken',
    'clientProfile.notes',
    'profile.treatmentPreferences.notes',
    'profile.treatmentPreferences.oilSensitivities',
  ];

  const cursor = User.find({}).cursor();
  let scanned = 0;
  let updated = 0;
  let alreadyEncrypted = 0;

  for await (const user of cursor) {
    scanned++;
    let changed = false;

    for (const path of ENCRYPTED_FIELDS) {
      // Read the raw stored value (no getters) so we can tell if it's
      // already been encrypted. Mongoose .get with { getters: false }
      // returns the stored value untransformed.
      const raw = user.get(path, null, { getters: false });
      if (typeof raw !== 'string' || raw.length === 0) continue;
      if (isEncrypted(raw)) {
        alreadyEncrypted++;
        continue;
      }
      // Re-set via the schema setter — encryption fires on save.
      // Read the plaintext (no getters means the legacy value),
      // set it back: setter runs, value gets encrypted.
      user.set(path, raw);
      user.markModified(path);
      changed = true;
    }

    if (changed) {
      try {
        await user.save({ validateModifiedOnly: true });
        updated++;
        if (updated % 50 === 0) {
          console.log(`Progress: ${updated} updated / ${scanned} scanned`);
        }
      } catch (err) {
        console.error(`Save failed for user ${user._id}: ${err.message}`);
      }
    }
  }

  console.log(`Done: scanned=${scanned}, updated=${updated}, alreadyEncrypted=${alreadyEncrypted}`);
  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
