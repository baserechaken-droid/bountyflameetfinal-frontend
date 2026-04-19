/**
 * useAuth — Authentication with graceful fallback
 * © Ken Baserecha
 *
 * Mode 1 (Firebase configured): Full email/password + Google auth
 * Mode 2 (No Firebase): Name-only local auth — app still works perfectly
 */
import { useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signInWithPopup,
  GoogleAuthProvider, signOut, updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../lib/firebase';
import { User } from '../types';

const LOCAL_USER_KEY = 'bfm_local_user_v3';

export function useAuth() {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // ── Load local user (fallback when Firebase not configured) ──
  const loadLocalUser = useCallback((): User | null => {
    try {
      const raw = localStorage.getItem(LOCAL_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, []);

  const saveLocalUser = useCallback((u: User) => {
    try { localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(u)); } catch {}
  }, []);

  const clearLocalUser = useCallback(() => {
    try { localStorage.removeItem(LOCAL_USER_KEY); } catch {}
  }, []);

  // ── Auth state listener ───────────────────────────────────────
  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      // No Firebase — restore from localStorage
      const localUser = loadLocalUser();
      setUser(localUser);
      setLoading(false);
      return;
    }

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          if (db) {
            const ref  = doc(db, 'users', fbUser.uid);
            const snap = await getDoc(ref);
            if (snap.exists()) {
              setUser(snap.data() as User);
            } else {
              const newUser: User = {
                uid: fbUser.uid, email: fbUser.email,
                displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
                photoURL: fbUser.photoURL, plan: 'free', createdAt: Date.now(),
              };
              await setDoc(ref, { ...newUser, createdAt: serverTimestamp() });
              setUser(newUser);
            }
          } else {
            setUser({
              uid: fbUser.uid, email: fbUser.email,
              displayName: fbUser.displayName || 'User',
              photoURL: fbUser.photoURL, plan: 'free', createdAt: Date.now(),
            });
          }
        } catch {
          setUser({
            uid: fbUser.uid, email: fbUser.email,
            displayName: fbUser.displayName || 'User',
            photoURL: fbUser.photoURL, plan: 'free', createdAt: Date.now(),
          });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [loadLocalUser]);

  // ── Local name login (when Firebase not configured) ───────────
  const loginWithName = useCallback((name: string) => {
    if (!name.trim()) return;
    const localUser: User = {
      uid: `local_${Date.now()}`, email: null,
      displayName: name.trim(), photoURL: null,
      plan: 'free', createdAt: Date.now(),
    };
    saveLocalUser(localUser);
    setUser(localUser);
  }, [saveLocalUser]);

  // ── Firebase email sign in ────────────────────────────────────
  const signInEmail = useCallback(async (email: string, password: string): Promise<boolean> => {
    if (!isFirebaseConfigured || !auth) { setError('Firebase not configured'); return false; }
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return true;
    } catch (e: any) { setError(friendlyError(e.code)); return false; }
  }, []);

  // ── Firebase register ─────────────────────────────────────────
  const registerEmail = useCallback(async (name: string, email: string, password: string): Promise<boolean> => {
    if (!isFirebaseConfigured || !auth) { setError('Firebase not configured'); return false; }
    setError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      return true;
    } catch (e: any) { setError(friendlyError(e.code)); return false; }
  }, []);

  // ── Google sign in ────────────────────────────────────────────
  const signInGoogle = useCallback(async (): Promise<boolean> => {
    if (!isFirebaseConfigured || !auth) { setError('Firebase not configured'); return false; }
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
      return true;
    } catch (e: any) {
      if (e.code !== 'auth/popup-closed-by-user') setError(friendlyError(e.code));
      return false;
    }
  }, []);

  // ── Password reset ────────────────────────────────────────────
  const resetPassword = useCallback(async (email: string): Promise<boolean> => {
    if (!isFirebaseConfigured || !auth) { setError('Firebase not configured'); return false; }
    setError(null);
    try { await sendPasswordResetEmail(auth, email); return true; }
    catch (e: any) { setError(friendlyError(e.code)); return false; }
  }, []);

  // ── Logout ────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    if (isFirebaseConfigured && auth) await signOut(auth).catch(() => {});
    clearLocalUser();
    setUser(null);
  }, [clearLocalUser]);

  // ── Upgrade plan (local — real upgrade done via payment webhook) ──
  const upgradePlan = useCallback((plan: 'pro' | 'enterprise') => {
    setUser(prev => prev ? { ...prev, plan } : null);
    if (isFirebaseConfigured === false) {
      const raw = localStorage.getItem(LOCAL_USER_KEY);
      if (raw) {
        const u = JSON.parse(raw);
        u.plan = plan;
        localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(u));
      }
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    user, loading, error, isFirebaseConfigured,
    loginWithName, signInEmail, registerEmail,
    signInGoogle, resetPassword, logout,
    upgradePlan, clearError,
  };
}

function friendlyError(code: string): string {
  const m: Record<string, string> = {
    'auth/user-not-found':       'No account found with this email',
    'auth/wrong-password':       'Incorrect password',
    'auth/email-already-in-use': 'Email already registered',
    'auth/weak-password':        'Password needs at least 6 characters',
    'auth/invalid-email':        'Invalid email address',
    'auth/too-many-requests':    'Too many attempts — try later',
    'auth/network-request-failed': 'Network error — check connection',
    'auth/invalid-credential':   'Invalid email or password',
    'auth/popup-blocked':        'Popup blocked — allow popups for this site',
  };
  return m[code] || 'Something went wrong — try again';
}
