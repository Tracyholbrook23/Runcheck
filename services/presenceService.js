/**
 * Presence Service
 *
 * Manages real-time presence at gyms (active check-ins).
 *
 * RESPONSIBILITIES:
 * - Check in to a gym (with GPS validation)
 * - Check out from a gym
 * - Auto-expire stale presences
 * - Prevent duplicate active presence
 * - Link check-ins to scheduled sessions
 *
 * BUSINESS RULES:
 * - User can only be checked in at one gym at a time
 * - Check-in requires GPS within configured radius (default 50m)
 * - Presences auto-expire after configured time (default 3 hours)
 * - Check-in fulfills matching scheduled session if within grace period
 *
 * EXAMPLE USAGE:
 *
 * import {
 *   checkIn,
 *   checkOut,
 *   getActivePresence,
 *   expireStalePresences
 * } from './presenceService';
 *
 * // Check in with GPS validation
 * const presence = await checkIn('user123', 'gym456', {
 *   latitude: 30.4692,
 *   longitude: -97.5963
 * });
 *
 * // Check out
 * await checkOut();
 *
 * // Get user's active presence
 * const active = await getActivePresence('user123');
 *
 * // Cleanup job
 * const expiredCount = await expireStalePresences();
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
  PRESENCE_STATUS,
  DEFAULT_CHECK_IN_RADIUS_METERS,
  DEFAULT_EXPIRE_MINUTES,
} from './models';

import { findMatchingSchedule, markScheduleAttended } from './scheduleService';
import { calculateDistanceMeters } from '../utils/locationUtils';

/**
 * Generate presence document ID (compound key prevents duplicates)
 *
 * @param {string} odId - User ID
 * @param {string} gymId - Gym ID
 * @returns {string} Presence document ID
 */
export const getPresenceId = (odId, gymId) => `${odId}_${gymId}`;

/**
 * Calculate expiry timestamp
 *
 * @param {number} minutes - Minutes until expiry
 * @returns {Timestamp} Firestore timestamp
 */
export const calculateExpiryTime = (minutes = DEFAULT_EXPIRE_MINUTES) => {
  const expiryDate = new Date();
  expiryDate.setMinutes(expiryDate.getMinutes() + minutes);
  return Timestamp.fromDate(expiryDate);
};

/**
 * Check if user has an active presence anywhere
 *
 * @param {string} odId - User ID
 * @returns {Promise<Object|null>} Active presence or null
 */
