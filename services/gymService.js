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
  updateDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';

import { DEFAULT_CHECK_IN_RADIUS_METERS, GYM_STATUS } from './models';

/**
 * seedGyms — DEPRECATED NO-OP
 *
 * This function previously seeded gym documents from a hardcoded array on every
 * app launch and deleted any Firestore gym doc not in the seed list.
 *
 * As of 2026-03-15, Firestore is the sole source of truth for gyms. Gym data is
 * managed exclusively via the admin seed script (`seedProductionGyms.js`) using
 * firebase-admin. The client is read-only.
 *
 * This export is retained as a no-op so that any remaining callers (e.g.
 * `scripts/seedDatabase.js`) do not throw at import time. It will be removed
 * in a future cleanup pass.
 *
 * @deprecated Use `node seedProductionGyms.js` to manage gym data.
 * @returns {Promise<Array>} Always returns an empty array.
 */
export const seedGyms = async () => {
  if (__DEV__) {
    console.warn(
      '[gymService] seedGyms() is deprecated and no longer writes to Firestore. ' +
      'Use the admin script `node seedProductionGyms.js` to manage gym data.'
    );
  }
  return [];
};

/**
 * Get all active gyms
 *
 * Returns only gyms with status === 'active'. Filtering is done client-side
 * to avoid requiring a Firestore composite index (status + name). At our
 * current scale (< 50 gyms) this is negligible cost and zero risk.
 *
 * @returns {Promise<Array>} Array of active gyms
 */
export const getAllGyms = async () => {
  const gymsRef = collection(db, 'gyms');
  const q = query(gymsRef, orderBy('name', 'asc'));
  const snapshot = await getDocs(q);

  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    .filter((gym) => gym.status === GYM_STATUS.ACTIVE);
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
 * Subscribe to all active gyms (real-time updates)
 *
 * Returns only gyms with status === 'active'. Filtering is done client-side
 * to avoid requiring a Firestore composite index (status + name). At our
 * current scale (< 50 gyms) this is negligible cost and zero risk.
 *
 * Note: subscribeToGym (single gym by ID) does NOT filter by status, so
 * screens that already hold a gymId reference (e.g. RunDetailsScreen via a
 * presence document) can still load the gym even if it's hidden/archived.
 *
 * @param {Function} callback - Called with array of active gyms
 * @returns {Function} Unsubscribe function
 */
export const subscribeToGyms = (callback) => {
  const gymsRef = collection(db, 'gyms');
  const q = query(gymsRef, orderBy('name', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const gyms = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .filter((gym) => gym.status === GYM_STATUS.ACTIVE);
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
