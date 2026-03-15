/**
 * pointsService.js — Gamification Points Engine
 *
 * The single function in this module, `awardPoints`, is the only place in the
 * codebase that ever writes to `users/{uid}.totalPoints`.  Screens call it
 * with an action string and receive back enough context to show a rank-up
 * celebration without doing their own Firestore reads.
 *
 * Point values come from `config/points.POINT_VALUES` so changing a reward
 * only requires editing one file.
 *
 * Action idempotency:
 *   checkin / checkinWithPlan — guarded by pointsAwarded.checkins.{idempotencyKey}
 *                               also writes pointsAwarded.gymVisits: arrayUnion(gymId) for review eligibility
 *   runComplete               — guarded by pointsAwarded.runs.{idempotencyKey} (idempotencyKey = runId)
 *                               also writes pointsAwarded.runGyms: arrayUnion(gymId) for review eligibility
 *   review                    — guarded by pointsAwarded.reviewedGyms array (gymId must be provided)
 *   completeProfile           — guarded by profileCompletionAwarded flag
 *   followGym                 — handled separately by handleFollowPoints (not routed through awardPoints)
 *
 * @example
 *   const { rankChanged, newRank } = await awardPoints(uid, 'checkin');
 *   if (rankChanged) Alert.alert('🎉', `You ranked up to ${newRank.name}!`);
 */

import { db } from '../config/firebase';
import { doc, updateDoc, increment, getDoc, runTransaction, arrayUnion, arrayRemove, Timestamp } from 'firebase/firestore';
import { POINT_VALUES } from '../config/points';
import { getUserRank } from '../utils/rankHelpers';

// ── Check-in reward cooldown ──────────────────────────────────────────────────
// Prevents points farming by repeatedly checking in/out at the same gym.
// The cooldown is enforced per user per gym: if a user last earned check-in
// points at a gym within the window, the award is silently skipped on the
// next check-in — presence and reliability tracking are NOT affected.
//
// Production: 4-hour window.
// Test accounts (TEST_USER_UIDS): 30-second window so manual testing remains easy.
//
// To add a test account: paste the user's Firebase Auth UID as a string entry
// in TEST_USER_UIDS below (e.g.  'abc123firebaseUID').
// ─────────────────────────────────────────────────────────────────────────────
const CHECKIN_COOLDOWN_MS      = 4 * 60 * 60 * 1000;  // 4 hours  (production)
const TEST_CHECKIN_COOLDOWN_MS =      30 * 1000;        // 30 seconds (test accounts)
const TEST_USER_UIDS = new Set([
  // Add test account Firebase Auth UIDs here:
  // 'PASTE_YOUR_TEST_UID_HERE',
]);

/**
 * handleFollowPoints — Awards or deducts follow points in a cheat-proof way.
 *
 * Points for following a gym are tracked per gymId inside
 * `users/{uid}.pointsAwarded.followedGyms`.  This means:
 *
 *   • Following a gym you've never followed before → award 2 pts, record gymId
 *   • Following a gym you already followed (and later unfollowed) → award 2 pts again
 *     because the gymId was removed from the array on unfollow (see below)
 *   • Following a gym that is *currently* in the awarded set → skip (exploit guard)
 *   • Unfollowing → deduct 2 pts and remove gymId from the awarded set
 *
 * This ties the points to the current follow state rather than the action
 * count, preventing infinite follow/unfollow farming.
 *
 * @param {string}  uid        — Firebase Auth user ID.
 * @param {string}  gymId      — Firestore ID of the gym being followed/unfollowed.
 * @param {boolean} isFollowing — true = user is NOW following, false = unfollowing.
 * @returns {Promise<void>}
 */
export const handleFollowPoints = async (uid, gymId, isFollowing) => {
  if (!uid || !gymId) return;

  const userRef = doc(db, 'users', uid);
  const points  = POINT_VALUES.followGym; // 2

  try {
    const snap       = await getDoc(userRef);
    const data       = snap.data() || {};
    const awardedSet = data.pointsAwarded?.followedGyms ?? [];

    if (isFollowing) {
      // Guard: if this gymId is already in the awarded set the user is
      // re-following without having unfollowed first — don't double-count.
      if (awardedSet.includes(gymId)) return;

      await updateDoc(userRef, {
        totalPoints:                    increment(points),
        weeklyPoints:                   increment(points),
        'pointsAwarded.followedGyms':   arrayUnion(gymId),
      });
    } else {
      // Only deduct if points were actually awarded for this gym.
      // If the user unfollows a gym they followed before the system existed,
      // awardedSet won't contain the gymId so we skip silently.
      if (!awardedSet.includes(gymId)) return;

      await updateDoc(userRef, {
        totalPoints:                    increment(-points),
        weeklyPoints:                   increment(-points),
        'pointsAwarded.followedGyms':   arrayRemove(gymId),
      });
    }
  } catch (err) {
    console.error('handleFollowPoints error:', err);
  }
};

