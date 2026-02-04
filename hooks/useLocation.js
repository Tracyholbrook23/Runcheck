/**
 * useLocation Hook
 *
 * Handles GPS location permissions and retrieval.
 *
 * USAGE:
 * const {
 *   location,           // Current location { latitude, longitude }
 *   loading,            // Loading state
 *   error,              // Error message
 *   permissionStatus,   // 'granted', 'denied', 'undetermined'
 *   requestPermission,  // Request location permission
 *   getCurrentLocation, // Get current GPS position
 * } = useLocation();
 */

import { useState, useCallback } from 'react';
import * as Location from 'expo-location';

// Set to true to use a fake Pflugerville location for testing
// Change to false when you want real GPS validation
const DEV_SKIP_GPS = true;

export const useLocation = () => {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState('undetermined');

  // Request foreground location permission
  const requestPermission = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermissionStatus(status);
      return status === 'granted';
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, []);

  // Check current permission status
  const checkPermission = useCallback(async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      setPermissionStatus(status);
      return status === 'granted';
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, []);

  // Get current GPS location
  const getCurrentLocation = useCallback(async (options = {}) => {
    setLoading(true);
    setError(null);

    try {
      // In dev mode, return a fake location near Cowboys Fit in Pflugerville
      if (DEV_SKIP_GPS) {
        const fakeCoords = {
          latitude: 30.4692,  // Near Cowboys Fit - Pflugerville
          longitude: -97.5963,
        };
        console.log('DEV MODE: Using fake Pflugerville location for testing');
        setLocation(fakeCoords);
        return fakeCoords;
      }

      // Check/request permission first
      let hasPermission = permissionStatus === 'granted';
      if (!hasPermission) {
        hasPermission = await requestPermission();
      }

      if (!hasPermission) {
        throw new Error('Location permission not granted');
      }

      // Get position
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        ...options,
      });

      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      setLocation(coords);
      return coords;
    } catch (err) {
      const message = err.message || 'Failed to get location';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [permissionStatus, requestPermission]);

  return {
    location,
    loading,
    error,
    permissionStatus,
    hasPermission: permissionStatus === 'granted',
    requestPermission,
    checkPermission,
    getCurrentLocation,
  };
};

export default useLocation;
