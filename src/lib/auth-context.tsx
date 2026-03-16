/**
 * auth-context.tsx — authentication state for the ICT Data Viewer.
 *
 * Provides:
 *   - session / user    — from Supabase auth
 *   - role              — fetched via get_my_role() RPC after sign-in
 *   - isGuest           — true when the user chose "Continue as guest"
 *   - isLoading         — true until the initial session check completes
 *   - enterGuestMode()  — call instead of setGuestMode(); updates both
 *                         sessionStorage and the React state in one step
 *
 * Internal helper exports (storage only, no state update):
 *   - clearGuestMode() — called on sign-in and sign-out
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AppRole = 'ict-member' | 'ict-manager' | 'ict-admin' | null;

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  role: AppRole;
  isGuest: boolean;
  isLoading: boolean;
  enterGuestMode: () => void;
};

// ---------------------------------------------------------------------------
// Guest-mode helpers (sessionStorage so it resets on tab close)
// ---------------------------------------------------------------------------

const GUEST_KEY = 'ict-guest';

export function setGuestMode(): void {
  if (typeof window !== 'undefined') sessionStorage.setItem(GUEST_KEY, 'true');
}

export function clearGuestMode(): void {
  if (typeof window !== 'undefined') sessionStorage.removeItem(GUEST_KEY);
}

function isGuestStored(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(GUEST_KEY) === 'true';
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue>({
  session:        null,
  user:           null,
  role:           null,
  isGuest:        false,
  isLoading:      true,
  enterGuestMode: () => {},
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session,   setSession]   = useState<Session | null>(null);
  const [user,      setUser]      = useState<User | null>(null);
  const [role,      setRole]      = useState<AppRole>(null);
  const [isGuest,   setIsGuest]   = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const enterGuestMode = useCallback(() => {
    setGuestMode();
    setIsGuest(true);
  }, []);

  const fetchRole = useCallback(async () => {
    const { data, error } = await getSupabaseBrowser().rpc('get_my_role');
    if (!error && data) {
      setRole(data as AppRole);
    } else {
      setRole(null);
    }
  }, []);

  useEffect(() => {
    // Restore existing session on mount
    void getSupabaseBrowser().auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setIsGuest(!s && isGuestStored());
      if (s?.user) void fetchRole();
      setIsLoading(false);
    });

    // Subscribe to future auth state changes
    const { data: { subscription } } = getSupabaseBrowser().auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
        setIsGuest(!s && isGuestStored());
        if (s?.user) {
          void fetchRole();
        } else {
          setRole(null);
        }
        setIsLoading(false);
      },
    );

    return () => { subscription.unsubscribe(); };
  }, [fetchRole]);

  return (
    <AuthContext.Provider value={{ session, user, role, isGuest, isLoading, enterGuestMode }}>
      {children}
    </AuthContext.Provider>
  );
}
