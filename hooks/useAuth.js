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
 * @example
 * const { user, loading, isAuthenticated } = useAuth();
 * if (loading) return <Spinner />;
 * if (!isAuthenticated) return <LoginScreen />;
 */

import { useState, useEffect } from 'react';
import { auth } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';

/**
 * useAuth — Hook for tracking Firebase authentication state.
 *
 * @returns {{
 *   user: import('firebase/auth').User | null,  Current Firebase user object, or null if signed out.
 *   loading: boolean,                           True while the initial auth state is being resolved.
 *   isAuthenticated: boolean,                   Shorthand boolean — true when a user is signed in.
 *   userId: string | null                       The current user's UID, or null if not signed in.
 * }}
 */
export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Subscribe to auth state changes. The returned function unsubscribes on cleanup.
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return {
    user,
    loading,
    isAuthenticated: !!user,
    userId: user?.uid || null,
  };
};

export default useAuth;
