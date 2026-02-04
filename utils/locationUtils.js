/**
 * Location Utilities
 *
 * Reusable GPS helpers for permission, location retrieval, and distance.
 * No UI logic — used by hooks and services only.
 */

import * as Location from 'expo-location';

// Cowboys Fit - Pflugerville coordinates for dev testing
const DEV_LOCATION = {
  latitude: 30.4692,
  longitude: -97.5963,
};

const isDevGps = () => process.env.EXPO_PUBLIC_DEV_SKIP_GPS === 'true';

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
  if (isDevGps()) {
    console.log('DEV MODE: Using fake Cowboys Fit location');
    return DEV_LOCATION;
  }

  const granted = await requestLocationPermission();
  if (!granted) {
    throw new Error('Location permission denied. Please enable location services in your device settings.');
  }

  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  } catch (err) {
    throw new Error('Unable to retrieve your location. Please check that GPS is enabled and try again.');
  }
};

/**
 * Calculate distance between two GPS coordinates in meters
 * Uses Haversine formula
 *
 * @param {Object} coord1 - { latitude, longitude }
 * @param {Object} coord2 - { latitude, longitude }
 * @returns {number} Distance in meters
 */
export const calculateDistanceMeters = (coord1, coord2) => {
  const R = 6371e3; // Earth's radius in meters
  const lat1 = (coord1.latitude * Math.PI) / 180;
  const lat2 = (coord2.latitude * Math.PI) / 180;
  const deltaLat = ((coord2.latitude - coord1.latitude) * Math.PI) / 180;
  const deltaLon = ((coord2.longitude - coord1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};
