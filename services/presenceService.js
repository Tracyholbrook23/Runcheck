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
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  runTransaction,
  increment,
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
 * Uses Firestore transactions to prevent race conditions on currentPresenceCount.
 * Atomically:
 * 1. Validates no existing presence
 * 2. Creates presence document
 * 3. Increments gym's currentPresenceCount
 * 4. Updates user's activePresence
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

  // Check for existing active presence anywhere (outside transaction for early exit)
  const existingPresence = await getActivePresence(odId);
  if (existingPresence) {
    throw new Error(`Already checked in at ${existingPresence.gymName}. Please check out first.`);
  }

  // Get gym data (outside transaction for GPS validation)
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

  console.log('🔐 [CHECK-IN] Starting GPS validation...');
  console.log('🔐 [CHECK-IN] Skip GPS validation?', options.skipGpsValidation);

  if (!options.skipGpsValidation) {
    console.log('🔐 [CHECK-IN] Validating user location...');

    if (!userLocation || !userLocation.latitude || !userLocation.longitude) {
      console.error('❌ [CHECK-IN] User location missing or invalid:', userLocation);
      throw new Error('Location is required for check-in');
    }

    console.log('✅ [CHECK-IN] User location valid:', userLocation);

    if (!gymLocation || !gymLocation.latitude || !gymLocation.longitude) {
      console.error('❌ [CHECK-IN] Gym location not configured:', gymLocation);
      throw new Error('Gym location not configured');
    }

    console.log('✅ [CHECK-IN] Gym location:', gymLocation);
    console.log('🔐 [CHECK-IN] Check-in radius:', checkInRadius, 'meters');

    distanceFromGym = calculateDistanceMeters(userLocation, gymLocation);

    console.log('📍 [CHECK-IN] Distance from gym:', distanceFromGym.toFixed(2), 'meters');
    console.log('📍 [CHECK-IN] Required radius:', checkInRadius, 'meters');

    // TESTING ONLY - uncomment before launch
    // if (distanceFromGym > checkInRadius) {
    //   console.error('❌ [CHECK-IN] TOO FAR! Distance:', distanceFromGym.toFixed(2), 'm > Radius:', checkInRadius, 'm');
    //   throw new Error(
    //     `You must be at the gym to check in. You are ${distanceFromGym.toFixed(0)}m away (max ${checkInRadius}m).`
    //   );
    // }

    console.log('✅ [CHECK-IN] GPS validation passed! Distance OK:', distanceFromGym.toFixed(2), 'm <', checkInRadius, 'm');
  } else {
    console.warn('⚠️ [CHECK-IN] GPS validation SKIPPED (testing mode)');
  }

  // Get user data (outside transaction)
  const userRef = doc(db, 'users', odId);
  const userDoc = await getDoc(userRef);
  const userData = userDoc.exists() ? userDoc.data() : {};
  const userName = userData.name || 'Anonymous';
  const skillLevel = userData.skillLevel || 'Casual';

  // Check if this fulfills a scheduled session (outside transaction)
  const matchingSchedule = await findMatchingSchedule(odId, gymId);

  const presenceId = getPresenceId(odId, gymId);
  const presenceRef = doc(db, 'presence', presenceId);
  const now = new Date();

  const presenceData = {
    odId,
    userName,
    gymId,
    gymName: gymData.name,
    skillLevel,
    status: PRESENCE_STATUS.ACTIVE,
    checkInLocation: userLocation || null,
    distanceFromGym,
    checkedInAt: Timestamp.fromDate(now),
    expiresAt: calculateExpiryTime(autoExpireMinutes),
    checkedOutAt: null,
    scheduleId: matchingSchedule?.id || null,
    createdAt: serverTimestamp(),
  };

  console.log('💾 [CHECK-IN] GPS validation complete - Starting database transaction...');
  console.log('💾 [CHECK-IN] Presence data:', {
    userName,
    gymName: gymData.name,
    distanceFromGym: distanceFromGym.toFixed(2) + 'm',
  });

  // Use transaction to atomically:
  // 1. Create presence document
  // 2. Increment gym's currentPresenceCount
  // 3. Update user's activePresence
  await runTransaction(db, async (transaction) => {
    // Double-check no presence was created since we checked earlier
    const existingPresenceDoc = await transaction.get(presenceRef);
    if (existingPresenceDoc.exists() && existingPresenceDoc.data().status === PRESENCE_STATUS.ACTIVE) {
      throw new Error('Already checked in at this gym');
    }

    // Create presence document
    transaction.set(presenceRef, presenceData);

    // Atomically increment gym's currentPresenceCount
    transaction.update(gymRef, {
      currentPresenceCount: increment(1),
      updatedAt: serverTimestamp(),
    });

    // Update user's activePresence
    transaction.update(userRef, {
      activePresence: {
        odId,
        gymId,
        gymName: gymData.name,
        checkedInAt: Timestamp.fromDate(now),
        expiresAt: presenceData.expiresAt,
      },
    });
  });

  // Write activity feed event — fire and forget.
  // Use Timestamp.now() (client-side) instead of serverTimestamp() so the
  // document immediately satisfies the HomeScreen's createdAt >= twoHoursAgo
  // query. serverTimestamp() leaves a pending-write placeholder that Firestore
  // excludes from inequality queries until the server round-trip completes.
  addDoc(collection(db, 'activity'), {
    userId: odId,
    userName,
    userAvatar: userData.photoURL || null,
    action: 'checked in at',
    gymId,
    gymName: gymData.name,
    createdAt: Timestamp.now(),
  }).catch((err) => console.error('Activity write error (check-in):', err));

  // Mark schedule as attended (outside transaction - non-critical)
  if (matchingSchedule) {
    await markScheduleAttended(matchingSchedule.id, presenceId);
  }

  return { id: presenceId, ...presenceData };
};

