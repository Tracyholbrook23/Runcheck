/**
 * useAdminGymRequests.js — All Gym Requests (Admin View)
 *
 * Real-time subscription to every document in the `gymRequests` collection,
 * regardless of who submitted it. Intended for admin review screens.
 *
 * Sort order: pending requests first, then newest-first within each group.
 *
 * Requires the Firestore read rule on `gymRequests` to allow any signed-in
 * user to read all docs (temporarily broadened for admin dev workflow).
 *
 * @example
 * const { requests, loading, pendingCount } = useAdminGymRequests();
 */

import { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';

/**
 * Stable sort: pending first, then by createdAt descending.
 * Firestore returns docs in `createdAt desc` order; this re-sort
 * floats all pending docs to the top while preserving date order
 * within each status group.
 */
function sortPendingFirst(docs) {
  return [...docs].sort((a, b) => {
    const aPending = a.status === 'pending' ? 0 : 1;
    const bPending = b.status === 'pending' ? 0 : 1;
    if (aPending !== bPending) return aPending - bPending;
    // Within the same group, newest first (already ordered by Firestore,
    // but re-sort to be safe after the status partition).
    const aTime = a.createdAt?.toMillis?.() ?? 0;
    const bTime = b.createdAt?.toMillis?.() ?? 0;
    return bTime - aTime;
  });
}

/**
 * useAdminGymRequests — Real-time subscription to all gym requests.
 *
 * @returns {{
 *   requests: object[],      Sorted array of gym request documents.
 *   loading: boolean,        True while the initial snapshot is in flight.
 *   pendingCount: number,    Number of requests with status === 'pending'.
 *   count: number,           Total number of requests.
 * }}
 */
export const useAdminGymRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'gymRequests'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setRequests(sortPendingFirst(docs));
        setLoading(false);
      },
      (err) => {
        console.error('useAdminGymRequests snapshot error:', err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return {
    requests,
    loading,
    pendingCount,
    count: requests.length,
  };
};

export default useAdminGymRequests;
