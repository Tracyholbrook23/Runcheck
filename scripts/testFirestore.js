/**
 * scripts/testFirestore.js — Firestore Emulator Smoke Test
 *
 * Fetches every document from the `users`, `gyms`, and `runs` collections
 * in the Firestore emulator and logs them to the console.
 *
 * ─── How to run (inside Expo / React Native) ──────────────────────────────────
 * Import and call `runFirestoreTests()` from any screen or component:
 *
 *   import { runFirestoreTests } from '../scripts/testFirestore';
 *
 *   // Call it from a button press or useEffect:
 *   await runFirestoreTests();
 *
 * ─── Prerequisites ─────────────────────────────────────────────────────────────
 *   1. Firebase Emulator Suite running:
 *        firebase emulators:start --only auth,firestore,functions
 *
 *   2. Firestore seeded with test data:
 *        cd RunCheckBackend/functions
 *        npm run build && node lib/seedTestData.js
 *
 *   3. EXPO_PUBLIC_USE_EMULATORS=true in .env (already set)
 *
 * ─── Expected output ───────────────────────────────────────────────────────────
 *   🔍 [testFirestore] ── users ──
 *   ✅ [testFirestore] 8 documents in users
 *      [0] { id: 'user1', displayName: 'Alice Runner', ... }
 *   🔍 [testFirestore] ── gyms ──
 *   ✅ [testFirestore] 5 documents in gyms
 *      ...
 *   🔍 [testFirestore] ── runs ──
 *   ✅ [testFirestore] 12 documents in runs
 *      ...
 *   🏁 [testFirestore] All tests complete.
 *
 * ─── Verifying emulator (not production) is being used ─────────────────────────
 * Check the Emulator UI at http://127.0.0.1:4000 → Firestore tab.
 * The data shown there must match what this script logs.  If you see data in the
 * app but NOT in the Emulator UI, you are accidentally hitting production.
 */

import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../config/firebase';

// ─── Helper: fetch and log one collection ────────────────────────────────────
async function testCollection(collectionName, sortField = null) {
  console.log(`\n🔍 [testFirestore] ── ${collectionName} ──`);

  try {
    const ref = collection(db, collectionName);
    const q = sortField
      ? query(ref, orderBy(sortField, 'asc'))
      : query(ref);

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.warn(
        `⚠️  [testFirestore] ${collectionName} is EMPTY.\n` +
        '    → Seed the emulator: cd RunCheckBackend/functions && npm run build && node lib/seedTestData.js'
      );
      return [];
    }

    const docs = snapshot.docs.map((doc) => {
      const data = doc.data();

      // Firestore GeoPoints need special serialisation for logging
      const serialised = Object.fromEntries(
        Object.entries(data).map(([k, v]) => {
          if (v && typeof v === 'object' && typeof v.latitude === 'number') {
            return [k, { lat: v.latitude, lng: v.longitude }];
          }
          // Timestamps → ISO string
          if (v && typeof v.toDate === 'function') {
            return [k, v.toDate().toISOString()];
          }
          return [k, v];
        })
      );

      return { id: doc.id, ...serialised };
    });

    console.log(`✅ [testFirestore] ${docs.length} documents in ${collectionName}`);
    docs.forEach((doc, i) => {
      console.log(`   [${i}]`, JSON.stringify(doc, null, 4));
    });

    return docs;
  } catch (err) {
    console.error(`❌ [testFirestore] Error fetching ${collectionName}:`, err.message);
    console.error(
      '   → Is the Firestore emulator running on 127.0.0.1:8080?\n' +
      '   → Is EXPO_PUBLIC_USE_EMULATORS=true in .env?'
    );
    return [];
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────
/**
 * runFirestoreTests — Run all Firestore emulator smoke tests.
 *
 * @returns {Promise<{ users: object[], gyms: object[], runs: object[] }>}
 */
export async function runFirestoreTests() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  🧪 RunCheck — Firestore Emulator Smoke Test');
  console.log('══════════════════════════════════════════════════');

  const users = await testCollection('users', 'displayName');
  const gyms  = await testCollection('gyms', 'name');
  const runs  = await testCollection('runs', 'startTime');

  console.log('\n══════════════════════════════════════════════════');
  console.log(`  🏁 [testFirestore] Complete`);
  console.log(`     users: ${users.length}  gyms: ${gyms.length}  runs: ${runs.length}`);
  console.log('══════════════════════════════════════════════════\n');

  return { users, gyms, runs };
}
