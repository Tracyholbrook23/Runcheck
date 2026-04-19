/**
 * uploadHouseOfGainzPhoto.js — Updates the gym photo for House of Gainz.
 *
 * Downloads the verified Google Maps photo, uploads it to Firebase Storage,
 * then updates the imageUrl field on the Firestore gym document.
 *
 * Usage (from RunCheck project root):
 *   node scripts/uploadHouseOfGainzPhoto.js
 *
 * Requires:
 *   - serviceAccountKey.json in the project root
 *   - firebase-admin installed (already a devDependency)
 */

const admin = require('firebase-admin');
const https = require('https');
const http  = require('http');

// ── Firebase init ─────────────────────────────────────────────────────────────
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential:    admin.credential.cert(serviceAccount),
    storageBucket: 'runcheck-567a3.firebasestorage.app',
  });
}

const db     = admin.firestore();
const bucket = admin.storage().bucket();

// ── Config ────────────────────────────────────────────────────────────────────
const GYM_ID       = 'house-of-gainz-austin';
const STORAGE_PATH = `gymImages/${GYM_ID}/cover.jpg`;
const STORAGE_URL  = `https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/${STORAGE_PATH}`;
const PHOTO_URL    = 'https://lh3.googleusercontent.com/gps-cs-s/APNQkAEgn_UVP5HkxxpgtkSbSWIWQHa5HAWhfQ9NByYWdr1hssfb2eHK0rhoQvFYnvxA8G5WgG2L9M5jzo3iu-DbnpYMHbkuYWSlzK5v9bf4iSzWpflb8T4-8UgkrHMrDqbGysvXpdEFW_FgNwY=w243-h244-n-k-no-nu';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Download an image from a URL and return a Buffer. Follows redirects. */
function downloadImage(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    if (redirects === 0) return reject(new Error('Too many redirects'));
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(downloadImage(res.headers.location, redirects - 1));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Download failed: HTTP ${res.statusCode} — ${url}`));
      }
      const chunks = [];
      res.on('data',  (chunk) => chunks.push(chunk));
      res.on('end',   () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n📸  Updating gym photo for: ${GYM_ID}`);
  console.log(`    Source: ${PHOTO_URL}`);

  // 1. Download
  console.log('\n1/3  Downloading image...');
  const imageBuffer = await downloadImage(PHOTO_URL);
  console.log(`     ✓ Downloaded ${(imageBuffer.length / 1024).toFixed(1)} KB`);

  // 2. Upload to Firebase Storage
  console.log(`\n2/3  Uploading to Firebase Storage at ${STORAGE_PATH}...`);
  const file = bucket.file(STORAGE_PATH);
  await file.save(imageBuffer, {
    metadata: { contentType: 'image/jpeg' },
    public: true,
  });
  console.log(`     ✓ Uploaded — public URL: ${STORAGE_URL}`);

  // 3. Update Firestore gym document
  console.log(`\n3/3  Updating Firestore gyms/${GYM_ID}...`);
  await db.collection('gyms').doc(GYM_ID).update({
    imageUrl:  STORAGE_URL,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`     ✓ imageUrl updated in Firestore`);

  console.log('\n✅  Done! House of Gainz photo updated.\n');
  process.exit(0);
}

run().catch((err) => {
  console.error('\n❌  Script failed:', err.message);
  process.exit(1);
});
