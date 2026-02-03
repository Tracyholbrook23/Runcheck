/**
 * useGym Hook
 *
 * Subscribes to real-time data for a single gym.
 *
 * USAGE:
 * const { gym, loading } = useGym(gymId);
 */

import { useState, useEffect } from 'react';
import { subscribeToGym } from '../services/gymService';

export const useGym = (gymId) => {
  const [gym, setGym] = useState(null);
  const [loading, setLoading] = useState(true);

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

  // Get activity level
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
