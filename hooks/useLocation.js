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
import {
  requestLocationPermission,
  getCurrentLocation as getLocation,
} from '../utils/locationUtils';

export const useLocation = () => {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Get current GPS location (delegates to locationUtils)
  const getCurrentLocation = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const coords = await getLocation();
      setLocation(coords);
      return coords;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    location,
    loading,
    error,
    requestPermission: requestLocationPermission,
    getCurrentLocation,
  };
};

export default useLocation;
