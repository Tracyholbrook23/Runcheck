/**
 * useGymPresences.js — Real-time Gym Presence List Hook
 *
 * Subscribes to all active presence documents for a specific gym in
 * Firestore. Used by RunDetailsScreen to display the "Now Playing"
 * section — the list updates automatically as players check in or out.
 *
 * The subscription is cleaned up and restarted whenever `gymId` changes,
 * matching the same pattern used by `useGym` and `useGymSchedules`.
 *
 * @example
 * const { presences, loading, count } = useGymPresences(gymId);
 */

import { useState, useEffect } from 'react';
import { subscribeToGymPresences } from '../services/presenceService';

/**
 * useGymPresences — Hook for real-time presence data at a specific gym.
 *
 * @param {string | null} gymId — Firestore document ID of the gym to watch.
 * @returns {{
 *   presences: object[],  Array of active presence documents for this gym.
 *   loading: boolean,     True while the initial Firestore snapshot is loading.
 *   count: number         Shorthand — number of currently checked-in players.
 * }}
 */
export const useGymPresences = (gymId) => {
  const [presences, setPresences] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Guard: if gymId is falsy, return empty state immediately
    if (!gymId) {
      setPresences([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Open a real-time listener on the presences subcollection for this gym
    const unsubscribe = subscribeToGymPresences(gymId, (presenceData) => {
      setPresences(presenceData);
      setLoading(false);
    });

    // Cleanup: unsubscribe when gymId changes or component unmounts
    return unsubscribe;
  }, [gymId]);

  return {
    presences,
    loading,
    count: presences.length,
  };
};

export default useGymPresences;
