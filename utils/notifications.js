/**
 * notifications.js — Push Notification Utilities
 *
 * Provides `registerPushToken`, a one-shot utility that requests push
 * notification permission from the device, retrieves the user's Expo
 * push token, and persists it to Firestore so the backend can target
 * this device for future notifications.
 *
 * Usage:
 *   Call `registerPushToken()` once from a top-level component (e.g.
 *   ProfileScreen) on mount. Subsequent calls are safe — they will
 *   silently update the token if it has changed.
 *
 * Requirements:
 *   - expo-notifications installed and configured in app.json
 *   - User must be signed in (auth.currentUser must be set)
 *
 * @module notifications
 */

import * as Notifications from 'expo-notifications';
import { auth, db } from '../config/firebase';
import { doc, updateDoc } from 'firebase/firestore';

/**
 * registerPushToken — Requests notification permission and saves the
 * Expo push token to the signed-in user's Firestore document.
 *
 * Flow:
 *   1. Check existing permission status.
 *   2. If not granted, prompt the user.
 *   3. If still not granted, log and return null (non-blocking).
 *   4. Retrieve the Expo push token.
 *   5. Write the token to `users/{uid}.pushToken` in Firestore.
 *
 * Non-critical: the function catches and logs all errors rather than
 * throwing, so a failure here never blocks UI.
 *
 * @returns {Promise<string | null>} The Expo push token string, or null
 *   if permission was denied or an error occurred.
 */
export const registerPushToken = async () => {
  try {
    // Step 1: Check current permission status
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Step 2: Request permission if not already granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    // Step 3: Bail out gracefully if permission is denied
    if (finalStatus !== 'granted') {
      console.log('notifications: push permission not granted');
      return null;
    }

    // Step 4: Retrieve the Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;

    // Step 5: Persist the token to Firestore
    const uid = auth.currentUser?.uid;
    if (uid && token) {
      await updateDoc(doc(db, 'users', uid), { pushToken: token });
    }

    return token;
  } catch (err) {
    // Non-critical — log but do not surface to the user
    console.warn('registerPushToken error:', err);
    return null;
  }
};
