/**
 * useGym.js — Single Gym Real-time Subscription Hook
 *
 * Subscribes to a single gym document in Firestore and exposes its data
 * alongside derived display values (activity level, presence count).
 * The Firestore listener is torn down and re-opened whenever `gymId` changes,
 * so this hook is safe to use in screens that navigate between different gyms.
 *
 * @example
 * const { gym, loading, activityLevel, presenceCount } = useGym(gymId);
 */

import { useState, useEffect } from 'react';
import { subscribeToGym } from '../services/gymService';

/**
 * useGym — Hook for subscribing to a single gym document in real-time.
 *
 * @param {string | null} gymId — Firestore document ID of the gym to watch.
 *                                 Pass null or undefined to get empty state.
 * @returns {{
 *   gym: object | null,   The live gym document, or null while loading / if gymId is falsy.
 *   loading: boolean,     True while the Firestore snapshot is pending.
 *   activityLevel: { level: string, label: string, color: string },
 *   presenceCount: number Current number of checked-in players.
 * }}
 */
export const useGym = (gymId) => {
  const [gym, setGym] = useState(null);
  const [loading, setLoading] = useState(true);

  // Re-subscribe whenever gymId changes (e.g., user navigates to a different gym detail)
  useEffect(() => {
    if (!gymId) {
      setGym(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubscribe = subscribeToGym(gymId, (gymData) => {
      setGym(gymData);
      setLoading(false);
    });

    return unsubscribe;
  }, [gymId]);

  /**
   * getActivityLevel — Derives an activity label and color from the current presence count.
   *
   * Called inline on every render so the returned `activityLevel` is always
   * derived from the latest `gym` state without needing a separate effect.
   *
   * @returns {{ level: string, label: string, color: string }}
   */
  const getActivityLevel = () => {
    const count = gym?.currentPresenceCount || 0;
    if (count === 0) return { level: 'empty', label: 'Empty', color: '#9e9e9e' };
    if (count <= 3) return { level: 'light', label: 'Light', color: '#4caf50' };
    if (count <= 7) return { level: 'active', label: 'Active', color: '#ff9800' };
    return { level: 'busy', label: 'Busy', color: '#f44336' };
  };

  return {
    gym,
    loading,
    activityLevel: getActivityLevel(),
    presenceCount: gym?.currentPresenceCount || 0,
  };
};

export default useGym;
