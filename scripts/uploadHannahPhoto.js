/**
 * uploadHannahPhoto.js
 *
 * Uploads the verified Hannah Community Center gym photo to Firebase Storage.
 * Photo source: Official City of East Lansing website (262x175, verified 2026-04-14)
 *
 * Usage (from the RunCheck/ directory):
 *   node scripts/uploadHannahPhoto.js
 *
 * Requires:
 *   - serviceAccountKey.json in the RunCheck/ root
 *   - scripts/hannah_court.jpg (already saved)
 */

'use strict';

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GYM_ID       = 'hannah-community-center-east-lansing';
const PHOTO_INDEX  = 1;
const BUCKET_NAME  = 'runcheck-567a3.firebasestorage.app';
const STORAGE_PATH = `gymImages/${GYM_ID}/${PHOTO_INDEX}.jpg`;

// Official City of East Lansing gymnasium photo (verified 2026-04-14)
const LOCAL_PHOTO  = path.join(__dirname, 'hannah_court.jpg');

// ---------------------------------------------------------------------------
// Firebase init
// ---------------------------------------------------------------------------

const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');

admin.initializeApp({
  credential:    admin.credential.cert(require(serviceAccountPath)),
  storageBucket: BUCKET_NAME,
});

const bucket = admin.storage().bucket();

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Reading local photo: ${LOCAL_PHOTO}`);
  const imageBuffer = fs.readFileSync(LOCAL_PHOTO);
  console.log(`  Read ${imageBuffer.length} bytes`);

  console.log(`Uploading to gs://${BUCKET_NAME}/${STORAGE_PATH}...`);
  const file = bucket.file(STORAGE_PATH);
  await file.save(imageBuffer, {
    metadata: { contentType: 'image/jpeg' },
    public: true,
    resumable: false,
  });

  const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${STORAGE_PATH}`;
  console.log('\n✅ Upload complete.');
  console.log(`\nPublic URL:\n  ${publicUrl}`);
  console.log('\nRun next: node seedProductionGyms.js');
}

main().catch((err) => {
  console.error('❌ Upload failed:', err.message);
  process.exit(1);
});
