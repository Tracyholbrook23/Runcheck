/**
 * Presence Service
 * Handles all Firestore operations for the presence system
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

// Default expiry time in minutes
const DEFAULT_EXPIRY_MINUTES = 180; // 3 hours

/**
 * Generate presence document ID (compound key prevents duplicates)
 */
export const getPresenceId = (odId, gymId) => `${odId}_${gymId}`;

/**
 * Calculate expiry timestamp
 */
export const calculateExpiryTime = (minutes = DEFAULT_EXPIRY_MINUTES) => {
  const expiryDate = new Date();
  expiryDate.setMinutes(expiryDate.getMinutes() + minutes);
  return Timestamp.fromDate(expiryDate);
};

/**
 * Check if user has an active presence anywhere
 */
export const getActivePresence = async (odId) => {
  const presencesRef = collection(db, 'presences');
  const q = query(
    presencesRef,
    where('odId', '==', odId),
    where('status', '==', 'active')
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();

  // Check if expired (client-side check)
  if (data.expiresAt && data.expiresAt.toDate() < new Date()) {
    // Mark as expired
    await updateDoc(doc.ref, { status: 'expired' });
    return null;
  }

  return { id: doc.id, ...data };
};

/**
 * Check in to a gym
 */
export const checkIn = async (gymId, gymName) => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Must be logged in to check in');
  }

  // Check for existing active presence
  const existingPresence = await getActivePresence(user.uid);
  if (existingPresence) {
    throw new Error(`Already checked in at ${existingPresence.gymName}. Check out first.`);
  }

  const presenceId = getPresenceId(user.uid, gymId);
  const presenceRef = doc(db, 'presences', presenceId);

  // Check if there's a recent presence at this gym (rate limiting)
  const existingDoc = await getDoc(presenceRef);
  if (existingDoc.exists()) {
    const data = existingDoc.data();
    if (data.status === 'active') {
      throw new Error('Already checked in at this gym');
    }
    // Allow re-check-in if previous was checked out or expired
  }

  const now = new Date();
  const presenceData = {
    odId: user.uid,
    userName: user.displayName || 'Anonymous',
    gymId,
    gymName,
    status: 'active',
    checkedInAt: Timestamp.fromDate(now),
    expiresAt: calculateExpiryTime(),
    checkedOutAt: null,
    createdAt: serverTimestamp(),
  };

  await setDoc(presenceRef, presenceData);

  // Update gym presence count
  await updateGymPresenceCount(gymId, 1);

  return { id: presenceId, ...presenceData };
};

/**
 * Check out from current gym
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

  const presenceRef = doc(db, 'presences', activePresence.id);

  await updateDoc(presenceRef, {
    status: 'checked_out',
    checkedOutAt: serverTimestamp(),
  });

  // Update gym presence count
  await updateGymPresenceCount(activePresence.gymId, -1);

  return activePresence;
};

/**
 * Update gym's current presence count
 * Note: In production, this should be done via Cloud Functions for accuracy
 */
export const updateGymPresenceCount = async (gymId, delta) => {
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
};

/**
 * Subscribe to active presences at a gym (real-time)
 */
export const subscribeToGymPresences = (gymId, callback) => {
  const presencesRef = collection(db, 'presences');
  const q = query(
    presencesRef,
    where('gymId', '==', gymId),
    where('status', '==', 'active'),
    orderBy('checkedInAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const presences = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(presences);
  });
};

/**
 * Subscribe to user's active presence (real-time)
 */
export const subscribeToUserPresence = (odId, callback) => {
  const presencesRef = collection(db, 'presences');
  const q = query(
    presencesRef,
    where('odId', '==', odId),
    where('status', '==', 'active')
  );

  return onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      callback(null);
      return;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    // Check expiry
    if (data.expiresAt && data.expiresAt.toDate() < new Date()) {
      callback(null);
      return;
    }

    callback({ id: doc.id, ...data });
  });
};
