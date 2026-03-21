/**
 * useConversations.js — DM Conversation List Hook
 *
 * Wraps dmService.subscribeToConversations with React state.
 * Returns the signed-in user's conversations ordered by lastActivityAt desc,
 * a loading flag, and a minimal unread count.
 *
 * Unread detection: compares lastActivityAt vs lastSeenAt[uid] Timestamps.
 * Both values live on the conversation doc — no extra Firestore reads.
 * A conversation is considered unread when lastActivityAt > lastSeenAt[uid].
 */

import { useState, useEffect } from 'react';
import { auth } from '../config/firebase';
import { subscribeToConversations } from '../services/dmService';

/**
 * useConversations — Real-time DM conversation list for the signed-in user.
 *
 * @returns {{
 *   conversations: object[],  // ordered by lastActivityAt desc
 *   loading: boolean,
 *   unreadCount: number,      // count of conversations with unseen new messages
 * }}
 */
export function useConversations() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToConversations(uid, (newConversations, error) => {
      if (error) {
        if (__DEV__) console.warn('[useConversations] subscription error:', error);
      }
      setConversations(newConversations);
      setLoading(false);
    });

    return unsubscribe;
  }, [uid]);

  // Count conversations where the last activity happened after the user
  // last viewed the conversation. One Timestamp comparison per row — no reads.
  const unreadCount = conversations.filter((c) => {
    const lastSeen = c.lastSeenAt?.[uid]?.toMillis?.() ?? 0;
    const lastActivity = c.lastActivityAt?.toMillis?.() ?? 0;
    return lastActivity > lastSeen;
  }).length;

  return { conversations, loading, unreadCount };
}

export default useConversations;
