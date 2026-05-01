// Idempotent one-shot: clear stray anchor data on static-mode WeeklyTemplate
// rows and their materialized Availability rows.
//
// Background. The original WeeklyTemplate save path didn't clear the anchor
// when the provider switched a day from mobile to in-studio, so static days
// kept the leftover departure-location anchor (typically Home). The
// materializer then propagated that anchor to every Availability row,
// where DaySchedule rendered it as a "Fixed" overlay (z-10) sitting on
// top of the in-studio block — visually obscuring the static rendering.
//
// The save and materialization paths are now both fixed (commits in this
// branch). This script repairs the data already on disk.
//
// Idempotent: targets only rows that currently have BOTH kind=static AND
// anchor.locationId set. Re-running after the first pass is a no-op.
//
// Usage:
//   node scripts/clear-static-day-anchors.js --dry-run    # report only
//   node scripts/clear-static-day-anchors.js              # apply

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const DRY_RUN = process.argv.includes('--dry-run');

const NULL_ANCHOR_TEMPLATE = {
  locationId: null,
  startTime: null,
  endTime: null,
};

const NULL_ANCHOR_AVAILABILITY = {
  locationId: null,
  name: null,
  address: null,
  lat: null,
  lng: null,
  startTime: null,
  endTime: null,
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`\n=== clear-static-day-anchors.js ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'} ===\n`);

  const tplCol = mongoose.connection.collection('weeklytemplates');
  const availCol = mongoose.connection.collection('availabilities');

  // WeeklyTemplate rows with kind=static AND a stray anchor.
  const badTemplates = await tplCol.find({
    kind: 'static',
    'anchor.locationId': { $ne: null },
  }).toArray();
  console.log(`WeeklyTemplate rows to fix: ${badTemplates.length}`);
  for (const t of badTemplates) {
    console.log(
      `  - provider=${t.provider} dayOfWeek=${t.dayOfWeek} anchor.locationId=${t.anchor?.locationId} ` +
      `staticLocation=${t.staticLocation}`
    );
  }

  // Availability rows with kind=static AND a stray anchor.
  const badAvail = await availCol.find({
    kind: 'static',
    'anchor.locationId': { $ne: null },
  }).toArray();
  console.log(`\nAvailability rows to fix: ${badAvail.length}`);
  for (const a of badAvail) {
    console.log(
      `  - provider=${a.provider} localDate=${a.localDate} source=${a.source} ` +
      `anchor.locationId=${a.anchor?.locationId} staticLocation=${a.staticLocation}`
    );
  }

  if (DRY_RUN) {
    console.log('\nDry run — no writes performed. Re-run without --dry-run to apply.');
    await mongoose.disconnect();
    return;
  }

  if (badTemplates.length === 0 && badAvail.length === 0) {
    console.log('\nNothing to repair.');
    await mongoose.disconnect();
    return;
  }

  const tplResult = await tplCol.updateMany(
    { kind: 'static', 'anchor.locationId': { $ne: null } },
    { $set: { anchor: NULL_ANCHOR_TEMPLATE } }
  );
  console.log(`\nWeeklyTemplate updated: ${tplResult.modifiedCount}`);

  const availResult = await availCol.updateMany(
    { kind: 'static', 'anchor.locationId': { $ne: null } },
    { $set: { anchor: NULL_ANCHOR_AVAILABILITY } }
  );
  console.log(`Availability updated: ${availResult.modifiedCount}`);

  await mongoose.disconnect();
  console.log('\nDone.');
})().catch(e => { console.error(e); process.exit(1); });
