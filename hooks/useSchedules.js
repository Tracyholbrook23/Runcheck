/**
 * useSchedules Hook
 *
 * Manages user's scheduled gym sessions.
 *
 * USAGE:
 * const {
 *   schedules,       // Array of user's active schedules
 *   loading,         // Initial loading state
 *   createSchedule,  // Function to create a new schedule
 *   cancelSchedule,  // Function to cancel a schedule
 *   creating,        // Loading state for creation
 *   cancelling,      // Loading state for cancellation
 *   error,           // Last error message
 * } = useSchedules();
 */

import { useState, useEffect, useCallback } from 'react';
import { auth } from '../config/firebase';
import {
  subscribeToUserSchedules,
  createSchedule as createScheduleService,
  cancelSchedule as cancelScheduleService,
} from '../services/scheduleService';

export const useSchedules = () => {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState(null);

  // Subscribe to user's schedules
  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false);
      setSchedules([]);
      return;
    }

    const unsubscribe = subscribeToUserSchedules(auth.currentUser.uid, (scheduleData) => {
      setSchedules(scheduleData);
      setLoading(false);
    });

    return unsubscribe;
  }, [auth.currentUser?.uid]);

  // Create a new schedule
  const createSchedule = useCallback(async (gymId, gymName, scheduledTime) => {
    if (!auth.currentUser) {
      throw new Error('Must be logged in to schedule a visit');
    }

    setCreating(true);
    setError(null);

    try {
      const result = await createScheduleService(
        auth.currentUser.uid,
        gymId,
        gymName,
        scheduledTime
      );
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setCreating(false);
    }
  }, []);

  // Cancel a schedule
  const cancelSchedule = useCallback(async (scheduleId) => {
    setCancelling(true);
    setError(null);

    try {
      const result = await cancelScheduleService(scheduleId);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setCancelling(false);
    }
  }, []);

  // Format schedule time for display
  const formatScheduleTime = useCallback((schedule) => {
    const date = schedule.scheduledTime?.toDate();
    if (!date) return '';

    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = date.toDateString() === tomorrow.toDateString();

    const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    if (isToday) return `Today ${time}`;
    if (isTomorrow) return `Tomorrow ${time}`;
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ` ${time}`;
  }, []);

  return {
    schedules,
    loading,
    count: schedules.length,
    createSchedule,
    cancelSchedule,
    creating,
    cancelling,
    error,
    formatScheduleTime,
  };
};

export default useSchedules;
