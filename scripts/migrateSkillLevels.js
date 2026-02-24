/**
 * migrateSkillLevels.js — One-Time Skill Level Migration
 *
 * Finds all user documents where `skillLevel` is a legacy value from the old
 * 4-tier system and updates them to 'Casual' (the closest valid default).
 *
 * Valid values (new system):  ['Casual', 'Competitive', 'Either']
 * Legacy values (old system): ['Beginner', 'Intermediate', 'Advanced', 'Pro']
 *
 * Usage:
 *   node scripts/migrateSkillLevels.js
 *
 * Dry-run (preview only, no writes):
 *   DRY_RUN=true node scripts/migrateSkillLevels.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// ─── Config ──────────────────────────────────────────────────────────────────

const VALID_SKILL_LEVELS = ['Casual', 'Competitive', 'Either'];
const LEGACY_VALUES      = ['Beginner', 'Intermediate', 'Advanced', 'Pro'];
const FALLBACK_VALUE     = 'Casual';
const DRY_RUN            = process.env.DRY_RUN === 'true';

// ─── Firebase init ────────────────────────────────────────────────────────────

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ─── Migration ────────────────────────────────────────────────────────────────

async function migrateSkillLevels() {
  console.log('');
  console.log('🔄  RunCheck — Skill Level Migration');
  console.log('────────────────────────────────────');
  if (DRY_RUN) {
    console.log('⚠️   DRY RUN enabled — no documents will be written.\n');
  }

  const usersRef = db.collection('users');

  // Firestore `not-in` supports up to 10 values — we're well within that limit.
  // We query for any skillLevel that is NOT one of the valid values, which also
  // catches documents where skillLevel is missing/null (those won't match
  // not-in, so we handle the missing-field case separately below).

  let affectedDocs = [];

  // ── Pass 1: docs with a legacy skillLevel value ───────────────────────────
  try {
    const legacySnap = await usersRef
      .where('skillLevel', 'in', LEGACY_VALUES)
      .get();

    legacySnap.forEach((doc) => {
      affectedDocs.push({ id: doc.id, currentValue: doc.data().skillLevel });
    });
  } catch (err) {
    console.error('❌  Error querying legacy skillLevel values:', err.message);
    process.exit(1);
  }

  // ── Pass 2: docs where skillLevel field is missing entirely ───────────────
  // Firestore has no direct "field does not exist" query, but we can use
  // a where('skillLevel', '==', null) trick for absent fields in some SDKs.
  // For safety we also fetch all users and filter client-side for missing field.
  // This is acceptable for a one-time migration script.
  try {
    const allSnap = await usersRef.get();
    allSnap.forEach((doc) => {
      const data = doc.data();
      const alreadyIncluded = affectedDocs.some((d) => d.id === doc.id);
      const hasInvalidLevel =
        !alreadyIncluded &&
        (data.skillLevel === undefined ||
          data.skillLevel === null ||
          data.skillLevel === '' ||
          (!VALID_SKILL_LEVELS.includes(data.skillLevel) &&
            !LEGACY_VALUES.includes(data.skillLevel)));

      if (hasInvalidLevel) {
        affectedDocs.push({
          id: doc.id,
          currentValue: data.skillLevel ?? '(missing)',
        });
      }
    });
  } catch (err) {
    console.error('❌  Error fetching all users:', err.message);
    process.exit(1);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`📋  Total users scanned`);
  console.log(`🔍  Documents requiring migration: ${affectedDocs.length}\n`);

  if (affectedDocs.length === 0) {
    console.log('✅  Nothing to migrate — all users already have valid skillLevel values.');
    process.exit(0);
  }

  // Log each affected doc
  affectedDocs.forEach(({ id, currentValue }) => {
    console.log(`  • ${id}  |  "${currentValue}"  →  "${FALLBACK_VALUE}"`);
  });
  console.log('');

  if (DRY_RUN) {
    console.log(`🏁  Dry run complete. Run without DRY_RUN=true to apply ${affectedDocs.length} update(s).`);
    process.exit(0);
  }

  // ── Batched writes (max 500 per batch) ────────────────────────────────────
  const BATCH_SIZE = 400; // stay comfortably under the 500-op limit
  let updatedCount = 0;
  let errorCount   = 0;

  for (let i = 0; i < affectedDocs.length; i += BATCH_SIZE) {
    const chunk = affectedDocs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    chunk.forEach(({ id }) => {
      const ref = usersRef.doc(id);
      batch.update(ref, { skillLevel: FALLBACK_VALUE });
    });

    try {
      await batch.commit();
      updatedCount += chunk.length;
      console.log(`  ✔  Batch ${Math.floor(i / BATCH_SIZE) + 1}: updated ${chunk.length} document(s)`);
    } catch (err) {
      errorCount += chunk.length;
      console.error(`  ❌  Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, err.message);
    }
  }

  // ── Final report ─────────────────────────────────────────────────────────
  console.log('');
  console.log('────────────────────────────────────');
  console.log(`✅  Migration complete`);
  console.log(`    Updated : ${updatedCount}`);
  if (errorCount > 0) {
    console.log(`    Errors  : ${errorCount}  ← re-run to retry failed batches`);
  }
  console.log('');

  process.exit(errorCount > 0 ? 1 : 0);
}

migrateSkillLevels();
