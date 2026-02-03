/**
 * useAuth Hook
 *
 * Provides authentication state and user data.
 *
 * USAGE:
 * const { user, loading } = useAuth();
 *
 * if (loading) return <Loading />;
 * if (!user) return <LoginScreen />;
 */

import { useState, useEffect } from 'react';
import { auth } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
