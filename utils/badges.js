/**
 * badges.js — Gamification Rank & Badge Utilities
 *
 * Single source of truth for every tier definition, point value, and
 * progress calculation in the RunCheck badge system.  Import these helpers
 * into any screen or service that needs rank data — never hard-code tier
 * thresholds elsewhere.
 *
 * Tier ladder (total points):
 *   🥉 Bronze   —    0–99
 *   🥈 Silver   — 100–249
 *   ✨ Gold     — 250–499
 *   💎 Platinum — 500+  (max rank, pulsing glow in UI)
 *
 * Point system notes:
 *   - Planning a visit earns 0 pts. Points are only awarded on attendance.
 *   - Checking in when you had a scheduled plan → 15 pts (10 + 5 bonus).
 *   - Checking in without a prior plan → 10 pts.
 */

/**
 * RANKS — ordered array of tier definitions from lowest to highest.
 *
 * Fields:
 *   name        — Display name shown in badges and alerts
 *   minPoints   — Minimum total points needed to reach this tier
 *   color       — Primary brand color for the badge background / text
 *   glowColor   — Semi-transparent version used for shadow / glow effects
 *   icon        — Emoji medal shown next to the rank name
 *   nextRankAt  — Point threshold for the next tier, or null if max rank
 */
export const RANKS = [
  {
    name: 'Bronze',
    minPoints: 0,
    color: '#CD7F32',
    glowColor: '#CD7F3260',
    icon: '🥉',
    nextRankAt: 100,
  },
  {
    name: 'Silver',
    minPoints: 100,
    color: '#A8A9AD',
    glowColor: '#A8A9AD60',
    icon: '🥈',
    nextRankAt: 250,
  },
  {
    name: 'Gold',
    minPoints: 250,
    color: '#FFD700',
    glowColor: '#FFD70060',
    icon: '✨',
    nextRankAt: 500,
  },
  {
    name: 'Platinum',
    minPoints: 500,
    color: '#E8F4FD',
    glowColor: '#E8F4FD60',
    icon: '💎',
    nextRankAt: null,
  },
];

/**
 * POINT_VALUES — maps action type strings to their point reward.
 *
 * These values are the authoritative source used by both `pointsService`
 * (for Firestore writes) and `LeaderboardScreen` (for the "How to Earn"
 * card), so changing a value here automatically updates both.
 */
export const POINT_VALUES = {
  checkin:          10, // Standard check-in (no prior plan)
  checkinWithPlan:  15, // Check-in that fulfils a scheduled plan (+5 bonus)
  runComplete:      10, // Check in to a gym when you're a run participant — show-up bonus
  review:           15,
  followGym:         2,
  completeProfile:  10,
};

/**
 * ACTION_LABELS — human-readable metadata for each earnable action.
 * Used to render the "How to Earn Points" list in LeaderboardScreen.
 *
 * `ionicon`   — Ionicons icon name for the action row icon.
 * `iconColor` — Hex color for the icon and its background tint.
 *               null means "use the app's theme primary color".
 */
export const ACTION_LABELS = [
  {
    action: 'checkin',
    label: 'Check in at a gym',
    icon: '✅',
    ionicon: 'location',
    iconColor: null,          // use colors.primary from theme
    points: POINT_VALUES.checkin,
    note: null,
  },
  {
    action: 'checkinWithPlan',
    label: 'Attend a planned visit',
    icon: '📅',
    ionicon: 'calendar-check',
    iconColor: null,          // use colors.primary from theme
    points: POINT_VALUES.checkinWithPlan,
    note: '+5 follow-through bonus',
  },
  {
    action: 'runComplete',
    label: 'Show up for a run',
    icon: '🏃',
    ionicon: 'flag',
    iconColor: '#6366F1',     // indigo
    points: POINT_VALUES.runComplete,
    note: '+10 show-up bonus',
  },
  {
    action: 'review',
    label: 'Leave a review',
    icon: '⭐',
    ionicon: 'star',
    iconColor: '#F59E0B',     // amber
    points: POINT_VALUES.review,
    note: null,
  },
  {
    action: 'followGym',
    label: 'Follow a gym',
    icon: '❤️',
    ionicon: 'heart',
    iconColor: '#EF4444',     // red
    points: POINT_VALUES.followGym,
    note: null,
  },
  {
    action: 'completeProfile',
    label: 'Complete your profile',
    icon: '👤',
    ionicon: 'person-circle',
    iconColor: '#22C55E',     // green
    points: POINT_VALUES.completeProfile,
    note: 'one time',
  },
];

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
 * the current tier the user is.  Platinum always returns 1 (max rank).
 *
 * @param {number} totalPoints — The user's cumulative point total.
 * @returns {number} Progress ratio between 0 (start of tier) and 1 (next tier).
 */
export const getProgressToNextRank = (totalPoints = 0) => {
  const rank = getUserRank(totalPoints);
  if (rank.nextRankAt === null) return 1;
  const rangeSize = rank.nextRankAt - rank.minPoints;
  const earned = totalPoints - rank.minPoints;
  return Math.min(Math.max(earned / rangeSize, 0), 1);
};
