/**
 * useReliability Hook
 *
 * Fetches and provides user's reliability score and stats.
 *
 * USAGE:
 * const {
 *   reliability,     // Reliability data object
 *   score,           // Numeric score (0-100)
 *   tier,            // Tier info { tier, label, color }
 *   loading,         // Loading state
 *   refresh,         // Function to refresh data
 * } = useReliability(userId);
 */

import { useState, useEffect, useCallback } from 'react';
import { auth } from '../config/firebase';
import {
  getUserReliability,
  getReliabilityTier,
} from '../services/reliabilityService';

export const useReliability = (userId = null) => {
  const [reliability, setReliability] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const effectiveUserId = userId || auth.currentUser?.uid;

  const fetchReliability = useCallback(async () => {
    if (!effectiveUserId) {
      setReliability(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getUserReliability(effectiveUserId);
      setReliability(data);
    } catch (err) {
      setError(err.message);
      setReliability(null);
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId]);

  useEffect(() => {
    fetchReliability();
  }, [fetchReliability]);

  const score = reliability?.score ?? 100;
  const tier = getReliabilityTier(score);

  return {
    reliability,
    score,
    tier,
    loading,
    error,
    refresh: fetchReliability,
    // Computed stats
    stats: reliability ? {
      totalScheduled: reliability.totalScheduled || 0,
      totalAttended: reliability.totalAttended || 0,
      totalNoShow: reliability.totalNoShow || 0,
      totalCancelled: reliability.totalCancelled || 0,
      attendanceRate: reliability.totalScheduled > 0
        ? Math.round((reliability.totalAttended / reliability.totalScheduled) * 100)
        : 100,
    } : null,
  };
};

export default useReliability;
