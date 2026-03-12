/**
 * useGymRuns.js — Real-time hook for runs at a specific gym.
 *
 * Subscribes to two Firestore listeners simultaneously:
 *   1. `subscribeToGymRuns`        — all upcoming runs at the gym
 *   2. `subscribeToUserRunsAtGym`  — which of those runs the current user
 *                                    has already joined
 *
 * Exposes a `joinedRunIds` Set so components can cheaply check
 * `joinedRunIds.has(run.id)` without iterating arrays.
 *
 * @example
 * const { runs, loading, joinedRunIds } = useGymRuns(gymId);
 */

import { useState, useEffect, useMemo } from 'react';
import { auth } from '../config/firebase';
import {
  subscribeToGymRuns,
  subscribeToUserRunsAtGym,
} from '../services/runService';

/**
 * useGymRuns — Subscribes to live runs and the user's participation state.
 *
 * @param {string|null|undefined} gymId — Firestore gym document ID.
 *   Pass null/undefined to skip subscriptions (hook stays in loading=false state).
 *
 * @returns {{
 *   runs: object[],           All upcoming runs at this gym (ordered by startTime asc)
 *   loading: boolean,         True until the first snapshot fires
 *   joinedRunIds: Set<string> Set of run IDs the current user has joined
 *   userParticipants: object[] Raw participant docs for the current user at this gym
 * }}
 */
export const useGymRuns = (gymId) => {
  const [runs, setRuns] = useState([]);
  const [userParticipants, setUserParticipants] = useState([]);
  // Track how many listeners have fired at least once
  const [runsReady, setRunsReady] = useState(false);
  const [participantsReady, setParticipantsReady] = useState(false);

  const uid = auth.currentUser?.uid;

  // ── Subscription 1: all upcoming runs at this gym ──────────────────────────
  useEffect(() => {
    if (!gymId) {
      setRuns([]);
      setRunsReady(true);
      return;
    }

    setRunsReady(false);

    const unsubscribe = subscribeToGymRuns(gymId, (newRuns) => {
      setRuns(newRuns);
      setRunsReady(true);
    });

    return unsubscribe;
  }, [gymId]);

  // ── Subscription 2: user's participation at this gym ──────────────────────
  useEffect(() => {
    if (!gymId || !uid) {
      setUserParticipants([]);
      setParticipantsReady(true);
      return;
    }

    setParticipantsReady(false);

    const unsubscribe = subscribeToUserRunsAtGym(uid, gymId, (participants) => {
      setUserParticipants(participants);
      setParticipantsReady(true);
    });

    return unsubscribe;
  }, [gymId, uid]);

  // ── Derived: Set of run IDs the user has joined ────────────────────────────
  // Memoized so referential equality is preserved between renders when the
  // underlying data hasn't changed — prevents unnecessary child re-renders.
  const joinedRunIds = useMemo(
    () => new Set(userParticipants.map((p) => p.runId)),
    [userParticipants]
  );

  const loading = !runsReady || !participantsReady;

  return {
    runs,
    loading,
    joinedRunIds,
    userParticipants,
  };
};

export default useGymRuns;
