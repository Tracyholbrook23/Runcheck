/**
 * useProximityCheckIn.js — Smart Proximity Check-In Hook
 *
 * Monitors the user's location while the app is foregrounded and surfaces
 * a one-tap check-in prompt whenever the user is physically inside a gym's
 * check-in radius.
 *
 * Design principles:
 *   • Foreground-only — no background location, no silent writes.
 *   • User-confirmed — the user always taps "Check In" to confirm (for unscheduled visits).
 *   • Auto check-in — if the user has a scheduled visit at the detected gym and is
 *     within the ±60-min grace window, the hook fires onAutoCheckIn(gym) silently
 *     without requiring a tap. Fires at most once per gym per app session.
 *   • Per-gym cooldown — after dismissing a prompt for a gym, the same
 *     gym won't prompt again for DISMISS_COOLDOWN_MS (30 min).
 *   • Single gym — only the nearest eligible gym prompts at a time.
 *   • Conservative accuracy gate — ignores GPS fixes worse than
 *     MAX_ACCURACY_METERS to avoid false positives indoors.
 *   • Dev bypass — respects EXPO_PUBLIC_DEV_SKIP_GPS just like checkIn.
 *
 * Usage:
 *   const { nearbyGym, dismiss, checking } = useProximityCheckIn({
 *     gyms,
 *     isCheckedIn,
 *     userSchedules,    // optional — array of active schedule docs for the current user
 *     onAutoCheckIn,    // optional — called with gym when auto check-in fires
 *   });
 *
 *   nearbyGym    — gym object if user is inside its radius (and prompt not dismissed), else null
 *   dismiss      — call with gymId to suppress the prompt for this gym for 30 min
 *   checking     — true while a GPS check is in progress
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { isLocationGranted, calculateDistanceMeters } from '../utils/locationUtils';
import { DEFAULT_CHECK_IN_RADIUS_METERS, SCHEDULE_GRACE_PERIOD_MINUTES } from '../services/models';

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

/**
 * Maximum speed (m/s) at which auto check-in is allowed.
 * Above this threshold the user is almost certainly in a vehicle passing by.
 * 5 m/s ≈ 11 mph — fast jog / slow car. Walking is ~1.4 m/s.
 * We use a generous threshold to avoid penalising cyclists or e-scooters.
 * If speed is unavailable (returns -1 or null on some devices) we allow it through.
 */
const MAX_AUTO_CHECKIN_SPEED_MS = 5; // m/s

/**
 * Number of consecutive GPS polls the user must be inside a gym's radius
 * before auto check-in fires. At POLL_INTERVAL_MS = 30s, 2 polls = 60 seconds.
 * A driver passing by is inside the radius for at most one poll.
 * Someone actually at the gym stays in range across multiple polls.
 */
const DWELL_POLLS_REQUIRED = 2;

/**
 * findScheduledVisit — Check if the user has an active scheduled visit
 * at a gym within the ±SCHEDULE_GRACE_PERIOD_MINUTES window.
 *
 * @param {string} gymId
 * @param {Array}  userSchedules — array of schedule docs from Firestore
 * @returns {object|null} matching schedule or null
 */
