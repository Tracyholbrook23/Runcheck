/**
 * Schedule Service
 *
 * Manages scheduled gym sessions (future visits).
 *
 * RESPONSIBILITIES:
 * - Create scheduled sessions
 * - Cancel scheduled sessions
 * - Prevent overlapping schedules per user
 * - Mark sessions as attended or no-show
 * - Update gym schedule counts
 *
 * BUSINESS RULES:
 * - Users can have max 5 active scheduled sessions
 * - Cannot schedule overlapping times at different gyms
 * - Cancelling <1hr before incurs reliability penalty
 * - Sessions auto-marked as no-show 1hr after scheduled time
 *
 * EXAMPLE USAGE:
 *
 * import {
 *   createSchedule,
 *   cancelSchedule,
 *   markScheduleAttended,
 *   markScheduleNoShow,
 *   getActiveSchedules
 * } from './scheduleService';
 *
 * // Schedule a session
 * const schedule = await createSchedule('user123', 'gym456', 'Cowboys Fit', new Date('2024-02-01T18:00:00'));
 *
 * // Cancel a session
 * await cancelSchedule('schedule789');
 *
 * // Mark attended (called when user checks in)
 * await markScheduleAttended('schedule789', 'presence123');
 *
 * // Mark no-show (called by cleanup job)
 * await markScheduleNoShow('schedule789');
 */

import { db, auth } from '../config/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

import {
  SCHEDULE_STATUS,
  CANCEL_PENALTY_THRESHOLD_MINUTES,
  SCHEDULE_GRACE_PERIOD_MINUTES,
} from './models';

import {
  updateReliabilityOnAttend,
  updateReliabilityOnNoShow,
  updateReliabilityOnCancel,
  incrementScheduledCount,
} from './reliabilityService';

// Constants
const MAX_ACTIVE_SCHEDULES = 5;

/**
 * Format a date to a time slot string (hourly)
 *
 * @param {Date} date
 * @returns {string} ISO hour string, e.g., "2024-02-01T18:00"
 */
export const formatTimeSlot = (date) => {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 13) + ':00';
};

/**
 * Generate schedule document ID
 *
 * @param {string} odId - User ID
 * @param {string} timeSlot - Time slot string
 * @returns {string} Schedule document ID
 */
export const getScheduleId = (odId, timeSlot) => {
  return `${odId}_${timeSlot.replace(/[:.]/g, '-')}`;
};

/**
 * Create a scheduled gym session
 *
 * @param {string} odId - User ID
 * @param {string} gymId - Gym ID
 * @param {string} gymName - Gym name (denormalized)
 * @param {Date} scheduledTime - When user plans to arrive
 * @returns {Promise<Object>} Created schedule data
 * @throws {Error} If validation fails
 */
