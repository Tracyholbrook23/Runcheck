/**
 * useProfile.js — Authenticated User Profile Hook
 *
 * Subscribes to the signed-in user's Firestore profile document in real time.
 * Provides all profile fields — name, skillLevel, age — along with
 * `followedGyms`, an array of gym IDs the user has followed.
 *
 * Using onSnapshot (rather than a one-time getDoc) means that any screen
 * consuming this hook will automatically reflect follow/unfollow changes
 * made elsewhere in the app without needing a manual refresh.
 *
 * @example
 * const { followedGyms, loading } = useProfile();
 * const isFollowing = followedGyms.includes(gymId);
 */

import { useState, useEffect } from 'react';
import { auth, db } from '../config/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

/**
 * useProfile — Real-time subscription to the current user's Firestore profile.
 *
 * @returns {{
 *   profile: object | null,   Full Firestore profile document data, or null if not loaded.
 *   followedGyms: string[],   Array of gym IDs the user currently follows (empty if none).
 *   loading: boolean,         True while the first snapshot is in flight.
 * }}
 */
export const useProfile = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;

    if (!uid) {
      setLoading(false);
      return;
    }

    // Subscribe to the user's Firestore document — updates automatically when
    // followedGyms (or any other field) changes via arrayUnion / arrayRemove.
    const unsubscribe = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        setProfile(snap.exists() ? snap.data() : null);
        setLoading(false);
      },
      (err) => {
        console.error('useProfile snapshot error:', err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  return {
    profile,
    followedGyms: profile?.followedGyms ?? [],
    loading,
  };
};

export default useProfile;
