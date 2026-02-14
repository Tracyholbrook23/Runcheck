/**
 * Location Utilities
 *
 * Reusable GPS helpers for permission, location retrieval, and distance.
 * No UI logic — used by hooks and services only.
 */

import * as Location from 'expo-location';
import { distanceBetween } from 'geofire-common';

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
  console.log('🔍 [GPS] Checking location mode...');
  console.log('🔍 [GPS] DEV_SKIP_GPS =', process.env.EXPO_PUBLIC_DEV_SKIP_GPS);

  if (isDevGps()) {
    console.warn('⚠️ [GPS] DEV MODE ENABLED - Using fake Cowboys Fit location');
    console.warn('⚠️ [GPS] Fake location:', DEV_LOCATION);
    return DEV_LOCATION;
  }

  console.log('✅ [GPS] REAL GPS MODE - Requesting location permission...');
  const granted = await requestLocationPermission();

  if (!granted) {
    console.error('❌ [GPS] Location permission denied');
    throw new Error('Location permission denied. Please enable location services in your device settings.');
  }

  console.log('✅ [GPS] Permission granted - Getting current position...');

  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    const userLocation = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };

    console.log('✅ [GPS] Real user location obtained:', userLocation);
    console.log('✅ [GPS] Accuracy:', position.coords.accuracy, 'meters');

    return userLocation;
  } catch (err) {
    console.error('❌ [GPS] Failed to get location:', err.message);
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
  console.log('📏 [DISTANCE] Calculating distance...');
  console.log('📏 [DISTANCE] From:', coord1);
  console.log('📏 [DISTANCE] To:', coord2);

  // geofire-common's distanceBetween returns distance in kilometers
  const distanceKm = distanceBetween(
    [coord1.latitude, coord1.longitude],
    [coord2.latitude, coord2.longitude]
  );

  const distanceMeters = distanceKm * 1000; // Convert to meters

  console.log('📏 [DISTANCE] Distance:', distanceMeters.toFixed(2), 'meters');

  return distanceMeters;
};
