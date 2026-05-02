/**
 * useAuth — Authentication with subscription expiry check
 * © Ken Baserecha — Boutyflameet
 *
 * FIXES:
 * 1. Google sign-in: popup with redirect fallback for mobile/blocked popup
 * 2. auth/unauthorized-domain: clear error message with fix instructions
 * 3. Subscription expiry auto-downgrades on load
 * 4. Single instance — all methods exposed via App.tsx context
 */
import { useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../lib/firebase';
import { User } from '../types';
import { LS_KEYS } from '../lib/constants';
import { setGuestToken, removeGuestToken } from '../lib/auth-token';

const LOCAL_USER_KEY = LS_KEYS.LOCAL_USER;

function checkAndDowngrade(u: User): User {
  if (u.plan !== 'free' && u.expiresAt && u.expiresAt < Date.now()) {
    console.log('[Auth] Plan expired — downgrading to free');
    return { ...u, plan: 'free', expiresAt: undefined };
  }
  return u;
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isMobile(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function useAuth() {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const loadLocalUser = useCallback((): User | null => {
    try {
      const r = localStorage.getItem(LOCAL_USER_KEY);
      return r ? checkAndDowngrade(JSON.parse(r)) : null;
    } catch { return null; }
  }, []);

  const saveLocalUser = useCallback((u: User) => {
    try { localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(u)); } catch {}
  }, []);

  const clearLocalUser = useCallback(() => {
    try { localStorage.removeItem(LOCAL_USER_KEY); } catch {}
  }, []);

  // Create or update Firestore user document
  const syncFirestoreUser = useCallback(async (fbUser: any): Promise<User> => {
    if (!db) {
      return checkAndDowngrade({
        uid: fbUser.uid, email: fbUser.email,
        displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
        photoURL: fbUser.photoURL, plan: 'free', createdAt: Date.now(),
      });
    }
    try {
      const ref  = doc(db, 'users', fbUser.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        let userData = snap.data() as User;
        userData = checkAndDowngrade(userData);
        // Auto-downgrade in Firestore if expired
        if (userData.plan !== (snap.data() as User).plan) {
          await updateDoc(ref, { plan: 'free', expiresAt: null }).catch(() => {});
        }
        return userData;
      } else {
        const newUser: User = {
          uid: fbUser.uid, email: fbUser.email,
          displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
          photoURL: fbUser.photoURL, plan: 'free', createdAt: Date.now(),
        };
        await setDoc(ref, { ...newUser, createdAt: serverTimestamp() });
        return newUser;
      }
    } catch {
      return checkAndDowngrade({
        uid: fbUser.uid, email: fbUser.email,
        displayName: fbUser.displayName || 'User',
        photoURL: fbUser.photoURL, plan: 'free', createdAt: Date.now(),
      });
    }
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setUser(loadLocalUser());
      setLoading(false);
      return;
    }

    // Handle redirect result from Google sign-in on mobile
    getRedirectResult(auth)
      .then(async result => {
        if (result?.user) {
          console.log('[Auth] Google redirect result received:', result.user.email);
          const userData = await syncFirestoreUser(result.user);
          setUser(userData);
        }
      })
      .catch(e => {
        console.warn('[Auth] Redirect result error:', e.code);
      });

    const unsub = onAuthStateChanged(auth, async fbUser => {
      if (fbUser) {
        const userData = await syncFirestoreUser(fbUser);
        setUser(userData);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [loadLocalUser, syncFirestoreUser]);

  const loginWithName = useCallback((name: string) => {
    if (!name.trim()) return;
    const guestToken = setGuestToken(name.trim());
    const u: User = {
      uid: `local_${guestToken}`, email: null,
      displayName: name.trim(), photoURL: null,
      plan: 'free', createdAt: Date.now(),
    };
    saveLocalUser(u);
    setUser(u);
  }, [saveLocalUser]);

  const signInEmail = useCallback(async (email: string, password: string): Promise<boolean> => {
    if (!isFirebaseConfigured || !auth) { setError('Firebase not configured — use name-only mode'); return false; }
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return true;
    } catch (e: any) {
      setError(friendlyError(e.code));
      return false;
    }
  }, []);

  const registerEmail = useCallback(async (name: string, email: string, password: string): Promise<boolean> => {
    if (!isFirebaseConfigured || !auth) { setError('Firebase not configured — use name-only mode'); return false; }
    setError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      return true;
    } catch (e: any) {
      setError(friendlyError(e.code));
      return false;
    }
  }, []);

  const signInGoogle = useCallback(async (): Promise<boolean> => {
    if (!isFirebaseConfigured || !auth) {
      setError('Firebase not configured — use name-only mode below');
      return false;
    }
    setError(null);

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    provider.addScope('email');
    provider.addScope('profile');

    // On mobile, redirect is more reliable than popup
    if (isMobile()) {
      try {
        await signInWithRedirect(auth, provider);
        return true; // page will reload with redirect result
      } catch (e: any) {
        console.error('[Auth] Redirect failed:', e);
        setError(friendlyError(e.code));
        return false;
      }
    }

    // Desktop: use popup
    try {
      const result = await signInWithPopup(auth, provider);
      console.log('[Auth] Google sign-in success:', result.user.email);
      return true;
    } catch (e: any) {
      console.error('[Auth] Google popup error:', e.code, e.message);

      // Popup blocked — try redirect as fallback
      if (e.code === 'auth/popup-blocked') {
        try {
          await signInWithRedirect(auth, provider);
          return true;
        } catch (e2: any) {
          setError(friendlyError(e2.code));
          return false;
        }
      }

      if (e.code === 'auth/popup-closed-by-user') {
        // User cancelled — don't show error
        return false;
      }

      setError(friendlyError(e.code));
      return false;
    }
  }, []);

  const resetPassword = useCallback(async (email: string): Promise<boolean> => {
    if (!isFirebaseConfigured || !auth) { setError('Firebase not configured'); return false; }
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
      return true;
    } catch (e: any) {
      setError(friendlyError(e.code));
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    if (isFirebaseConfigured && auth) await signOut(auth).catch(() => {});
    removeGuestToken();
    clearLocalUser();
    setUser(null);
  }, [clearLocalUser]);

  const upgradePlan = useCallback((plan: 'pro' | 'enterprise', expiresAt?: number) => {
    const daysMap = { pro: 30, enterprise: 365 };
    const expiry  = expiresAt ?? (Date.now() + daysMap[plan] * 86400000);
    setUser(prev => {
      if (!prev) return null;
      const updated = { ...prev, plan, expiresAt: expiry };
      if (!isFirebaseConfigured) saveLocalUser(updated);
      if (isFirebaseConfigured && db && prev.uid && !prev.uid.startsWith('local_')) {
        updateDoc(doc(db, 'users', prev.uid), { plan, expiresAt: expiry }).catch(() => {});
      }
      return updated;
    });
  }, [saveLocalUser]);

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
    'auth/user-not-found':        'No account found with this email',
    'auth/wrong-password':        'Incorrect password',
    'auth/email-already-in-use':  'This email is already registered — sign in instead',
    'auth/weak-password':         'Password must be at least 6 characters',
    'auth/invalid-email':         'Invalid email address',
    'auth/too-many-requests':     'Too many attempts — wait a few minutes and try again',
    'auth/network-request-failed':'Network error — check your internet connection',
    'auth/invalid-credential':    'Incorrect email or password',
    'auth/popup-blocked':         'Popup was blocked by your browser — redirecting instead…',
    'auth/unauthorized-domain':   `This domain is not authorized for Google sign-in. Add "${window.location.hostname}" to Firebase Console → Authentication → Settings → Authorized domains`,
    'auth/operation-not-allowed': 'Google sign-in is not enabled — enable it in Firebase Console → Authentication → Sign-in method',
    'auth/cancelled-popup-request': '', // silent
  };
  return m[code] || `Sign-in error (${code}) — please try again`;
}