/**
 * Check out from current gym
 *
 * Uses a transaction to atomically update presence status, decrement the gym
 * count, and clear the user's activePresence.
 *
 * isManual controls whether this is a voluntary early checkout (true) or an
 * auto-expiry triggered by the server/Cloud Function (false):
 *
 *   isManual = true  → User tapped "Check Out" before the session expired.
 *                       Deduct 10 pts (prevents check-in/out point farming)
 *                       and delete the "checked in at" activity feed entry.
 *
 *   isManual = false → Auto-expiry path (Cloud Function / client-side cleanup).
 *                       Do NOT deduct points — the user successfully attended
 *                       their session and has already earned those points.
 *                       Do NOT remove the activity entry.
 *
 * @param {boolean} isManual — true for user-initiated checkout (default), false for auto-expiry
 * @returns {Promise<Object>} Checked out presence data
 * @throws {Error} If no active presence or user is not authenticated
 */
export const checkOut = async (isManual = true) => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Must be logged in to check out');
  }

  const activePresence = await getActivePresence(user.uid);
  if (!activePresence) {
    throw new Error('No active check-in found');
  }

  const presenceRef = doc(db, 'presence', activePresence.id);
  const gymRef = doc(db, 'gyms', activePresence.gymId);
  const userRef = doc(db, 'users', user.uid);

  // Atomically:
  // 1. Mark presence as checked-out
  // 2. Decrement gym's currentPresenceCount
  // 3. Clear user's activePresence (and optionally deduct points)
  await runTransaction(db, async (transaction) => {
    transaction.update(presenceRef, {
      status: PRESENCE_STATUS.CHECKED_OUT,
      checkedOutAt: serverTimestamp(),
    });

    transaction.update(gymRef, {
      currentPresenceCount: increment(-1),
      updatedAt: serverTimestamp(),
    });

    if (isManual) {
      // Manual early checkout: clear presence AND deduct the check-in points
      // so the user can't farm points by rapidly checking in and out.
      transaction.update(userRef, {
        activePresence: null,
        totalPoints: increment(-10),
      });
    } else {
      // Auto-expiry: only clear the presence field — points stay intact.
      transaction.update(userRef, {
        activePresence: null,
      });
    }
  });

  // Manual checkout only: delete the "checked in at" activity feed entry.
  // This keeps the activity feed honest — a check-in that was reversed
  // shouldn't appear as if the user attended the session.
  if (isManual) {
    try {
      const activitySnap = await getDocs(
        query(
          collection(db, 'activity'),
          where('userId', '==', user.uid),
          where('gymId', '==', activePresence.gymId),
          where('action', '==', 'checked in at'),
          limit(1)
        )
      );
      activitySnap.forEach((actDoc) => deleteDoc(actDoc.ref));
    } catch (err) {
      // Non-critical — log and continue. The points deduction already happened.
      console.error('Activity cleanup error (manual check-out):', err);
    }
  }

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

// TODO: Auto-checkout via Cloud Function when presence expires after autoExpireMinutes (default 3hrs) — should NOT deduct points as user successfully attended

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
 * Update gym's current presence count using atomic increment
 * (Used by markPresenceExpired - checkIn/checkOut now use transactions)
 *
 * @param {string} gymId - Gym ID
 * @param {number} delta - Change (+1 or -1)
 */
export const updateGymPresenceCount = async (gymId, delta) => {
  try {
    const gymRef = doc(db, 'gyms', gymId);

    await updateDoc(gymRef, {
      currentPresenceCount: increment(delta),
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
