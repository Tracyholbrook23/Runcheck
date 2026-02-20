/**
 * useGymSchedules.js — Real-time Gym Schedule List Hook
 *
 * Subscribes to all scheduled visits for a specific gym in Firestore.
 * Used by RunDetailsScreen to populate the "Scheduled Today" and
 * "Scheduled Tomorrow" sections. The service layer pre-groups schedules
 * by time slot and returns both a flat array and a keyed map.
 *
 * @example
 * const { schedules, schedulesBySlot, count } = useGymSchedules(gymId);
 */

import { useState, useEffect } from 'react';
import { subscribeToGymSchedules } from '../services/scheduleService';

/**
 * useGymSchedules — Hook for real-time schedule data at a specific gym.
 *
 * @param {string | null} gymId — Firestore document ID of the gym to watch.
 * @returns {{
 *   schedules: object[],          Flat array of all upcoming schedule documents.
 *   schedulesBySlot: object,      Schedules keyed by ISO time slot string for
 *                                 quick slot-based lookups in the UI.
 *   loading: boolean,             True while the initial Firestore snapshot loads.
 *   count: number                 Total number of upcoming scheduled visits.
 * }}
 */
export const useGymSchedules = (gymId) => {
  const [schedules, setSchedules] = useState([]);
  const [schedulesBySlot, setSchedulesBySlot] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Guard: return empty state if no gymId is provided
    if (!gymId) {
      setSchedules([]);
      setSchedulesBySlot({});
      setLoading(false);
      return;
    }

    setLoading(true);

    // The service callback delivers both a flat list and a slot-grouped map
    const unsubscribe = subscribeToGymSchedules(gymId, (scheduleData, bySlot) => {
      setSchedules(scheduleData);
      setSchedulesBySlot(bySlot);
      setLoading(false);
    });

    // Cleanup: unsubscribe when gymId changes or component unmounts
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
