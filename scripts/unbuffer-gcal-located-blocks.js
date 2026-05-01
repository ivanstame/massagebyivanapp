// Repair existing BlockedTime rows that were synced from Google Calendar
// with the old 15-min-each-side buffer. After the BUFFER_WITH_LOCATION
// change in services/googleCalendarSync.js, new rows land at the GCal
// event's actual times. This script unwinds the inflation on rows
// already on disk by adding 15 min to start and subtracting 15 min from
// end — the inverse of the old buffer math.
//
// Affects only rows where source=google_calendar AND location.lat is
// set (the same condition that triggered the old buffer).
//
// Idempotent via the `_unbufferedAt` marker. First run sets it; re-runs
// skip rows that already carry it. New post-fix sync rows are NOT
// marked, but they also don't need fixing — and their times don't match
// the old "buffered = real + 30 min" pattern either, so even if the
// marker is missing, the script's filter would still pick them up by
// mistake. To prevent that, we also bail out (with a warning) on any
// row whose duration is <= 30 min, since unbuffering it by another 30
// min would push start past end.
//
// Usage:
//   node scripts/unbuffer-gcal-located-blocks.js --dry-run
//   node scripts/unbuffer-gcal-located-blocks.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { DateTime } = require('luxon');

const DRY_RUN = process.argv.includes('--dry-run');
const FIFTEEN_MIN_MS = 15 * 60 * 1000;

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`\n=== unbuffer-gcal-located-blocks.js ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'} ===\n`);

  const col = mongoose.connection.collection('blockedtimes');

  // Filter: GCal-sourced, has a geocoded location, not already unbuffered.
  const rows = await col.find({
    source: 'google_calendar',
    'location.lat': { $ne: null },
    _unbufferedAt: { $exists: false },
  }).toArray();

  console.log(`Candidate rows: ${rows.length}`);

  const safe = [];
  const skipped = [];

  for (const r of rows) {
    const durationMs = new Date(r.end).getTime() - new Date(r.start).getTime();
    if (durationMs <= 30 * 60 * 1000) {
      // Row is too short to have been buffered with +15/+15. Most likely
      // it was created post-fix, or it's a manually-edited row. Skip.
      skipped.push({ row: r, reason: `duration ${Math.round(durationMs / 60000)}min <= 30min` });
      continue;
    }
    safe.push(r);
  }

  console.log(`Safe to unbuffer: ${safe.length}`);
  console.log(`Skipped (likely already correct): ${skipped.length}\n`);

  for (const r of safe) {
    const oldStart = DateTime.fromJSDate(r.start).setZone('America/Los_Angeles').toFormat('yyyy-MM-dd HH:mm');
    const oldEnd = DateTime.fromJSDate(r.end).setZone('America/Los_Angeles').toFormat('HH:mm');
    const newStart = DateTime.fromJSDate(new Date(r.start.getTime() + FIFTEEN_MIN_MS))
      .setZone('America/Los_Angeles').toFormat('yyyy-MM-dd HH:mm');
    const newEnd = DateTime.fromJSDate(new Date(r.end.getTime() - FIFTEEN_MIN_MS))
      .setZone('America/Los_Angeles').toFormat('HH:mm');
    console.log(`  ${oldStart}-${oldEnd}  →  ${newStart}-${newEnd}  (provider=${r.provider})`);
  }

  if (skipped.length > 0) {
    console.log('\nSkipped rows:');
    for (const s of skipped) {
      const startStr = DateTime.fromJSDate(s.row.start).setZone('America/Los_Angeles').toFormat('yyyy-MM-dd HH:mm');
      console.log(`  ${startStr}  provider=${s.row.provider}  reason=${s.reason}`);
    }
  }

  if (DRY_RUN) {
    console.log('\nDry run — no writes performed.');
    await mongoose.disconnect();
    return;
  }

  if (safe.length === 0) {
    console.log('\nNothing to repair.');
    await mongoose.disconnect();
    return;
  }

  let updated = 0;
  const now = new Date();
  for (const r of safe) {
    const newStart = new Date(r.start.getTime() + FIFTEEN_MIN_MS);
    const newEnd = new Date(r.end.getTime() - FIFTEEN_MIN_MS);
    const newLocalDate = DateTime.fromJSDate(newStart).setZone('America/Los_Angeles').toFormat('yyyy-MM-dd');
    const result = await col.updateOne(
      { _id: r._id },
      {
        $set: {
          start: newStart,
          end: newEnd,
          localDate: newLocalDate,
          _unbufferedAt: now,
        },
      }
    );
    if (result.modifiedCount === 1) updated++;
  }
  console.log(`\nUpdated: ${updated}`);

  await mongoose.disconnect();
  console.log('Done.');
})().catch(e => { console.error(e); process.exit(1); });
