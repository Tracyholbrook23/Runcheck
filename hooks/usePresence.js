/**
 * usePresence.js — User Check-In / Check-Out Hook
 *
 * Manages the currently signed-in user's gym presence. Subscribes to
 * Firestore in real-time so the UI always reflects the live check-in
 * state without manual polling.
 *
 * Check-in uses a two-layer GPS validation strategy:
 *   1. Client-side distance check (fast, no server round-trip) using
 *      the Haversine formula in `locationUtils`.
 *   2. Service-layer check (second validation inside `presenceService`)
 *      as a safety net against spoofed client data.
 *
 * @example
 * const { isCheckedIn, checkIn, checkOut, getTimeRemaining } = usePresence();
 */

import { useState, useEffect, useCallback } from 'react';
import { auth } from '../config/firebase';
import {
  subscribeToUserPresence,
  checkIn as checkInService,
  checkOut as checkOutService,
} from '../services/presenceService';
import { getCurrentLocation, calculateDistanceMeters } from '../utils/locationUtils';
import { getGym } from '../services/gymService';
import { DEFAULT_CHECK_IN_RADIUS_METERS } from '../services/models';

/**
 * usePresence — Hook for managing the current user's gym check-in state.
 *
 * @returns {{
 *   presence: object | null,      Active presence document from Firestore, or null.
 *   loading: boolean,             True while the initial Firestore subscription resolves.
 *   isCheckedIn: boolean,         Shorthand — true when presence is non-null.
 *   checkIn: (gymId: string) => Promise<void>,  GPS-validated check-in function.
 *   checkOut: () => Promise<void>,              Removes the user's active presence.
 *   checkingIn: boolean,          True while a check-in request is in flight.
 *   checkingOut: boolean,         True while a check-out request is in flight.
 *   error: string | null,         Last error message, cleared on each new action.
 *   getTimeRemaining: () => string | null  Human-readable time until auto-expiry.
 * }}
 */
export const usePresence = () => {
  const [presence, setPresence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState(null);

  // Subscribe to the user's active presence document in Firestore.
  // When the document changes (e.g., auto-expiry deletes it), React state updates automatically.
  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false);
      setPresence(null);
      return;
    }

    const unsubscribe = subscribeToUserPresence(auth.currentUser.uid, (presenceData) => {
      setPresence(presenceData);
      setLoading(false);
    });

    return unsubscribe;
  }, [auth.currentUser?.uid]);

  /**
   * checkIn — Validates GPS proximity then writes a presence document to Firestore.
   *
   * Steps:
   *   1. Acquire the device's current GPS coordinates.
   *   2. Fetch the target gym's stored `location` from Firestore.
   *   3. Calculate straight-line distance (Haversine) between user and gym.
   *   4. Reject if distance exceeds the gym's configured radius (defaults to
   *      `DEFAULT_CHECK_IN_RADIUS_METERS` if the gym hasn't set a custom value).
   *   5. Delegate to `presenceService.checkIn` for the actual Firestore write
   *      (the service performs a second server-side validation as an extra layer).
   *
   * @param {string} gymId — Firestore document ID of the gym to check into.
   * @throws {Error} If location permission is denied, GPS is unavailable, or the
   *                 user is outside the allowed check-in radius.
   */
  const checkIn = useCallback(async (gymId) => {
    if (!auth.currentUser) {
      throw new Error('Must be logged in to check in');
    }

    console.log('🎯 [HOOK] Starting check-in for gym:', gymId);

    setCheckingIn(true);
    setError(null);

    try {
      // 1. Get device location (handles permission + retrieval)
      console.log('🎯 [HOOK] Step 1: Getting user location...');
      const userLocation = await getCurrentLocation();
      console.log('🎯 [HOOK] User location obtained:', userLocation);

      // 2. Client-side distance check before hitting Firestore
      console.log('🎯 [HOOK] Step 2: Fetching gym data...');
      const gym = await getGym(gymId);

      if (!gym?.location) {
        console.error('❌ [HOOK] Gym has no location configured');
        throw new Error('Gym location not configured');
      }

      console.log('🎯 [HOOK] Gym:', gym.name);
      console.log('🎯 [HOOK] Gym location:', gym.location);

      // Calculate straight-line distance between the user and the gym entrance
      const distance = calculateDistanceMeters(userLocation, gym.location);
      const radius = gym.checkInRadiusMeters || DEFAULT_CHECK_IN_RADIUS_METERS;

      console.log('🎯 [HOOK] Client-side distance check:', distance.toFixed(2), 'm (max:', radius, 'm)');

      if (distance > radius) {
        console.error('❌ [HOOK] Client-side validation FAILED - Too far from gym');
        throw new Error(`You must be at the gym to check in. You are ${distance.toFixed(0)}m away (max ${radius}m).`);
      }

      console.log('✅ [HOOK] Client-side validation PASSED');
      console.log('🎯 [HOOK] Step 3: Calling service-layer check-in...');

      // 3. Service-layer check-in (second safety layer validates again)
      const result = await checkInService(auth.currentUser.uid, gymId, userLocation);

      console.log('✅ [HOOK] Check-in successful!');
      return result;
    } catch (err) {
      console.error('❌ [HOOK] Check-in failed:', err.message);
      setError(err.message);
      throw err;
    } finally {
      setCheckingIn(false);
    }
  }, []);

  /**
   * checkOut — Removes the user's active presence document from Firestore.
   *
   * Delegates entirely to `presenceService.checkOut`. Manages loading and
   * error state locally so the calling screen can react to the outcome.
   *
   * @throws {Error} If the Firestore write fails.
   */
  const checkOut = useCallback(async () => {
    setCheckingOut(true);
    setError(null);

    try {
      const result = await checkOutService();
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setCheckingOut(false);
    }
  }, []);

  /**
   * getTimeRemaining — Calculates a human-readable countdown to presence expiry.
   *
   * Reads the `expiresAt` Firestore Timestamp from the active presence document,
   * converts it to a JS Date, and formats the difference from now.
   *
   * @returns {string | null} Formatted string like "45m" or "1h 12m", or null
   *                          if there is no active presence.
   */
  const getTimeRemaining = useCallback(() => {
    if (!presence?.expiresAt) return null;

    const expiresAt = presence.expiresAt.toDate();
    const minutes = Math.max(0, Math.round((expiresAt - new Date()) / 60000));

    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }, [presence]);

  return {
    presence,
    loading,
    isCheckedIn: !!presence,
    checkIn,
    checkOut,
    checkingIn,
    checkingOut,
    error,
    getTimeRemaining,
  };
};

export default usePresence;
