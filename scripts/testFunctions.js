/**
 * scripts/testFunctions.js — Cloud Functions Emulator Smoke Test
 *
 * Tests the following Cloud Functions by calling them from inside the Expo app:
 *   • getRuns  (HTTP onRequest — requires Bearer token + gymId query param)
 *   • addGym   (callable onCall)
 *   • rateUser (callable onCall)
 *
 * ─── How to run (inside Expo / React Native) ──────────────────────────────────
 * Import and call `runFunctionsTests()` from any screen or component.
 * The caller must be authenticated (even anonymously) because getRuns verifies
 * the Firebase ID token server-side.
 *
 *   import { runFunctionsTests } from '../scripts/testFunctions';
 *
 *   // Typically called after sign-in:
 *   await runFunctionsTests({ gymId: 'gym1' });
 *
 * ─── Prerequisites ─────────────────────────────────────────────────────────────
 *   1. Firebase Emulator Suite running:
 *        firebase emulators:start --only auth,firestore,functions
 *
 *   2. Firestore seeded (so gymId values exist):
 *        cd RunCheckBackend/functions && npm run build && node lib/seedTestData.js
 *
 *   3. User must be signed in (use signInAnonymously if needed — the emulator
 *      supports anonymous auth without any configuration).
 *
 * ─── Expected output ───────────────────────────────────────────────────────────
 *   🔍 [testFunctions] ── getRuns ──
 *   ✅ [testFunctions] getRuns returned 3 runs
 *      [0] { id: '...', status: 'scheduled', ... }
 *   🔍 [testFunctions] ── addGym (callable) ──
 *   ✅ [testFunctions] addGym returned: { gymId: '...', name: 'Smoke Test Gym ...' }
 *   ...
 *   🏁 [testFunctions] All tests complete.
 */

import { signInAnonymously } from 'firebase/auth';
import { auth, callFunction, callHttpFunction } from '../config/firebase';

// ─── Ensure a signed-in user exists ──────────────────────────────────────────
// getRuns and other functions check context.auth, so we need a valid token.
// signInAnonymously works on the Auth emulator with zero configuration.
async function ensureSignedIn() {
  if (auth.currentUser) {
    console.log(`[testFunctions] Already signed in as: ${auth.currentUser.uid}`);
    return auth.currentUser;
  }

  console.log('[testFunctions] No current user — signing in anonymously…');
  const cred = await signInAnonymously(auth);
  console.log(`[testFunctions] ✅ Anonymous sign-in OK  uid=${cred.user.uid}`);
  return cred.user;
}

// ─── Test: getRuns (HTTP onRequest) ──────────────────────────────────────────
async function testGetRuns(gymId) {
  console.log(`\n🔍 [testFunctions] ── getRuns (gymId=${gymId}) ──`);
  try {
    const result = await callHttpFunction('getRuns', { gymId });
    const runs = result.runs ?? [];
    console.log(`✅ [testFunctions] getRuns returned ${runs.length} run(s)`);
    runs.forEach((run, i) => {
      console.log(`   [${i}]`, JSON.stringify({
        id: run.id,
        status: run.status,
        isPrivate: run.isPrivate,
        attendees: run.attendees?.length ?? 0,
        startTime: run.startTime,
      }, null, 4));
    });
    return runs;
  } catch (err) {
    console.error('❌ [testFunctions] getRuns error:', err.message);
    return [];
  }
}

// ─── Test: addGym (callable onCall) ──────────────────────────────────────────
async function testAddGym() {
  const gymName = `Smoke Test Gym ${Date.now()}`;
  console.log(`\n🔍 [testFunctions] ── addGym (callable) — "${gymName}" ──`);
  try {
    const result = await callFunction('addGym', {
      name: gymName,
      location: { lat: 32.7767, lng: -96.797 }, // Dallas coords
    });
    console.log('✅ [testFunctions] addGym returned:', JSON.stringify(result, null, 4));
    return result;
  } catch (err) {
    console.error('❌ [testFunctions] addGym error:', err.message);
    return null;
  }
}

// ─── Test: rateUser (callable onCall) ────────────────────────────────────────
async function testRateUser(ratedUserId = 'user2') {
  console.log(`\n🔍 [testFunctions] ── rateUser (callable) — ratedUserId=${ratedUserId} ──`);
  try {
    const result = await callFunction('rateUser', {
      ratedUserId,
      score: 5,
      comment: 'Emulator smoke test rating',
    });
    console.log('✅ [testFunctions] rateUser returned:', JSON.stringify(result, null, 4));
    return result;
  } catch (err) {
    // A non-existent ratedUserId will throw — that's expected in a clean emulator
    console.warn('⚠️  [testFunctions] rateUser error (may be expected if user does not exist):', err.message);
    return null;
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────
/**
 * runFunctionsTests — Run all Cloud Functions emulator smoke tests.
 *
 * @param {object} [options]
 * @param {string} [options.gymId='gym1'] - Firestore gym document ID to query runs for
 * @returns {Promise<void>}
 */
export async function runFunctionsTests({ gymId = 'gym1' } = {}) {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  🧪 RunCheck — Functions Emulator Smoke Test');
  console.log('══════════════════════════════════════════════════');

  // Sign in first so getRuns can verify the token
  try {
    await ensureSignedIn();
  } catch (err) {
    console.error('❌ [testFunctions] Auth failed — cannot proceed:', err.message);
    console.error('   → Is the Auth emulator running on 127.0.0.1:9099?');
    return;
  }

  await testGetRuns(gymId);
  await testAddGym();
  await testRateUser('user2'); // 'user2' is seeded by seedTestData.ts

  console.log('\n══════════════════════════════════════════════════');
  console.log('  🏁 [testFunctions] All tests complete');
  console.log('══════════════════════════════════════════════════\n');
}
