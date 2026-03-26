/**
 * repairReliabilityScores.js — One-Time Reliability Score Repair
 *
 * Scans every user document and recalculates the correct `reliability.score`
 * from the counters already stored on the doc (`totalAttended`, `totalNoShow`,
 * `totalLateCancelled`).  Any user whose stored score doesn't match the formula
 * will have their score corrected.
 *
 * ── Why this is needed ────────────────────────────────────────────────────────
 * The `totalAttended < 3` lock was added to the formula in a later version of
 * onScheduleWrite.ts and detectRunNoShows.ts.  Users whose reliability was
 * written by older backend code (before the lock existed) may have a score of 0
 * even though their attendance history doesn't warrant it.  This script
 * recalculates every score from the source-of-truth counters and patches any
 * that are wrong.
 *
 * ── Formula (mirrors onScheduleWrite.ts and detectRunNoShows.ts) ─────────────
 *   if (totalAttended < 3)  → score = 100  (lock: new users get full trust)
 *   else                    → score = clamp(100 − 20·noShows − 8·lateCancels, 0, 100)
 *
 * ── Modes ─────────────────────────────────────────────────────────────────────
 *   DRY RUN (default): reads only — prints every discrepancy, no writes.
 *   COMMIT:            DRY_RUN=false  OR  pass --commit flag to apply patches.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   # Preview discrepancies (safe — no writes)
 *   node scripts/repairReliabilityScores.js
 *
 *   # Apply corrections to Firestore
 *   DRY_RUN=false node scripts/repairReliabilityScores.js
 *
 * ── Requirements ─────────────────────────────────────────────────────────────
 *   serviceAccountKey.json must exist at the project root.
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// ─── Config ──────────────────────────────────────────────────────────────────

const DRY_RUN = process.env.DRY_RUN !== 'false' && !process.argv.includes('--commit');
const BATCH_SIZE = 400; // Firestore batch write limit is 500; stay under for safety

// ─── Firebase init ────────────────────────────────────────────────────────────

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ─── Formula (must stay in sync with onScheduleWrite.ts / detectRunNoShows.ts) ─

/**
 * Compute the correct reliability score from stored counters.
 * @param {object} r - The reliability sub-document from users/{uid}
 * @returns {number} Correct score (0–100)
 */
function computeCorrectScore(r) {
  const totalAttended      = r.totalAttended      ?? 0;
  const totalNoShow        = r.totalNoShow        ?? 0;
  const totalLateCancelled = r.totalLateCancelled ?? 0;

  // Lock: score stays at 100 until the user has attended 3+ sessions.
  if (totalAttended < 3) return 100;

  // Ratio-based recovery: attending sessions naturally improves score over time.
  // Late cancels count as half a no-show. Floor of 20 keeps score recoverable.
  const totalSessions = totalAttended + totalNoShow + (totalLateCancelled * 0.5);
  const raw = Math.round((totalAttended / totalSessions) * 100);
  return Math.max(20, raw);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(str, len) {
  return String(str).padEnd(len);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function repairReliabilityScores() {
  console.log('');
  console.log('🔧  RunCheck — Reliability Score Repair');
  console.log('────────────────────────────────────────');
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no writes)' : '✍️  COMMIT (will write to Firestore)'}`);
  console.log('');

  // ── 1. Load all user docs ──────────────────────────────────────────────────
  console.log('Loading users...');
  const usersSnap = await db.collection('users').get();
  const total = usersSnap.size;
  console.log(`Found ${total} user doc(s).\n`);

  // ── 2. Evaluate each user ──────────────────────────────────────────────────
  const toFix   = []; // { ref, uid, name, storedScore, correctScore, r }
  const noData  = []; // users with no reliability object at all
  let   correct = 0;

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    const uid  = doc.id;
    const name = data.name || data.username || uid;

    const r = data.reliability;

    if (!r || typeof r.score === 'undefined') {
      // No reliability object — skip (Cloud Functions will initialize on first
      // schedule event; no need to create a synthetic record here).
      noData.push({ uid, name });
      continue;
    }

    const storedScore  = r.score;
    const correctScore = computeCorrectScore(r);

    if (storedScore === correctScore) {
      correct++;
    } else {
      toFix.push({ ref: doc.ref, uid, name, storedScore, correctScore, r });
    }
  }

  // ── 3. Report findings ────────────────────────────────────────────────────
  console.log('── Scan Results ─────────────────────────────────────────────');
  console.log(`  Total users scanned : ${total}`);
  console.log(`  No reliability data : ${noData.length}  (skipped — Cloud Functions will initialize)`);
  console.log(`  Score correct       : ${correct}`);
  console.log(`  Score needs fixing  : ${toFix.length}`);
  console.log('');

  if (toFix.length === 0) {
    console.log('✅  All reliability scores are accurate. No action needed.');
    process.exit(0);
  }

  // ── 4. Print the fix list ─────────────────────────────────────────────────
  console.log('── Users That Need Correction ───────────────────────────────');
  console.log(
    `  ${ pad('UID', 30) }  ${ pad('Name', 20) }  ${ pad('Attended', 8) }  ${ pad('NoShow', 6) }  ${ pad('LateCxl', 7) }  ${ pad('Stored', 6) }  →  Correct`
  );
  console.log('  ' + '─'.repeat(100));

  for (const u of toFix) {
    const attended      = u.r.totalAttended      ?? 0;
    const noShow        = u.r.totalNoShow        ?? 0;
    const lateCxl       = u.r.totalLateCancelled ?? 0;
    const flag          = u.storedScore > u.correctScore ? '⬇' : '⬆';

    console.log(
      `  ${ pad(u.uid, 30) }  ${ pad(u.name, 20) }  ${ pad(attended, 8) }  ${ pad(noShow, 6) }  ${ pad(lateCxl, 7) }  ${ pad(u.storedScore, 6) }  ${flag}  ${ u.correctScore }`
    );
  }

  console.log('');

  if (DRY_RUN) {
    console.log('──────────────────────────────────────────────────────────────');
    console.log(`DRY RUN complete — ${toFix.length} user(s) would be patched.`);
    console.log('To apply: DRY_RUN=false node scripts/repairReliabilityScores.js');
    console.log('');
    process.exit(0);
  }

  // ── 5. Apply fixes in batched writes ─────────────────────────────────────
  console.log(`Applying ${toFix.length} fix(es) in batches of ${BATCH_SIZE}...`);

  let patched = 0;
  let failed  = 0;

  for (let i = 0; i < toFix.length; i += BATCH_SIZE) {
    const chunk = toFix.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const u of chunk) {
      batch.update(u.ref, {
        'reliability.score':     u.correctScore,
        'reliability.lastUpdated': admin.firestore.Timestamp.now(),
      });
    }

    try {
      await batch.commit();
      patched += chunk.length;
      console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: patched ${chunk.length} user(s)`);
    } catch (err) {
      failed += chunk.length;
      console.error(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: FAILED — ${err.message}`);
    }
  }

  // ── 6. Summary ─────────────────────────────────────────────────────────────
  console.log('');
  console.log('── Final Summary ────────────────────────────────────────────');
  console.log(`  Patched successfully : ${patched}`);
  if (failed > 0) {
    console.log(`  Failed              : ${failed}  ← re-run script to retry`);
  }
  console.log('');

  if (failed === 0) {
    console.log('✅  All reliability scores repaired successfully.');
  } else {
    console.log('⚠️   Some patches failed. Re-run the script to retry.');
    process.exit(1);
  }
}

repairReliabilityScores().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
