/**
 * useUserClips.js — Real-time User Clips Hook
 *
 * Subscribes to a user's clips in Firestore, ordered by createdAt descending.
 * Used by ProfileScreen and UserProfileScreen to display a player's clip reel.
 *
 * Returns resolved video download URLs and thumbnail URIs so the consuming
 * screen can render clip tiles immediately without additional async work.
 *
 * Query: gymClips where uploaderUid == uid, orderBy createdAt desc, limit 20.
 * Uses composite index: uploaderUid ASC + createdAt DESC (added in Phase 1).
 *
 * Client-side filters:
 *   • status must be 'ready' or 'ready_raw'
 *   • storagePath must exist
 *   • isHidden !== true
 *
 * @example
 * const { clips, videoUrls, thumbnails, loading, error } = useUserClips(userId);
 */

import { useState, useEffect, useRef } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { db } from '../config/firebase';

/**
 * isReadyClip — Client-side filter matching the gym feed logic in
 * RunDetailsScreen. A clip is "ready" if it has been finalized (status
 * 'ready' or 'ready_raw'), has a playable storagePath, and is not hidden.
 */
const isReadyClip = (c) =>
  (c.status === 'ready' || c.status === 'ready_raw') &&
  !!c.storagePath &&
  !!c.createdAt &&
  !c.isHidden;

/**
 * useUserClips — Hook for real-time clips belonging to a specific user.
 *
 * @param {string | null} uid — The user ID whose clips to fetch.
 * @returns {{
 *   clips: object[],               Filtered, ready clip documents.
 *   videoUrls: Record<string, string>,  Download URLs keyed by clip ID.
 *   thumbnails: Record<string, string>, Thumbnail URIs keyed by clip ID.
 *   loading: boolean,              True while the initial snapshot is pending.
 *   error: string | null           Error message if the subscription fails.
 * }}
 */
export const useUserClips = (uid) => {
  const [clips, setClips] = useState([]);
  const [videoUrls, setVideoUrls] = useState({});
  const [thumbnails, setThumbnails] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Prevent duplicate async work across rapid snapshot re-fires.
  const resolvedIdsRef = useRef(new Set());

  useEffect(() => {
    if (!uid) {
      setClips([]);
      setVideoUrls({});
      setThumbnails({});
      setLoading(false);
      setError(null);
      resolvedIdsRef.current.clear();
      return;
    }

    setLoading(true);
    setError(null);
    resolvedIdsRef.current.clear();

    const clipsQuery = query(
      collection(db, 'gymClips'),
      where('uploaderUid', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    /**
     * resolveClipMedia — For each new clip, fetches the Firebase Storage
     * download URL and generates a thumbnail (backend path first, then
     * client-side fallback via expo-video-thumbnails).
     */
    const resolveClipMedia = (clipList) => {
      const storage = getStorage();
      clipList
        .filter((c) => c.storagePath && !resolvedIdsRef.current.has(c.id))
        .forEach(async (c) => {
          resolvedIdsRef.current.add(c.id);

          // Step 1: download URL
          let url;
          try {
            url = await getDownloadURL(ref(storage, c.storagePath));
            setVideoUrls((prev) => {
              if (prev[c.id]) return prev;
              return { ...prev, [c.id]: url };
            });
          } catch (err) {
            console.warn('[useUserClips] getDownloadURL failed for', c.id, err.message);
            resolvedIdsRef.current.delete(c.id);
            return;
          }

          // Step 2: thumbnail — backend thumbnail first, then client-side fallback
          if (c.status === 'ready_processed' && c.thumbnailPath) {
            try {
              const thumbUrl = await getDownloadURL(ref(storage, c.thumbnailPath));
              setThumbnails((prev) => {
                if (prev[c.id]) return prev;
                return { ...prev, [c.id]: thumbUrl };
              });
              return;
            } catch {
              // Fall through to client-side generation.
            }
          }
          try {
            const thumb = await VideoThumbnails.getThumbnailAsync(url, { time: 0 });
            setThumbnails((prev) => {
              if (prev[c.id]) return prev;
              return { ...prev, [c.id]: thumb.uri };
            });
          } catch {
            // Non-fatal — tile shows dark placeholder.
          }
        });
    };

    const unsubscribe = onSnapshot(
      clipsQuery,
      (snap) => {
        const readyList = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter(isReadyClip);
        setClips(readyList);
        setLoading(false);
        resolveClipMedia(readyList);
      },
      (err) => {
        console.error('[useUserClips] error:', err.code, err.message);
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [uid]);

  return { clips, videoUrls, thumbnails, loading, error };
};

export default useUserClips;
