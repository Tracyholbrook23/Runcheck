/**
 * useMyRunChats.js — Hook for the user's active run chat threads.
 *
 * Subscribes to all runParticipants docs for the current user, then enriches
 * each with the corresponding run doc (gymName + startTime) so the Messages
 * inbox can show a meaningful label like "Cowboys Fit · 7:00 PM".
 *
 * Reads: runParticipants (live subscription) + runs/{runId} (one getDoc per
 * active run, re-fetched whenever the participant list changes). Users are
 * typically in 0–3 active runs at a time, so this is acceptable for MVP.
 *
 * No push notification or unread-count logic (deferred per spec).
 *
 * @returns {{ runChats: object[], loading: boolean }}
 *   Each runChat object: { id, runId, gymId, gymName, startTime, ... }
 */

import { useState, useEffect } from 'react';
import { db, auth } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { subscribeToAllUserRuns } from '../services/runService';

export function useMyRunChats() {
  const [runChats, setRunChats] = useState([]);
  const [loading, setLoading] = useState(true);

  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) {
      setRunChats([]);
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToAllUserRuns(uid, async (participants) => {
      if (participants.length === 0) {
        setRunChats([]);
        setLoading(false);
        return;
      }

      // Fetch each run doc (gymName + startTime) and gym doc (imageUrl) in parallel.
      // Participant docs may lack gymName (older docs) and never carry startTime.
      const enriched = await Promise.all(
        participants.map(async (p) => {
          try {
            const gymId = p.gymId;
            const [runSnap, gymSnap] = await Promise.all([
              getDoc(doc(db, 'runs', p.runId)),
              gymId ? getDoc(doc(db, 'gyms', gymId)) : Promise.resolve(null),
            ]);
            const runData = runSnap.exists() ? runSnap.data() : {};
            const gymData = gymSnap?.exists() ? gymSnap.data() : {};
            return {
              ...p,
              gymName: runData.gymName || p.gymName || '',
              startTime: runData.startTime || null,
              gymImageUrl: gymData.imageUrl || null,
            };
          } catch {
            // If the docs can't be fetched, fall back gracefully.
            return p;
          }
        }),
      );

      setRunChats(enriched);
      setLoading(false);
    });

    return unsubscribe;
  }, [uid]);

  return { runChats, loading };
}
