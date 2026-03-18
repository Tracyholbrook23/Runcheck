/**
 * weeklyWinnersService.js — Read-only access to weekly leaderboard winners.
 *
 * The `weeklyWinners` collection is written exclusively by the reset script
 * (`scripts/weeklyReset.js`).  This service provides client-side reads only.
 *
 * Document shape (weeklyWinners/{YYYY-MM-DD}):
 *   weekOf:     string        — "YYYY-MM-DD", mirrors doc ID
 *   recordedAt: Timestamp
 *   firstPlace: { uid, name, photoURL, weeklyPoints }
 *   winners:    [{ uid, name, photoURL, weeklyPoints, place: 1|2|3 }]
 */

import { db } from '../config/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

const WEEKLY_WINNERS_COLL = 'weeklyWinners';

/**
 * getLatestWeeklyWinners — Fetches the most recent weeklyWinners document.
 *
 * Returns `null` if no winners have ever been recorded (fresh app, or reset
 * has never been run with COMMIT=true).
 *
 * @returns {Promise<{ weekOf: string, winners: Array, firstPlace: object } | null>}
 */
export const getLatestWeeklyWinners = async () => {
  try {
    const q = query(
      collection(db, WEEKLY_WINNERS_COLL),
      orderBy('weekOf', 'desc'),
      limit(1)
    );

    const snap = await getDocs(q);

    if (snap.empty) return null;

    const doc = snap.docs[0];
    const data = doc.data();

    return {
      id:         doc.id,
      weekOf:     data.weekOf,
      recordedAt: data.recordedAt,
      firstPlace: data.firstPlace ?? null,
      winners:    data.winners ?? [],
    };
  } catch (err) {
    if (__DEV__) console.error('getLatestWeeklyWinners error:', err);
    return null;
  }
};
