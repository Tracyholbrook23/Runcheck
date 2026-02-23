/**
 * pointsService.js — Gamification Points Engine
 *
 * The single function in this module, `awardPoints`, is the only place in the
 * codebase that ever writes to `users/{uid}.totalPoints`.  Screens call it
 * with an action string and receive back enough context to show a rank-up
 * celebration without doing their own Firestore reads.
 *
 * Point values come from `utils/badges.POINT_VALUES` so changing a reward
 * only requires editing one file.
 *
 * The `completeProfile` action is idempotent — it will silently skip the
 * award if `users/{uid}.profileCompletionAwarded` is already true, preventing
 * double-counting when the user updates their photo multiple times.
 *
 * @example
 *   const { rankChanged, newRank } = await awardPoints(uid, 'checkin');
 *   if (rankChanged) Alert.alert('🎉', `You ranked up to ${newRank.name}!`);
 */

import { db } from '../config/firebase';
import { doc, updateDoc, increment, getDoc } from 'firebase/firestore';
import { POINT_VALUES, getUserRank } from '../utils/badges';

/**
 * awardPoints — Increments the user's `totalPoints` in Firestore and returns
 * rank transition data so the caller can show a celebration UI if needed.
 *
 * @param {string} uid    — Firebase Auth user ID.
 * @param {string} action — One of: 'checkin' | 'planVisit' | 'review' |
 *                          'followGym' | 'completeProfile'
 * @returns {Promise<{
 *   newTotal:     number,        — Point total after the award.
 *   rankChanged:  boolean,       — True if the user crossed a tier boundary.
 *   newRank:      object | null, — The RANKS entry for the new tier.
 *   prevRank:     object | null, — The RANKS entry before the award.
 * }>}
 */
export const awardPoints = async (uid, action) => {
  const noOp = { newTotal: 0, rankChanged: false, newRank: null, prevRank: null };

  if (!uid || !POINT_VALUES[action]) return noOp;

  const points = POINT_VALUES[action];
  const userRef = doc(db, 'users', uid);

  try {
    const snap = await getDoc(userRef);
    const data = snap.data() || {};
    const currentTotal = data.totalPoints || 0;
    const prevRank = getUserRank(currentTotal);

    // ── completeProfile is one-time only ────────────────────────────────────
    if (action === 'completeProfile') {
      if (data.profileCompletionAwarded) {
        // Already awarded — return current state without writing
        return { newTotal: currentTotal, rankChanged: false, newRank: prevRank, prevRank };
      }
      await updateDoc(userRef, {
        totalPoints: increment(points),
        profileCompletionAwarded: true,
      });
    } else {
      // All other actions — unconditional increment
      await updateDoc(userRef, { totalPoints: increment(points) });
    }

    const newTotal = currentTotal + points;
    const newRank = getUserRank(newTotal);
    const rankChanged = newRank.name !== prevRank.name;

    return { newTotal, rankChanged, newRank, prevRank };
  } catch (err) {
    console.error('awardPoints error:', err);
    return noOp;
  }
};
