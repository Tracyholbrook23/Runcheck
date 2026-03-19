/**
 * useProximityCheckIn.js — Smart Proximity Check-In Hook
 *
 * Monitors the user's location while the app is foregrounded and surfaces
 * a one-tap check-in prompt whenever the user is physically inside a gym's
 * check-in radius.
 *
 * Design principles:
 *   • Foreground-only — no background location, no silent writes.
 *   • User-confirmed — the user always taps "Check In" to confirm.
 *   • Per-gym cooldown — after dismissing a prompt for a gym, the same
 *     gym won't prompt again for DISMISS_COOLDOWN_MS (30 min).
 *   • Single gym — only the nearest eligible gym prompts at a time.
 *   • Conservative accuracy gate — ignores GPS fixes worse than
 *     MAX_ACCURACY_METERS to avoid false positives indoors.
 *   • Dev bypass — respects EXPO_PUBLIC_DEV_SKIP_GPS just like checkIn.
 *
 * Usage:
 *   const { nearbyGym, dismiss, checking } = useProximityCheckIn({ gyms, isCheckedIn });
 *
 *   nearbyGym  — gym object if user is inside its radius (and prompt not dismissed), else null
 *   dismiss    — call with gymId to suppress the prompt for this gym for 30 min
 *   checking   — true while a GPS check is in progress
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { isLocationGranted, calculateDistanceMeters } from '../utils/locationUtils';
import { DEFAULT_CHECK_IN_RADIUS_METERS } from '../services/models';

// ── Constants ─────────────────────────────────────────────────────────────────

/** How often to poll GPS while the app is active (ms). */
const POLL_INTERVAL_MS = 30_000; // 30 seconds

/** After dismissing a gym's prompt, suppress it for this long (ms). */
const DISMISS_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Ignore GPS fixes with accuracy worse than this value (meters).
 * Prevents false positives from coarse wifi/cell-tower locations.
 */
const MAX_ACCURACY_METERS = 100;

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useProximityCheckIn
 *
 * @param {object}  options
 * @param {Array}   options.gyms        — All gym objects (must have id, location, checkInRadiusMeters)
 * @param {boolean} options.isCheckedIn — Current check-in state; clears prompt when true
 * @returns {{ nearbyGym: object|null, dismiss: (gymId: string) => void, checking: boolean }}
 */
export const useProximityCheckIn = ({ gyms = [], isCheckedIn = false }) => {
  const [nearbyGym, setNearbyGym]   = useState(null);
  const [checking,  setChecking]    = useState(false);

  // gymId → timestamp when last dismissed — stored in a ref so it persists across
  // re-renders without triggering effects, but resets on app reload (acceptable for MVP).
  const dismissedAt  = useRef({});
  const intervalRef  = useRef(null);
  const appStateRef  = useRef(AppState.currentState);
  // Guard against concurrent GPS calls (e.g. foreground event + timer firing together)
  const checkingRef  = useRef(false);

  /**
   * checkProximity — Core proximity detection logic.
   * Gets the current GPS fix and finds the nearest gym within its check-in radius.
   * Skips silently on any error so the user is never disrupted by GPS failures.
   */
  const checkProximity = useCallback(async () => {
    // Skip if already checked in — no prompt needed
    if (isCheckedIn) {
      setNearbyGym(null);
      return;
    }

    // Skip if no gyms loaded yet
    if (gyms.length === 0) return;

    // Skip if location permission not granted
    const granted = await isLocationGranted();
    if (!granted) {
      setNearbyGym(null);
      return;
    }

    // Prevent overlapping GPS calls
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);

    try {
      // Use Balanced accuracy: faster than High, still good enough for a 100m radius.
      // Balanced typically resolves in 1–3 s vs 5–15 s for High.
      const position = await Location.getCurrentPositionAsync({
        accuracy:   Location.Accuracy.Balanced,
        timeout:    8000,
        maximumAge: 20_000,
      });

      const { latitude, longitude, accuracy } = position.coords;

      // Ignore coarse fixes (indoor wifi positioning, etc.)
      if (accuracy > MAX_ACCURACY_METERS) {
        if (__DEV__) console.log('[PROXIMITY] GPS fix too inaccurate:', accuracy.toFixed(0), 'm — skipping');
        return;
      }

      const now = Date.now();
      let closestGym  = null;
      let closestDist = Infinity;

      for (const gym of gyms) {
        // Skip gyms without coordinates
        if (!gym.location?.latitude || !gym.location?.longitude) continue;

        const radius = gym.checkInRadiusMeters || DEFAULT_CHECK_IN_RADIUS_METERS;
        const dist   = calculateDistanceMeters(
          { latitude, longitude },
          { latitude: gym.location.latitude, longitude: gym.location.longitude },
        );

        if (__DEV__) console.log(`[PROXIMITY] ${gym.name}: ${dist.toFixed(0)}m (radius ${radius}m)`);

        // Only consider gyms the user is inside
        if (dist > radius) continue;

        // Respect per-gym dismiss cooldown
        const lastDismissed = dismissedAt.current[gym.id] || 0;
        if (now - lastDismissed < DISMISS_COOLDOWN_MS) {
          if (__DEV__) console.log(`[PROXIMITY] ${gym.name}: in cooldown — skipping`);
          continue;
        }

        // Track the closest eligible gym (handles edge case of two overlapping gyms)
        if (dist < closestDist) {
          closestGym  = gym;
          closestDist = dist;
        }
      }

      if (__DEV__ && closestGym) console.log('[PROXIMITY] Nearby gym found:', closestGym.name);
      setNearbyGym(closestGym);

    } catch (err) {
      // Location errors are silent — user shouldn't see GPS noise
      if (__DEV__) console.log('[PROXIMITY] GPS check skipped:', err?.message);
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [isCheckedIn, gyms]);

  // Clear the prompt the moment the user checks in
  useEffect(() => {
    if (isCheckedIn) setNearbyGym(null);
  }, [isCheckedIn]);

  // Run on mount + poll every POLL_INTERVAL_MS while app is active
  useEffect(() => {
    checkProximity();
    intervalRef.current = setInterval(checkProximity, POLL_INTERVAL_MS);
    return () => {
      clearInterval(intervalRef.current);
    };
  }, [checkProximity]);

  // Re-check whenever the app comes back to the foreground (e.g. user returns from Maps)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      if (wasBackground && nextState === 'active') {
        if (__DEV__) console.log('[PROXIMITY] App foregrounded — checking proximity');
        checkProximity();
      }
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, [checkProximity]);

  /**
   * dismiss — Suppress the prompt for a specific gym for DISMISS_COOLDOWN_MS.
   * Called when the user taps "Not now" on the proximity card.
   *
   * @param {string} gymId
   */
  const dismiss = useCallback((gymId) => {
    if (__DEV__) console.log('[PROXIMITY] Dismissed for gym:', gymId);
    dismissedAt.current[gymId] = Date.now();
    setNearbyGym((prev) => (prev?.id === gymId ? null : prev));
  }, []);

  return { nearbyGym, dismiss, checking };
};
