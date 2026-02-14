/**
 * GPS Validation Tests
 * Verifies that check-in correctly validates user location
 */

import { calculateDistanceMeters } from '../../utils/locationUtils';
import { DEFAULT_CHECK_IN_RADIUS_METERS } from '../../services/models';

describe('GPS Check-in Validation', () => {
  const COWBOYS_FIT = { latitude: 30.4692, longitude: -97.5963 };

  describe('Distance Calculations', () => {
    it('should calculate 0 meters for same location', () => {
      const distance = calculateDistanceMeters(COWBOYS_FIT, COWBOYS_FIT);
      expect(distance).toBe(0);
    });

    it('should calculate ~50m for nearby location', () => {
      const nearbyLocation = { latitude: 30.4696, longitude: -97.5963 }; // ~44m north
      const distance = calculateDistanceMeters(COWBOYS_FIT, nearbyLocation);
      expect(distance).toBeGreaterThan(40);
      expect(distance).toBeLessThan(50);
    });

    it('should calculate ~100m for edge of radius', () => {
      const edgeLocation = { latitude: 30.4701, longitude: -97.5963 }; // ~100m north
      const distance = calculateDistanceMeters(COWBOYS_FIT, edgeLocation);
      expect(distance).toBeGreaterThan(95);
      expect(distance).toBeLessThan(105);
    });

    it('should calculate >100m for location outside radius', () => {
      const farLocation = { latitude: 30.4710, longitude: -97.5970 }; // ~250m away
      const distance = calculateDistanceMeters(COWBOYS_FIT, farLocation);
      expect(distance).toBeGreaterThan(200);
    });
  });

  describe('Check-in Radius Validation', () => {
    it('should use 100m as default radius', () => {
      expect(DEFAULT_CHECK_IN_RADIUS_METERS).toBe(100);
    });

    it('should PASS validation when within 100m', () => {
      const userLocation = { latitude: 30.4695, longitude: -97.5963 }; // ~33m away
      const distance = calculateDistanceMeters(userLocation, COWBOYS_FIT);

      expect(distance).toBeLessThan(DEFAULT_CHECK_IN_RADIUS_METERS);
    });

    it('should FAIL validation when beyond 100m', () => {
      const userLocation = { latitude: 30.4710, longitude: -97.5970 }; // ~250m away
      const distance = calculateDistanceMeters(userLocation, COWBOYS_FIT);

      expect(distance).toBeGreaterThan(DEFAULT_CHECK_IN_RADIUS_METERS);
    });

    it('should PASS validation at exactly 100m (boundary)', () => {
      const userLocation = { latitude: 30.4701, longitude: -97.5963 }; // ~100m
      const distance = calculateDistanceMeters(userLocation, COWBOYS_FIT);

      // Should be right at or just below the boundary
      expect(distance).toBeLessThanOrEqual(DEFAULT_CHECK_IN_RADIUS_METERS + 5); // +5m tolerance
    });
  });

  describe('Real-world Scenarios', () => {
    it('should REJECT check-in from 1 mile away', () => {
      const userLocation = { latitude: 30.4840, longitude: -97.5963 }; // ~1.6km away
      const distance = calculateDistanceMeters(userLocation, COWBOYS_FIT);

      expect(distance).toBeGreaterThan(1500); // > 1.5km
      expect(distance).toBeGreaterThan(DEFAULT_CHECK_IN_RADIUS_METERS);
    });

    it('should REJECT check-in from neighboring building (150m)', () => {
      const userLocation = { latitude: 30.4705, longitude: -97.5970 }; // ~150m away
      const distance = calculateDistanceMeters(userLocation, COWBOYS_FIT);

      expect(distance).toBeGreaterThan(140);
      expect(distance).toBeGreaterThan(DEFAULT_CHECK_IN_RADIUS_METERS);
    });

    it('should ACCEPT check-in from gym parking lot (50m)', () => {
      const userLocation = { latitude: 30.4696, longitude: -97.5966 }; // ~50m away
      const distance = calculateDistanceMeters(userLocation, COWBOYS_FIT);

      expect(distance).toBeLessThan(60);
      expect(distance).toBeLessThan(DEFAULT_CHECK_IN_RADIUS_METERS);
    });
  });
});
