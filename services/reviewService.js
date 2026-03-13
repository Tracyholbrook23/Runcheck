/**
 * reviewService.js — Verified gym review system (RC-007)
 *
 * Reviews are stored in gyms/{gymId}/reviews/{autoId}.
 * Eligibility is gated on verified run attendance, read from
 * users/{uid}.pointsAwarded.runGyms — written atomically inside the
 * runComplete points transaction so it is always consistent.
 *
 * MVP rules enforced here:
 *   • One active review per user per gym (submitReview query-guard).
 *   • One review reward per user per gym, forever (pointsService transaction).
 *     Deleting and reposting cannot earn a second reward.
 */

import { db } from '../config/firebase';
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { awardPoints } from './pointsService';

/**
 * checkReviewEligibility — Returns whether the user is eligible to write a
 * review at the given gym.
 *
 * A user qualifies under either condition (OR logic):
 *   1. pointsAwarded.runGyms includes gymId
 *      — set atomically when the user earns a runComplete bonus here (verified
 *        run: GPS check-in, participantCount ≥ 2, creator also present).
 *   2. pointsAwarded.gymVisits includes gymId
 *      — set atomically when the user earns check-in points here (written
 *        inside the same cooldown-guarded transaction as the checkin award).
 *        Represents a real visit to the gym independent of run participation.
 *
 * Both signals are read from a single user document — no extra Firestore
 * queries required beyond the one getDoc call.
 *
 * The two values are returned separately so the screen can gate the review
 * button on `canReview` while writing `verifiedAttendee` only when
 * `hasVerifiedRun` is true (run-completion path only).
 *
 * @param {string} uid    — Firebase Auth user ID.
 * @param {string} gymId  — Firestore ID of the gym.
 * @returns {Promise<{ canReview: boolean, hasVerifiedRun: boolean }>}
 *   canReview      — true if eligible via either signal (gate check).
 *   hasVerifiedRun — true only if user completed a verified run here (badge check).
 */
export const checkReviewEligibility = async (uid, gymId) => {
  const ineligible = { canReview: false, hasVerifiedRun: false };
  if (!uid || !gymId) return ineligible;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return ineligible;
    const awarded = snap.data()?.pointsAwarded ?? {};
    const runGyms   = awarded.runGyms   ?? [];
    const gymVisits = awarded.gymVisits ?? [];
    return {
      canReview:      runGyms.includes(gymId) || gymVisits.includes(gymId),
      hasVerifiedRun: runGyms.includes(gymId),
    };
  } catch (err) {
    console.error('checkReviewEligibility error:', err);
    return ineligible;
  }
};

/**
 * submitReview — Creates a verified gym review and awards the one-time
 * review bonus points.
 *
 * Enforces the one-active-review-per-user-per-gym MVP rule by querying
 * for an existing review before writing. The points award is awaited
 * (not fire-and-forget) so errors surface at the call site.
 *
 * @param {string}  uid         — Firebase Auth user ID.
 * @param {string}  gymId       — Firestore ID of the gym being reviewed.
 * @param {string}  userName    — Display name to store on the review doc.
 * @param {string}  userAvatar  — Avatar URL to store on the review doc.
 * @param {number}  rating      — Star rating (1–5).
 * @param {string}  text        — Optional review body (may be empty string).
 * @param {boolean} isVerified  — Whether the user is a verified run attendee.
 * @returns {Promise<{
 *   success:         boolean,
 *   alreadyReviewed: boolean,
 *   pointsResult:    object | null,
 * }>}
 */
export const submitReview = async (
  uid,
  gymId,
  userName,
  userAvatar,
  rating,
  text,
  isVerified,
) => {
  const failure = { success: false, alreadyReviewed: false, pointsResult: null };

  if (!uid || !gymId || !rating) return failure;

  try {
    // ── One-active-review guard ──────────────────────────────────────────────
    // MVP rule: one review per user per gym. If a review already exists,
    // return early without writing or awarding points.
    const reviewsRef = collection(db, 'gyms', gymId, 'reviews');
    const existingSnap = await getDocs(query(reviewsRef, where('userId', '==', uid)));
    if (!existingSnap.empty) {
      return { success: false, alreadyReviewed: true, pointsResult: null };
    }

    // ── Write the review document ────────────────────────────────────────────
    await addDoc(reviewsRef, {
      userId:           uid,
      userName:         userName   ?? '',
      userAvatar:       userAvatar ?? '',
      rating,
      text:             text       ?? '',
      verifiedAttendee: isVerified ?? false,
      createdAt:        serverTimestamp(),
    });

    // ── Award review points (awaited, not fire-and-forget) ───────────────────
    // The transactional guard in pointsService (pointsAwarded.reviewedGyms)
    // ensures at most one reward per user per gym, forever.
    const pointsResult = await awardPoints(uid, 'review', null, gymId);

    return { success: true, alreadyReviewed: false, pointsResult };
  } catch (err) {
    console.error('submitReview error:', err);
    return failure;
  }
};
