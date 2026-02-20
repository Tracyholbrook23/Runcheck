/**
 * useReliability.js — User Reliability Score Hook
 *
 * Fetches a user's reliability record from Firestore via `reliabilityService`
 * and derives a numeric score, tier badge, and computed attendance stats.
 * Unlike the presence/schedule hooks, reliability data is fetched once on
 * mount (not a real-time subscription) and can be manually refreshed.
 *
 * Accepts an optional `userId` parameter so it can display another player's
 * score — when omitted it falls back to the currently signed-in user.
 *
 * Score tiers are determined by `reliabilityService.getReliabilityTier`:
 *   90–100 → Elite
 *   75–89  → Trusted
 *   50–74  → Reliable
 *   0–49   → Developing
 *
 * @example
 * const { score, tier, stats, refresh } = useReliability();
 */

import { useState, useEffect, useCallback } from 'react';
import { auth } from '../config/firebase';
import {
  getUserReliability,
  getReliabilityTier,
} from '../services/reliabilityService';

/**
 * useReliability — Hook for fetching and deriving a user's reliability data.
 *
 * @param {string | null} [userId=null] — UID of the user to look up.
 *                                        Defaults to the signed-in user's UID.
 * @returns {{
 *   reliability: object | null,  Raw reliability document from Firestore.
 *   score: number,               Numeric reliability score (0–100). Defaults to 100.
 *   tier: { tier: string, label: string, color: string },
 *   loading: boolean,
 *   error: string | null,
 *   refresh: () => Promise<void>, Re-fetches the reliability document.
 *   stats: {
 *     totalScheduled: number,
 *     totalAttended: number,
 *     totalNoShow: number,
 *     totalCancelled: number,
 *     attendanceRate: number,   Percentage (0–100). Defaults to 100 if no sessions.
 *   } | null
 * }}
 */
export const useReliability = (userId = null) => {
  const [reliability, setReliability] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Use the provided userId or fall back to the currently authenticated user
  const effectiveUserId = userId || auth.currentUser?.uid;

  /**
   * fetchReliability — Loads the reliability document for `effectiveUserId`.
   *
   * Wrapped in useCallback so it can be both called from useEffect on
   * mount and exposed as `refresh` for manual re-fetches (e.g., pull-to-refresh).
   */
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

  // Fetch on mount and whenever the target user changes
  useEffect(() => {
    fetchReliability();
  }, [fetchReliability]);

  // Derive score and tier from the fetched data; default score is 100 for new users
  const score = reliability?.score ?? 100;
  const tier = getReliabilityTier(score);

  return {
    reliability,
    score,
    tier,
    loading,
    error,
    refresh: fetchReliability,
    // Compute attendance stats from the raw reliability document.
    // attendanceRate defaults to 100% when no sessions have been scheduled yet.
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
