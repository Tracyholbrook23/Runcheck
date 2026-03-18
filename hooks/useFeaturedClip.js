/**
 * useFeaturedClip.js — Real-time Featured Clip Spotlight Hook
 *
 * Subscribes to the most recently featured clips in Firestore and returns
 * exactly one valid clip for the Home screen spotlight card.
 *
 * Query: gymClips where isDailyHighlight == true, orderBy featuredAt desc, limit 5.
 * The small over-fetch lets client-side filtering always find a valid candidate
 * even if some featured clips have since been hidden or expired.
 *
 * Client-side filters:
 *   • isHidden !== true
 *   • status is 'ready' or 'ready_raw'
 *   • storagePath exists
 *   • featuredAt exists and is within 24 hours
 *
 * Resolves the video download URL and thumbnail (backend path first, then
 * client-side expo-video-thumbnails fallback).
 *
 * Also resolves uploader name/photo and gym name from the gyms array.
 *
 * @example
 * const { clip, videoUrl, thumbnail, uploaderInfo, gymName, loading, error } = useFeaturedClip(gyms);
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
import { doc, getDoc } from 'firebase/firestore';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { db } from '../config/firebase';

/** Visibility window: featured clips older than this are hidden from the spotlight. */
const FEATURED_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * isFeaturedClipValid — Client-side eligibility check for the spotlight.
 *
 * @param {object} c - Clip document data (with `id` field merged in).
 * @returns {boolean}
 */
const isFeaturedClipValid = (c) => {
  if (c.isHidden === true) return false;
  if (c.isDeletedByUser === true) return false;
  if (c.status !== 'ready' && c.status !== 'ready_raw') return false;
  if (!c.storagePath) return false;
  if (!c.featuredAt) return false;

  const featuredDate = c.featuredAt.toDate ? c.featuredAt.toDate() : new Date(c.featuredAt);
  return Date.now() - featuredDate.getTime() < FEATURED_WINDOW_MS;
};

/**
 * useFeaturedClip — Hook returning a single featured clip for the Home spotlight.
 *
 * @param {object[]} gyms — Full gyms array from useGyms, used to resolve gym names.
 * @returns {{
 *   clip: object | null,
 *   videoUrl: string | null,
 *   thumbnail: string | null,
 *   uploaderInfo: { name: string, photoURL: string | null } | null,
 *   gymName: string | null,
 *   loading: boolean,
 *   error: string | null,
 * }}
 */
export const useFeaturedClip = (gyms) => {
  const [clip, setClip] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [thumbnail, setThumbnail] = useState(null);
  const [uploaderInfo, setUploaderInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Track the clip ID we've already resolved media for to avoid duplicate work.
  const resolvedClipIdRef = useRef(null);

  // ── Step 1: Real-time subscription to featured clips ───────────────────
  useEffect(() => {
    const featuredQuery = query(
      collection(db, 'gymClips'),
      where('isDailyHighlight', '==', true),
      orderBy('featuredAt', 'desc'),
      limit(5)
    );

    const unsubscribe = onSnapshot(
      featuredQuery,
      (snap) => {
        const candidates = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter(isFeaturedClipValid);

        const best = candidates.length > 0 ? candidates[0] : null;
        setClip(best);
        setLoading(false);

        // Clear media if the selected clip changed
        if (!best || best.id !== resolvedClipIdRef.current) {
          setVideoUrl(null);
          setThumbnail(null);
          setUploaderInfo(null);
          resolvedClipIdRef.current = null;
        }
      },
      (err) => {
        if (__DEV__) console.error('[useFeaturedClip] onSnapshot error:', err.code, err.message);
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  // ── Step 2: Resolve video URL, thumbnail, and uploader when clip changes ─
  useEffect(() => {
    if (!clip) return;
    if (clip.id === resolvedClipIdRef.current) return; // already resolving/resolved
    resolvedClipIdRef.current = clip.id;

    let cancelled = false;
    const storage = getStorage();

    (async () => {
      // Video URL
      let url = null;
      try {
        url = await getDownloadURL(ref(storage, clip.storagePath));
        if (!cancelled) setVideoUrl(url);
      } catch (err) {
        if (__DEV__) console.warn('[useFeaturedClip] getDownloadURL failed:', err.message);
        return;
      }

      // Thumbnail — backend first, then client-side fallback
      if (clip.thumbnailPath) {
        try {
          const thumbUrl = await getDownloadURL(ref(storage, clip.thumbnailPath));
          if (!cancelled) { setThumbnail(thumbUrl); }
        } catch {
          // Fall through to client-side
          if (url) {
            try {
              const thumb = await VideoThumbnails.getThumbnailAsync(url, { time: 0 });
              if (!cancelled) setThumbnail(thumb.uri);
            } catch { /* placeholder will show */ }
          }
        }
      } else if (url) {
        try {
          const thumb = await VideoThumbnails.getThumbnailAsync(url, { time: 0 });
          if (!cancelled) setThumbnail(thumb.uri);
        } catch { /* placeholder will show */ }
      }

      // Uploader info
      if (clip.uploaderUid) {
        try {
          const userSnap = await getDoc(doc(db, 'users', clip.uploaderUid));
          if (!cancelled && userSnap.exists()) {
            const d = userSnap.data();
            setUploaderInfo({ name: d.name || 'Player', photoURL: d.photoURL || null });
          }
        } catch { /* ignore — will show without uploader */ }
      }
    })();

    return () => { cancelled = true; };
  }, [clip]);

  // ── Gym name resolution from the already-loaded gyms array ─────────────
  const gymName = clip?.gymId && gyms?.length
    ? (gyms.find((g) => g.id === clip.gymId)?.name || null)
    : null;

  return { clip, videoUrl, thumbnail, uploaderInfo, gymName, loading, error };
};

export default useFeaturedClip;
