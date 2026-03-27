/**
 * useLivePresenceMap.js — App-wide Real-time Presence Hook
 *
 * Single source of truth for active player presence across all gyms.
 * Opens one Firestore subscription covering the entire `presence` collection
 * and returns two derived maps that every screen can consume directly.
 *
 * Why this hook exists:
 *   Before this hook, HomeScreen and ViewRunsScreen each maintained their own
 *   inline `onSnapshot` subscriptions against the `presence` collection, using
 *   slightly different query filters. ProfileScreen read the stale denormalized
 *   `gym.currentPresenceCount` field instead. This created three divergent
 *   sources of truth that could show different numbers on different screens.
 *
 *   This hook centralises all three into one canonical subscription so every
 *   screen that needs all-gym counts always sees the same data.
 *
 * What it does NOT replace:
 *   `useGymPresences(gymId)` — the per-gym hook used by RunDetailsScreen to
 *   fetch full player detail (userName, userAvatar, etc.) for a single gym.
 *   That hook is appropriate for focused, single-gym views and is left untouched.
 *
 * Query strategy:
 *   - Filter: `status == 'active'`  (canonical — matches presenceService.checkIn)
 *   - Limit:  200 docs              (ample headroom; each doc is one check-in)
 *   - Client-side `expiresAt` guard drops sessions whose timer has lapsed before
 *     the backend cleanup function fires.
 *   - Deduplication by `odId` per gym prevents one user being counted twice
 *     (e.g. if a stale doc wasn't cleaned up before a new check-in was created).
 *
 * @example
 * const { presenceMap, countMap } = useLivePresenceMap();
 * const players = presenceMap['cowboys-fit-pflugerville'] ?? [];
 * const count   = countMap['cowboys-fit-pflugerville']   ?? 0;
 */

import { useState, useEffect } from 'react';
import { collection, query, where, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { PRESENCE_STATUS } from '../services/models';

/**
 * useLivePresenceMap — Subscribes to all active presence docs in real time.
 *
 * @returns {{
 *   presenceMap: Object.<string, Array<{odId: string, userName: string|null, userAvatar: string|null, checkedInAt: import('firebase/firestore').Timestamp|null}>>,
 *   countMap:    Object.<string, number>
 * }}
 *
 * `presenceMap`  gymId → deduplicated array of active player objects.
 *                Used by HomeScreen for avatar stacks and "started Xm ago" labels.
 *
 * `countMap`     gymId → deduplicated player count (number).
 *                Used by HomeScreen, ViewRunsScreen, and ProfileScreen for
 *                numeric badges and run-quality labels.
 */
export const useLivePresenceMap = () => {
  const [presenceMap, setPresenceMap] = useState({});
  const [countMap, setCountMap]       = useState({});

  useEffect(() => {
    // Subscribe immediately — no InteractionManager delay. The deferred approach
    // was originally intended to avoid competing with navigation animations for JS
    // thread time, but React StrictMode + React Navigation native stack in new arch
    // (RN 0.81 / Expo SDK 54) runs effect cleanup synchronously before the task
    // callback fires, cancelling it. Presence counts would stay at 0 indefinitely.
    // This hook doesn't gate any loading spinner, but immediate subscription ensures
    // counts populate correctly on first render without requiring a user interaction.
    const q = query(
      collection(db, 'presence'),
      where('status', '==', PRESENCE_STATUS.ACTIVE),
      limit(200)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const now = new Date();

        // Build gymId → Map<odId, playerObject> to deduplicate in one pass.
        // Using a Map keyed by odId ensures each user is counted only once per gym.
        const perGym = {};

        snap.docs.forEach((d) => {
          const data = d.data();
          if (!data.gymId || !data.odId) return;

          // Client-side expiry guard — drops sessions whose timer has lapsed
          // before the backend cleanup Cloud Function fires.
          const expiresAt = data.expiresAt?.toDate?.();
          if (expiresAt && expiresAt < now) return;

          if (!perGym[data.gymId]) perGym[data.gymId] = new Map();

          // Only keep the first entry per odId per gym (deduplication).
          if (!perGym[data.gymId].has(data.odId)) {
            perGym[data.gymId].set(data.odId, {
              odId:        data.odId,
              userName:    data.userName    ?? null,
              userAvatar:  data.userAvatar  ?? null,
              checkedInAt: data.checkedInAt ?? null,
            });
          }
        });

        // Convert Map structures to plain arrays / numbers for React state.
        const nextPresenceMap = {};
        const nextCountMap    = {};

        Object.entries(perGym).forEach(([gymId, playerMap]) => {
          nextPresenceMap[gymId] = Array.from(playerMap.values());
          nextCountMap[gymId]    = playerMap.size;
        });

        setPresenceMap(nextPresenceMap);
        setCountMap(nextCountMap);
      },
      () => {
        // On error clear both maps so screens fall back to zero gracefully.
        setPresenceMap({});
        setCountMap({});
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  return { presenceMap, countMap };
};

export default useLivePresenceMap;