export const createSchedule = async (odId, gymId, gymName, scheduledTime) => {
  // Validate user is authenticated
  if (!auth.currentUser || auth.currentUser.uid !== odId) {
    throw new Error('Unauthorized: Must be logged in as this user');
  }

  // Get user data for name
  const userRef = doc(db, 'users', odId);
  const userDoc = await getDoc(userRef);
  const userName = userDoc.exists() ? userDoc.data().name : 'Anonymous';

  // Validate time is in the future
  const now = new Date();
  if (scheduledTime <= now) {
    throw new Error('Cannot schedule a session in the past');
  }

  // Validate not too far in the future (max 7 days)
  const maxDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (scheduledTime > maxDate) {
    throw new Error('Cannot schedule more than 7 days in advance');
  }

  const timeSlot = formatTimeSlot(scheduledTime);
  const scheduleId = getScheduleId(odId, timeSlot);

  // Check for existing schedule at this time slot (prevent duplicates)
  const existingScheduleRef = doc(db, 'schedules', scheduleId);
  const existingSchedule = await getDoc(existingScheduleRef);

  if (existingSchedule.exists()) {
    const data = existingSchedule.data();
    if (data.status === SCHEDULE_STATUS.SCHEDULED) {
      throw new Error('You already have a session scheduled at this time');
    }
  }

  // Check user's total active schedules (max 5)
  const activeSchedules = await getActiveSchedules(odId);
  if (activeSchedules.length >= MAX_ACTIVE_SCHEDULES) {
    throw new Error(`You can only have ${MAX_ACTIVE_SCHEDULES} scheduled sessions at a time`);
  }

  // Check for overlapping schedule (same hour, different gym)
  const overlappingSchedule = activeSchedules.find(
    (s) => s.timeSlot === timeSlot && s.gymId !== gymId
  );
  if (overlappingSchedule) {
    throw new Error(`You already have a session at ${overlappingSchedule.gymName} at this time`);
  }

  // Create the schedule
  const scheduleData = {
    odId,
    userName,
    gymId,
    gymName,
    status: SCHEDULE_STATUS.SCHEDULED,
    scheduledTime: Timestamp.fromDate(scheduledTime),
    timeSlot,
    createdAt: serverTimestamp(),
    attendedAt: null,
    cancelledAt: null,
    markedNoShowAt: null,
    presenceId: null,
  };

  await setDoc(existingScheduleRef, scheduleData);

  // Update gym schedule count
  await updateGymScheduleCount(gymId, timeSlot, 1);

  // Update user's scheduled count
  await incrementScheduledCount(odId);

  return { id: scheduleId, ...scheduleData };
};

/**
 * Cancel a scheduled session
 *
 * @param {string} scheduleId - Schedule document ID
 * @returns {Promise<Object>} Cancelled schedule data
 * @throws {Error} If validation fails
 */
export const cancelSchedule = async (scheduleId) => {
  const scheduleRef = doc(db, 'schedules', scheduleId);
  const scheduleDoc = await getDoc(scheduleRef);

  if (!scheduleDoc.exists()) {
    throw new Error('Schedule not found');
  }

  const scheduleData = scheduleDoc.data();

  // Validate ownership
  if (!auth.currentUser || auth.currentUser.uid !== scheduleData.odId) {
    throw new Error('Unauthorized: You can only cancel your own schedules');
  }

  // Validate status
  if (scheduleData.status !== SCHEDULE_STATUS.SCHEDULED) {
    throw new Error('This session is no longer active');
  }

  // Check if this is a late cancellation (less than 1 hour before)
  const now = new Date();
  const scheduledTime = scheduleData.scheduledTime.toDate();
  const minutesUntilSession = (scheduledTime - now) / (1000 * 60);
  const isLateCancellation = minutesUntilSession < CANCEL_PENALTY_THRESHOLD_MINUTES;

  // Update schedule status
  await updateDoc(scheduleRef, {
    status: SCHEDULE_STATUS.CANCELLED,
    cancelledAt: serverTimestamp(),
  });

  // Update gym schedule count
  await updateGymScheduleCount(scheduleData.gymId, scheduleData.timeSlot, -1);

  // Update reliability (penalize late cancellations)
  await updateReliabilityOnCancel(scheduleData.odId, isLateCancellation);

  return { ...scheduleData, status: SCHEDULE_STATUS.CANCELLED, isLateCancellation };
};

/**
 * Mark a schedule as attended (called when user checks in)
 *
 * @param {string} scheduleId - Schedule document ID
 * @param {string} presenceId - Presence document ID from check-in
 * @returns {Promise<Object>} Updated schedule data
 */