export const getActivePresence = async (odId) => {
  const presencesRef = collection(db, 'presence');
  const q = query(
    presencesRef,
    where('odId', '==', odId),
    where('status', '==', PRESENCE_STATUS.ACTIVE)
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();

  // Check if expired (client-side check)
  if (data.expiresAt && data.expiresAt.toDate() < new Date()) {
    // Mark as expired in background
    await markPresenceExpired(doc.id, data.gymId);
    return null;
  }

  return { id: doc.id, ...data };
};

/**
 * Check in to a gym with GPS validation
 *
 * @param {string} odId - User ID
 * @param {string} gymId - Gym ID
 * @param {Object} userLocation - { latitude, longitude }
 * @param {Object} options - { skipGpsValidation: boolean } (for testing)
 * @returns {Promise<Object>} Created presence data
 * @throws {Error} If validation fails
 */
export const checkIn = async (odId, gymId, userLocation, options = {}) => {
  // Validate user is authenticated
  if (!auth.currentUser || auth.currentUser.uid !== odId) {
    throw new Error('Unauthorized: Must be logged in as this user');
  }

  // Check for existing active presence anywhere
  const existingPresence = await getActivePresence(odId);
  if (existingPresence) {
    throw new Error(`Already checked in at ${existingPresence.gymName}. Please check out first.`);
  }

  // Get gym data
  const gymRef = doc(db, 'gyms', gymId);
  const gymDoc = await getDoc(gymRef);

  if (!gymDoc.exists()) {
    throw new Error('Gym not found');
  }

  const gymData = gymDoc.data();
  const gymLocation = gymData.location;
  const checkInRadius = gymData.checkInRadiusMeters || DEFAULT_CHECK_IN_RADIUS_METERS;
  const autoExpireMinutes = gymData.autoExpireMinutes || DEFAULT_EXPIRE_MINUTES;

  // GPS validation (can be skipped for testing)
  let distanceFromGym = 0;
  if (!options.skipGpsValidation) {
    if (!userLocation || !userLocation.latitude || !userLocation.longitude) {
      throw new Error('Location is required for check-in');
    }

    if (!gymLocation || !gymLocation.latitude || !gymLocation.longitude) {
      throw new Error('Gym location not configured');
    }

    distanceFromGym = calculateDistanceMeters(userLocation, gymLocation);

    if (distanceFromGym > checkInRadius) {
      throw new Error(
        'You must be at the gym to check in. Try again when you arrive.'
      );
    }
  }

  // Get user data
  const userRef = doc(db, 'users', odId);
  const userDoc = await getDoc(userRef);
  const userName = userDoc.exists() ? userDoc.data().name : 'Anonymous';

  // Create presence
  const presenceId = getPresenceId(odId, gymId);
  const presenceRef = doc(db, 'presence', presenceId);

  const now = new Date();
  const presenceData = {
    odId,
    userName,
    gymId,
    gymName: gymData.name,
    status: PRESENCE_STATUS.ACTIVE,
    checkInLocation: userLocation || null,
    distanceFromGym,
    checkedInAt: Timestamp.fromDate(now),
    expiresAt: calculateExpiryTime(autoExpireMinutes),
    checkedOutAt: null,
    scheduleId: null,
    createdAt: serverTimestamp(),
  };

  await setDoc(presenceRef, presenceData);

  // Update gym presence count
  await updateGymPresenceCount(gymId, 1);

  // Update user's activePresence
  await updateDoc(userRef, {
    activePresence: {
      odId,
      gymId,
      gymName: gymData.name,
      checkedInAt: Timestamp.fromDate(now),
      expiresAt: presenceData.expiresAt,
    },
  });

  // Check if this fulfills a scheduled session
  const matchingSchedule = await findMatchingSchedule(odId, gymId);
  if (matchingSchedule) {
    await markScheduleAttended(matchingSchedule.id, presenceId);
    // Update presence with schedule link
    await updateDoc(presenceRef, { scheduleId: matchingSchedule.id });
    presenceData.scheduleId = matchingSchedule.id;
  }

  return { id: presenceId, ...presenceData };
};

/**
 * Check out from current gym
 *
 * @returns {Promise<Object>} Checked out presence data
 * @throws {Error} If no active presence
 */
export const checkOut = async () => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Must be logged in to check out');
  }

  const activePresence = await getActivePresence(user.uid);
  if (!activePresence) {
    throw new Error('No active check-in found');
  }

  const presenceRef = doc(db, 'presence', activePresence.id);

  await updateDoc(presenceRef, {
    status: PRESENCE_STATUS.CHECKED_OUT,
    checkedOutAt: serverTimestamp(),
  });

  // Update gym presence count
  await updateGymPresenceCount(activePresence.gymId, -1);

  // Clear user's activePresence
  const userRef = doc(db, 'users', user.uid);
  await updateDoc(userRef, { activePresence: null });

  return { ...activePresence, status: PRESENCE_STATUS.CHECKED_OUT };
};

/**
 * Mark a presence as expired
 *
 * @param {string} presenceId - Presence document ID
 * @param {string} gymId - Gym ID
 */
const markPresenceExpired = async (presenceId, gymId) => {
  try {
    const presenceRef = doc(db, 'presence', presenceId);
    const presenceDoc = await getDoc(presenceRef);

    if (presenceDoc.exists() && presenceDoc.data().status === PRESENCE_STATUS.ACTIVE) {
      const data = presenceDoc.data();

      await updateDoc(presenceRef, {
        status: PRESENCE_STATUS.EXPIRED,
      });

      // Update gym count
      await updateGymPresenceCount(gymId, -1);

      // Clear user's activePresence
      const userRef = doc(db, 'users', data.odId);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists() && userDoc.data().activePresence?.gymId === gymId) {
        await updateDoc(userRef, { activePresence: null });
      }
    }
  } catch (error) {
    console.error('Error marking presence expired:', error);
  }
};

