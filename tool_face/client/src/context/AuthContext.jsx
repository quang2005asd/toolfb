import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import authApi from '../services/authApi';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check auth once on application mount or when navigating to protected route
  useEffect(() => {
    if (!router.isReady) return;
    
    // On login page or root, do not force redirect
    if (router.pathname === '/login' || router.pathname === '/') {
      setLoading(false);
      return;
    }

    // If user is already loaded, no need to refetch
    if (user) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    authApi.me()
      .then((result) => {
        if (active) {
          setUser(result.user);
        }
      })
      .catch(() => {
        if (active) {
          setUser(null);
          const returnUrl = router.asPath || '/';
          router.replace(`/login?next=${encodeURIComponent(returnUrl)}`);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [router.isReady, router.pathname, user]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      await router.replace('/login?loggedOut=1');
    }
  }, [router]);

  const refreshUser = useCallback(async () => {
    try {
      const result = await authApi.me();
      setUser(result.user);
      return result.user;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    logout,
    refreshUser,
    setUser
  }), [user, loading, logout, refreshUser]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default useAuth;
