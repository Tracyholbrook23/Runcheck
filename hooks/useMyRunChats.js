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
 * Unread detection: compares runs/{runId}.lastMessageAt against
 * runParticipants/{runId}_{uid}.lastReadAt (written by markRunChatSeen when
 * the user opens RunChatScreen). Both fields are nullable — old docs without
 * them are treated as read (conservative: no phantom unread badges).
 *
 * @returns {{ runChats: object[], loading: boolean, runChatUnreadCount: number }}
 *   Each runChat object: { id, runId, gymId, gymName, startTime, ... }
 */

import { useState, useEffect } from 'react';
import { db, auth } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { subscribeToAllUserRuns } from '../services/runService';
import { RUN_CHAT_EXPIRY_MS } from '../services/runChatService';

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

      // Fetch each run doc (gymName + startTime + chatExpiresAt) and gym doc
      // (imageUrl) in parallel. Participant docs may lack gymName (older docs)
      // and never carry startTime or chatExpiresAt.
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
            // Unread detection:
            //   lastMessageAt — stamped on the run doc each time a message is sent
            //   lastReadAt    — stamped on the participant doc when user opens the chat
            // Both nullable: docs created before this feature are treated as read.
            const lastMessageAt = runData.lastMessageAt || null;
            const lastReadAt = p.lastReadAt || null;
            const lastMessageMs = lastMessageAt?.toDate
              ? lastMessageAt.toDate().getTime()
              : lastMessageAt ? new Date(lastMessageAt).getTime() : 0;
            const lastReadMs = lastReadAt?.toDate
              ? lastReadAt.toDate().getTime()
              : lastReadAt ? new Date(lastReadAt).getTime() : 0;
            const isUnread = lastMessageMs > 0 && lastMessageMs > lastReadMs;

            return {
              ...p,
              gymName: runData.gymName || p.gymName || '',
              startTime: runData.startTime || null,
              // chatExpiresAt: stored on new runs. For old runs that pre-date
              // this field, fall back to startTime + RUN_CHAT_EXPIRY_MS so the
              // filter still works correctly.
              chatExpiresAt: runData.chatExpiresAt || null,
              gymImageUrl: gymData.imageUrl || null,
              isUnread,
            };
          } catch {
            // If the docs can't be fetched, fall back gracefully.
            return p;
          }
        }),
      );

      // Filter out expired run chats — they should not appear in the Messages
      // inbox once the chat window has closed.
      //
      // Expiry resolution order:
      //   1. chatExpiresAt field (new runs — explicit server-stored timestamp)
      //   2. startTime + RUN_CHAT_EXPIRY_MS (old runs without chatExpiresAt)
      //   3. No time info → show the chat (conservative, avoids hiding valid chats)
      const now = Date.now();
      const active = enriched.filter((chat) => {
        if (chat.chatExpiresAt) {
          const expiresMs = chat.chatExpiresAt.toDate
            ? chat.chatExpiresAt.toDate().getTime()
            : new Date(chat.chatExpiresAt).getTime();
          return expiresMs > now;
        }
        if (chat.startTime) {
          const startMs = chat.startTime.toDate
            ? chat.startTime.toDate().getTime()
            : new Date(chat.startTime).getTime();
          return startMs + RUN_CHAT_EXPIRY_MS > now;
        }
        return true; // no time info — show conservatively
      });

      setRunChats(active);
      setLoading(false);
    });

    return unsubscribe;
  }, [uid]);

  const runChatUnreadCount = runChats.filter((c) => c.isUnread).length;

  return { runChats, loading, runChatUnreadCount };
}
