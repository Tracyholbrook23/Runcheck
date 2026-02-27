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
  deleteDoc,
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
 * Safe to run multiple times — will only create documents that do not already
 * exist and will never overwrite existing documents or their location, placeId,
 * or address fields.
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
      accessType: 'paid',
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
      id: 'clay-madsen-round-rock',
      name: 'Clay Madsen Recreation Center',
      address: '1600 Gattis School Rd, Round Rock, TX 78664',
      city: 'Round Rock',
      state: 'TX',
      type: GYM_TYPE.INDOOR,
      accessType: 'paid',
      notes: '55,000 sq ft facility with two full-size gymnasiums, basketball courts, pool, racquetball courts',
      imageUrl: 'https://s3-media0.fl.yelpcdn.com/bphoto/R1OXLFLx0N6gUT2rNfqLoA/o.jpg',
      location: {
        latitude: 30.4972,
        longitude: -97.6609,
      },
      checkInRadiusMeters: DEFAULT_CHECK_IN_RADIUS_METERS,
      currentPresenceCount: 0,
      scheduleCounts: {},
      autoExpireMinutes: DEFAULT_EXPIRE_MINUTES,
    },
    {
      id: 'pan-american-recreation-center',
      name: 'Pan American Recreation Center',
      address: '2100 E 3rd St, Austin, TX 78702',
      city: 'Austin',
      state: 'TX',
      type: GYM_TYPE.INDOOR,
      accessType: 'free',
      notes: '',
      imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTlugK3VDdlosE9o97HH-NdRI89Eww_GHZaHQ&s',
      location: { latitude: 30.2626, longitude: -97.7198 },
      checkInRadiusMeters: DEFAULT_CHECK_IN_RADIUS_METERS,
      currentPresenceCount: 0,
      scheduleCounts: {},
      autoExpireMinutes: DEFAULT_EXPIRE_MINUTES,
    },
    {
      id: 'lifetime-austin-north',
      name: 'Life Time Austin North',
      address: '13725 Ranch Rd 620 N, Austin, TX 78717',
      city: 'Austin',
      state: 'TX',
      type: GYM_TYPE.INDOOR,
      accessType: 'paid',
      notes: '',
      imageUrl: 'https://media.lifetime.life/is/image/lifetimeinc/fso-gymnasium-01-1?crop=362,224,1360,1088&id=1701881564012&fit=crop,1&wid=390',
      location: { latitude: 30.4572, longitude: -97.8147 },
      checkInRadiusMeters: DEFAULT_CHECK_IN_RADIUS_METERS,
      currentPresenceCount: 0,
      scheduleCounts: {},
      autoExpireMinutes: DEFAULT_EXPIRE_MINUTES,
    },
    {
      id: 'golds-gym-hesters-crossing',
      name: "Gold's Gym Hester's Crossing",
      address: '2400 S I-35 Frontage Rd, Round Rock, TX 78681',
      city: 'Round Rock',
      state: 'TX',
      type: GYM_TYPE.INDOOR,
      accessType: 'paid',
      notes: '',
      imageUrl: 'https://res.cloudinary.com/ggus-dev/image/private/s--HzKSnHnn--/c_auto%2Cg_center%2Cw_1200%2Ch_800/v1/25fcf1e9/austin-hesters-crossing-basketball.webp?_a=BAAAV6DQ',
      location: { latitude: 30.5085, longitude: -97.6789 },
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
      // Only create the document if it does not already exist.
      // Never overwrite an existing document — location, placeId, and address
      // may have been updated via the app and must not be clobbered by seed data.
      await setDoc(gymRef, {
        ...gym,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      console.log(`Created gym: ${gym.name}`);
    } else {
      console.log(`Skipped existing gym: ${gym.name}`);
    }
  }

  // Remove old gym documents that are no longer in the seed list
  const validIds = new Set(gyms.map((g) => g.id));
  const allDocs = await getDocs(collection(db, 'gyms'));
  for (const gymDoc of allDocs.docs) {
    if (!validIds.has(gymDoc.id)) {
      await deleteDoc(doc(db, 'gyms', gymDoc.id));
      console.log(`Removed old gym: ${gymDoc.id}`);
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
  const { calculateDistanceMeters } = await import('../utils/locationUtils');

  const allGyms = await getAllGyms();

  return allGyms
    .map((gym) => {
      if (!gym.location) return null;

      const distance = calculateDistanceMeters(userLocation, gym.location);
      return { ...gym, distance };
    })
    .filter((gym) => gym && gym.distance <= maxDistanceMeters)
    .sort((a, b) => a.distance - b.distance);
};
