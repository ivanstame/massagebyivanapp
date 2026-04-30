// One-shot migration: convert every PackagePurchase from sessions-mode
// to minutes-pool form, preserving the marketing framing in displayPack.
//
// Why: post-Apr-2026, all newly-created purchases land as minutes pools
// (so a 5×90 buyer can spend a credit on a 60-min session). Existing
// sessions-mode purchases stay locked unless we migrate them. This script
// walks every kind:'sessions' purchase and rewrites it in place:
//
//   sessionsTotal       (kept for audit; unused for math afterward)
//   sessionDuration     (kept for audit; unused for math afterward)
//   kind                'sessions' → 'minutes'
//   minutesTotal        sessionsTotal × sessionDuration
//   preConsumedMinutes  preConsumedSessions × sessionDuration
//   displayPack         { sessions, sessionDuration }   ← snapshot for UI
//   redemptions[i].minutesConsumed
//                       backfilled from booking.duration (populated)
//
// Idempotent: skips any purchase already in minutes-mode. Safe to re-run.
//
// Usage:
//   heroku run node scripts/migrate-sessions-to-minutes.js --dry-run -a massagebyivan
//   heroku run node scripts/migrate-sessions-to-minutes.js -a massagebyivan

require('dotenv').config();
const mongoose = require('mongoose');

const PackagePurchase = require('../server/models/PackagePurchase');

const DRY_RUN = process.argv.includes('--dry-run');

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
  await mongoose.connect(uri);
  console.log(`Connected to MongoDB${DRY_RUN ? ' (DRY-RUN)' : ''}\n`);

  let scanned = 0;
  let migrated = 0;
  let skippedAlready = 0;
  let warnings = 0;

  try {
    const cursor = PackagePurchase
      .find({ kind: 'sessions' })
      .populate('redemptions.booking', 'duration')
      .cursor();

    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
      scanned++;

      // Idempotency: only sessions-mode rows reach here, but be defensive.
      if (doc.kind !== 'sessions') {
        skippedAlready++;
        continue;
      }

      const sessionsTotal = Number(doc.sessionsTotal) || 0;
      const sessionDuration = Number(doc.sessionDuration) || 0;
      if (!sessionsTotal || !sessionDuration) {
        console.warn(`! ${doc._id}: missing sessionsTotal/sessionDuration; skipping`);
        warnings++;
        continue;
      }

      const newMinutesTotal = sessionsTotal * sessionDuration;
      const preConsumedSessions = Number(doc.preConsumedSessions) || 0;
      const newPreConsumedMinutes = preConsumedSessions * sessionDuration;

      // Backfill minutesConsumed on each redemption from the booking's
      // duration. If the booking is gone (referenced doc deleted), leave
      // 0 and warn — operator can fix manually.
      let redemptionWarnings = 0;
      for (const r of doc.redemptions) {
        if (r.minutesConsumed > 0) continue; // already populated, leave alone
        const b = r.booking && typeof r.booking === 'object' ? r.booking : null;
        if (b && Number.isFinite(b.duration) && b.duration > 0) {
          r.minutesConsumed = b.duration;
        } else {
          // Best effort: assume the original session length.
          r.minutesConsumed = sessionDuration;
          redemptionWarnings++;
        }
      }
      if (redemptionWarnings > 0) {
        console.warn(`  ~ ${doc._id}: ${redemptionWarnings} redemption(s) missing booking ref; defaulted to sessionDuration`);
        warnings += redemptionWarnings;
      }

      const summary =
        `${doc._id}  ${sessionsTotal}×${sessionDuration} ` +
        `→ ${newMinutesTotal}-min pool` +
        (preConsumedSessions > 0 ? ` (preConsumed ${preConsumedSessions}→${newPreConsumedMinutes} min)` : '') +
        ` · ${doc.redemptions.length} redemption(s)`;

      if (DRY_RUN) {
        console.log(`[dry] ${summary}`);
      } else {
        doc.kind = 'minutes';
        doc.minutesTotal = newMinutesTotal;
        doc.preConsumedMinutes = newPreConsumedMinutes;
        doc.displayPack = { sessions: sessionsTotal, sessionDuration };
        // sessionsTotal/sessionDuration intentionally left set for audit.
        await doc.save();
        console.log(`✓ ${summary}`);
      }
      migrated++;
    }

    console.log('');
    console.log(`Scanned:  ${scanned}`);
    console.log(`Migrated: ${migrated}${DRY_RUN ? ' (dry-run; no writes)' : ''}`);
    console.log(`Skipped:  ${skippedAlready}`);
    if (warnings > 0) console.log(`Warnings: ${warnings}`);
  } catch (err) {
    console.error('Fatal:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