export const markScheduleAttended = async (scheduleId, presenceId) => {
  const scheduleRef = doc(db, 'schedules', scheduleId);
  const scheduleDoc = await getDoc(scheduleRef);

  if (!scheduleDoc.exists()) {
    throw new Error('Schedule not found');
  }

  const scheduleData = scheduleDoc.data();

  if (scheduleData.status !== SCHEDULE_STATUS.SCHEDULED) {
    // Already processed, skip
    return scheduleData;
  }

  // Update schedule
  await updateDoc(scheduleRef, {
    status: SCHEDULE_STATUS.ATTENDED,
    attendedAt: serverTimestamp(),
    presenceId,
  });

  // Update gym schedule count
  await updateGymScheduleCount(scheduleData.gymId, scheduleData.timeSlot, -1);

  // Update reliability (bonus for showing up)
  await updateReliabilityOnAttend(scheduleData.odId);

  return { ...scheduleData, status: SCHEDULE_STATUS.ATTENDED };
};

/**
 * Mark a schedule as no-show (called by cleanup job)
 *
 * @param {string} scheduleId - Schedule document ID
 * @returns {Promise<Object>} Updated schedule data
 */
export const markScheduleNoShow = async (scheduleId) => {
  const scheduleRef = doc(db, 'schedules', scheduleId);
  const scheduleDoc = await getDoc(scheduleRef);

  if (!scheduleDoc.exists()) {
    throw new Error('Schedule not found');
  }

  const scheduleData = scheduleDoc.data();

  if (scheduleData.status !== SCHEDULE_STATUS.SCHEDULED) {
    // Already processed, skip
    return scheduleData;
  }

  // Update schedule
  await updateDoc(scheduleRef, {
    status: SCHEDULE_STATUS.NO_SHOW,
    markedNoShowAt: serverTimestamp(),
  });

  // Update gym schedule count
  await updateGymScheduleCount(scheduleData.gymId, scheduleData.timeSlot, -1);

  // Update reliability (penalty for not showing)
  await updateReliabilityOnNoShow(scheduleData.odId);

  return { ...scheduleData, status: SCHEDULE_STATUS.NO_SHOW };
};

/**
 * Get user's active (scheduled) sessions
 *
 * @param {string} odId - User ID
 * @returns {Promise<Array>} Array of active schedules
 */
export const getActiveSchedules = async (odId) => {
  const schedulesRef = collection(db, 'schedules');
  const q = query(
    schedulesRef,
    where('odId', '==', odId),
    where('status', '==', SCHEDULE_STATUS.SCHEDULED),
    orderBy('scheduledTime', 'asc')
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
};

/**
 * Find matching schedule for a check-in (to mark as attended)
 *
 * @param {string} odId - User ID
 * @param {string} gymId - Gym ID
 * @returns {Promise<Object|null>} Matching schedule or null
 */
export const findMatchingSchedule = async (odId, gymId) => {
  const now = new Date();
  const gracePeriodMs = SCHEDULE_GRACE_PERIOD_MINUTES * 60 * 1000;

  // Window: 1 hour before to 1 hour after scheduled time
  const windowStart = new Date(now.getTime() - gracePeriodMs);
  const windowEnd = new Date(now.getTime() + gracePeriodMs);

  const schedulesRef = collection(db, 'schedules');
  const q = query(
    schedulesRef,
    where('odId', '==', odId),
    where('gymId', '==', gymId),
    where('status', '==', SCHEDULE_STATUS.SCHEDULED)
  );

  const snapshot = await getDocs(q);

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const scheduledTime = data.scheduledTime.toDate();

    // Check if within grace period window
    if (scheduledTime >= windowStart && scheduledTime <= windowEnd) {
      return { id: doc.id, ...data };
    }
  }

  return null;
};

/**
 * Subscribe to user's schedules (real-time)
 *
 * @param {string} odId - User ID
 * @param {Function} callback - Called with array of schedules
 * @returns {Function} Unsubscribe function
 */
