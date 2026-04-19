/**
 * Firebase — Boutyflameet
 * © Ken Baserecha
 * Works in 3 modes:
 *  1. Full Firebase (env vars set) → real auth + Firestore
 *  2. No Firebase (env vars missing) → name-only local mode, app still works
 */
import { initializeApp, getApps } from 'firebase/app';
import { getAuth }                 from 'firebase/auth';
import { getFirestore }            from 'firebase/firestore';

const cfg = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || '',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || '',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || '',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID|| '',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || '',
};

export const isFirebaseConfigured = Boolean(cfg.apiKey && cfg.projectId && cfg.authDomain);

let _auth: ReturnType<typeof getAuth> | null   = null;
let _db:   ReturnType<typeof getFirestore> | null = null;

if (isFirebaseConfigured) {
  const app = getApps().length ? getApps()[0] : initializeApp(cfg);
  _auth = getAuth(app);
  _db   = getFirestore(app);
}

export const auth    = _auth;
export const db      = _db;
export const storage = null; // Storage skipped — not needed
