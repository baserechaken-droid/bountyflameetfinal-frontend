import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { SIGNALING_URL } from '../lib/constants';
import { ConnectionStatus } from '../types';

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    console.log('[Socket] Connecting to:', SIGNALING_URL);

    const s = io(SIGNALING_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 15000,
      autoConnect: true,
    });

    socketRef.current = s;

    s.on('connect', () => {
      console.log('[Socket] Connected:', s.id);
      setStatus('connected');
      setSocket(s);
    });

    s.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      setStatus('reconnecting');
    });

    s.on('reconnect', () => {
      console.log('[Socket] Reconnected');
      setStatus('connected');
      setSocket(s);
    });

    s.on('reconnecting', (attempt: number) => {
      console.log('[Socket] Reconnecting attempt:', attempt);
      setStatus('reconnecting');
    });

    s.on('reconnect_failed', () => {
      console.error('[Socket] All reconnection attempts failed');
      setStatus('error');
    });

    s.on('connect_error', (e) => {
      console.error('[Socket] Connection error:', e.message);
      // Keep status as 'connecting' while it retries — don't block UI
      setStatus('connecting');
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, []);

  return { socket, status };
}
