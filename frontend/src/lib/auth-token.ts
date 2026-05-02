import { auth, isFirebaseConfigured } from './firebase';

export interface AuthToken {
  value: string;
  type: 'firebase-jwt' | 'shared-secret' | 'guest';
  expiresAt?: number;
}

let cachedToken: AuthToken | null = null;
let tokenRefreshPromise: Promise<AuthToken> | null = null;

/**
 * Get authentication token for socket connections
 * Implements caching and concurrent request deduplication
 */
// Add this debug function temporarily
export async function debugAuthToken() {
  console.log('[Auth Debug] Checking auth state...');
  console.log('[Auth Debug] Firebase configured?', isFirebaseConfigured);
  console.log('[Auth Debug] Current user?', auth?.currentUser?.email);
  
  if (auth?.currentUser) {
    const token = await auth.currentUser.getIdToken(true);
    console.log('[Auth Debug] Token obtained:', !!token);
    console.log('[Auth Debug] Token length:', token.length);
    
    // Decode token to check expiry
    try {
      const decoded = JSON.parse(atob(token.split('.')[1]));
      console.log('[Auth Debug] Token expiry:', new Date(decoded.exp * 1000).toLocaleString());
      console.log('[Auth Debug] Token valid?', decoded.exp * 1000 > Date.now());
    } catch (e) {
      console.log('[Auth Debug] Could not decode token');
    }
  } else {
    console.log('[Auth Debug] No Firebase user');
  }
}
export async function getAuthToken(forceRefresh = false): Promise<AuthToken> {
  // Return cached token if still valid
  if (!forceRefresh && cachedToken && cachedToken.expiresAt && cachedToken.expiresAt > Date.now() + 300000) {
    return cachedToken;
  }

  // Prevent multiple concurrent token refreshes
  if (tokenRefreshPromise) {
    return tokenRefreshPromise;
  }

  tokenRefreshPromise = (async () => {
    try {
      // Priority 1: Firebase authenticated user
      if (isFirebaseConfigured && auth?.currentUser) {
        // Force refresh if requested
        const token = await auth.currentUser.getIdToken(forceRefresh);
        
        // Decode token to get expiration
        const decoded = JSON.parse(atob(token.split('.')[1]));
        const expiresAt = decoded.exp * 1000; // Convert to milliseconds
        
        cachedToken = { value: token, type: 'firebase-jwt', expiresAt };
        
        // Store in localStorage for debugging
        localStorage.setItem('firebase_token_debug', token.substring(0, 50) + '...');
        
        console.log('[AuthToken] Got Firebase token, expires:', new Date(expiresAt).toLocaleTimeString());
        return cachedToken;
      }
    } catch (error) {
      console.warn('[AuthToken] Firebase token refresh failed:', error);
    }

    // Priority 2: Guest mode
    const guestToken = localStorage.getItem('bountyflameet_guest_token');
    if (guestToken) {
      cachedToken = { value: guestToken, type: 'guest', expiresAt: Date.now() + 86400000 };
      return cachedToken;
    }

    // Priority 3: Shared secret
    const sharedSecret = import.meta.env.VITE_APP_SOCKET_SECRET || '';
    cachedToken = { value: sharedSecret, type: 'shared-secret' };
    return cachedToken;
  })();

  try {
    return await tokenRefreshPromise;
  } finally {
    tokenRefreshPromise = null;
  }
}

/**
 * Clear cached token (call on logout or auth error)
 */
export function clearAuthToken(): void {
  cachedToken = null;
  tokenRefreshPromise = null;
}

/**
 * Generate and store a guest token for name-only users
 */
export function setGuestToken(name: string): string {
  const token = `guest_${Date.now()}_${name.replace(/\s/g, '_')}`;
  localStorage.setItem('bountyflameet_guest_token', token);
  clearAuthToken(); // Force refresh on next use
  return token;
}

/**
 * Remove guest token on logout
 */
export function removeGuestToken(): void {
  localStorage.removeItem('bountyflameet_guest_token');
  clearAuthToken();
}