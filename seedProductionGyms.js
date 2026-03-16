/**
 * seedProductionGyms.js — Single canonical admin seed script for gym data.
 *
 * This is the ONLY script that should write gym documents to Firestore.
 * The client app is read-only — it subscribes to gyms via real-time listeners
 * and never creates, updates, or deletes gym documents.
 *
 * Usage:
 *   node seedProductionGyms.js              # Validate + seed
 *   node seedProductionGyms.js --validate   # Validate only (dry run, no Firestore writes)
 *
 * Behavior:
 *   - Uses `set(data, { merge: true })` so it is safe to re-run at any time.
 *   - Creates missing gym documents.
 *   - Updates fields on existing documents without deleting any data.
 *   - Never deletes gym documents — to remove a gym, delete it manually in
 *     the Firebase console or set its `status` to 'hidden' or 'archived'.
 *   - Sets `createdAt` only on first creation (document does not yet exist).
 *   - Sets `updatedAt` on every run.
 *   - Does NOT include system-managed fields (currentPresenceCount, scheduleCounts)
 *     because merge:true would overwrite live data.
 *
 * To add a new gym:
 *   1. Add a new entry to the `gyms` array below.
 *   2. Get coordinates by right-clicking the exact building/court in Google Maps
 *      → "What's here?" → copy latitude/longitude. Do NOT use an address geocoder
 *      — it returns parcel centroids, not building-level pins.
 *   3. Run `node seedProductionGyms.js --validate` to check for errors.
 *   4. Run `node seedProductionGyms.js` to seed.
 *   5. The client app will pick it up automatically via the Firestore listener.
 *   6. If the gym needs a local image override, also add an entry in
 *      `constants/gymAssets.js`.
 *
 * Requires:
 *   - `serviceAccountKey.json` in the project root (firebase-admin credential)
 *
 * @since 2026-03-15 — Promoted to single source of truth for gym data.
 * @updated 2026-03-15 — Phase 1: added validation, status field, timestamps,
 *          removed system-managed fields from seed data.
 */

const admin = require('firebase-admin');

// ---------------------------------------------------------------------------
// Validation constants
// ---------------------------------------------------------------------------

const VALID_TYPES = ['indoor', 'outdoor'];
const VALID_ACCESS_TYPES = ['paid', 'free'];
const VALID_STATUSES = ['active', 'hidden', 'archived'];
const GYM_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// System-managed fields that should NEVER appear in seed data.
// merge:true would overwrite live values if these were included.
const SYSTEM_MANAGED_FIELDS = ['currentPresenceCount', 'scheduleCounts'];

// Current launch region (central Texas). Coordinates outside this box produce
// a warning, NOT a hard failure — this allows future expansion to other regions.
const LAUNCH_REGION = {
  label: 'Central Texas',
  latMin: 29.0,
  latMax: 32.0,
  lngMin: -99.0,
  lngMax: -96.0,
};

// ---------------------------------------------------------------------------
// Gym data — admin-managed fields only
// ---------------------------------------------------------------------------

