import '../styles/globals.css';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import { AuthProvider } from '../context/AuthContext';

axios.defaults.withCredentials = true;

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    // 1. Eagerly prefetch main functional routes during idle time
    const routesToPrefetch = [
      '/dashboard',
      '/ai-studio',
      '/post-planner/compose',
      '/post-planner/list',
      '/post-planner/calendar',
      '/channels',
      '/post-planner/bulk-upload',
      '/post-planner/dashboard'
    ];

    const timer = setTimeout(() => {
      routesToPrefetch.forEach((path) => {
        try {
          router.prefetch(path);
        } catch {
          // ignore
        }
      });
    }, 200);

    // 2. High-speed route transition feedback bar
    const handleStart = (url) => {
      if (url !== router.asPath) {
        setNavigating(true);
      }
    };
    const handleComplete = () => setNavigating(false);
    const handleError = () => setNavigating(false);

    router.events.on('routeChangeStart', handleStart);
    router.events.on('routeChangeComplete', handleComplete);
    router.events.on('routeChangeError', handleError);

    return () => {
      clearTimeout(timer);
      router.events.off('routeChangeStart', handleStart);
      router.events.off('routeChangeComplete', handleComplete);
      router.events.off('routeChangeError', handleError);
    };
  }, [router]);

  return (
    <AuthProvider>
      {/* Top glowing neon beam during navigation */}
      {navigating && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: 'linear-gradient(90deg, #00f2fe, #8b5cf6, #ec4899, #00f2fe)',
            backgroundSize: '200% 100%',
            animation: 'rgb-line 1s linear infinite',
            zIndex: 99999,
            boxShadow: '0 0 16px rgba(0, 242, 254, 0.9)',
            pointerEvents: 'none'
          }}
        />
      )}
      <Component {...pageProps} />
    </AuthProvider>
  );
}