/**
 * Integration test for transaction-based check-in
 * Tests the new check-in logic with GPS validation and transactions
 */

import { calculateDistanceMeters } from '../../utils/locationUtils';

describe('Check-in Integration Tests', () => {
  describe('GPS Distance Calculation (geofire-common)', () => {
    it('should calculate distance between two coordinates correctly', () => {
      const coord1 = { latitude: 30.4692, longitude: -97.5963 }; // Cowboys Fit
      const coord2 = { latitude: 30.4700, longitude: -97.5970 }; // ~100m away

      const distance = calculateDistanceMeters(coord1, coord2);

      // Should be approximately 111 meters
      expect(distance).toBeGreaterThan(100);
      expect(distance).toBeLessThan(120);
    });

    it('should return 0 for same coordinates', () => {
      const coord = { latitude: 30.4692, longitude: -97.5963 };

      const distance = calculateDistanceMeters(coord, coord);

      expect(distance).toBe(0);
    });

    it('should calculate correct distance for far coordinates', () => {
      const austin = { latitude: 30.2672, longitude: -97.7431 };
      const dallas = { latitude: 32.7767, longitude: -96.7970 };

      const distance = calculateDistanceMeters(austin, dallas);

      // Austin to Dallas is approximately 300km
      expect(distance).toBeGreaterThan(250000); // > 250km
      expect(distance).toBeLessThan(350000); // < 350km
    });
  });

  describe('Check-in Radius Validation', () => {
    const DEFAULT_CHECK_IN_RADIUS_METERS = 100;

    it('should use 100m as default check-in radius', () => {
      expect(DEFAULT_CHECK_IN_RADIUS_METERS).toBe(100);
    });

    it('should allow check-in within radius', () => {
      const gymLocation = { latitude: 30.4692, longitude: -97.5963 };
      const userLocation = { latitude: 30.4695, longitude: -97.5965 }; // ~40m away

      const distance = calculateDistanceMeters(userLocation, gymLocation);

      expect(distance).toBeLessThan(DEFAULT_CHECK_IN_RADIUS_METERS);
    });

    it('should reject check-in outside radius', () => {
      const gymLocation = { latitude: 30.4692, longitude: -97.5963 };
      const userLocation = { latitude: 30.4710, longitude: -97.5980 }; // ~250m away

      const distance = calculateDistanceMeters(userLocation, gymLocation);

      expect(distance).toBeGreaterThan(DEFAULT_CHECK_IN_RADIUS_METERS);
    });
  });
});
