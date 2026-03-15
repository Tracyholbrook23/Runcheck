/**
 * useGyms.js — Real-time Gyms List Hook
 *
 * Subscribes to the full gyms collection in Firestore and keeps local
 * state in sync with any remote changes (new gyms added, presence counts
 * updated, etc.). Also exposes utility helpers that screens use to derive
 * activity level labels and colors without duplicating logic.
 *
 * The client is read-only — gym data is managed exclusively via the admin
 * seed script (`seedProductionGyms.js`). Firestore is the sole source of
 * truth for gym documents.
 *
 * @example
 * const { gyms, loading, getActivityLevel } = useGyms();
 */

import { useState, useEffect, useCallback } from 'react';
import { subscribeToGyms } from '../services/gymService';

/**
 * useGyms — Hook for subscribing to the real-time gyms collection.
 *
 * @returns {{
 *   gyms: object[],              Array of gym documents from Firestore.
 *   loading: boolean,            True while the initial snapshot loads.
 *   error: string | null,        Reserved for future use.
 *   getActivityLevel: (gym: object) => { level: string, label: string, color: string }
 * }}
 */
export const useGyms = () => {
  const [gyms, setGyms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Open a real-time Firestore listener; unsubscribe on unmount
    const unsubscribe = subscribeToGyms((gymData) => {
      setGyms(gymData);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  /**
   * getActivityLevel — Maps a gym's live presence count to a display label and color.
   *
   * Thresholds:
   *   0        → Empty  (grey)
   *   1–3      → Light  (green)
   *   4–7      → Active (amber)
   *   8+       → Busy   (red)
   *
   * @param {object} gym — A gym document from Firestore (needs `currentPresenceCount`).
   * @returns {{ level: string, label: string, color: string }} Display metadata.
   */
  const getActivityLevel = useCallback((gym) => {
    const count = gym?.currentPresenceCount || 0;
    if (count === 0) return { level: 'empty', label: 'Empty', color: '#9CA3AF' };
    if (count <= 3) return { level: 'light', label: 'Light', color: '#22C55E' };
    if (count <= 7) return { level: 'active', label: 'Active', color: '#F59E0B' };
    return { level: 'busy', label: 'Busy', color: '#EF4444' };
  }, []);

  return {
    gyms,
    loading,
    error,
    getActivityLevel,
  };
};

export default useGyms;