/**
 * awardPoints — Increments the user's `totalPoints` in Firestore and returns
 * rank transition data so the caller can show a celebration UI if needed.
 *
 * @param {string}      uid              — Firebase Auth user ID.
 * @param {string}      action           — One of: 'checkin' | 'checkinWithPlan' | 'runComplete' |
 *                                         'review' | 'followGym' | 'completeProfile'
 * @param {string|null} idempotencyKey   — Unique key used to prevent duplicate awards.
 *                                         checkin/checkinWithPlan: pass sessionKey (presenceId + timestamp).
 *                                         runComplete: pass the runId.
 *                                         Other actions: omit (null).
 * @param {string|null} gymId            — Required for checkin cooldown guard and review idempotency.
 *                                         Also written to runGyms when awarding runComplete.
 * @returns {Promise<{
 *   newTotal:     number,        — Point total after the award.
 *   rankChanged:  boolean,       — True if the user crossed a tier boundary.
 *   newRank:      object | null, — The RANKS entry for the new tier.
 *   prevRank:     object | null, — The RANKS entry before the award.
 * }>}
 */
export const awardPoints = async (uid, action, idempotencyKey = null, gymId = null) => {
  const noOp = { newTotal: 0, rankChanged: false, newRank: null, prevRank: null };

  if (!uid || !POINT_VALUES[action]) return noOp;

  const points = POINT_VALUES[action];
  const userRef = doc(db, 'users', uid);

  try {
    // ── checkin / checkinWithPlan — idempotent + cooldown guard ─────────────
    // Runs inside a transaction so all reads and writes are atomic.
    // Two guards are applied in order:
    //   1. Idempotency: if this exact idempotencyKey was already awarded, skip.
    //   2. Cooldown: if the user earned check-in points at this gym within the
    //      cooldown window (4 h production / 30 s test), skip this award.
    //      Presence and reliability tracking are unaffected — only points.
    // Falls through if idempotencyKey is not provided.
    if ((action === 'checkin' || action === 'checkinWithPlan') && idempotencyKey) {
      return await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(userRef);
        const data = snap.data() || {};
        const currentTotal = data.totalPoints || 0;
        const prevRank = getUserRank(currentTotal);

        // Guard 1 — idempotency: already awarded for this exact session key
        if (data.pointsAwarded?.checkins?.[idempotencyKey]) {
          return { newTotal: currentTotal, rankChanged: false, newRank: prevRank, prevRank };
        }

        // Guard 2 — cooldown: skip if re-checking into the same gym too soon
        if (gymId) {
          const cooldownMs = TEST_USER_UIDS.has(uid)
            ? TEST_CHECKIN_COOLDOWN_MS
            : CHECKIN_COOLDOWN_MS;
          const lastAt = data.pointsAwarded?.lastCheckinAt?.[gymId];
          if (lastAt) {
            const elapsed = Date.now() - lastAt.toMillis();
            if (elapsed < cooldownMs) {
              return { newTotal: currentTotal, rankChanged: false, newRank: prevRank, prevRank };
            }
          }
        }

        // Both guards passed — award points and record the timestamp.
        // gymVisits uses arrayUnion so it is naturally idempotent: adding a
        // gymId that is already present is a no-op. This means the field
        // accumulates unique gymIds across all sessions, forming a permanent
        // per-gym visit record that reviewService uses for eligibility checks.
        transaction.update(userRef, {
          totalPoints:  increment(points),
          weeklyPoints: increment(points),
          [`pointsAwarded.checkins.${idempotencyKey}`]: true,
          // Record when points were last awarded at this gym so the cooldown
          // guard can compare on the next check-in.
          ...(gymId ? { [`pointsAwarded.lastCheckinAt.${gymId}`]: Timestamp.now() } : {}),
          // Persistent visit record — written once per gym (arrayUnion is a no-op
          // on subsequent visits). Used by checkReviewEligibility as the
          // session-attendance signal alongside pointsAwarded.runGyms.
          ...(gymId ? { 'pointsAwarded.gymVisits': arrayUnion(gymId) } : {}),
        });

        const newTotal = currentTotal + points;
        const newRank = getUserRank(newTotal);
        return { newTotal, rankChanged: newRank.name !== prevRank.name, newRank, prevRank };
      });
    }

    // ── runComplete — transactional idempotency guard per runId ──────────────
    // idempotencyKey is the runId. Guard field: pointsAwarded.runs.{runId}.
    // Legitimacy (participantCount >= 2, creator presence) is verified upstream
    // in evaluateRunReward() before this function is called.
    // A missing idempotencyKey means the caller has no runId — bail out rather
    // than falling through to the unconditional increment path below.
    if (action === 'runComplete' && !idempotencyKey) {
      console.warn('awardPoints: runComplete called without idempotencyKey (runId) — skipping award');
      return noOp;
    }
    if (action === 'runComplete' && idempotencyKey) {
      return await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(userRef);
        const data = snap.data() || {};
        const currentTotal = data.totalPoints || 0;
        const prevRank = getUserRank(currentTotal);

        // Guard — already awarded for this run
        if (data.pointsAwarded?.runs?.[idempotencyKey]) {
          return { newTotal: currentTotal, rankChanged: false, newRank: prevRank, prevRank };
        }

        transaction.update(userRef, {
          totalPoints:  increment(points),
          weeklyPoints: increment(points),
          [`pointsAwarded.runs.${idempotencyKey}`]: true,
          // Record the gymId so RunDetailsScreen can check run attendance
          // eligibility with a single getDoc rather than querying runParticipants.
          ...(gymId ? { 'pointsAwarded.runGyms': arrayUnion(gymId) } : {}),
        });

        const newTotal = currentTotal + points;
        const newRank = getUserRank(newTotal);
        return { newTotal, rankChanged: newRank.name !== prevRank.name, newRank, prevRank };
      });
    }

    // ── review — transactional one-per-gym reward guard ──────────────────────
    // gymId is the uniqueness key. A user earns the review bonus at most once
    // per gym, ever — recorded in pointsAwarded.reviewedGyms. Deleting a review
    // and reposting cannot earn a second reward because the gymId stays in the
    // array permanently. gymId is required; omitting it is treated as a caller
    // error and silently skipped.
    if (action === 'review') {
      if (!gymId) {
        console.warn('awardPoints: review called without gymId — skipping award');
        return noOp;
      }
      return await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(userRef);
        const data = snap.data() || {};
        const currentTotal = data.totalPoints || 0;
        const prevRank = getUserRank(currentTotal);

        // Guard — already rewarded for reviewing this gym
        const reviewedGyms = data.pointsAwarded?.reviewedGyms ?? [];
        if (reviewedGyms.includes(gymId)) {
          return { newTotal: currentTotal, rankChanged: false, newRank: prevRank, prevRank };
        }

        transaction.update(userRef, {
          totalPoints:  increment(points),
          weeklyPoints: increment(points),
          'pointsAwarded.reviewedGyms': arrayUnion(gymId),
        });

        const newTotal = currentTotal + points;
        const newRank = getUserRank(newTotal);
        return { newTotal, rankChanged: newRank.name !== prevRank.name, newRank, prevRank };
      });
    }

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
        totalPoints:  increment(points),
        weeklyPoints: increment(points),
        profileCompletionAwarded: true,
      });
    } else {
      // Remaining actions (e.g. any future action not yet given its own guard)
      // — unconditional increment as a safe fallback.
      await updateDoc(userRef, { totalPoints: increment(points), weeklyPoints: increment(points) });
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

/**
 * penalizePoints — Deducts points from a user's total, floored at 0.
 *
 * Used exclusively for late-cancel penalties on runs (creator: −15,
 * participant: −5).  Does NOT touch reliability — that remains Cloud
 * Function-owned.  weeklyPoints are also reduced so the leaderboard
 * stays accurate within the current week.
 *
 * @param {string} uid    — Firebase Auth user ID.
 * @param {number} amount — Positive number of points to deduct.
 * @returns {Promise<void>}
 */
export const penalizePoints = async (uid, amount) => {
  if (!uid || amount <= 0) return;

  const userRef = doc(db, 'users', uid);
  try {
    const snap = await getDoc(userRef);
    const current = snap.data()?.totalPoints ?? 0;
    // Clamp deduction so totalPoints never goes below 0.
    const deduction = Math.min(amount, current);
    if (deduction <= 0) return;

    await updateDoc(userRef, {
      totalPoints:  increment(-deduction),
      weeklyPoints: increment(-deduction),
    });
  } catch (err) {
    console.error('penalizePoints error:', err);
  }
};
