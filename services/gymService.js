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

import { DEFAULT_CHECK_IN_RADIUS_METERS, DEFAULT_EXPIRE_MINUTES, GYM_TYPE } from './models';

/**
 * Seed initial gyms with GPS locations
 * Call once to populate database
 *
 * @returns {Promise<Array>} Array of seeded gyms
 */
export const seedGyms = async () => {
  // Pflugerville, TX gyms and courts
  const gyms = [
    {
      id: 'cowboys-fit-pflugerville',
      name: 'Cowboys Fit - Pflugerville',
      address: '1401 Town Center Dr, Pflugerville, TX 78660',
      city: 'Pflugerville',
      state: 'TX',
      type: GYM_TYPE.INDOOR,
      notes: '57,000 sq ft facility with indoor basketball court, pool, and recovery lounge',
      location: {
        latitude: 30.4692,
        longitude: -97.5963,
      },
      checkInRadiusMeters: DEFAULT_CHECK_IN_RADIUS_METERS,
      currentPresenceCount: 0,
      scheduleCounts: {},
      autoExpireMinutes: DEFAULT_EXPIRE_MINUTES,
    },
    {
      id: 'pflugerville-rec-center',
      name: 'Pflugerville Recreation Center',
      address: '400 Immanuel Rd, Pflugerville, TX 78660',
      city: 'Pflugerville',
      state: 'TX',
      type: GYM_TYPE.INDOOR,
      notes: 'City rec center with two basketball half courts and walking track',
      location: {
        latitude: 30.4325,
        longitude: -97.6129,
      },
      checkInRadiusMeters: DEFAULT_CHECK_IN_RADIUS_METERS,
      currentPresenceCount: 0,
      scheduleCounts: {},
      autoExpireMinutes: DEFAULT_EXPIRE_MINUTES,
    },
    {
      id: 'pfluger-park',
      name: 'Pfluger Park',
      address: '515 City Park Rd, Pflugerville, TX 78660',
      city: 'Pflugerville',
      state: 'TX',
      type: GYM_TYPE.OUTDOOR,
      notes: '30-acre park with outdoor basketball court and sand volleyball',
      location: {
        latitude: 30.4469,
        longitude: -97.6219,
      },
      checkInRadiusMeters: 500,
      currentPresenceCount: 0,
      scheduleCounts: {},
      autoExpireMinutes: DEFAULT_EXPIRE_MINUTES,
    },
    {
      id: 'gilleland-creek-park',
      name: 'Gilleland Creek Park',
      address: '700 N Railroad Ave, Pflugerville, TX 78660',
      city: 'Pflugerville',
      state: 'TX',
      type: GYM_TYPE.OUTDOOR,
      notes: '11-acre park with basketball courts and playground',
      location: {
        latitude: 30.4451,
        longitude: -97.6198,
      },
      checkInRadiusMeters: 500,
      currentPresenceCount: 0,
      scheduleCounts: {},
      autoExpireMinutes: DEFAULT_EXPIRE_MINUTES,
    },
    {
      id: 'northeast-metro-park',
      name: 'Northeast Metropolitan Park',
      address: '15500 Sun Light Near Way, Pflugerville, TX 78660',
      city: 'Pflugerville',
      state: 'TX',
      type: GYM_TYPE.OUTDOOR,
      notes: '349-acre park with basketball court, tennis, and skate park',
      location: {
        latitude: 30.4475,
        longitude: -97.5700,
      },
      checkInRadiusMeters: 500,
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
        name: gym.name,
        address: gym.address,
        city: gym.city,
        state: gym.state,
        type: gym.type,
        notes: gym.notes,
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
