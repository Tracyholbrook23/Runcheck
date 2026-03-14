/**
 * weeklyReset.js — Weekly Leaderboard Top-3 Winners & Reset
 *
 * Determines the top 3 weekly winners from weeklyPoints, writes a snapshot
 * to `weeklyWinners/{YYYY-MM-DD}`, then removes the `weeklyPoints` field
 * from every user who had one — resetting the weekly competition.
 *
 * ── SAFE BY DEFAULT ──────────────────────────────────────────────────────────
 * Dry-run mode is the DEFAULT. No Firestore writes occur unless you explicitly
 * pass COMMIT=true. Always run a dry run first to confirm the winners are
 * correct before committing.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *   Dry run (simulate only, no writes):
 *     node scripts/weeklyReset.js
 *
 *   Commit (write winners doc + reset weeklyPoints):
 *     COMMIT=true node scripts/weeklyReset.js
 *
 * ── Winner selection ─────────────────────────────────────────────────────────
 *   Up to 3 winners are saved (1st, 2nd, 3rd). Fewer if < 3 users earned pts.
 *   1. Primary metric   : weeklyPoints (highest wins)
 *   2. Tiebreaker       : totalPoints  (highest all-time breaks the tie)
 *   3. Full tie         : first Firestore result (non-deterministic; logged)
 *
 * ── Document shape ───────────────────────────────────────────────────────────
 *   weeklyWinners/{YYYY-MM-DD}:
 *     weekOf, recordedAt,
 *     firstPlace: { uid, name, photoURL, weeklyPoints },   ← convenience field
 *     winners: [
 *       { uid, name, photoURL, weeklyPoints, place: 1 },
 *       { uid, name, photoURL, weeklyPoints, place: 2 },
 *       { uid, name, photoURL, weeklyPoints, place: 3 },
 *     ]
 *
 * ── Reset behaviour ──────────────────────────────────────────────────────────
 * The weeklyPoints field is DELETED (not set to 0) so that users with no
 * activity this week are naturally excluded from the This Week leaderboard
 * query (which uses orderBy('weeklyPoints', 'desc')).  The next increment()
 * call from pointsService.js will recreate the field from scratch.
 *
 * ── Re-run safety ────────────────────────────────────────────────────────────
 * If the commit run is interrupted after writing the winners doc but before all
 * batches complete, re-running on the SAME CALENDAR DAY is safe — the winners
 * doc is overwritten with the same data and remaining batches are retried.
 * If you re-run on a DIFFERENT day, the winners doc ID will differ.  To avoid
 * this, use the WEEK_OF env var to pin the doc ID:
 *   COMMIT=true WEEK_OF=2026-03-09 node scripts/weeklyReset.js
 */

'use strict';

const admin          = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// ─── Config ───────────────────────────────────────────────────────────────────

// COMMIT must be explicitly set to 'true' — dry-run is the safe default.
const COMMIT     = process.env.COMMIT === 'true';
const DRY_RUN    = !COMMIT;

// WEEK_OF lets you pin the winner-doc ID when retrying on a different calendar
// day.  Format: YYYY-MM-DD.  Defaults to today's local date.
const WEEK_OF_OVERRIDE = process.env.WEEK_OF ?? null;

const BATCH_SIZE          = 400;  // comfortably under Firestore's 500-op limit
const WEEKLY_WINNERS_COLL = 'weeklyWinners';
const USERS_COLL          = 'users';

// ─── Firebase init ────────────────────────────────────────────────────────────

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db         = admin.firestore();
const Timestamp  = admin.firestore.Timestamp;
const FieldValue = admin.firestore.FieldValue;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns "YYYY-MM-DD" in the machine's local time. */
function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const DIVIDER = '─'.repeat(48);

// ─── Main ─────────────────────────────────────────────────────────────────────

