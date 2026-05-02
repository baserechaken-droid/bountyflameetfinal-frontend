/**
 * useSocket — Socket.IO client with JWT auth + reconnection signal
 * © Ken Baserecha — Boutyflameet v4.1
 *
 * P0 fixes:
 * 1. Passes Firebase ID token (or shared secret) in handshake.auth
 *    so server can verify identity before allowing join.
 * 2. Emits a 'socket-reconnected' custom event so MeetingPage knows
 *    to re-join the room after a network drop.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { SIGNALING_URL } from '../lib/constants';
import { ConnectionStatus } from '../types';
import { getAuthToken, clearAuthToken } from '../lib/auth-token';

const MAX_RECONNECT_ATTEMPTS = 20;
const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 8000;

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);
  const reconnectAttemptsRef = useRef(0);

  const setupSocketListeners = useCallback((s: Socket, mounted: boolean) => {
    s.on('connect', () => {
      if (!mounted) return;
      console.log('[Socket] Connected:', s.id);
      setStatus('connected');
      setSocket(s);
      reconnectAttemptsRef.current = 0;
    });

    s.on('disconnect', (reason) => {
      if (!mounted) return;
      console.log('[Socket] Disconnected:', reason);
      setStatus('reconnecting');
    });

    s.on('reconnect_attempt', (attempt) => {
      if (!mounted) return;
      console.log('[Socket] Reconnect attempt', attempt);
      reconnectAttemptsRef.current = attempt;
      setStatus('reconnecting');
    });

    s.on('reconnect', async () => {
      if (!mounted) return;
      console.log('[Socket] Reconnected after', reconnectAttemptsRef.current, 'attempts');
      
      // Refresh token on reconnect
      try {
        const { value: freshToken } = await getAuthToken(true);
        s.auth = { token: freshToken };
        console.log('[Socket] Token refreshed on reconnect');
      } catch (error) {
        console.error('[Socket] Token refresh failed:', error);
      }
      
      setStatus('connected');
      setSocket(s);
      setReconnectCount(prev => prev + 1);
    });

    s.on('connect_error', async (error) => {
      if (!mounted) return;
      console.error('[Socket] Connection error:', error.message);
      
      // Handle authentication errors
      if (error.message.includes('Authentication') || error.message.includes('401')) {
        console.warn('[Socket] Auth failed, clearing token cache');
        clearAuthToken();
        
        // Don't disconnect, let socket.io retry with new token
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(
            BASE_RECONNECT_DELAY * Math.pow(1.5, reconnectAttemptsRef.current),
            MAX_RECONNECT_DELAY
          );
          console.log('[Socket] Retrying with new token in', delay, 'ms');
          setTimeout(async () => {
            const { value: newToken } = await getAuthToken(true);
            s.auth = { token: newToken };
            s.connect();
          }, delay);
        }
      } else {
        setStatus('connecting');
      }
    });

    s.on('reconnect_failed', () => {
      if (!mounted) return;
      console.error('[Socket] All reconnection attempts failed');
      setStatus('error');
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    let currentSocket: Socket | null = null;

    const connect = async () => {
      try {
        const { value: token, type } = await getAuthToken();
        
        // Enhanced logging
        console.log('[Socket] Connecting to:', SIGNALING_URL);
        console.log('[Socket] Auth type:', type);
        console.log('[Socket] Token exists:', !!token);
        console.log('[Socket] Token length:', token?.length || 0);
        
        // Log first 50 chars of token for debugging (don't log full token in production)
        if (token && token.length > 50) {
          console.log('[Socket] Token preview:', token.substring(0, 50) + '...');
        }

        const s = io(SIGNALING_URL, {
          transports: ['websocket', 'polling'],
          reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
          reconnectionDelay: BASE_RECONNECT_DELAY,
          reconnectionDelayMax: MAX_RECONNECT_DELAY,
          timeout: 15000,
          autoConnect: true,
          auth: { token },
        });

        currentSocket = s;
        socketRef.current = s;
        setupSocketListeners(s, mounted);
      } catch (error) {
        console.error('[Socket] Init error:', error);
        if (mounted) setStatus('error');
      }
    };

    connect();

    return () => {
      mounted = false;
      if (currentSocket) {
        currentSocket.removeAllListeners();
        currentSocket.disconnect();
      }
      socketRef.current = null;
      setSocket(null);
    };
  }, [setupSocketListeners]);

  const reconnect = useCallback(async () => {
    if (socketRef.current) {
      console.log('[Socket] Manual reconnect requested');
      socketRef.current.disconnect();
      const { value: freshToken } = await getAuthToken(true);
      socketRef.current.auth = { token: freshToken };
      socketRef.current.connect();
    }
  }, []);

  return { socket, status, reconnectCount, reconnect };
}