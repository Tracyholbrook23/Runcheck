/**
 * useReliability.js — User Reliability Score Hook
 *
 * Subscribes to the user's Firestore document in real time and derives a
 * numeric score, tier badge, and computed attendance stats from the
 * `users/{uid}.reliability` sub-object.
 *
 * Using onSnapshot (rather than a one-time getDoc) means the Profile screen
 * automatically reflects reliability changes written by Cloud Functions
 * without requiring a logout/login or manual refresh.
 *
 * Accepts an optional `userId` parameter so it can display another player's
 * score — when omitted it falls back to the currently signed-in user.
 *
 * Score tiers are determined by `reliabilityService.getReliabilityTier`:
 *   90–100 → Excellent
 *   75–89  → Good
 *   50–74  → Fair
 *   25–49  → Poor
 *   0–24   → Unreliable
 *
 * @example
 * const { score, tier, stats } = useReliability();
 */

import { useState, useEffect } from 'react';
import { auth, db } from '../config/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { getReliabilityTier } from '../services/reliabilityService';

const INITIAL_SCORE = 100;

/**
 * useReliability — Real-time hook for a user's reliability data.
 *
 * @param {string | null} [userId=null] — UID of the user to look up.
 *                                        Defaults to the signed-in user's UID.
 * @returns {{
 *   reliability: object | null,  Raw reliability sub-object from Firestore.
 *   score: number,               Numeric reliability score (0–100). Defaults to 100.
 *   tier: { tier: string, label: string, color: string },
 *   loading: boolean,
 *   error: string | null,
 *   refresh: () => Promise<void>, No-op — data updates automatically via onSnapshot.
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

  useEffect(() => {
    if (!effectiveUserId) {
      setReliability(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Subscribe to users/{uid} — the reliability sub-object is updated by
    // Cloud Functions so any change is reflected here automatically.
    const unsubscribe = onSnapshot(
      doc(db, 'users', effectiveUserId),
      (snap) => {
        if (!snap.exists()) {
          setReliability(null);
        } else {
          const r = snap.data().reliability || {};
          setReliability({
            score:          r.score          ?? INITIAL_SCORE,
            totalScheduled: r.totalScheduled ?? 0,
            totalAttended:  r.totalAttended  ?? 0,
            totalNoShow:    r.totalNoShow    ?? 0,
            totalCancelled: r.totalCancelled ?? 0,
            lastUpdated:    r.lastUpdated    ?? null,
          });
        }
        setLoading(false);
      },
      (err) => {
        console.error('useReliability snapshot error:', err);
        setError(err.message);
        setReliability(null);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [effectiveUserId]);

  // Derive score and tier from the live snapshot; default score is 100 for new users
  const score = reliability?.score ?? INITIAL_SCORE;
  const tier = getReliabilityTier(score);

  return {
    reliability,
    score,
    tier,
    loading,
    error,
    // refresh is a no-op — onSnapshot keeps data current automatically
    refresh: () => Promise.resolve(),
    // Compute attendance stats from the reliability sub-object.
    // attendanceRate defaults to 100% when no sessions have been scheduled yet.
    stats: reliability ? {
      totalScheduled: reliability.totalScheduled || 0,
      totalAttended:  reliability.totalAttended  || 0,
      totalNoShow:    reliability.totalNoShow    || 0,
      totalCancelled: reliability.totalCancelled || 0,
      attendanceRate: reliability.totalScheduled > 0
        ? Math.round((reliability.totalAttended / reliability.totalScheduled) * 100)
        : 100,
    } : null,
  };
};

export default useReliability;
