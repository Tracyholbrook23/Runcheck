/**
 * rankHelpers.js — Rank Computation Utilities
 *
 * Pure functions that derive rank data from a user's totalPoints.
 * All tier definitions come from config/ranks.js — no thresholds here.
 *
 * Replaces the computation logic previously in utils/badges.js.
 */

import { RANKS } from '../config/ranks';

/**
 * getUserRank — Returns the RANKS entry matching a given point total.
 *
 * Iterates from the top tier downward so the first match is always the
 * highest tier the user has reached.
 *
 * @param {number} totalPoints — The user's cumulative point total.
 * @returns {object} The matching RANKS entry object.
 */
export const getUserRank = (totalPoints = 0) => {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (totalPoints >= RANKS[i].minPoints) return RANKS[i];
  }
  return RANKS[0]; // Bronze fallback (covers 0 points)
};

/**
 * getProgressToNextRank — Returns a 0–1 float representing how far through
 * the current tier the user is. Legend (max rank) always returns 1.
 *
 * @param {number} totalPoints — The user's cumulative point total.
 * @returns {number} Progress ratio between 0 (start of tier) and 1 (next tier).
 */
export const getProgressToNextRank = (totalPoints = 0) => {
  const rank = getUserRank(totalPoints);
  if (rank.maxPoints === null) return 1; // max rank
  const nextMin = rank.maxPoints + 1;
  const rangeSize = nextMin - rank.minPoints;
  const earned = totalPoints - rank.minPoints;
  return Math.min(Math.max(earned / rangeSize, 0), 1);
};

/**
 * getNextRank — Returns the next tier above the user's current rank,
 * or null if the user is already at max rank.
 *
 * @param {number} totalPoints — The user's cumulative point total.
 * @returns {object|null} The next RANKS entry, or null.
 */
export const getNextRank = (totalPoints = 0) => {
  const rank = getUserRank(totalPoints);
  const idx = RANKS.indexOf(rank);
  return idx < RANKS.length - 1 ? RANKS[idx + 1] : null;
};

/**
 * getRankById — Looks up a rank by its string id.
 *
 * @param {string} id — e.g. 'gold', 'diamond'.
 * @returns {object|null} The matching RANKS entry, or null.
 */
export const getRankById = (id) => {
  return RANKS.find((r) => r.id === id) ?? null;
};
