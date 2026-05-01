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
 * Point system philosophy:
 *   Showing up > everything else. Points are weighted to reward consistency
 *   and follow-through — not passive actions like tapping buttons.
 *
 *   - Showing up to an active run is the highest-value action (+20).
 *   - Attending a visit you had planned rewards follow-through (+25 total).
 *   - Basic check-ins still count but carry less weight (+5).
 *   - Passive actions (follow, review) are minimal (+1–5).
 */

/**
 * POINT_VALUES — maps action type strings to their point reward.
 */
export const POINT_VALUES = {
  checkin:          5,  // Standard check-in (no prior plan)
  checkinWithPlan:  25, // Check-in that fulfils a scheduled plan (+20 follow-through bonus)
  runComplete:      20, // Show up to an active run — the core action we reward most
  review:           5,
  followGym:        1,
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
    action: 'checkinWithPlan',
    label: 'Attend a planned visit',
    icon: '📅',
    ionicon: 'calendar-outline',
    iconColor: null,          // use colors.primary from theme
    points: POINT_VALUES.checkinWithPlan,
    note: '+20 follow-through bonus',
  },
  {
    action: 'runComplete',
    label: 'Show up for a run',
    icon: '🏃',
    ionicon: 'flag',
    iconColor: '#6366F1',     // indigo
    points: POINT_VALUES.runComplete,
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
];
