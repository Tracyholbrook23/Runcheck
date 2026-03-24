/**
 * dmService.js — Direct Messaging Service
 *
 * Handles all Firestore reads and writes for the DM / Messages feature.
 *
 * DATA MODEL:
 *   conversations/{conversationId}
 *     conversationId = [uid_a, uid_b].sort().join('_')  — deterministic, no duplicates
 *     Fields: participantIds, participants, lastMessage, lastActivityAt, createdAt, lastSeenAt
 *
 *   conversations/{conversationId}/messages/{autoId}
 *     Fields: senderId, text, createdAt
 *
 * DESIGN DECISIONS:
 *   - Conversation ID is deterministic — the same two users always share one conversation
 *     doc. Creating from either side is idempotent via getDoc → setDoc.
 *   - `openOrCreateConversation` checks if the doc already exists before reading
 *     users/{currentUid}. The user doc read only happens at first conversation creation,
 *     not on every subsequent Message button tap.
 *   - `sendDMMessage` makes two sequential writes (message + conversation metadata).
 *     These are not in a transaction. The messages subcollection is always consistent;
 *     lastMessage may lag by one message in a very tight race — acceptable at MVP scale.
 *   - Dot-notation field paths (e.g. `lastSeenAt.${uid}`) update only that nested key
 *     without overwriting the sibling key for the other participant.
 *   - DM message docs do NOT denormalize senderName or senderAvatar. In a 1:1 conversation
 *     the two participants are known from the conversation doc, so the screen can resolve
 *     names/avatars without storing them on every message.
 */

import { db, auth } from '../config/firebase';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  arrayUnion,
  arrayRemove,
  deleteField,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';

const MAX_MESSAGE_LENGTH = 500;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getConversationId — Deterministic, order-independent conversation doc ID.
 *
 * Sorts the two UIDs lexicographically so calling with (uid_a, uid_b) or
 * (uid_b, uid_a) always produces the same string. This prevents duplicate
 * conversations between the same two users.
 *
 * @param {string} uid_a
 * @param {string} uid_b
 * @returns {string}
 */
export function getConversationId(uid_a, uid_b) {
  return [uid_a, uid_b].sort().join('_');
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * openOrCreateConversation — Returns the conversation ID for a 1:1 DM thread,
 * creating the conversation doc if it does not already exist.
 *
 * Optimization: if the conversation already exists, returns immediately
 * (one getDoc read, no writes, no users/{currentUid} read).
 * The current user doc read only happens during conversation creation —
 * the first Message tap between two users who have never messaged before.
 *
 * @param {object} params
 * @param {string} params.currentUid   — Firebase Auth UID of the current user
 * @param {string} params.otherUid     — Firebase Auth UID of the other participant
 * @param {string} params.otherName    — Display name of the other participant (denormalized)
 * @param {string|null} params.otherAvatar — Avatar URL of the other participant, or null
 * @returns {Promise<string>} conversationId
 * @throws {Error} If not authenticated or if UIDs are invalid
 */
export async function openOrCreateConversation({ currentUid, otherUid, otherName, otherAvatar }) {
  if (!currentUid) throw new Error('Not authenticated');
  if (!otherUid) throw new Error('otherUid is required');
  if (currentUid === otherUid) throw new Error('Cannot start a conversation with yourself');

  const conversationId = getConversationId(currentUid, otherUid);
  const conversationRef = doc(db, 'conversations', conversationId);

  // Fast path: conversation already exists — return immediately, no user read.
  const snap = await getDoc(conversationRef);
  if (snap.exists()) {
    return conversationId;
  }

  // Slow path: new conversation — read the current user's profile to get their
  // display name and avatar for the denormalized `participants` map.
  const currentUserSnap = await getDoc(doc(db, 'users', currentUid));
  const currentUserData = currentUserSnap.exists() ? currentUserSnap.data() : {};
  const currentName = currentUserData.name || auth.currentUser?.displayName || 'Player';
  const currentAvatar = currentUserData.photoURL || null;

  await setDoc(conversationRef, {
    participantIds: [currentUid, otherUid],
    participants: {
      [currentUid]: { name: currentName, avatar: currentAvatar },
      [otherUid]: { name: otherName || 'Player', avatar: otherAvatar || null },
    },
    lastMessage: null,
    lastActivityAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    lastSeenAt: {},
  });

  return conversationId;
}

/**
 * subscribeToConversations — Real-time listener for the current user's DM inbox.
 *
 * Queries conversations where the user's UID is in `participantIds`, ordered
 * by `lastActivityAt` descending (most recently active first).
 *
 * Requires a composite Firestore index:
 *   Collection: conversations
 *   Fields: participantIds ARRAY, lastActivityAt DESC
 *
 * @param {string} uid — Firebase Auth UID of the current user
 * @param {function(object[], Error|null): void} callback
 *   Called with (conversations, null) on success; ([], error) on failure.
 * @returns {function} Unsubscribe function — call on component unmount.
 */
export function subscribeToConversations(uid, callback) {
  if (!uid) {
    callback([], null);
    return () => {};
  }

  const q = query(
    collection(db, 'conversations'),
    where('participantIds', 'array-contains', uid),
    orderBy('lastActivityAt', 'desc'),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const conversations = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(conversations, null);
    },
    (error) => {
      if (__DEV__) console.warn('[dmService] subscribeToConversations error:', error.code, error.message);
      callback([], error);
    },
  );
}

