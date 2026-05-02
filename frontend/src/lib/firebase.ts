/**
 * Firebase — Boutyflameet
 * © Ken Baserecha
 *
 * Works in 3 modes:
 *  1. Full Firebase (env vars set) → real auth + Firestore
 *  2. No Firebase (env vars missing) → name-only local mode, app still works
 *
 * FIX: Added logging so you can diagnose auth failures in the browser console.
 * If Google sign-in fails with auth/unauthorized-domain, the domain needs
 * to be added to Firebase Console → Authentication → Settings → Authorized domains.
 */
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator }          from 'firebase/auth';
import { getFirestore }                           from 'firebase/firestore';

const cfg = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY             || '',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN         || '',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID          || '',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET      || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID              || '',
};

export const isFirebaseConfigured = Boolean(
  cfg.apiKey && cfg.projectId && cfg.authDomain &&
  cfg.apiKey !== 'your_api_key_here' &&
  cfg.projectId !== 'your_project_id'
);

let _app:  FirebaseApp | null = null;
let _auth: ReturnType<typeof getAuth> | null    = null;
let _db:   ReturnType<typeof getFirestore> | null = null;

if (isFirebaseConfigured) {
  try {
    _app  = getApps().length ? getApps()[0] : initializeApp(cfg);
    _auth = getAuth(_app);
    _db   = getFirestore(_app);
    console.log('[Firebase] ✅ Initialized — project:', cfg.projectId);
    console.log('[Firebase] Auth domain:', cfg.authDomain);
    console.log('[Firebase] Current hostname:', window.location.hostname);
    console.log('[Firebase] 👉 If Google sign-in fails, add', window.location.hostname,
      'to Firebase Console → Authentication → Settings → Authorized domains');
  } catch (e) {
    console.error('[Firebase] ❌ Init failed:', e);
  }
} else {
  console.log('[Firebase] Not configured — running in name-only mode');
  console.log('[Firebase] Missing vars:', Object.entries(cfg).filter(([,v]) => !v).map(([k]) => k));
}

export const auth    = _auth;
export const db      = _db;
export const storage = null;
