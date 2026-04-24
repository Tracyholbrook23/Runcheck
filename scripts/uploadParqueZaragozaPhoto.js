/**
 * uploadParqueZaragozaPhoto.js — Updates the gym photo for Parque Zaragoza Recreation Center.
 *
 * Uploads the locally saved photo to Firebase Storage, then updates
 * the imageUrl field on the Firestore gym document.
 *
 * Usage (from RunCheck project root):
 *   node scripts/uploadParqueZaragozaPhoto.js
 *
 * Requires:
 *   - serviceAccountKey.json in the project root
 *   - scripts/parque_zaragoza_court.jpg (already saved)
 *   - firebase-admin installed (already a devDependency)
 */

'use strict';

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

// ── Firebase init ─────────────────────────────────────────────────────────────
const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential:    admin.credential.cert(require(serviceAccountPath)),
    storageBucket: 'runcheck-567a3.firebasestorage.app',
  });
}

const db     = admin.firestore();
const bucket = admin.storage().bucket();

// ── Config ────────────────────────────────────────────────────────────────────
const GYM_ID       = 'parque-zaragoza-recreation-center';
const STORAGE_PATH = `gymImages/${GYM_ID}/cover.jpg`;
const STORAGE_URL  = `https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/${STORAGE_PATH}`;
const LOCAL_PHOTO  = path.join(__dirname, 'parque_zaragoza_court.jpg');

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n📸  Updating gym photo for: ${GYM_ID}`);

  // 1. Read local file
  console.log(`\n1/3  Reading local photo: ${LOCAL_PHOTO}`);
  const imageBuffer = fs.readFileSync(LOCAL_PHOTO);
  console.log(`     ✓ Read ${(imageBuffer.length / 1024).toFixed(1)} KB`);

  // 2. Upload to Firebase Storage
  console.log(`\n2/3  Uploading to Firebase Storage at ${STORAGE_PATH}...`);
  const file = bucket.file(STORAGE_PATH);
  await file.save(imageBuffer, {
    metadata: { contentType: 'image/jpeg' },
    public: true,
    resumable: false,
  });
  console.log(`     ✓ Uploaded — public URL: ${STORAGE_URL}`);

  // 3. Update Firestore gym document
  console.log(`\n3/3  Updating Firestore gyms/${GYM_ID}...`);
  await db.collection('gyms').doc(GYM_ID).update({
    imageUrl:  STORAGE_URL,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`     ✓ imageUrl updated in Firestore`);

  console.log('\n✅  Done! Parque Zaragoza Recreation Center photo updated.\n');
  process.exit(0);
}

run().catch((err) => {
  console.error('\n❌  Script failed:', err.message);
  process.exit(1);
});