const gyms = [
  {
    id: 'cowboys-fit-pflugerville',
    name: 'Cowboys Fit - Pflugerville',
    address: '1401 Town Center Dr, Pflugerville, TX 78660',
    city: 'Pflugerville',
    state: 'TX',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    notes: '57,000 sq ft facility with indoor basketball court, pool, and recovery lounge',
    // No imageUrl — this gym uses a bundled local asset (assets/cowboyfitgym.png)
    // resolved via GYM_LOCAL_IMAGES in constants/gymAssets.js.
    location: { latitude: 30.4673, longitude: -97.6021 },
    checkInRadiusMeters: 100,
    autoExpireMinutes: 120,
  },
  {
    id: 'clay-madsen-round-rock',
    name: 'Clay Madsen Recreation Center',
    address: '1600 Gattis School Rd, Round Rock, TX 78664',
    city: 'Round Rock',
    state: 'TX',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    notes: '55,000 sq ft facility with two full-size gymnasiums, basketball courts, pool, racquetball courts',
    imageUrl: 'https://s3-media0.fl.yelpcdn.com/bphoto/R1OXLFLx0N6gUT2rNfqLoA/o.jpg',
    location: { latitude: 30.4972, longitude: -97.6608 },
    checkInRadiusMeters: 100,
    autoExpireMinutes: 120,
  },
  {
    id: 'pan-american-recreation-center',
    name: 'Pan American Recreation Center',
    address: '2100 E 3rd St, Austin, TX 78702',
    city: 'Austin',
    state: 'TX',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    notes: '',
    imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTlugK3VDdlosE9o97HH-NdRI89Eww_GHZaHQ&s',
    location: { latitude: 30.2582, longitude: -97.7208 },
    checkInRadiusMeters: 100,
    autoExpireMinutes: 120,
  },
  {
    id: 'lifetime-austin-north',
    name: 'Life Time Austin North',
    address: '13725 Ranch Rd 620 N, Austin, TX 78717',
    city: 'Austin',
    state: 'TX',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    notes: '',
    imageUrl: 'https://media.lifetime.life/is/image/lifetimeinc/fso-gymnasium-01-1?crop=362,224,1360,1088&id=1701881564012&fit=crop,1&wid=390',
    location: { latitude: 30.4726, longitude: -97.7733 },
    checkInRadiusMeters: 100,
    autoExpireMinutes: 120,
  },
  {
    id: 'golds-gym-hesters-crossing',
    name: "Gold's Gym Hester's Crossing",
    address: '2400 S I-35 Frontage Rd, Round Rock, TX 78681',
    city: 'Round Rock',
    state: 'TX',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    notes: '',
    imageUrl: 'https://res.cloudinary.com/ggus-dev/image/private/s--HzKSnHnn--/c_auto%2Cg_center%2Cw_1200%2Ch_800/v1/25fcf1e9/austin-hesters-crossing-basketball.webp?_a=BAAAV6DQ',
    location: { latitude: 30.4865, longitude: -97.6789 },
    checkInRadiusMeters: 100,
    autoExpireMinutes: 120,
  },
  {
    id: 'fitness-connection-austin-north',
    name: 'Fitness Connection',
    address: '12901 N Interstate Hwy 35 Suite 900, Austin, TX 78753',
    city: 'Austin',
    state: 'TX',
    type: 'indoor',
    accessType: 'paid',
    status: 'active',
    notes: '',
    imageUrl: 'https://firebasestorage.googleapis.com/v0/b/runcheck-567a3.firebasestorage.app/o/gymImages%2Ffitness-connection-austin-north.jpg?alt=media&token=aefe2fc5-5248-404d-83ad-b71d411df4fb',
    location: { latitude: 30.412062, longitude: -97.671535 },
    checkInRadiusMeters: 100,
    autoExpireMinutes: 120,
  },
  {
    id: 'montopolis-rec-center-austin',
    name: 'Montopolis Recreation and Community Center',
    address: '1200 Montopolis Dr, Austin, TX 78741',
    city: 'Austin',
    state: 'TX',
    type: 'indoor',
    accessType: 'free',
    status: 'active',
    notes: 'Community Center',
    imageUrl: 'https://firebasestorage.googleapis.com/v0/b/runcheck-567a3.firebasestorage.app/o/gymImages%2Fmontopolis-rec-center-austin.jpg?alt=media&token=844f845f-d284-4f7b-8282-4f2e218c14bc',
    location: { latitude: 30.232372532425174, longitude: -97.69989329035879 },
    checkInRadiusMeters: 100,
    autoExpireMinutes: 120,
  },
  {
    id: 'veterans-park-round-rock',
    name: 'Veterans Park',
    address: '600 N Lee St, Round Rock, TX 78664',
    city: 'Round Rock',
    state: 'TX',
    type: 'outdoor',
    accessType: 'free',
    status: 'active',
    notes: 'Outdoor basketball courts at Veterans Park',
    imageUrl: 'https://firebasestorage.googleapis.com/v0/b/runcheck-567a3.firebasestorage.app/o/gymImages%2Fveterans-park-round-rock.jpg?alt=media&token=fb600660-abc1-40bf-be82-60f036c5b35e',
    location: { latitude: 30.51782715173148, longitude: -97.67570546006625 },
    checkInRadiusMeters: 100,
    autoExpireMinutes: 120,
  },
];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates a single gym entry. Returns an object with `errors` (hard failures)
 * and `warnings` (non-blocking issues).
 *
 * @param {object} gym - A gym entry from the `gyms` array.
 * @param {number} index - Array index (for readable error messages).
 * @returns {{ errors: string[], warnings: string[] }}
 */
