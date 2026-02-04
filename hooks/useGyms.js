/**
 * useGyms Hook
 *
 * Subscribes to real-time gym list.
 *
 * USAGE:
 * const { gyms, loading, refresh } = useGyms();
 */

import { useState, useEffect, useCallback } from 'react';
import {
  subscribeToGyms,
  getAllGyms,
  seedGyms,
} from '../services/gymService';

export const useGyms = () => {
  const [gyms, setGyms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Seed/cleanup gyms on first load, then subscribe to updates
    seedGyms().catch((err) => console.error('Error seeding gyms:', err));

    const unsubscribe = subscribeToGyms((gymData) => {
      setGyms(gymData);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Seed/update gyms (adds location data to existing gyms)
  const ensureGymsExist = useCallback(async () => {
    try {
      // Always run seedGyms to ensure locations are configured
      await seedGyms();
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // Get activity level based on presence count
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
    ensureGymsExist,
    getActivityLevel,
  };
};

export default useGyms;