export const subscribeToUserSchedules = (odId, callback) => {
  const schedulesRef = collection(db, 'schedules');
  const q = query(
    schedulesRef,
    where('odId', '==', odId),
    where('status', '==', SCHEDULE_STATUS.SCHEDULED),
    orderBy('scheduledTime', 'asc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const now = new Date();
      const schedules = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((schedule) => {
          // Filter out past schedules (will be cleaned up by job)
          const scheduledTime = schedule.scheduledTime?.toDate();
          const gracePeriodMs = SCHEDULE_GRACE_PERIOD_MINUTES * 60 * 1000;
          return scheduledTime && scheduledTime > new Date(now.getTime() - gracePeriodMs);
        });
      callback(schedules);
    },
    (error) => {
      console.error('Error subscribing to schedules:', error);
      callback([]);
    }
  );
};

/**
 * Subscribe to gym's schedules (real-time)
 *
 * @param {string} gymId - Gym ID
 * @param {Function} callback - Called with (schedules, byTimeSlot)
 * @returns {Function} Unsubscribe function
 */
export const subscribeToGymSchedules = (gymId, callback) => {
  const schedulesRef = collection(db, 'schedules');
  const q = query(
    schedulesRef,
    where('gymId', '==', gymId),
    where('status', '==', SCHEDULE_STATUS.SCHEDULED),
    orderBy('scheduledTime', 'asc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const now = new Date();
      const schedules = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((schedule) => {
          const scheduledTime = schedule.scheduledTime?.toDate();
          return scheduledTime && scheduledTime > now;
        });

      // Group by time slot
      const byTimeSlot = {};
      schedules.forEach((schedule) => {
        const slot = schedule.timeSlot;
        if (!byTimeSlot[slot]) {
          byTimeSlot[slot] = [];
        }
        byTimeSlot[slot].push(schedule);
      });

      callback(schedules, byTimeSlot);
    },
    (error) => {
      console.error('Error subscribing to gym schedules:', error);
      callback([], {});
    }
  );
};

/**
 * Get overdue schedules for no-show processing
 *
 * @returns {Promise<Array>} Array of overdue schedules
 */
export const getOverdueSchedules = async () => {
  const now = new Date();
  const gracePeriodMs = SCHEDULE_GRACE_PERIOD_MINUTES * 60 * 1000;
  const cutoffTime = new Date(now.getTime() - gracePeriodMs);

  const schedulesRef = collection(db, 'schedules');
  const q = query(
    schedulesRef,
    where('status', '==', SCHEDULE_STATUS.SCHEDULED),
    orderBy('scheduledTime', 'asc')
  );

  const snapshot = await getDocs(q);

  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((schedule) => {
      const scheduledTime = schedule.scheduledTime?.toDate();
      return scheduledTime && scheduledTime < cutoffTime;
    });
};

/**
 * Process overdue schedules (mark as no-show)
 * Called by cleanup job
 *
 * @returns {Promise<number>} Number of schedules marked as no-show
 */
export const processOverdueSchedules = async () => {
  const overdueSchedules = await getOverdueSchedules();
  let count = 0;

  for (const schedule of overdueSchedules) {
    try {
      await markScheduleNoShow(schedule.id);
      count++;
    } catch (error) {
      console.error(`Failed to mark schedule ${schedule.id} as no-show:`, error);
    }
  }

  return count;
};

/**
 * Update gym's schedule count for a time slot
 *
 * @param {string} gymId - Gym ID
 * @param {string} timeSlot - Time slot string
 * @param {number} delta - Change (+1 or -1)
 */
const updateGymScheduleCount = async (gymId, timeSlot, delta) => {
  try {
    const gymRef = doc(db, 'gyms', gymId);
    const gymDoc = await getDoc(gymRef);

    if (!gymDoc.exists()) {
      console.warn(`Gym ${gymId} not found`);
      return;
    }

    const scheduleCounts = gymDoc.data().scheduleCounts || {};
    const currentCount = scheduleCounts[timeSlot] || 0;
    const newCount = Math.max(0, currentCount + delta);

    if (newCount === 0) {
      delete scheduleCounts[timeSlot];
    } else {
      scheduleCounts[timeSlot] = newCount;
    }

    await updateDoc(gymRef, {
      scheduleCounts,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating gym schedule count:', error);
  }
};
