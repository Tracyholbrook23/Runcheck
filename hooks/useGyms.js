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
    if (count === 0) return { level: 'empty', label: 'Empty', color: '#9e9e9e' };
    if (count <= 3) return { level: 'light', label: 'Light', color: '#4caf50' };
    if (count <= 7) return { level: 'active', label: 'Active', color: '#ff9800' };
    return { level: 'busy', label: 'Busy', color: '#f44336' };
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
