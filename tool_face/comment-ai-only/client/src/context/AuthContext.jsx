import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import authApi from '../services/authApi';

const AuthContext = createContext(null);
const PUBLIC_PATHS = new Set(['/login']);

export function AuthProvider({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!router.isReady) return undefined;
    if (PUBLIC_PATHS.has(router.pathname)) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    authApi.me()
      .then((result) => {
        if (active) setUser(result.user);
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        router.replace(`/login?next=${encodeURIComponent(router.asPath || '/comment-ai')}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [router.isReady, router.pathname]);

  const signIn = useCallback((nextUser) => setUser(nextUser), []);
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      await router.replace('/login');
    }
  }, [router]);

  const value = useMemo(() => ({ user, loading, signIn, logout }), [user, loading, signIn, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within an AuthProvider');
  return value;
}
