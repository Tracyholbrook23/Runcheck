/**
 * Reliability Service
 *
 * Manages user reliability scores based on their attendance behavior.
 *
 * RESPONSIBILITIES:
 * - Calculate reliability score from attendance history
 * - Update user reliability stats when sessions are attended/missed
 * - Provide reliability data for display
 *
 * SCORING FORMULA:
 * - Base score: 100
 * - Each no-show: -10 points
 * - Each late cancel (<1hr before): -5 points
 * - Each attendance: +2 points (max 100)
 * - Minimum score: 0
 *
 * EXAMPLE USAGE:
 *
 * import { updateReliabilityOnAttend, updateReliabilityOnNoShow, getUserReliability } from './reliabilityService';
 *
 * // When user checks in for a scheduled session
 * await updateReliabilityOnAttend('user123');
 *
 * // When user misses a scheduled session
 * await updateReliabilityOnNoShow('user123');
 *
 * // Get user's reliability data
 * const reliability = await getUserReliability('user123');
 * console.log(reliability.score); // 85
 */

import { db } from '../config/firebase';
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';

// Scoring constants
const INITIAL_SCORE = 100;
const NO_SHOW_PENALTY = 10;
const LATE_CANCEL_PENALTY = 5;
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

/**
 * Initialize reliability data for a new user
 *
 * @param {string} odId - User ID
 * @returns {Promise<void>}
 */
export const initializeReliability = async (odId) => {
  const userRef = doc(db, 'users', odId);

  await updateDoc(userRef, {
    reliability: {
      score: INITIAL_SCORE,
      totalScheduled: 0,
      totalAttended: 0,
      totalNoShow: 0,
      totalCancelled: 0,
      lastUpdated: serverTimestamp(),
    },
  });
};

/**
 * Update reliability when user attends a scheduled session
 *
 * @param {string} odId - User ID
 * @returns {Promise<Object>} Updated reliability data
 */
export const updateReliabilityOnAttend = async (odId) => {
  const userRef = doc(db, 'users', odId);
  const reliability = await getUserReliability(odId);

  if (!reliability) {
    throw new Error('User not found');
  }

  // Calculate new score (bonus for showing up, max 100)
  const newScore = Math.min(MAX_SCORE, reliability.score + ATTENDANCE_BONUS);

  const updatedReliability = {
    score:          newScore,
    totalScheduled: reliability.totalScheduled ?? 0,
    totalAttended:  (reliability.totalAttended  ?? 0) + 1,
    totalNoShow:    reliability.totalNoShow     ?? 0,
    totalCancelled: reliability.totalCancelled  ?? 0,
    lastUpdated:    serverTimestamp(),
  };

  await updateDoc(userRef, { reliability: updatedReliability });

  return updatedReliability;
};

/**
 * Update reliability when user doesn't show up for a scheduled session
 *
 * @param {string} odId - User ID
 * @returns {Promise<Object>} Updated reliability data
 */
export const updateReliabilityOnNoShow = async (odId) => {
  const userRef = doc(db, 'users', odId);
  const reliability = await getUserReliability(odId);

  if (!reliability) {
    throw new Error('User not found');
  }

  // Calculate new score (penalty for no-show)
  const newScore = Math.max(MIN_SCORE, reliability.score - NO_SHOW_PENALTY);

  const updatedReliability = {
    score:          newScore,
    totalScheduled: reliability.totalScheduled ?? 0,
    totalAttended:  reliability.totalAttended  ?? 0,
    totalNoShow:    (reliability.totalNoShow   ?? 0) + 1,
    totalCancelled: reliability.totalCancelled ?? 0,
    lastUpdated:    serverTimestamp(),
  };

  await updateDoc(userRef, { reliability: updatedReliability });

  return updatedReliability;
};

/**
 * Update reliability when user cancels a scheduled session
 *
 * @param {string} odId - User ID
 * @param {boolean} isLateCancellation - True if cancelled less than 1 hour before
 * @returns {Promise<Object>} Updated reliability data
 */
export const updateReliabilityOnCancel = async (odId, isLateCancellation) => {
  const userRef = doc(db, 'users', odId);
  const reliability = await getUserReliability(odId);

  if (!reliability) {
    throw new Error('User not found');
  }

  // Only penalize late cancellations
  const penalty = isLateCancellation ? LATE_CANCEL_PENALTY : 0;
  const newScore = Math.max(MIN_SCORE, reliability.score - penalty);

  const updatedReliability = {
    score:          newScore,
    totalScheduled: reliability.totalScheduled ?? 0,
    totalAttended:  reliability.totalAttended  ?? 0,
    totalNoShow:    reliability.totalNoShow    ?? 0,
    totalCancelled: (reliability.totalCancelled ?? 0) + 1,
    lastUpdated:    serverTimestamp(),
  };

  await updateDoc(userRef, { reliability: updatedReliability });

  return updatedReliability;
};

/**
 * Increment scheduled count when user creates a new schedule
 *
 * @param {string} odId - User ID
 * @returns {Promise<void>}
 */
export const incrementScheduledCount = async (odId) => {
  const userRef = doc(db, 'users', odId);
  const reliability = await getUserReliability(odId);

  if (!reliability) {
    throw new Error('User not found');
  }

  await updateDoc(userRef, {
    'reliability.totalScheduled': (reliability.totalScheduled ?? 0) + 1,
    'reliability.lastUpdated':    serverTimestamp(),
  });
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
