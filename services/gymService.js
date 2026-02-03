/**
 * Gym Service
 *
 * Manages gym data including locations for GPS validation.
 *
 * RESPONSIBILITIES:
 * - CRUD operations for gyms
 * - Seed initial gym data with GPS coordinates
 * - Real-time subscriptions for gym updates
 *
 * EXAMPLE USAGE:
 *
 * import { getAllGyms, getGym, subscribeToGyms } from './gymService';
 *
 * // Get all gyms
 * const gyms = await getAllGyms();
 *
 * // Subscribe to gym updates
 * const unsubscribe = subscribeToGyms((gyms) => {
 *   console.log('Gyms updated:', gyms);
 * });
 */

import { db } from '../config/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';

import { DEFAULT_CHECK_IN_RADIUS_METERS, DEFAULT_EXPIRE_MINUTES } from './models';

/**
 * Seed initial gyms with GPS locations
 * Call once to populate database
 *
 * @returns {Promise<Array>} Array of seeded gyms
 */
export const seedGyms = async () => {
  // Atlanta area gyms with real-ish coordinates
  const gyms = [
    {
      id: 'la-fitness-southside',
      name: 'LA Fitness - Southside',
      address: '123 Southside Ave, Atlanta, GA 30315',
      location: {
        latitude: 33.7120,
        longitude: -84.3880,
      },
      checkInRadiusMeters: DEFAULT_CHECK_IN_RADIUS_METERS,
      currentPresenceCount: 0,
      scheduleCounts: {},
      autoExpireMinutes: DEFAULT_EXPIRE_MINUTES,
    },
    {
      id: 'ymca-midtown',
      name: 'YMCA - Midtown',
      address: '456 Midtown Blvd, Atlanta, GA 30308',
      location: {
        latitude: 33.7870,
        longitude: -84.3830,
      },
      checkInRadiusMeters: DEFAULT_CHECK_IN_RADIUS_METERS,
      currentPresenceCount: 0,
      scheduleCounts: {},
      autoExpireMinutes: DEFAULT_EXPIRE_MINUTES,
    },
    {
      id: 'outdoor-park-rivertown',
      name: 'Outdoor Park - Piedmont',
      address: '789 Piedmont Ave, Atlanta, GA 30309',
      location: {
        latitude: 33.7870,
        longitude: -84.3740,
      },
      checkInRadiusMeters: 500, // Larger radius for outdoor park
      currentPresenceCount: 0,
      scheduleCounts: {},
      autoExpireMinutes: DEFAULT_EXPIRE_MINUTES,
    },
    {
      id: '24hr-fitness-buckhead',
      name: '24 Hour Fitness - Buckhead',
      address: '321 Buckhead Loop, Atlanta, GA 30326',
      location: {
        latitude: 33.8400,
        longitude: -84.3790,
      },
      checkInRadiusMeters: DEFAULT_CHECK_IN_RADIUS_METERS,
      currentPresenceCount: 0,
      scheduleCounts: {},
      autoExpireMinutes: DEFAULT_EXPIRE_MINUTES,
    },
    {
      id: 'lifetime-fitness-perimeter',
      name: 'Lifetime Fitness - Perimeter',
      address: '555 Perimeter Center, Atlanta, GA 30346',
      location: {
        latitude: 33.9260,
        longitude: -84.3410,
      },
      checkInRadiusMeters: DEFAULT_CHECK_IN_RADIUS_METERS,
      currentPresenceCount: 0,
      scheduleCounts: {},
      autoExpireMinutes: DEFAULT_EXPIRE_MINUTES,
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
    } else {
      // Always force update location data to ensure correct coordinates
      await updateDoc(gymRef, {
        location: gym.location,
        checkInRadiusMeters: gym.checkInRadiusMeters,
        autoExpireMinutes: gym.autoExpireMinutes,
        updatedAt: serverTimestamp(),
      });
      console.log(`Updated gym location: ${gym.name}`);
    }
  }

  return gyms;
};

/**
 * Get all gyms
 *
 * @returns {Promise<Array>} Array of all gyms
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
 *
 * @param {string} gymId - Gym document ID
 * @returns {Promise<Object|null>} Gym data or null
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
 *
 * @param {Function} callback - Called with array of gyms
 * @returns {Function} Unsubscribe function
 */
export const subscribeToGyms = (callback) => {
  const gymsRef = collection(db, 'gyms');
  const q = query(gymsRef, orderBy('name', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const gyms = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      callback(gyms);
    },
    (error) => {
      console.error('Error subscribing to gyms:', error);
      callback([]);
    }
  );
};

/**
 * Subscribe to a single gym (real-time updates)
 *
 * @param {string} gymId - Gym document ID
 * @param {Function} callback - Called with gym data or null
 * @returns {Function} Unsubscribe function
 */
export const subscribeToGym = (gymId, callback) => {
  const gymRef = doc(db, 'gyms', gymId);

  return onSnapshot(
    gymRef,
    (doc) => {
      if (!doc.exists()) {
        callback(null);
        return;
      }
      callback({ id: doc.id, ...doc.data() });
    },
    (error) => {
      console.error('Error subscribing to gym:', error);
      callback(null);
    }
  );
};

/**
 * Update gym location (admin function)
 *
 * @param {string} gymId - Gym document ID
 * @param {Object} location - { latitude, longitude }
 * @param {number} checkInRadius - Check-in radius in meters
 * @returns {Promise<void>}
 */
export const updateGymLocation = async (gymId, location, checkInRadius = DEFAULT_CHECK_IN_RADIUS_METERS) => {
  const gymRef = doc(db, 'gyms', gymId);

  await updateDoc(gymRef, {
    location,
    checkInRadiusMeters: checkInRadius,
    updatedAt: serverTimestamp(),
  });
};

/**
 * Get gyms near a location
 *
 * @param {Object} userLocation - { latitude, longitude }
 * @param {number} maxDistanceMeters - Maximum distance to include
 * @returns {Promise<Array>} Array of nearby gyms with distance
 */
export const getNearbyGyms = async (userLocation, maxDistanceMeters = 10000) => {
  const { calculateDistance } = await import('./presenceService');

  const allGyms = await getAllGyms();

  return allGyms
    .map((gym) => {
      if (!gym.location) return null;

      const distance = calculateDistance(userLocation, gym.location);
      return { ...gym, distance };
    })
    .filter((gym) => gym && gym.distance <= maxDistanceMeters)
    .sort((a, b) => a.distance - b.distance);
};
