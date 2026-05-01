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

import { useState, useEffect, useRef, useCallback } from 'react';
import { unstable_batchedUpdates } from 'react-native';
import * as Location from 'expo-location';
import { auth } from '../config/firebase';
import {
  subscribeToUserPresence,
  checkIn as checkInService,
  checkOut as checkOutService,
  extendPresence as extendPresenceService,
} from '../services/presenceService';
import { getCurrentLocation, calculateDistanceMeters, isLocationGranted } from '../utils/locationUtils';
import { getGym } from '../services/gymService';
import { DEFAULT_CHECK_IN_RADIUS_METERS } from '../services/models';

// ── GPS-based session management constants ─────────────────────────────────────
/** How often GPS is polled while checked in (extension + leave detection). */
const EXTENSION_POLL_INTERVAL_MS = 60_000; // 1 minute

/** Extend the session when this much time or less remains on expiresAt. */
const EXTEND_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/** Consecutive out-of-radius GPS readings required before auto check-out fires. */
const OUT_OF_RADIUS_POLLS_TO_CHECKOUT = 2;

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

  // Client-side expiry timer — clears presence locally the moment expiresAt is reached.
  // This prevents the UI from showing the user as checked in after expiry, without
  // requiring a Firestore write, a Cloud Function, or a logout/login cycle.
  // The Firestore listener below will eventually confirm the cleared state once the
  // server-side cleanup runs, but the UI transition happens immediately here.
  useEffect(() => {
    if (!presence?.expiresAt) return;

    const expiresAt = presence.expiresAt.toDate();
    const msUntilExpiry = expiresAt - Date.now();

    // Already expired by the time this effect runs (e.g., app foregrounded after a long sleep)
    if (msUntilExpiry <= 0) {
      setPresence(null);
      return;
    }

    const timer = setTimeout(() => {
      setPresence(null);
    }, msUntilExpiry);

    return () => clearTimeout(timer);
  }, [presence]);

  // ── Ref tracking latest presence for use inside interval closures ─────────
  // Intervals capture variables at creation time — using a ref lets the poll
  // callback always read the current expiresAt without restarting the interval.
  const latestPresenceRef = useRef(presence);
  useEffect(() => {
    latestPresenceRef.current = presence;
  }, [presence]);

  // ── GPS-based session extension + auto-checkout-on-leave ──────────────────
  //
  // While checked in, polls GPS every EXTENSION_POLL_INTERVAL_MS (60s).
  //
  //  EXTEND: when expiresAt is within EXTEND_THRESHOLD_MS (30 min), and GPS
  //  confirms the user is still inside the gym radius, push expiresAt forward
  //  by DEFAULT_EXPIRE_MINUTES (2 hrs). A 4-hour pickup session stays live as
  //  long as the app is open and the user remains at the gym.
  //
  //  AUTO-CHECKOUT: after OUT_OF_RADIUS_POLLS_TO_CHECKOUT (2) consecutive GPS
  //  readings outside the gym radius, check the user out automatically.
  //  The 2-reading threshold guards against brief GPS noise / indoor drift.
  //
  //  ABANDONMENT: if the app is closed or backgrounded, GPS polling stops and
  //  expiresAt is never extended. After DEFAULT_EXPIRE_MINUTES (2 hrs) the
  //  expirePresence Cloud Function expires the session — "true abandonment"
  //  handled naturally with no extra code.
  useEffect(() => {
    if (!isCheckedIn || !presence?.gymId) return;

    const gymId = presence.gymId;
    let cachedGym   = null;  // gym doc (coordinates) fetched once per effect lifetime
    let outOfRadius = 0;     // consecutive out-of-radius counter
    let extending   = false; // guard against concurrent extension calls

    const poll = async () => {
      const cur = latestPresenceRef.current;
      // Stop if presence was cleared or the user is now at a different gym
      if (!cur || cur.gymId !== gymId) return;
      if (!auth.currentUser) return;

      const granted = await isLocationGranted();
      if (!granted) return;

      try {
        // Lazy-fetch the gym once; reuse on subsequent polls to avoid extra reads
        if (!cachedGym) {
          cachedGym = await getGym(gymId);
        }
        if (!cachedGym?.location?.latitude || !cachedGym?.location?.longitude) return;

        // Balanced accuracy: faster than High, good enough for a 100 m radius check.
        const position = await Location.getCurrentPositionAsync({
          accuracy:   Location.Accuracy.Balanced,
          timeout:    8_000,
          maximumAge: 30_000,
        });

        const radius   = cachedGym.checkInRadiusMeters || DEFAULT_CHECK_IN_RADIUS_METERS;
        const distance = calculateDistanceMeters(
          { latitude: position.coords.latitude, longitude: position.coords.longitude },
          cachedGym.location,
        );

        if (distance <= radius) {
          // ── User confirmed still at gym ─────────────────────────────────────
          outOfRadius = 0; // reset leave counter

          // Extend when approaching expiry (and not already extending)
          if (!extending && cur.expiresAt) {
            const msLeft = cur.expiresAt.toDate() - Date.now();
            if (msLeft < EXTEND_THRESHOLD_MS) {
              extending = true;
              if (__DEV__) {
                console.log(
                  `[PRESENCE] GPS confirmed at gym — extending session (${(msLeft / 60000).toFixed(0)} min left)`
                );
              }
              extendPresenceService(auth.currentUser.uid, gymId)
                .catch((err) => {
                  if (__DEV__) console.warn('[PRESENCE] Extension failed:', err.message);
                })
                .finally(() => { extending = false; });
            }
          }
        } else {
          // ── User outside gym radius ─────────────────────────────────────────
          outOfRadius += 1;
          if (__DEV__) {
            console.log(
              `[PRESENCE] Outside radius (${distance.toFixed(0)}m > ${radius}m) — consecutive count: ${outOfRadius}`
            );
          }
          if (outOfRadius >= OUT_OF_RADIUS_POLLS_TO_CHECKOUT) {
            if (__DEV__) console.log('[PRESENCE] Auto check-out — user has left the gym');
            checkOutService(false).catch((err) => {
              if (__DEV__) console.warn('[PRESENCE] Auto-checkout failed:', err.message);
            });
            // Don't reset counter — let the effect clean up once presence clears
          }
        }
      } catch {
        // GPS errors are silent — never disrupt the user's session
      }
    };

    // Short initial delay so the effect doesn't race with check-in write settling
    const initialDelay = setTimeout(poll, 10_000);
    const interval     = setInterval(poll, EXTENSION_POLL_INTERVAL_MS);

    return () => {
      clearTimeout(initialDelay);
      clearInterval(interval);
    };
  }, [isCheckedIn, presence?.gymId]);

  // Subscribe to the user's active presence document in Firestore.
  // When the document changes (e.g., auto-expiry deletes it), React state updates automatically.
  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false);
      setPresence(null);
      return;
    }

    const unsubscribe = subscribeToUserPresence(auth.currentUser.uid, (presenceData) => {
      unstable_batchedUpdates(() => {
        setPresence(presenceData);
        setLoading(false);
      });
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

    if (__DEV__) console.log('[HOOK] Starting check-in for gym:', gymId);

    setCheckingIn(true);
    setError(null);

    try {
      // 1. Get device location (handles permission + retrieval)
      if (__DEV__) console.log('[HOOK] Step 1: Getting user location...');
      const userLocation = await getCurrentLocation();
      if (__DEV__) console.log('[HOOK] User location obtained:', userLocation);

      // 2. Client-side distance check before hitting Firestore
      if (__DEV__) console.log('[HOOK] Step 2: Fetching gym data...');
      const gym = await getGym(gymId);

      if (!gym?.location) {
        if (__DEV__) console.error('[HOOK] Gym has no location configured');
        throw new Error('Gym location not configured');
      }

      if (__DEV__) console.log('[HOOK] Gym:', gym.name);
      if (__DEV__) console.log('[HOOK] Gym location:', gym.location);

      // Calculate straight-line distance between the user and the gym entrance
      const distance = calculateDistanceMeters(userLocation, gym.location);
      const radius = gym.checkInRadiusMeters || DEFAULT_CHECK_IN_RADIUS_METERS;

      if (__DEV__) console.log('[HOOK] Client-side distance check:', distance.toFixed(2), 'm (max:', radius, 'm)');

      // Client-side GPS distance gate (re-enabled for launch)
      if (distance > radius) {
        if (__DEV__) console.warn('[HOOK] Client-side: too far from gym');
        throw new Error(`You must be at the gym to check in. You are ${distance.toFixed(0)}m away (max ${radius}m).`);
      }

      if (__DEV__) console.log('[HOOK] Client-side validation PASSED');
      if (__DEV__) console.log('[HOOK] Step 3: Calling service-layer check-in...');

      // 3. Service-layer check-in (second safety layer validates again)
      const result = await checkInService(auth.currentUser.uid, gymId, userLocation);

      if (__DEV__) console.log('[HOOK] Check-in successful!');
      return result;
    } catch (err) {
      if (__DEV__) console.warn('[HOOK] Check-in failed:', err.message);
      setError(err.message);
      throw err;
    } finally {
      setCheckingIn(false);
    }
  }, []);

  /**
   * checkOut — Removes the user's active presence document from Firestore.
   *
   * Always calls presenceService.checkOut(isManual=true) because any checkout
   * triggered through the UI is by definition user-initiated. Auto-expiry is
   * handled server-side (Cloud Function — see TODO above) and will call
   * checkOut(isManual=false) directly, bypassing this hook.
   *
   * Manual checkout deducts 10 pts and removes the activity feed entry.
   *
   * @throws {Error} If the Firestore write fails.
   */
  const checkOut = useCallback(async () => {
    setCheckingOut(true);
    setError(null);

    try {
      // isManual=true: deduct points + delete activity entry
      const result = await checkOutService(true);
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

  // Derive active check-in state locally. A presence document is only considered
  // active if it exists AND its expiresAt timestamp is in the future.
  // The timer above handles the transition in real-time; this guard covers any
  // edge-case window where the timer hasn't fired yet (e.g., a new snapshot
  // arrives with a stale doc before the Cloud Function cleans it up).
  const isCheckedIn =
    !!presence &&
    (!presence.expiresAt || presence.expiresAt.toDate() > new Date());

  return {
    presence,
    loading,
    isCheckedIn,
    checkIn,
    checkOut,
    checkingIn,
    checkingOut,
    error,
    getTimeRemaining,
  };
};

export default usePresence;
