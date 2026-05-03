/**
 * useAuth — Fixed authentication hook
 * © Ken Baserecha — Boutyflameet
 *
 * Root-cause fixes:
 * 1. syncFirestoreUser extracted outside useEffect so dep array is stable
 * 2. getRedirectResult race condition fixed — single loading gate
 * 3. Google popup + redirect fallback working correctly
 * 4. Subscription expiry auto-downgrades on load
 */
import { useState, useEffect, useCallback, useRef } from 'react';
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

function isMobile(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Build Firestore user from Firebase user object
async function buildUser(fbUser: any): Promise<User> {
  if (!db) {
    return checkAndDowngrade({
      uid: fbUser.uid,
      email: fbUser.email,
      displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
      photoURL: fbUser.photoURL,
      plan: 'free',
      createdAt: Date.now(),
    });
  }
  try {
    const ref  = doc(db, 'users', fbUser.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data     = snap.data() as User;
      const userData = checkAndDowngrade(data);
      // Write back if plan was downgraded
      if (userData.plan !== data.plan) {
        await updateDoc(ref, { plan: 'free', expiresAt: null }).catch(() => {});
      }
      return userData;
    }
    // New user — create document
    const newUser: User = {
      uid:         fbUser.uid,
      email:       fbUser.email,
      displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
      photoURL:    fbUser.photoURL,
      plan:        'free',
      createdAt:   Date.now(),
    };
    await setDoc(ref, { ...newUser, createdAt: serverTimestamp() });
    return newUser;
  } catch {
    return checkAndDowngrade({
      uid:         fbUser.uid,
      email:       fbUser.email,
      displayName: fbUser.displayName || 'User',
      photoURL:    fbUser.photoURL,
      plan:        'free',
      createdAt:   Date.now(),
    });
  }
}

export function useAuth() {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  // Prevent double-loading when both redirect result and onAuthStateChanged fire
  const authHandledRef = useRef(false);

  const loadLocalUser = useCallback((): User | null => {
    try {
      const raw = localStorage.getItem(LOCAL_USER_KEY);
      return raw ? checkAndDowngrade(JSON.parse(raw)) : null;
    } catch { return null; }
  }, []);

  const saveLocalUser = useCallback((u: User) => {
    try { localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(u)); } catch {}
  }, []);

  const clearLocalUser = useCallback(() => {
    try { localStorage.removeItem(LOCAL_USER_KEY); } catch {}
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setUser(loadLocalUser());
      setLoading(false);
      return;
    }

    // Step 1: Check for pending Google redirect result first
    // This must complete before we set up onAuthStateChanged so we
    // don't double-fire user setup.
    let unsubscribe: (() => void) | null = null;

    getRedirectResult(auth!)
      .then(async result => {
        if (result?.user && !authHandledRef.current) {
          console.log('[Auth] ✅ Google redirect result:', result.user.email);
          authHandledRef.current = true;
          const userData = await buildUser(result.user);
          setUser(userData);
          setLoading(false);
        }
      })
      .catch(e => {
        if (e.code !== 'auth/no-auth-event') {
          console.warn('[Auth] Redirect result error:', e.code);
        }
      })
      .finally(() => {
        // Step 2: Set up persistent auth state listener
        unsubscribe = onAuthStateChanged(auth!, async fbUser => {
          if (authHandledRef.current && fbUser) {
            // Already handled by redirect result above — skip but keep loading false
            setLoading(false);
            return;
          }
          authHandledRef.current = false; // reset for next sign-in
          if (fbUser) {
            const userData = await buildUser(fbUser);
            setUser(userData);
          } else {
            setUser(null);
          }
          setLoading(false);
        });
      });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [loadLocalUser]);

  // ── Name-only login ───────────────────────────────────────
  const loginWithName = useCallback((name: string) => {
    if (!name.trim()) return;
    const token = setGuestToken(name.trim());
    const u: User = {
      uid:         `local_${token}`,
      email:       null,
      displayName: name.trim(),
      photoURL:    null,
      plan:        'free',
      createdAt:   Date.now(),
    };
    saveLocalUser(u);
    setUser(u);
  }, [saveLocalUser]);

  // ── Email sign-in ─────────────────────────────────────────
  const signInEmail = useCallback(async (email: string, password: string): Promise<boolean> => {
    if (!isFirebaseConfigured || !auth) {
      setError('Firebase not configured — use the name-only option below');
      return false;
    }
    setError(null);
    try {
      await signInWithEmailAndPassword(auth!, email, password);
      console.log('[Auth] ✅ Email sign-in success');
      return true;
    } catch (e: any) {
      console.error('[Auth] Email sign-in error:', e.code);
      setError(friendlyError(e.code));
      return false;
    }
  }, []);

  // ── Email register ────────────────────────────────────────
  const registerEmail = useCallback(async (name: string, email: string, password: string): Promise<boolean> => {
    if (!isFirebaseConfigured || !auth) {
      setError('Firebase not configured — use the name-only option below');
      return false;
    }
    setError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth!, email, password);
      await updateProfile(cred.user, { displayName: name });
      console.log('[Auth] ✅ Registration success:', email);
      return true;
    } catch (e: any) {
      console.error('[Auth] Register error:', e.code);
      setError(friendlyError(e.code));
      return false;
    }
  }, []);

  // ── Google sign-in ────────────────────────────────────────
  const signInGoogle = useCallback(async (): Promise<boolean> => {
    if (!isFirebaseConfigured || !auth) {
      setError('Firebase not configured — use the name-only option below');
      return false;
    }
    setError(null);

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    provider.addScope('email');
    provider.addScope('profile');

    // CRITICAL: signInWithPopup MUST be called synchronously from the
    // user gesture (button click). Any await before this call breaks
    // the browser gesture chain and the popup is silently blocked.
    //
    // On mobile we use redirect instead — popups are always blocked there.
    if (isMobile()) {
      try {
        console.log('[Auth] Mobile — using redirect');
        await signInWithRedirect(auth!, provider);
        return true;
      } catch (e: any) {
        console.error('[Auth] Redirect error:', e.code);
        setError(friendlyError(e.code));
        return false;
      }
    }

    // Desktop: call popup immediately (no awaits before this line)
    try {
      console.log('[Auth] Opening Google popup…');
      const result = await signInWithPopup(auth!, provider);
      console.log('[Auth] ✅ Google success:', result.user.email);
      return true;
    } catch (e: any) {
      console.error('[Auth] Google error:', e.code);

      if (e.code === 'auth/popup-closed-by-user' ||
          e.code === 'auth/cancelled-popup-request') {
        return false; // user dismissed — no error shown
      }

      if (e.code === 'auth/popup-blocked') {
        // Popup blocked — fall back to redirect
        try {
          await signInWithRedirect(auth!, provider);
          return true;
        } catch (e2: any) {
          setError(friendlyError(e2.code));
          return false;
        }
      }

      setError(friendlyError(e.code));
      return false;
    }
  }, []);

  // ── Reset password ────────────────────────────────────────
  const resetPassword = useCallback(async (email: string): Promise<boolean> => {
    if (!isFirebaseConfigured || !auth) {
      setError('Firebase not configured');
      return false;
    }
    setError(null);
    try {
      await sendPasswordResetEmail(auth!, email);
      return true;
    } catch (e: any) {
      setError(friendlyError(e.code));
      return false;
    }
  }, []);

  // ── Logout ────────────────────────────────────────────────
  const logout = useCallback(async () => {
    if (isFirebaseConfigured && auth) await signOut(auth!).catch(() => {});
    removeGuestToken();
    clearLocalUser();
    setUser(null);
    authHandledRef.current = false;
  }, [clearLocalUser]);

  // ── Upgrade plan ──────────────────────────────────────────
  const upgradePlan = useCallback((plan: 'pro' | 'enterprise', expiresAt?: number) => {
    const daysMap = { pro: 30, enterprise: 365 };
    const expiry  = expiresAt ?? Date.now() + daysMap[plan] * 86400000;
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
  const map: Record<string, string> = {
    'auth/user-not-found':         'No account found with this email. Create one below.',
    'auth/wrong-password':         'Incorrect password. Try again or reset it below.',
    'auth/email-already-in-use':   'This email is already registered — sign in instead.',
    'auth/weak-password':          'Password must be at least 6 characters.',
    'auth/invalid-email':          'Please enter a valid email address.',
    'auth/too-many-requests':      'Too many failed attempts. Wait a few minutes and try again.',
    'auth/network-request-failed': 'Network error — check your internet connection.',
    'auth/invalid-credential':     'Incorrect email or password. Check and try again.',
    'auth/popup-blocked':          'Popup blocked — trying redirect method instead…',
    'auth/unauthorized-domain':    `This domain is not authorized. Go to Firebase Console → Authentication → Settings → Authorized domains and add: ${window.location.hostname}`,
    'auth/operation-not-allowed':  'Google sign-in is not enabled. Enable it in Firebase Console → Authentication → Sign-in method → Google.',
    'auth/internal-error':         'An unexpected error occurred. Please try again.',
  };
  return map[code] || `Sign-in failed (${code}). Please try again.`;
}
