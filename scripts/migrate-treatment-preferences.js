// One-shot migration from the old per-body-area clinical schema to the
// new wellness-style flat schema.
//
// Old shape (under profile.treatmentPreferences):
//   { bodyAreas: Map<areaId, { pressure: 1-100, conditions: [String],
//                              patterns: [String], note: String }> }
//   plus profile.medicalConditions: String, profile.allergies: String
//
// New shape:
//   { pressure: 'light'|'medium'|'firm'|'deep',
//     focusAreas: [String], avoidAreas: [String],
//     oilSensitivities: String, notes: String }
//
// What this script does, per user:
//   - Skip if new pressure is already a string enum (already migrated).
//   - Average the per-area pressure values, map 1-25→light, 26-50→medium,
//     51-75→firm, 76-100→deep. Default 'medium' if no per-area data.
//   - focusAreas ← human-readable label for each area that had any data.
//   - avoidAreas ← []  (the old schema had no avoid concept).
//   - oilSensitivities ← old profile.allergies (verbatim).
//   - notes ← concat of profile.medicalConditions + per-area notes
//     (each prefixed with the area label), separated by blank lines.
//   - Drops profile.allergies and profile.medicalConditions ($unset).
//
// Run via: heroku run node scripts/migrate-treatment-preferences.js
//
// Safe to run multiple times — idempotent.

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../server/models/User');

// Friendly labels for the old body-area IDs. If we don't recognize an ID,
// we fall back to a title-cased version of the ID itself.
const AREA_LABELS = {
  upper_back_shoulders: 'Upper back',
  middle_back_lats: 'Upper back',
  lower_back: 'Lower back',
  neck: 'Neck',
  shoulders: 'Shoulders',
  arms: 'Arms',
  hands: 'Hands',
  hips: 'Hips',
  glutes: 'Hips',
  legs_thighs: 'Legs',
  legs_calves: 'Legs',
  legs: 'Legs',
  feet: 'Feet',
  head: 'Head',
  face: 'Head',
};

function labelFor(id) {
  if (AREA_LABELS[id]) return AREA_LABELS[id];
  return id
    .split(/[_\s]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function pressureNumberToEnum(n) {
  if (n <= 25) return 'light';
  if (n <= 50) return 'medium';
  if (n <= 75) return 'firm';
  return 'deep';
}

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  // Pull every user's raw doc — we cannot rely on Mongoose schema casting
  // because the old field shape is no longer in the schema.
  const cursor = User.collection.find({}, {
    projection: {
      'profile.allergies': 1,
      'profile.medicalConditions': 1,
      'profile.treatmentPreferences': 1,
      accountType: 1,
      email: 1,
    },
  });

  let scanned = 0;
  let migrated = 0;
  let skipped = 0;
  const failures = [];

  while (await cursor.hasNext()) {
    const user = await cursor.next();
    scanned++;

    const tp = user.profile?.treatmentPreferences || {};
    const oldAllergies = user.profile?.allergies || '';
    const oldMedical = user.profile?.medicalConditions || '';

    // Already on new shape — pressure is a string. Skip.
    if (typeof tp.pressure === 'string') {
      skipped++;
      continue;
    }

    // Old shape had bodyAreas as a Map (BSON object on raw read).
    const bodyAreas = tp.bodyAreas || {};
    const areaEntries = Object.entries(bodyAreas);

    // Pressure: average all per-area pressures.
    let pressureEnum = 'medium';
    const pressures = areaEntries
      .map(([, v]) => Number(v?.pressure))
      .filter(n => Number.isFinite(n) && n >= 1 && n <= 100);
    if (pressures.length > 0) {
      const avg = pressures.reduce((s, n) => s + n, 0) / pressures.length;
      pressureEnum = pressureNumberToEnum(avg);
    }

    // Focus areas: any area that had data at all.
    const focusAreas = Array.from(new Set(
      areaEntries
        .filter(([, v]) => v && (
          v.pressure ||
          (Array.isArray(v.conditions) && v.conditions.length > 0) ||
          (Array.isArray(v.patterns) && v.patterns.length > 0) ||
          (v.note && v.note.trim())
        ))
        .map(([id]) => labelFor(id))
    ));

    // Notes: concat medicalConditions + per-area conditions/patterns/notes.
    const noteChunks = [];
    if (oldMedical && oldMedical.trim()) {
      noteChunks.push(oldMedical.trim());
    }
    for (const [id, v] of areaEntries) {
      const label = labelFor(id);
      const lines = [];
      if (Array.isArray(v.conditions) && v.conditions.length > 0) {
        lines.push(`Conditions: ${v.conditions.join(', ')}`);
      }
      if (Array.isArray(v.patterns) && v.patterns.length > 0) {
        lines.push(`Patterns: ${v.patterns.join(', ')}`);
      }
      if (v.note && v.note.trim()) {
        lines.push(v.note.trim());
      }
      if (lines.length > 0) {
        noteChunks.push(`${label}:\n${lines.join('\n')}`);
      }
    }
    const notes = noteChunks.join('\n\n').slice(0, 2000);

    const newPrefs = {
      pressure: pressureEnum,
      focusAreas,
      avoidAreas: [],
      oilSensitivities: oldAllergies.trim().slice(0, 500),
      notes,
    };

    try {
      await User.collection.updateOne(
        { _id: user._id },
        {
          $set: { 'profile.treatmentPreferences': newPrefs },
          $unset: {
            'profile.allergies': '',
            'profile.medicalConditions': '',
          },
        }
      );
      migrated++;
      console.log(
        `[migrated] ${user.email || user._id} — pressure=${pressureEnum}, ` +
        `focus=[${focusAreas.join(',')}], notes=${notes.length}c, ` +
        `oils=${newPrefs.oilSensitivities.length}c`
      );
    } catch (err) {
      failures.push({ id: user._id.toString(), email: user.email, error: err.message });
      console.error(`[failed]   ${user.email || user._id}: ${err.message}`);
    }
  }

  console.log('\n--- summary ---');
  console.log(`scanned:   ${scanned}`);
  console.log(`migrated:  ${migrated}`);
  console.log(`skipped:   ${skipped}  (already on new shape)`);
  console.log(`failures:  ${failures.length}`);
  if (failures.length > 0) {
    console.log(JSON.stringify(failures, null, 2));
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