const findScheduledVisit = (gymId, userSchedules) => {
  if (!gymId || !userSchedules?.length) return null;

  const now = Date.now();
  const gracePeriodMs = SCHEDULE_GRACE_PERIOD_MINUTES * 60 * 1000;
  const windowStart = now - gracePeriodMs;
  const windowEnd   = now + gracePeriodMs;

  return userSchedules.find((s) => {
    if (s.gymId !== gymId) return false;
    const scheduledMs = s.scheduledTime?.toDate?.()?.getTime?.() ?? null;
    if (scheduledMs === null) return false;
    return scheduledMs >= windowStart && scheduledMs <= windowEnd;
  }) ?? null;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useProximityCheckIn
 *
 * @param {object}    options
 * @param {Array}     options.gyms           — All gym objects (must have id, location, checkInRadiusMeters)
 * @param {boolean}   options.isCheckedIn    — Current check-in state; clears prompt when true
 * @param {Array}     [options.userSchedules] — Active schedule docs for the current user (optional)
 * @param {Function}  [options.onAutoCheckIn] — Called with gym object when auto check-in fires (optional)
 * @returns {{ nearbyGym: object|null, dismiss: (gymId: string) => void, checking: boolean }}
 */
export const useProximityCheckIn = ({
  gyms = [],
  isCheckedIn = false,
  userSchedules = [],
  onAutoCheckIn = null,
}) => {
  const [nearbyGym, setNearbyGym]   = useState(null);
  const [checking,  setChecking]    = useState(false);

  // gymId → timestamp when last dismissed — stored in a ref so it persists across
  // re-renders without triggering effects, but resets on app reload (acceptable for MVP).
  const dismissedAt      = useRef({});
  const intervalRef      = useRef(null);
  const appStateRef      = useRef(AppState.currentState);
  // Guard against concurrent GPS calls (e.g. foreground event + timer firing together)
  const checkingRef      = useRef(false);
  // Set of gymIds that have already been auto-checked-in this session — prevents re-firing
  const autoCheckedInRef = useRef(new Set());
  // gymId → consecutive poll count inside radius (dwell tracking for auto check-in)
  const dwellCountRef    = useRef({});

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

      const { latitude, longitude, accuracy, speed } = position.coords;

      // Ignore coarse fixes (indoor wifi positioning, etc.)
      if (accuracy > MAX_ACCURACY_METERS) {
        if (__DEV__) console.log('[PROXIMITY] GPS fix too inaccurate:', accuracy.toFixed(0), 'm — skipping');
        return;
      }

      // Speed check for auto check-in — positive speed above threshold means vehicle.
      // speed is null or -1 when unavailable (some iOS modes); treat that as OK.
      const speedMs = (speed != null && speed >= 0) ? speed : 0;
      const movingTooFast = speedMs > MAX_AUTO_CHECKIN_SPEED_MS;
      if (__DEV__ && movingTooFast) {
        console.log('[PROXIMITY] Speed too high for auto check-in:', speedMs.toFixed(1), 'm/s');
      }

      const now = Date.now();
      let closestGym  = null;
      let closestDist = Infinity;

      // Track which gyms are inside radius this poll so we can reset dwell
      // counters for gyms the user has left.
      const insideThisPoll = new Set();

      for (const gym of gyms) {
        // Skip gyms without coordinates
        if (!gym.location?.latitude || !gym.location?.longitude) continue;

        const radius = gym.checkInRadiusMeters || DEFAULT_CHECK_IN_RADIUS_METERS;
        const dist   = calculateDistanceMeters(
          { latitude, longitude },
          { latitude: gym.location.latitude, longitude: gym.location.longitude },
        );

        // Only consider gyms the user is inside
        if (dist > radius) continue;

        insideThisPoll.add(gym.id);

        // ── Auto check-in path ───────────────────────────────────────────────
        // Guards: correct schedule, not already done, not in a vehicle, dwell met.
        if (onAutoCheckIn && !autoCheckedInRef.current.has(gym.id)) {
          const matchingSchedule = findScheduledVisit(gym.id, userSchedules);
          if (matchingSchedule) {
            if (movingTooFast) {
              // Speed guard: reset dwell so they need to be stationary for N polls
              dwellCountRef.current[gym.id] = 0;
              if (__DEV__) console.log('[PROXIMITY] Moving too fast — resetting dwell for', gym.name);
            } else {
              // Increment dwell counter for this gym
              dwellCountRef.current[gym.id] = (dwellCountRef.current[gym.id] || 0) + 1;
              const dwell = dwellCountRef.current[gym.id];
              if (__DEV__) console.log(`[PROXIMITY] Dwell count for ${gym.name}:`, dwell, '/', DWELL_POLLS_REQUIRED);

              if (dwell >= DWELL_POLLS_REQUIRED) {
                if (__DEV__) console.log('[PROXIMITY] Auto check-in firing for scheduled gym:', gym.name);
                autoCheckedInRef.current.add(gym.id);
                delete dwellCountRef.current[gym.id];
                onAutoCheckIn(gym, matchingSchedule);
                // Don't set nearbyGym — no manual prompt needed
                continue;
              }
            }
            // Dwell not met yet — skip manual prompt for this gym too
            continue;
          }
        }

        // ── Manual prompt path ───────────────────────────────────────────────
        // Respect per-gym dismiss cooldown
        const lastDismissed = dismissedAt.current[gym.id] || 0;
        if (now - lastDismissed < DISMISS_COOLDOWN_MS) continue;

        // Track the closest eligible gym (handles edge case of two overlapping gyms)
        if (dist < closestDist) {
          closestGym  = gym;
          closestDist = dist;
        }
      }

      // Reset dwell counters for gyms the user has left this poll
      for (const gymId of Object.keys(dwellCountRef.current)) {
        if (!insideThisPoll.has(gymId)) {
          if (__DEV__) console.log('[PROXIMITY] User left gym radius, resetting dwell for', gymId);
          delete dwellCountRef.current[gymId];
        }
      }

      setNearbyGym(closestGym);

    } catch (err) {
      // Location errors are silent — GPS noise suppressed intentionally
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [isCheckedIn, gyms, userSchedules, onAutoCheckIn]);

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
