/**
 * useSchedules.js — User Scheduled Visits Hook
 *
 * Manages the currently signed-in user's planned gym sessions. Subscribes
 * to Firestore in real-time and exposes CRUD-like actions for creating and
 * cancelling schedules. Separate loading flags (`creating`, `cancelling`)
 * let the UI show precise button states without a shared spinner.
 *
 * @example
 * const { schedules, createSchedule, cancelSchedule, formatScheduleTime } = useSchedules();
 */

import { useState, useEffect, useCallback } from 'react';
import { auth } from '../config/firebase';
import {
  subscribeToUserSchedules,
  createSchedule as createScheduleService,
  cancelSchedule as cancelScheduleService,
} from '../services/scheduleService';

/**
 * useSchedules — Hook for managing the current user's scheduled gym visits.
 *
 * @returns {{
 *   schedules: object[],     Array of the user's upcoming schedule documents.
 *   loading: boolean,        True while the initial Firestore subscription resolves.
 *   count: number,           Total number of upcoming scheduled visits.
 *   createSchedule: (gymId: string, gymName: string, scheduledTime: Date) => Promise<void>,
 *   cancelSchedule: (scheduleId: string) => Promise<void>,
 *   creating: boolean,       True while a create request is in flight.
 *   cancelling: boolean,     True while a cancel request is in flight.
 *   error: string | null,    Last error message from either action.
 *   formatScheduleTime: (schedule: object) => string  Human-readable date/time label.
 * }}
 */
export const useSchedules = () => {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState(null);

  // Subscribe to the user's schedule documents in Firestore.
  // The real-time listener means newly created or cancelled schedules
  // appear in the UI immediately without a manual refresh.
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

  /**
   * createSchedule — Writes a new planned visit to Firestore.
   *
   * @param {string} gymId         — Firestore ID of the target gym.
   * @param {string} gymName       — Display name stored on the schedule document.
   * @param {Date}   scheduledTime — JavaScript Date representing the planned arrival.
   * @throws {Error} If the user is not authenticated or the Firestore write fails.
   */
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

  /**
   * cancelSchedule — Deletes (or marks cancelled) a schedule document in Firestore.
   *
   * @param {string} scheduleId — Firestore document ID of the schedule to cancel.
   * @throws {Error} If the Firestore write fails.
   */
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

  /**
   * formatScheduleTime — Formats a schedule's Firestore Timestamp for display.
   *
   * Returns context-aware labels:
   *   - "Today 6:30 PM"
   *   - "Tomorrow 9:00 AM"
   *   - "Mon, Jan 13 7:00 PM"
   *
   * @param {object} schedule — Schedule document with a `scheduledTime` Firestore Timestamp.
   * @returns {string} Formatted date/time string, or empty string if no timestamp.
   */
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
