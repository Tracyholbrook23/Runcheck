/**
 * points.js — Point Values & Action Labels
 *
 * Single source of truth for how many points each action awards and the
 * human-readable metadata used to render the "How to Earn Points" UI.
 *
 * These values are used by:
 *   - `services/pointsService.js`   — for Firestore writes
 *   - `screens/LeaderboardScreen.js` — for the "How to Earn" card
 *
 * Changing a value here automatically updates both.
 *
 * Point system notes:
 *   - Planning a visit earns 0 pts. Points are only awarded on attendance.
 *   - Checking in when you had a scheduled plan → 15 pts (10 + 5 bonus).
 *   - Checking in without a prior plan → 10 pts.
 */

/**
 * POINT_VALUES — maps action type strings to their point reward.
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
