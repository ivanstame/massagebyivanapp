#!/usr/bin/env node
// One-shot migration: drop the stale non-sparse `email_1` unique index on
// the users collection so Mongoose can recreate it as sparse (per the
// current schema), which is required for managed clients that don't have
// an email on file.
//
// Mongoose's autoIndex only creates missing indexes; it never drops and
// recreates an existing one when the schema's options change. So after the
// managed-client feature landed the prod DB kept the old non-sparse index,
// which rejects a second managed client with `{email: null}`.
//
// Run once with:
//   heroku run -a <app> node scripts/fix-email-index.js
//
// Safe to re-run — it detects if the current index is already sparse and
// exits without touching anything.

require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI env var is required');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    const users = mongoose.connection.collection('users');

    const indexes = await users.indexes();
    const emailIndex = indexes.find(i => i.name === 'email_1');

    if (!emailIndex) {
      console.log('email_1 index does not exist — nothing to drop.');
    } else if (emailIndex.sparse) {
      console.log('email_1 is already sparse — nothing to do.');
    } else {
      console.log('Dropping stale non-sparse email_1 index...');
      await users.dropIndex('email_1');
      console.log('Dropped.');
    }

    // Load the User model and let Mongoose (re)create indexes per the
    // current schema. `init()` waits for the indexes to finish building.
    const User = require('../server/models/User');
    console.log('Recreating indexes from current schema...');
    await User.init();
    console.log('Done.');

    const after = await users.indexes();
    const emailAfter = after.find(i => i.name === 'email_1');
    console.log('Final email_1 state:', emailAfter
      ? { name: emailAfter.name, sparse: !!emailAfter.sparse, unique: !!emailAfter.unique }
      : 'missing');

    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
})();
