import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import '@/styles/globals.css';
import { AuthProvider, useAuth } from '@/lib/auth-context';

/** Redirects unauthenticated, non-guest users to /login. */
function RouteGuard({ children }: { children: React.ReactNode }) {
  const { isLoading, session, isGuest } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!session && !isGuest && router.pathname !== '/login') {
      void router.replace('/login');
    }
  }, [isLoading, session, isGuest, router]);

  // Suppress flash of protected content while redirecting
  if (isLoading) return null;
  if (!session && !isGuest && router.pathname !== '/login') return null;

  return <>{children}</>;
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <RouteGuard>
        <Component {...pageProps} />
      </RouteGuard>
    </AuthProvider>
  );
}
