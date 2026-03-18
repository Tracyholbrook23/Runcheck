/**
 * useMyGymRequests.js — Current User's Gym Requests Hook
 *
 * Subscribes in real time to the signed-in user's documents in the
 * `gymRequests` Firestore collection. Results are ordered newest-first
 * so the most recent request appears at the top of any list.
 *
 * Firestore security rules restrict reads to `submittedBy == auth.uid`,
 * so this query only returns the current user's own requests.
 *
 * @example
 * const { requests, loading } = useMyGymRequests();
 */

import { useState, useEffect } from 'react';
import { auth, db } from '../config/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';

/**
 * useMyGymRequests — Real-time subscription to the current user's gym requests.
 *
 * @returns {{
 *   requests: object[],   Array of gym request documents, newest first.
 *   loading: boolean,     True while the initial snapshot is in flight.
 *   count: number,        Total number of requests (convenience shorthand).
 * }}
 */
export const useMyGymRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;

    if (!uid) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'gymRequests'),
      where('submittedBy', '==', uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setRequests(docs);
        setLoading(false);
      },
      (err) => {
        if (__DEV__) console.error('useMyGymRequests snapshot error:', err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return {
    requests,
    loading,
    count: requests.length,
    pendingCount,
  };
};

export default useMyGymRequests;
