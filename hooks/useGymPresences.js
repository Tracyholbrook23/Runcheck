/**
 * useGymPresences Hook
 *
 * Subscribes to real-time presences at a specific gym.
 *
 * USAGE:
 * const { presences, loading, count } = useGymPresences(gymId);
 */

import { useState, useEffect } from 'react';
import { subscribeToGymPresences } from '../services/presenceService';

export const useGymPresences = (gymId) => {
  const [presences, setPresences] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gymId) {
      setPresences([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubscribe = subscribeToGymPresences(gymId, (presenceData) => {
      setPresences(presenceData);
      setLoading(false);
    });

    return unsubscribe;
  }, [gymId]);

  return {
    presences,
    loading,
    count: presences.length,
  };
};

export default useGymPresences;
