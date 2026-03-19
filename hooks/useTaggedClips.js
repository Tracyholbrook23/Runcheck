/**
 * useTaggedClips.js — Fetch clips a user is tagged in
 *
 * Uses a native Firestore array-contains query on `taggedUserIds` — a flat
 * string array written by the `finalizeClipUpload` Cloud Function that mirrors
 * `taggedPlayers[].uid`. This avoids the V1 approach of fetching 100 recent
 * clips and filtering client-side.
 *
 * Returns two separate lists:
 *   - allTagged: every clip the user is tagged in (for "Tagged In" on own profile)
 *   - featuredIn: clips where the user's tag has addedToProfile === true
 *                 (for "Featured In" on any profile)
 *
 * Also resolves video download URLs and thumbnails, matching the pattern in
 * useUserClips.js.
 *
 * @example
 * const { allTagged, featuredIn, videoUrls, thumbnails, loading } = useTaggedClips(userId);
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection,
  query,
  orderBy,
  where,
  getDocs,
} from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { db } from '../config/firebase';

/**
 * isVisibleClip — same readiness check as useUserClips: clip must be
 * finalized, have a playable storagePath, and not be hidden or deleted.
 */
const isVisibleClip = (c) =>
  (c.status === 'ready' || c.status === 'ready_raw') &&
  !!c.storagePath &&
  !!c.createdAt &&
  !c.isHidden &&
  !c.isDeletedByUser;

export const useTaggedClips = (uid) => {
  const [allTagged, setAllTagged] = useState([]);
  const [featuredIn, setFeaturedIn] = useState([]);
  const [videoUrls, setVideoUrls] = useState({});
  const [thumbnails, setThumbnails] = useState({});
  const [loading, setLoading] = useState(true);

  const resolvedIdsRef = useRef(new Set());
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  useEffect(() => {
    if (!uid) {
      setAllTagged([]);
      setFeaturedIn([]);
      setVideoUrls({});
      setThumbnails({});
      setLoading(false);
      resolvedIdsRef.current.clear();
      return;
    }

    setLoading(true);
    resolvedIdsRef.current.clear();

    (async () => {
      try {
        // Native array-contains query on taggedUserIds — written by finalizeClipUpload
        // Cloud Function as a flat mirror of taggedPlayers[].uid.
        const clipsQuery = query(
          collection(db, 'gymClips'),
          where('taggedUserIds', 'array-contains', uid),
          orderBy('createdAt', 'desc'),
        );
        const snap = await getDocs(clipsQuery);

        const all = [];
        const featured = [];

        snap.docs.forEach((d) => {
          const data = { id: d.id, ...d.data() };
          if (!isVisibleClip(data)) return;

          all.push(data);

          // featuredIn: tagged entry where this user approved it for their profile
          const tagEntry = Array.isArray(data.taggedPlayers)
            ? data.taggedPlayers.find((p) => p.uid === uid)
            : null;
          if (tagEntry?.addedToProfile === true) {
            featured.push(data);
          }
        });

        setAllTagged(all);
        setFeaturedIn(featured);

        // Resolve media for all tagged clips
        resolveClipMedia(all);
      } catch (err) {
        if (__DEV__) console.error('[useTaggedClips] error:', err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [uid, fetchKey]);

  const resolveClipMedia = (clipList) => {
    const storage = getStorage();
    clipList
      .filter((c) => c.storagePath && !resolvedIdsRef.current.has(c.id))
      .forEach(async (c) => {
        resolvedIdsRef.current.add(c.id);

        let url;
        try {
          url = await getDownloadURL(ref(storage, c.storagePath));
          setVideoUrls((prev) => (prev[c.id] ? prev : { ...prev, [c.id]: url }));
        } catch (err) {
          if (__DEV__) console.warn('[useTaggedClips] getDownloadURL failed for', c.id, err.message);
          resolvedIdsRef.current.delete(c.id);
          return;
        }

        try {
          const thumb = await VideoThumbnails.getThumbnailAsync(url, { time: 0 });
          setThumbnails((prev) => (prev[c.id] ? prev : { ...prev, [c.id]: thumb.uri }));
        } catch {
          // Non-fatal — tile shows dark placeholder.
        }
      });
  };

  return { allTagged, featuredIn, videoUrls, thumbnails, loading, refetch };
};

export default useTaggedClips;
