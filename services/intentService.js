/**
 * Intent Service
 * Handles scheduling future gym visits
 */

import { db, auth } from '../config/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

/**
 * Generate intent document ID (compound key prevents duplicates)
 */
export const getIntentId = (odId, gymId, timeSlot) => `${odId}_${gymId}_${timeSlot}`;

/**
 * Format a date to a time slot string (hourly)
 */
export const formatTimeSlot = (date) => {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 13) + ':00';
};

/**
 * Get available time slots for today and tomorrow
 */
export const getAvailableTimeSlots = () => {
  const slots = [];
  const now = new Date();
  const currentHour = now.getHours();

  // Today's remaining slots (starting from next hour)
  for (let hour = currentHour + 1; hour <= 22; hour++) {
    const date = new Date(now);
    date.setHours(hour, 0, 0, 0);
    slots.push({
      date,
      timeSlot: formatTimeSlot(date),
      label: `Today ${formatTime(date)}`,
      isToday: true,
    });
  }

  // Tomorrow's slots
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  for (let hour = 6; hour <= 22; hour++) {
    const date = new Date(tomorrow);
    date.setHours(hour, 0, 0, 0);
    slots.push({
      date,
      timeSlot: formatTimeSlot(date),
      label: `Tomorrow ${formatTime(date)}`,
      isToday: false,
    });
  }

  return slots;
};

/**
 * Format time for display (e.g., "6:00 PM")
 */
const formatTime = (date) => {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

/**
 * Create an intent to visit a gym
 */
export const createIntent = async (gymId, gymName, plannedTime, timeSlot) => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Must be logged in to create an intent');
  }

  // Check if intent already exists for this gym/time
  const intentId = getIntentId(user.uid, gymId, timeSlot);
  const intentRef = doc(db, 'intents', intentId);
  const existingIntent = await getDoc(intentRef);

  if (existingIntent.exists() && existingIntent.data().status === 'pending') {
    throw new Error('You already have a plan for this gym at this time');
  }

  // Check user's total pending intents (max 5)
  const userIntentsQuery = query(
    collection(db, 'intents'),
    where('odId', '==', user.uid),
    where('status', '==', 'pending')
  );
  const userIntents = await getDocs(userIntentsQuery);
  if (userIntents.size >= 5) {
    throw new Error('You can only have up to 5 scheduled visits');
  }

  const intentData = {
    odId: user.uid,
    userName: user.displayName || 'Anonymous',
    gymId,
    gymName,
    status: 'pending',
    plannedTime: Timestamp.fromDate(new Date(plannedTime)),
    timeSlot,
    createdAt: serverTimestamp(),
    fulfilledAt: null,
  };

  await setDoc(intentRef, intentData);

  // Update gym intent counts
  await updateGymIntentCount(gymId, timeSlot, 1);

  return { id: intentId, ...intentData };
};

/**
 * Cancel an intent
 */
export const cancelIntent = async (intentId) => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Must be logged in to cancel an intent');
  }

  const intentRef = doc(db, 'intents', intentId);
  const intentDoc = await getDoc(intentRef);

  if (!intentDoc.exists()) {
    throw new Error('Intent not found');
  }

  const intentData = intentDoc.data();

  if (intentData.odId !== user.uid) {
    throw new Error('You can only cancel your own intents');
  }

  if (intentData.status !== 'pending') {
    throw new Error('This intent is no longer active');
  }

  await updateDoc(intentRef, {
    status: 'cancelled',
    cancelledAt: serverTimestamp(),
  });

  // Update gym intent counts
  await updateGymIntentCount(intentData.gymId, intentData.timeSlot, -1);

  return intentData;
};

/**
 * Get user's pending intents
 */
export const getUserIntents = async (odId) => {
  const intentsRef = collection(db, 'intents');
  const q = query(
    intentsRef,
    where('odId', '==', odId),
    where('status', '==', 'pending'),
    orderBy('plannedTime', 'asc')
  );

  const snapshot = await getDocs(q);
  const now = new Date();

  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    .filter((intent) => {
      // Filter out past intents
      if (intent.plannedTime && intent.plannedTime.toDate() < now) {
        // Mark as expired in background
        markIntentExpired(intent.id);
        return false;
      }
      return true;
    });
};

