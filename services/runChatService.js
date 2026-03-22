/**
 * runChatService.js — Run Chat Service
 *
 * Handles real-time messaging for group run chats.
 * Each run has a `messages` subcollection under `runs/{runId}/messages`.
 *
 * Rules:
 *  - Messages are ordered by createdAt ASC (oldest → newest)
 *  - serverTimestamp() is used for createdAt (consistent ordering across devices)
 *  - id is NOT stored inside the document (derived from doc.id on read)
 *  - Text is trimmed and capped at 500 characters before writing
 *  - Empty messages are rejected
 */

import { db } from '../config/firebase';
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';

const MAX_MESSAGE_LENGTH = 500;

/**
 * RUN_CHAT_EXPIRY_MS — How long a run's group chat stays active after startTime.
 *
 * Single source of truth for expiration duration. Imported by:
 *   - runService.js      → writes chatExpiresAt on run creation
 *   - useMyRunChats.js   → filters expired chats out of the Messages inbox
 *   - RunChatScreen.js   → enforces read-only state after expiry
 *
 * Default: 4 hours (14_400_000 ms). Adjust here to change it everywhere.
 */
export const RUN_CHAT_EXPIRY_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * subscribeToRunMessages — Real-time listener for a run's chat messages.
 *
 * Subscribes to `runs/{runId}/messages` ordered by createdAt ASC.
 * Calls `callback(messages, null)` on each successful snapshot.
 * Calls `callback([], error)` on Firestore error (e.g. permission-denied)
 * so the caller can handle it gracefully rather than hanging on a loading state
 * or causing an unhandled error in the React Native dev overlay.
 *
 * @param {string} runId — Firestore run document ID.
 * @param {function(object[], Error|null): void} callback
 *   Called with (messages, null) on success; ([], error) on failure.
 * @returns {function} Unsubscribe function — call on screen unmount.
 */
export function subscribeToRunMessages(runId, callback) {
  const messagesRef = collection(db, 'runs', runId, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'asc'));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const messages = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      callback(messages, null);
    },
    (error) => {
      // Surface the error to the caller so it can show a clean UI state.
      // This prevents the component from hanging on a spinner when Firestore
      // returns permission-denied (e.g. if rules deny a read we didn't expect).
      if (__DEV__) console.warn('[runChatService] subscribeToRunMessages error:', error.code, error.message);
      callback([], error);
    },
  );

  return unsubscribe;
}

/**
 * sendRunMessage — Writes a new message to a run's chat subcollection.
 *
 * Trims the text, rejects empty messages, enforces max length,
 * then writes the document using serverTimestamp() for createdAt.
 *
 * @param {object} params
 * @param {string} params.runId        — Firestore run document ID.
 * @param {string} params.senderId     — Firebase Auth UID of the sender.
 * @param {string} params.senderName   — Display name of the sender (denormalized).
 * @param {string|null} params.senderAvatar — Avatar URL of the sender (denormalized), or null.
 * @param {string} params.text         — Raw message text from the input.
 * @returns {Promise<void>}
 * @throws {Error} If text is empty after trimming, or if senderId/runId are missing.
 */
export async function sendRunMessage({ runId, senderId, senderName, senderAvatar, text }) {
  if (!runId) throw new Error('runId is required');
  if (!senderId) throw new Error('senderId is required');

  const trimmed = text?.trim() ?? '';
  if (!trimmed) throw new Error('Message cannot be empty');

  const safeText = trimmed.slice(0, MAX_MESSAGE_LENGTH);

  const messagesRef = collection(db, 'runs', runId, 'messages');

  await addDoc(messagesRef, {
    senderId,
    senderName: senderName || 'Player',
    senderAvatar: senderAvatar || null,
    text: safeText,
    createdAt: serverTimestamp(),
    type: 'text',
  });

  // Stamp lastMessageAt on the run doc so useMyRunChats can detect unread chats.
  // Fire-and-forget — never blocks sending and never throws to the caller.
  updateDoc(doc(db, 'runs', runId), { lastMessageAt: serverTimestamp() }).catch(() => {});
}

/**
 * markRunChatSeen — Records that the current user has viewed this run chat.
 *
 * Writes `lastReadAt` to the `runParticipants/{runId}_{uid}` document.
 * Used by RunChatScreen on mount so the unread badge clears when the
 * user opens the chat. Matches the markConversationSeen pattern in dmService.
 *
 * @param {string} runId — Firestore run document ID.
 * @param {string} uid   — Firebase Auth UID of the viewing user.
 * @returns {Promise<void>}
 */
export async function markRunChatSeen(runId, uid) {
  if (!runId || !uid) return;
  try {
    await updateDoc(doc(db, 'runParticipants', `${runId}_${uid}`), {
      lastReadAt: serverTimestamp(),
    });
  } catch (err) {
    // Non-fatal — unread count may be stale but app continues normally.
    if (__DEV__) console.warn('[runChatService] markRunChatSeen error:', err.code);
  }
}
