/**
 * Location Utilities
 *
 * Reusable GPS helpers for permission, location retrieval, and distance.
 * No UI logic — used by hooks and services only.
 */

import * as Location from 'expo-location';
import { distanceBetween } from 'geofire-common';

// Cowboys Fit - Pflugerville coordinates for dev testing
// Must match the Firestore gym document for cowboys-fit-pflugerville
const DEV_LOCATION = {
  latitude: 30.465690715984987,
  longitude: -97.60124257791747,
};

const isDevGps = () => process.env.EXPO_PUBLIC_DEV_SKIP_GPS === 'true';

/**
 * Check if foreground location permission is currently granted
 * without prompting the user.
 *
 * @returns {Promise<boolean>} true if granted
 */
export const isLocationGranted = async () => {
  if (isDevGps()) return true;
  const { status } = await Location.getForegroundPermissionsAsync();
  return status === 'granted';
};

/**
 * Request foreground location permission
 *
 * @returns {Promise<boolean>} true if granted
 */
export const requestLocationPermission = async () => {
  if (isDevGps()) return true;
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
};

/**
 * Get the device's current GPS coordinates
 *
 * In dev mode (EXPO_PUBLIC_DEV_SKIP_GPS=true), returns fake Cowboys Fit coords.
 *
 * @returns {Promise<{ latitude: number, longitude: number }>}
 * @throws {Error} If permission denied or location unavailable
 */
export const getCurrentLocation = async () => {
  if (__DEV__) {
    console.log('[GPS] DEV_SKIP_GPS =', process.env.EXPO_PUBLIC_DEV_SKIP_GPS);
  }

  if (__DEV__ && isDevGps()) {
    console.warn('[GPS] Dev mode — using fake Cowboys Fit location');
    return DEV_LOCATION;
  }

  const granted = await requestLocationPermission();

  if (!granted) {
    if (__DEV__) console.warn('[GPS] Location permission not granted');
    throw new Error('Location permission denied. Please enable location services in your device settings.');
  }

  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      timeout: 15000,    // 15s hard ceiling — prevents indefinite spinner indoors
      maximumAge: 30000, // reject cached fixes older than 30s
    });

    const userLocation = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };

    if (__DEV__) console.log('[GPS] Location obtained:', userLocation, 'accuracy:', position.coords.accuracy, 'm');

    return userLocation;
  } catch (err) {
    if (__DEV__) console.warn('[GPS] Failed to get location:', err.message);
    throw new Error('Unable to retrieve your location. Please check that GPS is enabled and try again.');
  }
};

/**
 * Calculate distance between two GPS coordinates in meters
 * Uses geofire-common's distanceBetween (optimized Haversine)
 *
 * @param {Object} coord1 - { latitude, longitude }
 * @param {Object} coord2 - { latitude, longitude }
 * @returns {number} Distance in meters
 */
export const calculateDistanceMeters = (coord1, coord2) => {
  // geofire-common's distanceBetween returns distance in kilometers
  const distanceKm = distanceBetween(
    [coord1.latitude, coord1.longitude],
    [coord2.latitude, coord2.longitude]
  );

  const distanceMeters = distanceKm * 1000; // Convert to meters

  return distanceMeters;
};