/**
 * subscribeToConversationMessages — Real-time listener for messages in a conversation.
 *
 * Subscribes to `conversations/{conversationId}/messages` ordered by createdAt ASC.
 * Calls `callback(messages, null)` on success, `callback([], error)` on failure.
 *
 * @param {string} conversationId
 * @param {function(object[], Error|null): void} callback
 * @returns {function} Unsubscribe function
 */
export function subscribeToConversationMessages(conversationId, callback) {
  const messagesRef = collection(db, 'conversations', conversationId, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const messages = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(messages, null);
    },
    (error) => {
      if (__DEV__) console.warn('[dmService] subscribeToConversationMessages error:', error.code, error.message);
      callback([], error);
    },
  );
}

/**
 * sendDMMessage — Writes a new message to a conversation's messages subcollection
 * and updates conversation metadata (lastMessage, lastActivityAt, lastSeenAt).
 *
 * Two sequential writes — not a transaction. The message always lands first.
 * In a rare tight race, lastMessage on the conversation doc may be one message
 * behind; this is acceptable at MVP scale.
 *
 * Dot-notation key `lastSeenAt.${senderId}` updates only that participant's
 * lastSeenAt entry without overwriting the other participant's entry.
 *
 * @param {object} params
 * @param {string} params.conversationId
 * @param {string} params.senderId    — Firebase Auth UID of the sender
 * @param {string} [params.recipientId] — Firebase Auth UID of the recipient (used for block check)
 * @param {string} params.text        — Raw message text from the input
 * @returns {Promise<void>}
 * @throws {Error} If text is empty after trimming, or required params are missing
 */
export async function sendDMMessage({ conversationId, senderId, recipientId, text }) {
  if (!conversationId) throw new Error('conversationId is required');
  if (!senderId) throw new Error('senderId is required');

  const trimmed = text?.trim() ?? '';
  if (!trimmed) throw new Error('Message cannot be empty');

  const safeText = trimmed.slice(0, MAX_MESSAGE_LENGTH);

  // ── Suspension guard ────────────────────────────────────────────────────────
  // Mirrors the same pattern used in presenceService.checkIn and runService.
  // Supports timed suspensions: if suspensionEndsAt has passed, allow through.
  const senderSnap = await getDoc(doc(db, 'users', senderId));
  if (senderSnap.exists()) {
    const senderData = senderSnap.data();
    if (senderData?.isSuspended === true) {
      const endsAt = senderData?.suspensionEndsAt?.toDate?.();
      if (!endsAt || endsAt > new Date()) {
        throw new Error('Your account is suspended. You cannot send messages.');
      }
    }
  }

  // ── Block guard ─────────────────────────────────────────────────────────────
  // Check if the recipient has blocked the sender. We read the recipient's doc
  // (not the sender's) so the blocked user gets no explicit signal — the send
  // just silently fails on the client (text is restored in the input).
  if (recipientId) {
    const recipientSnap = await getDoc(doc(db, 'users', recipientId));
    if (recipientSnap.exists()) {
      const blockedUsers = recipientSnap.data()?.blockedUsers || [];
      if (blockedUsers.includes(senderId)) {
        throw new Error('Message could not be sent.');
      }
    }
  }

  // Write the message doc first — this is the authoritative record.
  const messagesRef = collection(db, 'conversations', conversationId, 'messages');
  await addDoc(messagesRef, {
    senderId,
    text: safeText,
    createdAt: serverTimestamp(),
  });

  // Update conversation metadata after the message lands.
  // Dot-notation field path updates only this participant's lastSeenAt key.
  const conversationRef = doc(db, 'conversations', conversationId);
  await updateDoc(conversationRef, {
    lastMessage: { text: safeText, senderId, createdAt: serverTimestamp() },
    lastActivityAt: serverTimestamp(),
    [`lastSeenAt.${senderId}`]: serverTimestamp(),
  });
}

