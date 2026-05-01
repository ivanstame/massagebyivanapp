// Dedupe Availability rows where (provider, localDate, source='template')
// has more than one row, then create a partial unique index so the
// generateFromTemplate race can't recreate duplicates.
//
// Background. `generateFromTemplate` (server/routes/availability.js)
// dedups via findOne+create, which is not atomic — two concurrent
// /blocks/:date requests can each see "no existing template row" and
// both insert. We saw this in production (Fri 2026-05-01 had two
// identical template rows). The schema-level unique index closes the
// race at the DB layer.
//
// Manual blocks can legitimately have multiple rows per (provider,
// localDate) — non-overlapping windows on the same day — so the index
// is partial: only enforced where source='template'.
//
// Idempotent. Safe to re-run.
//
// Usage:
//   node scripts/dedupe-template-availability.js --dry-run
//   node scripts/dedupe-template-availability.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const DRY_RUN = process.argv.includes('--dry-run');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`\n=== dedupe-template-availability.js ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'} ===\n`);

  const col = mongoose.connection.collection('availabilities');

  // Find groups of (provider, localDate) where source='template' has >1 row.
  const dupGroups = await col.aggregate([
    { $match: { source: 'template' } },
    { $group: {
        _id: { provider: '$provider', localDate: '$localDate' },
        ids: { $push: '$_id' },
        count: { $sum: 1 }
    } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();

  console.log(`Duplicate groups found: ${dupGroups.length}`);
  let totalToDelete = 0;
  for (const g of dupGroups) {
    // Keep the oldest (lowest ObjectId — created first), delete the rest.
    const sorted = g.ids.slice().sort((a, b) => a.toString().localeCompare(b.toString()));
    const keep = sorted[0];
    const drop = sorted.slice(1);
    totalToDelete += drop.length;
    console.log(
      `  - provider=${g._id.provider} localDate=${g._id.localDate}: ${g.count} rows; keep ${keep}, drop ${drop.length}`
    );
  }
  console.log(`\nTotal rows to delete: ${totalToDelete}`);

  if (!DRY_RUN && totalToDelete > 0) {
    let deleted = 0;
    for (const g of dupGroups) {
      const sorted = g.ids.slice().sort((a, b) => a.toString().localeCompare(b.toString()));
      const drop = sorted.slice(1);
      const result = await col.deleteMany({ _id: { $in: drop } });
      deleted += result.deletedCount;
    }
    console.log(`Deleted: ${deleted}`);
  }

  // Index management. Drop and recreate so re-runs reconcile shape changes.
  const partialIndexName = 'provider_1_localDate_1_template_unique';
  const existingIndexes = await col.indexes();
  const existing = existingIndexes.find(idx => idx.name === partialIndexName);

  console.log(`\nPartial unique index '${partialIndexName}': ${existing ? 'present' : 'missing'}`);

  if (DRY_RUN) {
    if (!existing) console.log('Would create the partial unique index on live run.');
    console.log('\nDry run complete — no writes performed.');
    await mongoose.disconnect();
    return;
  }

  if (!existing) {
    try {
      await col.createIndex(
        { provider: 1, localDate: 1 },
        {
          name: partialIndexName,
          unique: true,
          partialFilterExpression: { source: 'template' },
        }
      );
      console.log(`Created index ${partialIndexName}.`);
    } catch (err) {
      console.error(`Failed to create index: ${err.message}`);
      console.error('There may still be duplicates. Re-run with --dry-run to inspect.');
      process.exitCode = 1;
    }
  }

  await mongoose.disconnect();
  console.log('\nDone.');
})().catch(e => { console.error(e); process.exit(1); });
