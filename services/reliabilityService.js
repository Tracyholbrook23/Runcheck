/**
 * Reliability Service
 *
 * READ-ONLY utility module. Reliability counters and scores are now written
 * exclusively by Cloud Functions (backend). The frontend only reads.
 *
 * RESPONSIBILITIES (frontend):
 * - Read reliability data for display (getUserReliability)
 * - Derive score tier / label / color (getReliabilityTier)
 * - Compute score locally as a display fallback (calculateReliabilityScore)
 *
 * DEPRECATED (backend handles these now — do NOT call from client):
 * - initializeReliability
 * - updateReliabilityOnAttend
 * - updateReliabilityOnNoShow
 * - updateReliabilityOnCancel
 * - incrementScheduledCount
 *
 * EXAMPLE USAGE:
 *
 * import { getUserReliability, getReliabilityTier } from './reliabilityService';
 *
 * // Get user's reliability data (read-only)
 * const reliability = await getUserReliability('user123');
 * console.log(reliability.score); // 85
 */

import { db } from '../config/firebase';
import {
  doc,
  getDoc,
} from 'firebase/firestore';

// Scoring constants (used by calculateReliabilityScore display fallback)
const INITIAL_SCORE = 100;
const NO_SHOW_PENALTY = 10;
const ATTENDANCE_BONUS = 2;
const MIN_SCORE = 0;
const MAX_SCORE = 100;

/**
 * Get user's reliability data
 *
 * @param {string} odId - User ID
 * @returns {Promise<Object|null>} Reliability data or null if user not found
 */
export const getUserReliability = async (odId) => {
  const userRef = doc(db, 'users', odId);
  const userDoc = await getDoc(userRef);

  if (!userDoc.exists()) {
    return null;
  }

  const userData = userDoc.data();

  // Normalize: if the field is missing entirely use {}, then apply ?? 0 to
  // every counter so a partially-populated reliability object (e.g. from an
  // older user document) never surfaces `undefined` to callers.
  const r = userData.reliability || {};
  return {
    score:          r.score          ?? INITIAL_SCORE,
    totalScheduled: r.totalScheduled ?? 0,
    totalAttended:  r.totalAttended  ?? 0,
    totalNoShow:    r.totalNoShow    ?? 0,
    totalCancelled: r.totalCancelled ?? 0,
    lastUpdated:    r.lastUpdated    ?? null,
  };
};

// ---------------------------------------------------------------------------
// DEPRECATED — these functions previously wrote reliability data from the
// client. Reliability is now managed exclusively by Cloud Functions.
// They are kept here as named exports only to avoid import errors in any
// code that has not yet been updated, but they are no-ops and will log a
// warning. Remove call-sites and eventually remove these stubs entirely.
// ---------------------------------------------------------------------------

/** @deprecated Reliability is now written by Cloud Functions. No-op. */
export const initializeReliability = async (_odId) => {
  if (__DEV__) console.warn('[reliabilityService] initializeReliability is deprecated — backend handles this.');
};

/** @deprecated Reliability is now written by Cloud Functions. No-op. */
export const updateReliabilityOnAttend = async (_odId) => {
  if (__DEV__) console.warn('[reliabilityService] updateReliabilityOnAttend is deprecated — backend handles this.');
};

/** @deprecated Reliability is now written by Cloud Functions. No-op. */
export const updateReliabilityOnNoShow = async (_odId) => {
  if (__DEV__) console.warn('[reliabilityService] updateReliabilityOnNoShow is deprecated — backend handles this.');
};

/** @deprecated Reliability is now written by Cloud Functions. No-op. */
export const updateReliabilityOnCancel = async (_odId, _isLateCancellation) => {
  if (__DEV__) console.warn('[reliabilityService] updateReliabilityOnCancel is deprecated — backend handles this.');
};

/** @deprecated Reliability is now written by Cloud Functions. No-op. */
export const incrementScheduledCount = async (_odId) => {
  if (__DEV__) console.warn('[reliabilityService] incrementScheduledCount is deprecated — backend handles this.');
};

/**
 * Calculate reliability score from raw stats
 * Useful for recalculating if data gets out of sync
 *
 * @param {Object} stats - { totalScheduled, totalAttended, totalNoShow, totalCancelled }
 * @returns {number} Calculated score (0-100)
 */
export const calculateReliabilityScore = (stats) => {
  const { totalAttended, totalNoShow } = stats;

  // Start at 100
  let score = INITIAL_SCORE;

  // Subtract penalties
  score -= totalNoShow * NO_SHOW_PENALTY;

  // Add bonuses
  score += totalAttended * ATTENDANCE_BONUS;

  // Clamp to valid range
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, score));
};

/**
 * Get reliability tier based on score
 *
 * @param {number} score - Reliability score (0-100)
 * @returns {Object} { tier: string, label: string, color: string }
 */
export const getReliabilityTier = (score) => {
  if (score >= 90) {
    return { tier: 'excellent', label: 'Excellent', color: '#4caf50' };
  } else if (score >= 75) {
    return { tier: 'good', label: 'Good', color: '#8bc34a' };
  } else if (score >= 50) {
    return { tier: 'fair', label: 'Fair', color: '#ff9800' };
  } else if (score >= 25) {
    return { tier: 'poor', label: 'Poor', color: '#ff5722' };
  } else {
    return { tier: 'unreliable', label: 'Unreliable', color: '#f44336' };
  }
};