/**
 * Expire all stale presences
 * Called by cleanup job
 *
 * @returns {Promise<number>} Number of presences expired
 */
export const expireStalePresences = async () => {
  const now = new Date();
  const presencesRef = collection(db, 'presence');

  // Query active presences - filter by expiry time client-side
  // (Firestore can't do inequality on two different fields in same query)
  const q = query(
    presencesRef,
    where('status', '==', PRESENCE_STATUS.ACTIVE)
  );

  const snapshot = await getDocs(q);
  let expiredCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const expiresAt = data.expiresAt?.toDate();

    if (expiresAt && expiresAt < now) {
      await markPresenceExpired(doc.id, data.gymId);
      expiredCount++;
    }
  }

  return expiredCount;
};

/**
 * Update gym's current presence count
 *
 * @param {string} gymId - Gym ID
 * @param {number} delta - Change (+1 or -1)
 */
export const updateGymPresenceCount = async (gymId, delta) => {
  try {
    const gymRef = doc(db, 'gyms', gymId);
    const gymDoc = await getDoc(gymRef);

    if (!gymDoc.exists()) {
      console.warn(`Gym ${gymId} not found`);
      return;
    }

    const currentCount = gymDoc.data().currentPresenceCount || 0;
    const newCount = Math.max(0, currentCount + delta);

    await updateDoc(gymRef, {
      currentPresenceCount: newCount,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating gym presence count:', error);
  }
};

/**
 * Subscribe to active presences at a gym (real-time)
 *
 * @param {string} gymId - Gym ID
 * @param {Function} callback - Called with array of presences
 * @returns {Function} Unsubscribe function
 */
export const subscribeToGymPresences = (gymId, callback) => {
  const presencesRef = collection(db, 'presence');
  const q = query(
    presencesRef,
    where('gymId', '==', gymId),
    where('status', '==', PRESENCE_STATUS.ACTIVE),
    orderBy('checkedInAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const now = new Date();
      const presences = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((presence) => {
          // Filter out expired (cleanup will handle them)
          const expiresAt = presence.expiresAt?.toDate();
          if (expiresAt && expiresAt < now) {
            // Trigger background cleanup
            markPresenceExpired(presence.id, presence.gymId);
            return false;
          }
          return true;
        });

      callback(presences);
    },
    (error) => {
      console.error('Error subscribing to presences:', error);
      callback([]);
    }
  );
};

/**
 * Subscribe to user's active presence (real-time)
 *
 * @param {string} odId - User ID
 * @param {Function} callback - Called with presence or null
 * @returns {Function} Unsubscribe function
 */
export const subscribeToUserPresence = (odId, callback) => {
  const presencesRef = collection(db, 'presence');
  const q = query(
    presencesRef,
    where('odId', '==', odId),
    where('status', '==', PRESENCE_STATUS.ACTIVE)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        callback(null);
        return;
      }

      const doc = snapshot.docs[0];
      const data = doc.data();
      const now = new Date();

      // Check expiry
      const expiresAt = data.expiresAt?.toDate();
      if (expiresAt && expiresAt < now) {
        markPresenceExpired(doc.id, data.gymId);
        callback(null);
        return;
      }

      callback({ id: doc.id, ...data });
    },
    (error) => {
      console.error('Error subscribing to user presence:', error);
      callback(null);
    }
  );
};

/**
 * Get all active presences at a gym
 *
 * @param {string} gymId - Gym ID
 * @returns {Promise<Array>} Array of active presences
 */
export const getGymPresences = async (gymId) => {
  const presencesRef = collection(db, 'presence');
  const q = query(
    presencesRef,
    where('gymId', '==', gymId),
    where('status', '==', PRESENCE_STATUS.ACTIVE),
    orderBy('checkedInAt', 'desc')
  );

  const snapshot = await getDocs(q);
  const now = new Date();

  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((presence) => {
      const expiresAt = presence.expiresAt?.toDate();
      return !expiresAt || expiresAt >= now;
    });
};