function validateGym(gym, index) {
  const errors = [];
  const warnings = [];
  const prefix = `Gym[${index}] "${gym.name || gym.id || '???'}"`;

  // --- Required string fields ---
  for (const field of ['id', 'name', 'address', 'city', 'state']) {
    if (typeof gym[field] !== 'string' || gym[field].trim() === '') {
      errors.push(`${prefix}: missing or empty required field "${field}".`);
    }
  }

  // --- ID format ---
  if (gym.id && !GYM_ID_PATTERN.test(gym.id)) {
    errors.push(
      `${prefix}: id "${gym.id}" is not valid kebab-case. ` +
      `Expected format: lowercase-words-separated-by-hyphens.`
    );
  }

  // --- Enum fields ---
  if (!VALID_TYPES.includes(gym.type)) {
    errors.push(`${prefix}: type "${gym.type}" is not valid. Expected: ${VALID_TYPES.join(', ')}.`);
  }
  if (!VALID_ACCESS_TYPES.includes(gym.accessType)) {
    errors.push(`${prefix}: accessType "${gym.accessType}" is not valid. Expected: ${VALID_ACCESS_TYPES.join(', ')}.`);
  }
  if (!VALID_STATUSES.includes(gym.status)) {
    errors.push(`${prefix}: status "${gym.status}" is not valid. Expected: ${VALID_STATUSES.join(', ')}.`);
  }

  // --- Location ---
  if (!gym.location || typeof gym.location !== 'object') {
    errors.push(`${prefix}: missing "location" object.`);
  } else {
    const { latitude, longitude } = gym.location;
    if (typeof latitude !== 'number' || isNaN(latitude) || latitude < -90 || latitude > 90) {
      errors.push(`${prefix}: location.latitude is invalid (got ${latitude}).`);
    }
    if (typeof longitude !== 'number' || isNaN(longitude) || longitude < -180 || longitude > 180) {
      errors.push(`${prefix}: location.longitude is invalid (got ${longitude}).`);
    }

    // Region warning (not a hard failure)
    if (
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      (latitude < LAUNCH_REGION.latMin ||
        latitude > LAUNCH_REGION.latMax ||
        longitude < LAUNCH_REGION.lngMin ||
        longitude > LAUNCH_REGION.lngMax)
    ) {
      warnings.push(
        `${prefix}: coordinates (${latitude}, ${longitude}) are outside the ` +
        `${LAUNCH_REGION.label} launch region. This is allowed but may indicate a data entry error.`
      );
    }
  }

  // --- Numeric fields ---
  if (typeof gym.checkInRadiusMeters !== 'number' || gym.checkInRadiusMeters <= 0) {
    errors.push(`${prefix}: checkInRadiusMeters must be a positive number (got ${gym.checkInRadiusMeters}).`);
  }
  if (typeof gym.autoExpireMinutes !== 'number' || gym.autoExpireMinutes <= 0) {
    errors.push(`${prefix}: autoExpireMinutes must be a positive number (got ${gym.autoExpireMinutes}).`);
  }

  // --- System-managed fields should not be in seed data ---
  for (const field of SYSTEM_MANAGED_FIELDS) {
    if (field in gym) {
      errors.push(
        `${prefix}: contains system-managed field "${field}". ` +
        `Remove it from seed data — merge:true would overwrite live values.`
      );
    }
  }

  // --- Image URL (optional but validate if present) ---
  if (gym.imageUrl !== undefined) {
    if (typeof gym.imageUrl !== 'string' || !gym.imageUrl.startsWith('https://')) {
      warnings.push(`${prefix}: imageUrl should be an HTTPS URL (got "${gym.imageUrl}").`);
    } else if (!gym.imageUrl.includes('firebasestorage.googleapis.com')) {
      warnings.push(
        `${prefix}: imageUrl points to an external host. ` +
        `Migrate to Firebase Storage (gymImages/${gym.id}.jpg) when possible.`
      );
    }
  }

  return { errors, warnings };
}

/**
 * Validates the entire gyms array. Checks individual entries plus cross-entry
 * rules (duplicate IDs).
 *
 * @param {object[]} gymList - The gyms array.
 * @returns {{ errors: string[], warnings: string[], valid: boolean }}
 */
function validateAll(gymList) {
  let allErrors = [];
  let allWarnings = [];

  // Per-gym validation
  gymList.forEach((gym, i) => {
    const { errors, warnings } = validateGym(gym, i);
    allErrors = allErrors.concat(errors);
    allWarnings = allWarnings.concat(warnings);
  });

  // Cross-entry: duplicate IDs
  const ids = gymList.map((g) => g.id);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) {
      allErrors.push(`Duplicate gym ID: "${id}". Each gym must have a unique ID.`);
    }
    seen.add(id);
  }

  return {
    errors: allErrors,
    warnings: allWarnings,
    valid: allErrors.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Seed logic
// ---------------------------------------------------------------------------

async function seed(validateOnly) {
  console.log('=== RunCheck Gym Seed Script ===\n');

  // --- Validate ---
  console.log(`Validating ${gyms.length} gym(s)...\n`);
  const { errors, warnings, valid } = validateAll(gyms);

  if (warnings.length > 0) {
    console.log('⚠️  Warnings:');
    warnings.forEach((w) => console.log(`   ${w}`));
    console.log('');
  }

  if (!valid) {
    console.log('❌ Validation FAILED:');
    errors.forEach((e) => console.log(`   ${e}`));
    console.log('\nFix the errors above before seeding.');
    process.exit(1);
  }

  console.log('✅ Validation passed.\n');

  if (validateOnly) {
    console.log('--validate flag set. Skipping Firestore writes.');
    process.exit(0);
  }

  // --- Initialize Firebase Admin ---
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  const db = admin.firestore();

  // --- Write to Firestore ---
  console.log('Seeding production gyms...\n');

  for (const gym of gyms) {
    const { id, ...data } = gym;
    const docRef = db.collection('gyms').doc(id);

    // Check if document exists to decide whether to set createdAt
    const existing = await docRef.get();

    const writeData = {
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (!existing.exists) {
      writeData.createdAt = admin.firestore.FieldValue.serverTimestamp();
      console.log(`  + ${gym.name} (new)`);
    } else {
      console.log(`  ~ ${gym.name} (updated)`);
    }

    await docRef.set(writeData, { merge: true });
  }

  console.log(`\n✅ Done — ${gyms.length} gym(s) seeded.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const validateOnly = process.argv.includes('--validate');

seed(validateOnly).catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
