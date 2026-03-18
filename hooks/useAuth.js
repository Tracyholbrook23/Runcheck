/**
 * useAuth.js — Firebase Authentication State Hook
 *
 * Subscribes to Firebase Auth's `onAuthStateChanged` listener and
 * exposes the current user, loading state, and convenience flags.
 * The subscription is torn down automatically when the component
 * using this hook unmounts.
 *
 * Because Firebase Auth persists sessions on-device, the hook will
 * re-authenticate silently on app launch — `loading` stays true
 * until that initial check resolves.
 *
 * Also subscribes to the user's Firestore profile document to expose
 * `hasUsername` — used by the navigation gate to route existing users
 * to the ClaimUsername screen when their profile lacks a username.
 *
 * @example
 * const { user, loading, isAuthenticated, emailVerified, hasUsername } = useAuth();
 * if (loading) return <Spinner />;
 * if (!isAuthenticated) return <LoginScreen />;
 * if (!emailVerified) return <VerifyEmailScreen />;
 * if (!hasUsername) return <ClaimUsernameScreen />;
 */

import { useState, useEffect } from 'react';
import { auth, db } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';

/**
 * useAuth — Hook for tracking Firebase authentication state.
 *
 * @returns {{
 *   user: import('firebase/auth').User | null,  Current Firebase user object, or null if signed out.
 *   loading: boolean,                           True while the initial auth state is being resolved.
 *   isAuthenticated: boolean,                   Shorthand boolean — true when a user is signed in.
 *   userId: string | null,                      The current user's UID, or null if not signed in.
 *   emailVerified: boolean,                     True when Firebase Auth confirms the user's email is verified.
 *   hasUsername: boolean,                        True when the user's Firestore profile has a username field.
 *   onboardingCompleted: boolean,               True when the user has completed first-time onboarding.
 *   profileLoading: boolean,                    True while the Firestore profile is being fetched.
 * }}
 */
export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasUsername, setHasUsername] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    // Subscribe to auth state changes. The returned function unsubscribes on cleanup.
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      // If no user, reset profile state immediately
      if (!firebaseUser) {
        setHasUsername(false);
        setOnboardingCompleted(false);
        setProfileLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  // Subscribe to the user's Firestore profile to track username presence
  useEffect(() => {
    if (!user?.uid) {
      setHasUsername(false);
      setOnboardingCompleted(false);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        const data = snap.data();
        setHasUsername(!!data?.username);
        setOnboardingCompleted(!!data?.onboardingCompleted);
        setProfileLoading(false);
      },
      (error) => {
        if (__DEV__) console.error('[useAuth] Profile snapshot error:', error);
        setHasUsername(false);
        setOnboardingCompleted(false);
        setProfileLoading(false);
      },
    );

    return unsubscribe;
  }, [user?.uid]);

  return {
    user,
    loading,
    isAuthenticated: !!user,
    userId: user?.uid || null,
    emailVerified: !!user?.emailVerified,
    hasUsername,
    onboardingCompleted,
    profileLoading,
  };
};

export default useAuth;
