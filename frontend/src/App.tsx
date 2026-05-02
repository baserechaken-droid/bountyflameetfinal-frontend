/**
 * App.tsx — Root with complete Auth Context
 * © Ken Baserecha — Boutyflameet
 *
 * FIX: All auth methods exposed through context so components
 * never need to call useAuth() directly (which creates a second
 * instance with separate state, causing sign-in to not reflect).
 */
import React, { createContext, useContext } from 'react';
import { Routes, Route } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { LobbyPage }   from './pages/LobbyPage';
import { MeetingPage } from './pages/MeetingPage';
import { useAuth }     from './hooks/useAuth';
import { User }        from './types';

// ── Complete auth context — every method available app-wide ──
interface AuthCtx {
  user:                 User | null;
  loading:              boolean;
  error:                string | null;
  logout:               () => Promise<void>;
  upgradePlan:          (plan: 'pro' | 'enterprise', expiresAt?: number) => void;
  isFirebaseConfigured: boolean;
  loginWithName:        (name: string) => void;
  signInEmail:          (email: string, pass: string) => Promise<boolean>;
  registerEmail:        (name: string, email: string, pass: string) => Promise<boolean>;
  signInGoogle:         () => Promise<boolean>;
  resetPassword:        (email: string) => Promise<boolean>;
  clearError:           () => void;
}

const AuthContext = createContext<AuthCtx>({
  user: null, loading: false, error: null,
  logout: async () => {}, upgradePlan: () => {},
  isFirebaseConfigured: false,
  loginWithName:  () => {},
  signInEmail:    async () => false,
  registerEmail:  async () => false,
  signInGoogle:   async () => false,
  resetPassword:  async () => false,
  clearError:     () => {},
});

export const useAppAuth = () => useContext(AuthContext);

export default function App() {
  const auth = useAuth();

  if (auth.loading) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <img src="/logo.jpeg" alt="Boutyflameet"
            className="w-16 h-16 rounded-full object-cover animate-flame-pulse"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}/>
          <div className="flex gap-1.5">
            {[0,1,2].map(i => (
              <span key={i} className="w-2.5 h-2.5 rounded-full bg-flame-500 animate-bounce"
                style={{ animationDelay: `${i*0.15}s` }}/>
            ))}
          </div>
          <p className="text-white/40 text-sm">Loading Boutyflameet…</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{
      user:                 auth.user,
      loading:              auth.loading,
      error:                auth.error,
      logout:               auth.logout,
      upgradePlan:          auth.upgradePlan,
      isFirebaseConfigured: auth.isFirebaseConfigured,
      loginWithName:        auth.loginWithName,
      signInEmail:          auth.signInEmail,
      registerEmail:        auth.registerEmail,
      signInGoogle:         auth.signInGoogle,
      resetPassword:        auth.resetPassword,
      clearError:           auth.clearError,
    }}>
      <Routes>
        <Route path="/"             element={<LandingPage />} />
        <Route path="/lobby"        element={<LobbyPage />} />
        <Route path="/join/:roomId" element={<MeetingPage />} />
        <Route path="*"             element={<LobbyPage />} />
      </Routes>
    </AuthContext.Provider>
  );
}
