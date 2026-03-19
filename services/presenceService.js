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
 * - Presences auto-expire after configured time (default 2 hours)
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
import { awardPoints } from './pointsService';
import { evaluateRunReward } from './runService';
import { calculateReliabilityScore } from './reliabilityService';

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

  // ── Suspension guard ────────────────────────────────────────────────────
  // Block suspended users from checking in. Supports timed suspensions:
  // if suspensionEndsAt has passed, the user is allowed through.
  const userSnap = await getDoc(doc(db, 'users', odId));
  if (userSnap.exists()) {
    const userData = userSnap.data();
    if (userData.isSuspended === true) {
      const endsAt = userData.suspensionEndsAt?.toDate?.();
      if (!endsAt || endsAt > new Date()) {
        throw new Error('Your account is suspended. You cannot perform this action.');
      }
    }
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

  if (__DEV__) console.log('[CHECK-IN] Starting GPS validation...');
  if (__DEV__) console.log('[CHECK-IN] Skip GPS validation?', options.skipGpsValidation);

  if (!options.skipGpsValidation) {
    if (__DEV__) console.log('[CHECK-IN] Validating user location...');

    if (!userLocation || !userLocation.latitude || !userLocation.longitude) {
      if (__DEV__) console.error('[CHECK-IN] User location missing or invalid:', userLocation);
      throw new Error('Location is required for check-in');
    }

    if (__DEV__) console.log('[CHECK-IN] User location valid:', userLocation);

    if (!gymLocation || !gymLocation.latitude || !gymLocation.longitude) {
      if (__DEV__) console.error('[CHECK-IN] Gym location not configured:', gymLocation);
      throw new Error('Gym location not configured');
    }

    if (__DEV__) console.log('[CHECK-IN] Gym location:', gymLocation);
    if (__DEV__) console.log('[CHECK-IN] Check-in radius:', checkInRadius, 'meters');

    distanceFromGym = calculateDistanceMeters(userLocation, gymLocation);

    if (__DEV__) console.log('[CHECK-IN] Distance from gym:', distanceFromGym.toFixed(2), 'meters');
    if (__DEV__) console.log('[CHECK-IN] Required radius:', checkInRadius, 'meters');

    // Service-layer GPS distance gate (re-enabled for launch)
    if (distanceFromGym > checkInRadius) {
      if (__DEV__) console.warn('[CHECK-IN] Too far:', distanceFromGym.toFixed(0), 'm > max:', checkInRadius, 'm');
      throw new Error(
        `You must be at the gym to check in. You are ${distanceFromGym.toFixed(0)}m away (max ${checkInRadius}m).`
      );
    }

    if (__DEV__) console.log('[CHECK-IN] GPS validation passed! Distance OK:', distanceFromGym.toFixed(2), 'm <', checkInRadius, 'm');
  } else {
    if (__DEV__) console.warn('[CHECK-IN] GPS validation SKIPPED (testing mode)');
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
    userAvatar: userData.photoURL || null,
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

  if (__DEV__) console.log('[CHECK-IN] GPS validation complete - Starting database transaction...');
  if (__DEV__) console.log('[CHECK-IN] Presence data:', {
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
  }).catch((err) => {
    if (__DEV__) console.error('Activity write error (check-in):', err);
  });

  // Mark schedule as attended (outside transaction - non-critical)
  if (matchingSchedule) {
    await markScheduleAttended(matchingSchedule.id, presenceId);
  }

  // ── Award points for this check-in (client-side, idempotent via sessionKey) ──
  // The key is presenceId + check-in timestamp so each session at the same gym
  // gets its own unique idempotency slot. Using just presenceId ({userId}_{gymId})
  // would block points on the second visit to the same gym because the document
  // ID is reused when the previous session is checked out or expired.
  // The presence document ID itself is unchanged — only the points-award key differs.
  const pointsAction = matchingSchedule ? 'checkinWithPlan' : 'checkin';
  const sessionKey = `${presenceId}_${now.getTime()}`;
  awardPoints(odId, pointsAction, sessionKey, gymId).catch((err) => {
    if (__DEV__) console.error('Points award error (check-in):', err);
  });

  // ── Run follow-through reward — delegated to runService ─────────────────
  // evaluateRunReward verifies legitimacy (participantCount >= 2, creator
  // presence, time window) and handles idempotency before awarding points.
  evaluateRunReward(odId, gymId, now).catch((err) => {
    if (__DEV__) console.error('Run reward evaluation error:', err);
  });

  // ── Record attended session in reliability stats ─────────────────────────
  // Increments reliability.totalAttended and recalculates the score.
  // Uses a transaction so the read-increment-recalculate is atomic.
  // Fire-and-forget — non-critical relative to the presence write above.
  runTransaction(db, async (txn) => {
    const snap = await txn.get(userRef);
    const d = snap.data() || {};
    const r = d.reliability || {};
    const newAttended = (r.totalAttended || 0) + 1;
    const newNoShow = r.totalNoShow || 0;
    const newScore = calculateReliabilityScore({
      totalAttended: newAttended,
      totalNoShow: newNoShow,
    });
    txn.update(userRef, {
      'reliability.totalAttended': increment(1),
      'reliability.score': newScore,
      'reliability.lastUpdated': Timestamp.now(),
    });
  }).catch((err) => {
    if (__DEV__) console.error('Attendance record error (check-in):', err);
  });

  return { id: presenceId, ...presenceData };
};

/**
 * Check out from current gym
 *
 * Uses a transaction to atomically update presence status, decrement the gym
 * count, and clear the user's activePresence.
 *
 * isManual is kept for API compatibility but currently has no behavioral
 * difference. Points are NEVER deducted on checkout — the check-in itself
 * is the attendance record and it is permanent. The activity feed entry is
 * preserved in both paths so the user's session history stays intact.
 *
 *   isManual = true  → User tapped "Check Out" (UI path, via usePresence hook)
 *   isManual = false → Auto-expiry path (Cloud Function / client-side cleanup)
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
  // 3. Clear user's activePresence — points are never deducted on checkout
  await runTransaction(db, async (transaction) => {
    transaction.update(presenceRef, {
      status: PRESENCE_STATUS.CHECKED_OUT,
      checkedOutAt: serverTimestamp(),
    });

    transaction.update(gymRef, {
      currentPresenceCount: increment(-1),
      updatedAt: serverTimestamp(),
    });

    // Clear the user's active presence regardless of checkout path.
    // Points earned at check-in are permanent — manual checkout no longer deducts them.
    transaction.update(userRef, {
      activePresence: null,
    });
  });

  // Remove the "checked in at" activity feed entry so the Home feed only shows
  // people who are CURRENTLY at a gym. Attendance credit is NOT lost here —
  // it was already written to users.reliability.totalAttended at check-in time
  // and is completely separate from the activity feed.
  getDocs(
    query(
      collection(db, 'activity'),
      where('userId', '==', user.uid),
      where('gymId',  '==', activePresence.gymId),
      where('action', '==', 'checked in at'),
      limit(1)
    )
  )
    .then((snap) => Promise.all(snap.docs.map((d) => deleteDoc(doc(db, 'activity', d.id)))))
    .catch((err) => {
      if (__DEV__) console.error('Activity cleanup error (checkout):', err);
    });

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

      // Clear user's activePresence — only permitted when the current user IS the owner
      // (Firestore rules enforce isSelf; other users expiring a stale presence can't write here)
      if (auth.currentUser?.uid === data.odId) {
        const userRef = doc(db, 'users', data.odId);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists() && userDoc.data().activePresence?.gymId === gymId) {
          await updateDoc(userRef, { activePresence: null });
        }
      }

      // Remove the "checked in at" activity feed entry — same logic as checkOut().
      // Attendance credit in users.reliability.totalAttended is unaffected.
      getDocs(
        query(
          collection(db, 'activity'),
          where('userId', '==', data.odId),
          where('gymId',  '==', gymId),
          where('action', '==', 'checked in at'),
          limit(1)
        )
      )
        .then((snap) => Promise.all(snap.docs.map((d) => deleteDoc(doc(db, 'activity', d.id)))))
        .catch((err) => {
          if (__DEV__) console.error('Activity cleanup error (expiry):', err);
        });
    }
  } catch (error) {
    if (__DEV__) console.error('Error marking presence expired:', error);
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
    if (__DEV__) console.error('Error updating gym presence count:', error);
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
      if (__DEV__) console.error('Error subscribing to presences:', error);
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
      if (__DEV__) console.error('Error subscribing to user presence:', error);
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
