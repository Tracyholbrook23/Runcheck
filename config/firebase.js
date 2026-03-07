/**
 * config/firebase.js — Firebase Initialisation & Emulator Connections
 *
 * This is the single source of truth for every Firebase service used in the
 * RunCheck app.  It exports ready-to-use instances of:
 *   • auth      — Firebase Auth (with AsyncStorage persistence for RN)
 *   • db        — Firestore database
 *   • functions — Cloud Functions (us-central1)
 *   • storage   — Firebase Storage (for profile photos & media)
 *
 * ─── Emulator Mode ────────────────────────────────────────────────────────────
 * When EXPO_PUBLIC_USE_EMULATORS=true in .env, ALL three services are wired to
 * the local Firebase Emulator Suite:
 *
 *   Auth      → http://127.0.0.1:9099
 *   Firestore → http://127.0.0.1:8080
 *   Functions → http://127.0.0.1:5001
 *
 * Nothing in production is ever touched while this flag is on.
 *
 * ─── Hot-reload guard ────────────────────────────────────────────────────────
 * Expo Fast Refresh re-evaluates this module on every save, but the underlying
 * Firebase SDK persists across reloads.  Calling connectXEmulator() more than
 * once throws "already connected".  The `emulatorsLinked` flag prevents that.
 *
 * ─── Usage ───────────────────────────────────────────────────────────────────
 *   import { auth, db, functions, callFunction, callHttpFunction } from '../config/firebase';
 *
 *   // Callable Cloud Function (onCall):
 *   const gym = await callFunction('addGym', { name: 'Central Park', location: { lat: 40.7, lng: -74 } });
 *
 *   // HTTP Cloud Function (onRequest / GET with query params):
 *   const { runs } = await callHttpFunction('getRuns', { gymId: 'abc123' });
 */

import { initializeApp, getApps } from 'firebase/app';
import {
  getReactNativePersistence,
  initializeAuth,
  connectAuthEmulator,
  getAuth,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from 'firebase/functions';
import ENV from './env';

// ─── Firebase project config (values come from .env via config/env.js) ────────
// These values identify the project but do NOT grant access on their own.
// All security is enforced by Firebase Security Rules + Cloud Functions auth.
const firebaseConfig = {
  apiKey: ENV.FIREBASE_API_KEY,
  authDomain: ENV.FIREBASE_AUTH_DOMAIN,
  projectId: ENV.FIREBASE_PROJECT_ID,
  storageBucket: ENV.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: ENV.FIREBASE_MESSAGING_SENDER_ID,
  appId: ENV.FIREBASE_APP_ID,
  measurementId: ENV.FIREBASE_MEASUREMENT_ID,
};

// ─── Singleton app init ────────────────────────────────────────────────────────
// `getApps()` returns the list of already-initialised apps.  If one exists we
// reuse it; otherwise we create it.  This prevents "duplicate app" errors on
// Expo Fast Refresh.
const isNewApp = getApps().length === 0;
const app = isNewApp ? initializeApp(firebaseConfig) : getApps()[0];

// ─── Auth — with AsyncStorage persistence (required for React Native) ──────────
// initializeAuth must only be called once — it registers the persistence adapter.
// On Fast Refresh the module re-evaluates but the Firebase SDK persists, so
// calling initializeAuth again throws auth/already-initialized.
// We use the same `isNewApp` flag to decide: first run → initializeAuth,
// subsequent runs → getAuth (which returns the already-configured instance).
const auth = isNewApp
  ? initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })
  : getAuth(app);

// ─── Firestore ────────────────────────────────────────────────────────────────
const db = getFirestore(app);

// ─── Cloud Functions (us-central1 matches the backend deployment region) ──────
const functions = getFunctions(app, 'us-central1');

// ─── Firebase Storage ─────────────────────────────────────────────────────────
const storage = getStorage(app);

// ─── Emulator connections ─────────────────────────────────────────────────────
// The flag below ensures we only call connectXEmulator once per JS runtime even
// if Fast Refresh re-evaluates this module multiple times.
let emulatorsLinked = false;

if (ENV.USE_EMULATORS && !emulatorsLinked) {
  emulatorsLinked = true;

  // Auth emulator — note the full http:// URL (no trailing slash)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: false });

  // Firestore emulator — host + port are separate params
  connectFirestoreEmulator(db, '127.0.0.1', 8080);

  // Functions emulator — host + port are separate params
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);

  console.log(
    '\n🔧 [RunCheck] Firebase Emulator Suite connected\n' +
    '   Auth      → http://127.0.0.1:9099\n' +
    '   Firestore → http://127.0.0.1:8080\n' +
    '   Functions → http://127.0.0.1:5001\n' +
    '   UI        → http://127.0.0.1:4000\n'
  );
} else if (!ENV.USE_EMULATORS) {
  console.log('🔥 [RunCheck] Firebase connected to PRODUCTION (runcheck-567a3)');
}

// ─── Callable function helper ─────────────────────────────────────────────────
/**
 * callFunction — Invoke an `onCall` Cloud Function.
 *
 * Wraps `httpsCallable` so callers don't need to import firebase/functions.
 * The emulator is used automatically when USE_EMULATORS=true.
 *
 * @param {string} name   - Exported function name (e.g. 'addGym', 'checkIn')
 * @param {object} data   - Payload to send
 * @returns {Promise<any>} - Unwrapped result (the `data` field from the response)
 *
 * @example
 *   const result = await callFunction('addGym', { name: 'YMCA', location: { lat: 32.7, lng: -97.3 } });
 */
export async function callFunction(name, data = {}) {
  const fn = httpsCallable(functions, name);
  const response = await fn(data);
  return response.data;
}

// ─── HTTP function helper ─────────────────────────────────────────────────────
/**
 * callHttpFunction — Invoke an `onRequest` (HTTP GET) Cloud Function.
 *
 * `getRuns` is an onRequest function that requires a Bearer token and accepts
 * query parameters — it cannot be called via httpsCallable.  This helper:
 *   1. Gets the current user's ID token from Firebase Auth.
 *   2. Builds the correct emulator / production URL.
 *   3. Appends query params and attaches the Authorization header.
 *   4. Returns the parsed JSON body.
 *
 * @param {string} functionName - Exported function name (e.g. 'getRuns')
 * @param {object} queryParams  - Key/value pairs appended as query string
 * @returns {Promise<any>}      - Parsed JSON response body
 *
 * @example
 *   const { runs } = await callHttpFunction('getRuns', { gymId: 'abc123' });
 */
export async function callHttpFunction(functionName, queryParams = {}) {
  // Build the base URL for either emulator or production
  const base = ENV.USE_EMULATORS
    ? `http://127.0.0.1:5001/${ENV.FIREBASE_PROJECT_ID}/us-central1`
    : `https://us-central1-${ENV.FIREBASE_PROJECT_ID}.cloudfunctions.net`;

  const qs = new URLSearchParams(queryParams).toString();
  const url = `${base}/${functionName}${qs ? `?${qs}` : ''}`;

  // Attach a Bearer token so the function can verify the caller's identity
  const currentUser = auth.currentUser;
  const token = currentUser ? await currentUser.getIdToken() : null;

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  console.log(`[callHttpFunction] GET ${url}`);

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} from ${functionName}: ${body}`);
  }
  return res.json();
}

export { auth, db, functions, storage };
