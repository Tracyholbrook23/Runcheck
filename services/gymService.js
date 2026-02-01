/**
 * Gym Service
 * Handles all Firestore operations for gyms
 */

import { db } from '../config/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';

/**
 * Seed initial gyms (call once to populate database)
 */
export const seedGyms = async () => {
  const gyms = [
    {
      id: 'la-fitness-southside',
      name: 'LA Fitness - Southside',
      address: '123 Southside Ave, Atlanta, GA',
      currentPresenceCount: 0,
      intentCounts: {},
      autoExpireMinutes: 180,
    },
    {
      id: 'ymca-midtown',
      name: 'YMCA - Midtown',
      address: '456 Midtown Blvd, Atlanta, GA',
      currentPresenceCount: 0,
      intentCounts: {},
      autoExpireMinutes: 180,
    },
    {
      id: 'outdoor-park-rivertown',
      name: 'Outdoor Park - Rivertown',
      address: '789 River Rd, Atlanta, GA',
      currentPresenceCount: 0,
      intentCounts: {},
      autoExpireMinutes: 180,
    },
    {
      id: '24hr-fitness-buckhead',
      name: '24 Hour Fitness - Buckhead',
      address: '321 Buckhead Loop, Atlanta, GA',
      currentPresenceCount: 0,
      intentCounts: {},
      autoExpireMinutes: 180,
    },
    {
      id: 'lifetime-fitness-perimeter',
      name: 'Lifetime Fitness - Perimeter',
      address: '555 Perimeter Center, Atlanta, GA',
      currentPresenceCount: 0,
      intentCounts: {},
      autoExpireMinutes: 180,
    },
  ];

  const gymsRef = collection(db, 'gyms');

  for (const gym of gyms) {
    const gymRef = doc(gymsRef, gym.id);
    const existingGym = await getDoc(gymRef);

    if (!existingGym.exists()) {
      await setDoc(gymRef, {
        ...gym,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      console.log(`Created gym: ${gym.name}`);
    }
  }

  return gyms;
};

/**
 * Get all gyms
 */
export const getAllGyms = async () => {
  const gymsRef = collection(db, 'gyms');
  const q = query(gymsRef, orderBy('name', 'asc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
};

/**
 * Get a single gym by ID
 */
export const getGym = async (gymId) => {
  const gymRef = doc(db, 'gyms', gymId);
  const gymDoc = await getDoc(gymRef);

  if (!gymDoc.exists()) {
    return null;
  }

  return { id: gymDoc.id, ...gymDoc.data() };
};

/**
 * Subscribe to all gyms (real-time updates)
 */
export const subscribeToGyms = (callback) => {
  const gymsRef = collection(db, 'gyms');
  const q = query(gymsRef, orderBy('name', 'asc'));

  return onSnapshot(q, (snapshot) => {
    const gyms = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(gyms);
  }, (error) => {
    console.error('Error subscribing to gyms:', error);
    callback([]);
  });
};

/**
 * Subscribe to a single gym (real-time updates)
 */
export const subscribeToGym = (gymId, callback) => {
  const gymRef = doc(db, 'gyms', gymId);

  return onSnapshot(gymRef, (doc) => {
    if (!doc.exists()) {
      callback(null);
      return;
    }
    callback({ id: doc.id, ...doc.data() });
  }, (error) => {
    console.error('Error subscribing to gym:', error);
    callback(null);
  });
};
