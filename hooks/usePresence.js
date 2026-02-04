/**
 * usePresence Hook
 *
 * Manages user's current presence (check-in state).
 *
 * USAGE:
 * const {
 *   presence,        // Current active presence or null
 *   loading,         // Initial loading state
 *   isCheckedIn,     // Boolean shorthand
 *   checkIn,         // Function to check in
 *   checkOut,        // Function to check out
 *   checkingIn,      // Loading state for check-in
 *   checkingOut,     // Loading state for check-out
 *   error,           // Last error message
 * } = usePresence();
 */

import { useState, useEffect, useCallback } from 'react';
import { auth } from '../config/firebase';
import {
  subscribeToUserPresence,
  checkIn as checkInService,
  checkOut as checkOutService,
} from '../services/presenceService';
import { getCurrentLocation, calculateDistanceMeters } from '../utils/locationUtils';
import { getGym } from '../services/gymService';
import { DEFAULT_CHECK_IN_RADIUS_METERS } from '../services/models';

export const usePresence = () => {
  const [presence, setPresence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState(null);

  // Subscribe to user's presence
  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false);
      setPresence(null);
      return;
    }

    const unsubscribe = subscribeToUserPresence(auth.currentUser.uid, (presenceData) => {
      setPresence(presenceData);
      setLoading(false);
    });

    return unsubscribe;
  }, [auth.currentUser?.uid]);

  // Check in to a gym with GPS validation
  const checkIn = useCallback(async (gymId) => {
    if (!auth.currentUser) {
      throw new Error('Must be logged in to check in');
    }

    setCheckingIn(true);
    setError(null);

    try {
      // 1. Get device location (handles permission + retrieval)
      const userLocation = await getCurrentLocation();

      // 2. Client-side distance check before hitting Firestore
      const gym = await getGym(gymId);
      if (!gym?.location) {
        throw new Error('Gym location not configured');
      }

      const distance = calculateDistanceMeters(userLocation, gym.location);
      const radius = gym.checkInRadiusMeters || DEFAULT_CHECK_IN_RADIUS_METERS;

      if (distance > radius) {
        throw new Error('You must be at the gym to check in. Try again when you arrive.');
      }

      // 3. Service-layer check-in (second safety layer validates again)
      const result = await checkInService(auth.currentUser.uid, gymId, userLocation);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setCheckingIn(false);
    }
  }, []);

  // Check out from current gym
  const checkOut = useCallback(async () => {
    setCheckingOut(true);
    setError(null);

    try {
      const result = await checkOutService();
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setCheckingOut(false);
    }
  }, []);

  // Calculate time remaining
  const getTimeRemaining = useCallback(() => {
    if (!presence?.expiresAt) return null;

    const expiresAt = presence.expiresAt.toDate();
    const minutes = Math.max(0, Math.round((expiresAt - new Date()) / 60000));

    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }, [presence]);

  return {
    presence,
    loading,
    isCheckedIn: !!presence,
    checkIn,
    checkOut,
    checkingIn,
    checkingOut,
    error,
    getTimeRemaining,
  };
};

export default usePresence;