/**
 * markConversationSeen — Records that the current user has viewed this conversation.
 *
 * Updates `lastSeenAt.{uid}` on the conversation doc using a dot-notation field
 * path so only this user's entry is affected. The inbox uses this to determine
 * whether to show the unread indicator.
 *
 * Called on DMConversationScreen mount. Non-critical — failure is silently
 * swallowed so a failed write doesn't crash the chat experience.
 *
 * @param {string} conversationId
 * @param {string} uid — Firebase Auth UID of the current user
 * @returns {Promise<void>}
 */
export async function markConversationSeen(conversationId, uid) {
  if (!conversationId || !uid) return;

  const conversationRef = doc(db, 'conversations', conversationId);
  await updateDoc(conversationRef, {
    [`lastSeenAt.${uid}`]: serverTimestamp(),
  }).catch((err) => {
    // Non-critical — user just sees the unread dot a bit longer. Don't crash.
    if (__DEV__) console.warn('[dmService] markConversationSeen error:', err.code);
  });
}

/**
 * blockUser — Adds `targetUid` to the current user's `blockedUsers` array.
 *
 * Written to `users/{currentUid}` using arrayUnion so the operation is
 * idempotent — blocking the same user twice has no effect. The blocked user
 * receives no notification.
 *
 * @param {string} currentUid — Firebase Auth UID of the user doing the blocking
 * @param {string} targetUid  — Firebase Auth UID of the user being blocked
 * @returns {Promise<void>}
 */
export async function blockUser(currentUid, targetUid) {
  if (!currentUid || !targetUid) throw new Error('Both UIDs are required');
  if (currentUid === targetUid) throw new Error('Cannot block yourself');

  const userRef = doc(db, 'users', currentUid);
  await updateDoc(userRef, {
    blockedUsers: arrayUnion(targetUid),
  });
}

/**
 * unblockUser — Removes `targetUid` from the current user's `blockedUsers` array.
 *
 * Written to `users/{currentUid}` using arrayRemove. Idempotent — unblocking
 * a user who is not blocked has no effect.
 *
 * @param {string} currentUid — Firebase Auth UID of the user doing the unblocking
 * @param {string} targetUid  — Firebase Auth UID of the user being unblocked
 * @returns {Promise<void>}
 */
export async function unblockUser(currentUid, targetUid) {
  if (!currentUid || !targetUid) throw new Error('Both UIDs are required');

  const userRef = doc(db, 'users', currentUid);
  await updateDoc(userRef, {
    blockedUsers: arrayRemove(targetUid),
  });
}

/**
 * getConversationMuteState — One-shot read of whether the current user has muted
 * a conversation.
 *
 * Reads `mutedBy.{uid}` from the conversation doc. Called on DMConversationScreen
 * mount to initialize the mute toggle. Not a real-time subscription — mute state
 * only changes via explicit user action (muteConversation / unmuteConversation).
 *
 * @param {string} conversationId
 * @param {string} uid — Firebase Auth UID of the current user
 * @returns {Promise<boolean>} true if the conversation is muted by this user
 */
export async function getConversationMuteState(conversationId, uid) {
  if (!conversationId || !uid) return false;
  try {
    const snap = await getDoc(doc(db, 'conversations', conversationId));
    if (!snap.exists()) return false;
    return snap.data()?.mutedBy?.[uid] === true;
  } catch (err) {
    if (__DEV__) console.warn('[dmService] getConversationMuteState error:', err);
    return false;
  }
}

/**
 * muteConversation — Mutes push notifications for a conversation for the current user.
 *
 * Writes `mutedBy.{uid}: true` to the conversation doc using dot-notation so only
 * this user's mute entry is affected. The `onDmMessageCreated` Cloud Function
 * checks this field and skips the notification when it is true.
 *
 * Mute is indefinite — unmute manually via unmuteConversation.
 * Messages still arrive normally; only push notifications are suppressed.
 *
 * @param {string} conversationId
 * @param {string} uid — Firebase Auth UID of the current user
 * @returns {Promise<void>}
 */
export async function muteConversation(conversationId, uid) {
  if (!conversationId || !uid) throw new Error('conversationId and uid are required');

  const conversationRef = doc(db, 'conversations', conversationId);
  await updateDoc(conversationRef, {
    [`mutedBy.${uid}`]: true,
  });
}

/**
 * unmuteConversation — Re-enables push notifications for a conversation.
 *
 * Removes `mutedBy.{uid}` from the conversation doc using deleteField().
 * The `onDmMessageCreated` Cloud Function will resume sending notifications.
 *
 * @param {string} conversationId
 * @param {string} uid — Firebase Auth UID of the current user
 * @returns {Promise<void>}
 */
export async function unmuteConversation(conversationId, uid) {
  if (!conversationId || !uid) throw new Error('conversationId and uid are required');

  const conversationRef = doc(db, 'conversations', conversationId);
  await updateDoc(conversationRef, {
    [`mutedBy.${uid}`]: deleteField(),
  });
}
