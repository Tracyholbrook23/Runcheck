/**
 * useIsAdmin.js — Admin Role Check Hook
 *
 * Reads the signed-in user's Firestore profile document and checks whether
 * the `isAdmin` field is `true`. Used to gate admin-only UI and screens.
 *
 * This hook uses a one-shot `getDoc` rather than a real-time listener because
 * admin status changes are extremely rare and don't need live reactivity.
 *
 * To grant admin access to a user, set `isAdmin: true` on their
 * `users/{uid}` document in the Firebase Console.
 *
 * @example
 * const { isAdmin, loading } = useIsAdmin();
 * if (loading) return <Spinner />;
 * if (!isAdmin) return <AccessDenied />;
 */

import { useState, useEffect } from 'react';
import { auth, db } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';

/**
 * useIsAdmin — One-shot check for admin role on the current user.
 *
 * @returns {{
 *   isAdmin: boolean,   True if users/{uid}.isAdmin === true.
 *   loading: boolean,   True while the check is in flight.
 * }}
 */
export const useIsAdmin = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;

    if (!uid) {
      setLoading(false);
      return;
    }

    getDoc(doc(db, 'users', uid))
      .then((snap) => {
        setIsAdmin(snap.exists() && snap.data().isAdmin === true);
      })
      .catch((err) => {
        if (__DEV__) console.error('useIsAdmin error:', err);
        setIsAdmin(false);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return { isAdmin, loading };
};

export default useIsAdmin;