/**
 * Subscribe to user's intents (real-time)
 */
export const subscribeToUserIntents = (odId, callback) => {
  const intentsRef = collection(db, 'intents');
  const q = query(
    intentsRef,
    where('odId', '==', odId),
    where('status', '==', 'pending'),
    orderBy('plannedTime', 'asc')
  );

  return onSnapshot(q, (snapshot) => {
    const now = new Date();
    const intents = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter((intent) => {
        // Filter out past intents
        const plannedTime = intent.plannedTime?.toDate();
        if (plannedTime && plannedTime < new Date(now.getTime() - 60 * 60 * 1000)) {
          // More than 1 hour past - mark as expired
          markIntentExpired(intent.id);
          return false;
        }
        return true;
      });
    callback(intents);
  }, (error) => {
    console.error('Error subscribing to intents:', error);
    callback([]);
  });
};

/**
 * Subscribe to intents for a specific gym (real-time)
 */
export const subscribeToGymIntents = (gymId, callback) => {
  const intentsRef = collection(db, 'intents');
  const now = new Date();

  const q = query(
    intentsRef,
    where('gymId', '==', gymId),
    where('status', '==', 'pending'),
    orderBy('plannedTime', 'asc')
  );

  return onSnapshot(q, (snapshot) => {
    const intents = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter((intent) => {
        const plannedTime = intent.plannedTime?.toDate();
        return plannedTime && plannedTime > new Date();
      });

    // Group by time slot
    const intentsBySlot = {};
    intents.forEach((intent) => {
      const slot = intent.timeSlot;
      if (!intentsBySlot[slot]) {
        intentsBySlot[slot] = [];
      }
      intentsBySlot[slot].push(intent);
    });

    callback(intents, intentsBySlot);
  }, (error) => {
    console.error('Error subscribing to gym intents:', error);
    callback([], {});
  });
};

/**
 * Mark an intent as expired (background cleanup)
 */
const markIntentExpired = async (intentId) => {
  try {
    const intentRef = doc(db, 'intents', intentId);
    const intentDoc = await getDoc(intentRef);

    if (intentDoc.exists() && intentDoc.data().status === 'pending') {
      const data = intentDoc.data();
      await updateDoc(intentRef, { status: 'expired' });
      // Decrement gym intent count
      await updateGymIntentCount(data.gymId, data.timeSlot, -1);
    }
  } catch (error) {
    console.error('Error marking intent expired:', error);
  }
};

/**
 * Update gym's intent count for a time slot
 */
const updateGymIntentCount = async (gymId, timeSlot, delta) => {
  try {
    const gymRef = doc(db, 'gyms', gymId);
    const gymDoc = await getDoc(gymRef);

    if (!gymDoc.exists()) {
      console.warn(`Gym ${gymId} not found`);
      return;
    }

    const intentCounts = gymDoc.data().intentCounts || {};
    const currentCount = intentCounts[timeSlot] || 0;
    const newCount = Math.max(0, currentCount + delta);

    if (newCount === 0) {
      delete intentCounts[timeSlot];
    } else {
      intentCounts[timeSlot] = newCount;
    }

    await updateDoc(gymRef, {
      intentCounts,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating gym intent count:', error);
  }
};

/**
 * Mark intent as fulfilled when user checks in
 */
export const fulfillIntent = async (odId, gymId) => {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    // Find matching pending intent within time window
    const intentsRef = collection(db, 'intents');
    const q = query(
      intentsRef,
      where('odId', '==', odId),
      where('gymId', '==', gymId),
      where('status', '==', 'pending')
    );

    const snapshot = await getDocs(q);

    for (const doc of snapshot.docs) {
      const intent = doc.data();
      const plannedTime = intent.plannedTime?.toDate();

      // Check if planned time is within window
      if (plannedTime && plannedTime >= oneHourAgo && plannedTime <= oneHourFromNow) {
        await updateDoc(doc.ref, {
          status: 'fulfilled',
          fulfilledAt: serverTimestamp(),
        });
        // Update gym intent count
        await updateGymIntentCount(gymId, intent.timeSlot, -1);
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error fulfilling intent:', error);
    return false;
  }
};
