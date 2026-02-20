/**
 * useLocation.js — GPS Location and Permissions Hook
 *
 * Thin wrapper around `locationUtils` that adds React state management for
 * loading and error conditions. Screens import this hook instead of calling
 * `locationUtils` directly so location logic stays in one testable place.
 *
 * Note: `getCurrentLocation` in this hook also stores the result in local
 * state (`location`), making the last-known position available for other
 * components like GymMapScreen that use it to center the map.
 *
 * @example
 * const { location, getCurrentLocation, requestPermission } = useLocation();
 */

import { useState, useCallback } from 'react';
import {
  requestLocationPermission,
  getCurrentLocation as getLocation,
} from '../utils/locationUtils';

/**
 * useLocation — Hook for managing GPS location permissions and coordinates.
 *
 * @returns {{
 *   location: { latitude: number, longitude: number } | null,
 *             Last successfully retrieved GPS coordinates.
 *   loading: boolean,                True while a location request is in flight.
 *   error: string | null,            Error message from the last failed request.
 *   requestPermission: () => Promise<string>,
 *             Prompts the OS permission dialog; resolves with the status string.
 *   getCurrentLocation: () => Promise<{ latitude: number, longitude: number }>,
 *             Requests the device's current GPS position.
 * }}
 */
export const useLocation = () => {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * getCurrentLocation — Retrieves the device's current GPS position.
   *
   * Delegates to `locationUtils.getCurrentLocation` which handles the
   * Expo Location API call and throws descriptive errors for permission
   * denial or hardware unavailability. Stores the result in `location`
   * state so other parts of the component can read the last-known position.
   *
   * @returns {Promise<{ latitude: number, longitude: number }>} Resolved coordinates.
   * @throws {Error} If location permission is denied or GPS is unavailable.
   */
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
    // requestPermission is passed through directly — no async state needed
    requestPermission: requestLocationPermission,
    getCurrentLocation,
  };
};

export default useLocation;
