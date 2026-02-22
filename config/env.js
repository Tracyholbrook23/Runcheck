// Environment configuration for Expo
// Variables must be prefixed with EXPO_PUBLIC_ to be accessible in the bundle.

const ENV = {
  FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  FIREBASE_AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  FIREBASE_MESSAGING_SENDER_ID: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  FIREBASE_MEASUREMENT_ID: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,

  // When "true", firebase.js connects all services to the local Emulator Suite
  // instead of production.  Set via EXPO_PUBLIC_USE_EMULATORS in .env.
  // ⚠️  Never ship to production with this set to "true".
  USE_EMULATORS: process.env.EXPO_PUBLIC_USE_EMULATORS === 'true',
};

export default ENV;
