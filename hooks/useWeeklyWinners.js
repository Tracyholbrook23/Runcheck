/**
 * useWeeklyWinners — React hook for the most recent weekly leaderboard winners.
 *
 * Fetches once on mount (winners change at most once per week, so real-time
 * subscription is unnecessary).  Returns `{ winners, weekOf, recordedAt, loading }`.
 *
 * `winners` is an array of up to 3 entries:
 *   [{ uid, name, photoURL, weeklyPoints, place: 1|2|3 }]
 *
 * `recordedAt` is the Firestore Timestamp of when the winners were recorded.
 * Used by HomeScreen to show a 24-hour celebration card after each weekly reset.
 *
 * Returns an empty array (not null) when no winner data exists, so callers
 * can safely check `winners.length > 0` without null guards.
 */

import { useState, useEffect } from 'react';
import { getLatestWeeklyWinners } from '../services/weeklyWinnersService';

export const useWeeklyWinners = () => {
  const [winners, setWinners]       = useState([]);
  const [weekOf, setWeekOf]         = useState(null);
  const [recordedAt, setRecordedAt] = useState(null);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetch = async () => {
      const result = await getLatestWeeklyWinners();

      if (cancelled) return;

      if (result) {
        setWinners(result.winners);
        setWeekOf(result.weekOf);
        setRecordedAt(result.recordedAt ?? null);
      }
      setLoading(false);
    };

    fetch();
    return () => { cancelled = true; };
  }, []);

  return { winners, weekOf, recordedAt, loading };
};
