/**
 * useGymSchedules Hook
 *
 * Subscribes to real-time schedules at a specific gym.
 *
 * USAGE:
 * const { schedules, schedulesBySlot, loading, count } = useGymSchedules(gymId);
 */

import { useState, useEffect } from 'react';
import { subscribeToGymSchedules } from '../services/scheduleService';

export const useGymSchedules = (gymId) => {
  const [schedules, setSchedules] = useState([]);
  const [schedulesBySlot, setSchedulesBySlot] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gymId) {
      setSchedules([]);
      setSchedulesBySlot({});
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubscribe = subscribeToGymSchedules(gymId, (scheduleData, bySlot) => {
      setSchedules(scheduleData);
      setSchedulesBySlot(bySlot);
      setLoading(false);
    });

    return unsubscribe;
  }, [gymId]);

  return {
    schedules,
    schedulesBySlot,
    loading,
    count: schedules.length,
  };
};

export default useGymSchedules;
