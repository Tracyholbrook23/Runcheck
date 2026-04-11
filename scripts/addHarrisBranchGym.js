/**
 * addHarrisBranchGym.js — One-time script to upload the HOA Harris Branch
 * basketball court photo to Firebase Storage, then seed the gym document.
 *
 * Usage (from RunCheck project root):
 *   node scripts/addHarrisBranchGym.js
 *
 * Requires:
 *   - serviceAccountKey.json in the project root
 *   - npm install firebase-admin (already installed)
 */

const admin = require('firebase-admin');
const https = require('https');
const path = require('path');

// ---------------------------------------------------------------------------
// Firebase init
// ---------------------------------------------------------------------------

const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'runcheck-567a3.firebasestorage.app',
  });
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

// ---------------------------------------------------------------------------
// Gym data
// ---------------------------------------------------------------------------

const GYM_ID = 'hoa-harris-branch-basketball-court';
const STORAGE_PATH = `gymImages/${GYM_ID}/1.jpg`;
const STORAGE_PUBLIC_URL = `https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/${STORAGE_PATH}`;

// Google Maps photo — requesting a larger size than the thumbnail in the URL
const PHOTO_URL =
  'https://lh3.googleusercontent.com/gps-cs-s/AHVAweo4Z-wuCS9VSbqNagLgbo9tj9G9zCXckPsxKydomnfjvdNbASXy9xZUMCAzTN5g4pz7ZsiLj-Kow5CYmHpOS40z4p4ldDXL599_RkBwRguzKuHDErodlEX17r17phKyKZcqrl1r=w1200-h900-k-no';

const GYM_DOC = {
  name: 'HOA Harris Branch Basketball Court',
  address: '11401 Farmhaven Rd, Austin, TX 78754',
  city: 'Austin',
  state: 'TX',
  zip: '78754',
  type: 'outdoor',
  accessType: 'free',
  status: 'active',
  notes: 'Outdoor basketball court in the Harris Branch HOA community',
  imageUrl: STORAGE_PUBLIC_URL,
  photoGallery: [STORAGE_PUBLIC_URL],
  location: new admin.firestore.GeoPoint(30.351231740052178, -97.61676429662909),
  checkInRadiusMeters: 100,
  autoExpireMinutes: 120,
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function downloadImageBuffer(url) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow redirect
        return downloadImageBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} fetching image`));
      }
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('▶ Downloading photo from Google Maps...');
  const imageBuffer = await downloadImageBuffer(PHOTO_URL);
  console.log(`  Downloaded ${(imageBuffer.length / 1024).toFixed(1)} KB`);

  console.log(`▶ Uploading to Firebase Storage: ${STORAGE_PATH}`);
  const file = bucket.file(STORAGE_PATH);
  await file.save(imageBuffer, {
    metadata: { contentType: 'image/jpeg' },
    public: true,
  });
  console.log(`  Uploaded → ${STORAGE_PUBLIC_URL}`);

  console.log(`▶ Writing Firestore gym document: gyms/${GYM_ID}`);
  const gymRef = db.collection('gyms').doc(GYM_ID);
  const existing = await gymRef.get();
  const docData = existing.exists
    ? GYM_DOC
    : { ...GYM_DOC, createdAt: admin.firestore.FieldValue.serverTimestamp(), currentPresenceCount: 0 };

  await gymRef.set(docData, { merge: true });
  console.log('  Done ✓');

  console.log('\n✅ HOA Harris Branch Basketball Court added successfully.');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