async function weeklyReset() {
  const now      = new Date();
  const weekOfId = WEEK_OF_OVERRIDE ?? isoDate(now);

  // ── Header ─────────────────────────────────────────────────────────────────
  console.log('');
  console.log('🏀  RunCheck — Weekly Leaderboard Reset');
  console.log(DIVIDER);

  if (DRY_RUN) {
    console.log('⚠️   DRY RUN MODE — zero Firestore writes will occur.');
    console.log('     Verify the output below, then run with COMMIT=true to apply.\n');
  } else {
    console.log('🔴  COMMIT MODE — Firestore will be written.\n');
  }

  console.log(`📅  Week-of ID  : ${weekOfId}  (winner doc path: ${WEEKLY_WINNERS_COLL}/${weekOfId})`);
  if (WEEK_OF_OVERRIDE) {
    console.log(`     (WEEK_OF override active — using ${WEEK_OF_OVERRIDE} instead of today's date)`);
  }
  console.log('');

  // ── Step 1: Fetch all users with weeklyPoints > 0 ─────────────────────────
  console.log('🔍  Step 1/4 — Fetching users with weeklyPoints > 0 ...');

  let candidates = [];

  try {
    const snap = await db
      .collection(USERS_COLL)
      .where('weeklyPoints', '>', 0)
      .get();

    snap.forEach((docSnap) => {
      const d = docSnap.data();
      candidates.push({
        id:           docSnap.id,
        name:         d.name         ?? 'Unknown',
        photoURL:     d.photoURL     ?? null,
        weeklyPoints: d.weeklyPoints ?? 0,
        totalPoints:  d.totalPoints  ?? 0,
      });
    });
  } catch (err) {
    console.error('❌  Failed to query users:', err.message);
    process.exit(1);
  }

  console.log(`     Found ${candidates.length} user(s) with weekly activity.\n`);

  // ── Step 2: No-winner guard ────────────────────────────────────────────────
  if (candidates.length === 0) {
    console.log('⚠️   WARNING: No users have weeklyPoints > 0 this week.');
    console.log('     This is expected at the start of a fresh week or before');
    console.log('     any points have been earned since the last reset.');
    console.log('     → No winner doc will be written.');
    console.log('     → No weeklyPoints will be reset (nothing to reset).\n');
    console.log(DIVIDER);
    console.log('🏁  Exited cleanly — nothing to do.');
    console.log('');
    process.exit(0);
  }

  // ── Step 3: Sort and determine top 3 ─────────────────────────────────────
  // Primary: weeklyPoints desc.  Tiebreaker: totalPoints desc.
  candidates.sort((a, b) => {
    if (b.weeklyPoints !== a.weeklyPoints) return b.weeklyPoints - a.weeklyPoints;
    return b.totalPoints - a.totalPoints;
  });

  const PODIUM_SIZE = 3;
  const PLACE_LABELS = ['1st', '2nd', '3rd'];
  const PLACE_ICONS  = ['🥇', '🥈', '🥉'];

  // Build the podium — up to 3 entries, fewer if not enough candidates
  const podium = candidates.slice(0, PODIUM_SIZE).map((c, i) => ({
    uid:          c.id,
    name:         c.name,
    photoURL:     c.photoURL,
    weeklyPoints: c.weeklyPoints,
    place:        i + 1,
  }));

  console.log(`🏆  Step 2/4 — Top ${podium.length} winner${podium.length !== 1 ? 's' : ''}`);
  podium.forEach((w, i) => {
    console.log(`     ${PLACE_ICONS[i]}  ${PLACE_LABELS[i].padEnd(4)} ${w.name.padEnd(22)} ${String(w.weeklyPoints).padStart(5)} weekly pts   (${w.uid})`);
  });

  // Tie warnings for adjacent podium positions
  for (let i = 0; i < podium.length - 1; i++) {
    const a = candidates[i];
    const b = candidates[i + 1];
    if (a.weeklyPoints === b.weeklyPoints && a.totalPoints === b.totalPoints) {
      console.log(`     ⚠️  FULL TIE between ${PLACE_LABELS[i]} (${a.name}) and ${PLACE_LABELS[i + 1]} (${b.name}).`);
      console.log('        Both weeklyPoints AND totalPoints are identical. Order is non-deterministic.');
    } else if (a.weeklyPoints === b.weeklyPoints) {
      console.log(`     ⚡ Tie on weeklyPoints between ${PLACE_LABELS[i]} and ${PLACE_LABELS[i + 1]}.`);
      console.log(`        Tiebreaker: totalPoints — ${a.name} (${a.totalPoints}) beats ${b.name} (${b.totalPoints}).`);
    }
  }
  console.log('');

  // ── Users to be reset (full list) ─────────────────────────────────────────
  console.log(`🔄  Step 3/4 — Users scheduled for weeklyPoints reset (${candidates.length} total)`);
  candidates.forEach(({ name, id, weeklyPoints }, i) => {
    const marker = i < PODIUM_SIZE ? PLACE_ICONS[i] : '  ';
    console.log(`  ${marker} ${name.padEnd(26)} ${String(weeklyPoints).padStart(5)} weekly pts   (${id})`);
  });
  console.log('');

  // ── Check for existing winner doc ─────────────────────────────────────────
  console.log(`📋  Step 4/4 — Checking for existing winner doc (${weekOfId}) ...`);

  try {
    const existSnap = await db
      .collection(WEEKLY_WINNERS_COLL)
      .doc(weekOfId)
      .get();

    if (existSnap.exists) {
      const prev = existSnap.data();
      const prevFirst = prev.firstPlace ?? prev;  // backward compat with old single-winner docs
      console.log(`     ⚠️  Doc ${weekOfId} already exists.`);
      console.log(`        Previous 1st place on record: ${prevFirst.name ?? '(unknown)'} — ${prevFirst.weeklyPoints ?? '?'} pts`);
      if (prev.winners) {
        console.log(`        Winners array has ${prev.winners.length} entries.`);
      }
      if (DRY_RUN) {
        console.log('        (Dry run — existing doc will not be touched.)\n');
      } else {
        console.log('        Will overwrite with new winners data.\n');
      }
    } else {
      console.log('     No existing doc — safe to write.\n');
    }
  } catch (err) {
    console.error('❌  Failed to check existing winner doc:', err.message);
    process.exit(1);
  }

  // ── Dry-run exit ───────────────────────────────────────────────────────────
  if (DRY_RUN) {
    console.log(DIVIDER);
    console.log('🏁  Dry run complete — no changes were made.\n');
    console.log('    If the winners above look correct, run:');
    console.log('    COMMIT=true node scripts/weeklyReset.js\n');
    process.exit(0);
  }

  // ══ COMMIT PATH ════════════════════════════════════════════════════════════

  // ── Write the weeklyWinners doc ───────────────────────────────────────────
  console.log(`✍️   Committing ${podium.length} winner(s) → ${WEEKLY_WINNERS_COLL}/${weekOfId} ...`);

  const first = podium[0];

  try {
    await db.collection(WEEKLY_WINNERS_COLL).doc(weekOfId).set({
      weekOf:       weekOfId,          // string "YYYY-MM-DD", mirrors doc ID
      recordedAt:   Timestamp.now(),
      // Convenience shortcut for quick reads that only need 1st place
      firstPlace: {
        uid:          first.uid,
        name:         first.name,
        photoURL:     first.photoURL,
        weeklyPoints: first.weeklyPoints,
      },
      // Full podium — up to 3 entries ordered by place
      winners: podium,
    });
    console.log('     ✔  Winners doc written.\n');
  } catch (err) {
    console.error('❌  Failed to write winners doc:', err.message);
    console.error('     ABORTING — weeklyPoints have NOT been reset (data is safe).');
    console.error('     Fix the error above, then re-run to retry.');
    process.exit(1);
  }

  // ── Batch-reset weeklyPoints ──────────────────────────────────────────────
  // The field is DELETED (not zeroed) so that post-reset weekly queries
  // (orderBy weeklyPoints) only return users who have earned new points.
  console.log(`🔄  Resetting weeklyPoints for ${candidates.length} user(s) ...`);

  let resetCount = 0;
  let errorCount = 0;

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const chunk     = candidates.slice(i, i + BATCH_SIZE);
    const batch     = db.batch();
    const batchNum  = Math.floor(i / BATCH_SIZE) + 1;

    chunk.forEach(({ id }) => {
      batch.update(db.collection(USERS_COLL).doc(id), {
        weeklyPoints: FieldValue.delete(),
      });
    });

    try {
      await batch.commit();
      resetCount += chunk.length;
      console.log(`     ✔  Batch ${batchNum}: reset ${chunk.length} user(s)`);
    } catch (err) {
      errorCount += chunk.length;
      console.error(`     ❌  Batch ${batchNum} failed: ${err.message}`);
      console.error('         Re-run with COMMIT=true to retry failed batches.');
    }
  }

  console.log('');

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log(DIVIDER);

  if (errorCount === 0) {
    console.log('✅  Weekly reset complete');
  } else {
    console.log('⚠️   Weekly reset finished with errors (see above)');
  }

  console.log(`     Mode        : COMMIT`);
  console.log(`     Week of     : ${weekOfId}`);
  podium.forEach((w, i) => {
    console.log(`     ${PLACE_ICONS[i]} ${PLACE_LABELS[i].padEnd(4)}      : ${w.name} — ${w.weeklyPoints} weekly pts`);
  });
  console.log(`     Winners doc : ${WEEKLY_WINNERS_COLL}/${weekOfId}  ✔ written`);
  console.log(`     Users reset : ${resetCount}`);

  if (errorCount > 0) {
    console.log(`     Errors      : ${errorCount}  ← re-run with COMMIT=true to retry`);
  }

  console.log('');
  process.exit(errorCount > 0 ? 1 : 0);
}

weeklyReset();
