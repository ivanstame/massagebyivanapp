// One-shot migration: collapse StaticLocation rows into SavedLocation
// rows tagged isStaticLocation:true. Then rewrite any
// Availability.staticLocation / WeeklyTemplate.staticLocation
// references to point at the new SavedLocation _id.
//
// Idempotent — safe to run multiple times. Uses an _origStaticId tag
// on the migrated SavedLocation so re-runs detect "already migrated"
// rows and skip them.
//
// Run: heroku run node scripts/migrate-static-to-saved-locations.js -a massagebyivan

require('dotenv').config();
const mongoose = require('mongoose');

const SavedLocation = require('../server/models/SavedLocation');
const Availability = require('../server/models/Availability');
const WeeklyTemplate = require('../server/models/WeeklyTemplate');

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log('Connected to MongoDB\n');

  // Pull StaticLocation rows directly via the raw collection — the
  // model file may be deleted by the time this script runs in prod.
  const StaticCollection = mongoose.connection.db.collection('staticlocations');
  const staticDocs = await StaticCollection.find({}).toArray();
  console.log(`Found ${staticDocs.length} StaticLocation row(s)`);

  if (staticDocs.length === 0) {
    console.log('Nothing to migrate. Disconnecting.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // Build map: old StaticLocation _id (string) → new SavedLocation _id
  const idMap = {};
  let created = 0;
  let reused = 0;

  for (const sd of staticDocs) {
    const oldIdStr = sd._id.toString();

    // Did we already migrate this one in a prior run?
    const alreadyMigrated = await SavedLocation.findOne({ _origStaticId: oldIdStr });
    if (alreadyMigrated) {
      idMap[oldIdStr] = alreadyMigrated._id;
      reused++;
      console.log(`  reused: ${sd.name} → ${alreadyMigrated._id} (already migrated)`);
      continue;
    }

    // Is there already a SavedLocation at this address (by lat/lng) for
    // this provider? If so, just promote it — no new row needed.
    let target = await SavedLocation.findOne({
      provider: sd.provider,
      lat: sd.lat,
      lng: sd.lng
    });

    if (target) {
      target.isStaticLocation = true;
      target.staticConfig = {
        bufferMinutes: sd.bufferMinutes ?? 15,
        useMobilePricing: !!sd.useMobilePricing,
        pricing: Array.isArray(sd.pricing) ? sd.pricing : []
      };
      // Tag for idempotency
      target.set('_origStaticId', oldIdStr);
      await target.save();
      idMap[oldIdStr] = target._id;
      reused++;
      console.log(`  promoted existing SavedLocation: ${target.name} (${target._id})`);
    } else {
      // Create a new SavedLocation from the StaticLocation data
      const fresh = await SavedLocation.create({
        provider: sd.provider,
        name: sd.name,
        address: sd.address,
        lat: sd.lat,
        lng: sd.lng,
        isHomeBase: false,
        isStaticLocation: true,
        staticConfig: {
          bufferMinutes: sd.bufferMinutes ?? 15,
          useMobilePricing: !!sd.useMobilePricing,
          pricing: Array.isArray(sd.pricing) ? sd.pricing : []
        },
        _origStaticId: oldIdStr
      });
      idMap[oldIdStr] = fresh._id;
      created++;
      console.log(`  created SavedLocation: ${fresh.name} (${fresh._id})`);
    }
  }

  // Rewrite references on Availability and WeeklyTemplate
  console.log('\nRewriting references...');
  let availUpdates = 0;
  let templateUpdates = 0;
  for (const [oldIdStr, newId] of Object.entries(idMap)) {
    const r1 = await Availability.updateMany(
      { staticLocation: new mongoose.Types.ObjectId(oldIdStr) },
      { $set: { staticLocation: newId } }
    );
    availUpdates += r1.modifiedCount || 0;
    const r2 = await WeeklyTemplate.updateMany(
      { staticLocation: new mongoose.Types.ObjectId(oldIdStr) },
      { $set: { staticLocation: newId } }
    );
    templateUpdates += r2.modifiedCount || 0;
  }
  console.log(`  Availability docs updated: ${availUpdates}`);
  console.log(`  WeeklyTemplate docs updated: ${templateUpdates}`);

  console.log('\n--- summary ---');
  console.log(`StaticLocation rows scanned: ${staticDocs.length}`);
  console.log(`SavedLocation rows created:  ${created}`);
  console.log(`SavedLocation rows reused:   ${reused}`);
  console.log(`Availability refs rewritten: ${availUpdates}`);
  console.log(`Template refs rewritten:     ${templateUpdates}`);
  console.log('\nThe staticlocations collection is left in place. After verifying the');
  console.log('migration, drop it manually with: db.staticlocations.drop()');

  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
