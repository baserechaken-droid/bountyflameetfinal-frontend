/**
 * useRecording — MediaRecorder-based meeting recorder
 * © Ken Baserecha — Boutyflameet
 *
 * Records the composite stream (camera + screen share) with audio.
 * Produces a .webm file the user can download.
 *
 * Works on: Chrome, Edge, Firefox (partial)
 * Mobile: Chrome Android only
 */
import { useRef, useState, useCallback, useEffect } from 'react';

export interface RecordingState {
  isRecording: boolean;
  isPaused:    boolean;
  duration:    number;   // seconds
  sizeKB:      number;
}

export interface CloudUploadResult {
  objectPath: string;          // e.g. "/objects/uploads/<uuid>"
  servingUrl: string;          // e.g. "/api/storage/objects/uploads/<uuid>"
  bytes:      number;
  filename:   string;
}

export function useRecording(stream: MediaStream | null, socket?: any, roomId?: string) {
  const recorderRef  = useRef<MediaRecorder | null>(null);
  const chunksRef    = useRef<Blob[]>([]);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const [state, setState] = useState<RecordingState>({
    isRecording: false, isPaused: false, duration: 0, sizeKB: 0,
  });

  // Check browser support
  const isSupported = useCallback(() => {
    return typeof MediaRecorder !== 'undefined' && !!stream?.active;
  }, [stream]);

  // Best supported MIME type
  const getMimeType = (): string => {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    return types.find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';
  };

  const startRecording = useCallback((): boolean => {
    if (!isSupported() || !stream) return false;
    if (state.isRecording) return false;

    try {
      chunksRef.current = [];
      const mimeType    = getMimeType();
      const recorder    = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2_500_000,
        audioBitsPerSecond: 128_000,
      });

      recorder.ondataavailable = (e) => {
        if (e.data?.size > 0) {
          chunksRef.current.push(e.data);
          const totalKB = chunksRef.current.reduce((s, b) => s + b.size, 0) / 1024;
          setState(s => ({ ...s, sizeKB: Math.round(totalKB) }));
        }
      };

      recorder.onerror = (e) => {
        console.error('[Recording] Error:', e);
        stopRecording();
      };

      recorder.start(1000); // Collect data every 1s
      recorderRef.current = recorder;
      startTimeRef.current = Date.now();

      // Duration timer
      timerRef.current = setInterval(() => {
        setState(s => ({
          ...s,
          duration: Math.floor((Date.now() - startTimeRef.current) / 1000),
        }));
      }, 1000);

      setState({ isRecording: true, isPaused: false, duration: 0, sizeKB: 0 });

      // Notify other participants via socket
      socket?.emit('recording-started');
      return true;
    } catch (e: any) {
      console.error('[Recording] Start failed:', e.message);
      return false;
    }
  }, [stream, state.isRecording, socket, isSupported]);

  const pauseRecording = useCallback(() => {
    if (!recorderRef.current || recorderRef.current.state !== 'recording') return;
    recorderRef.current.pause();
    setState(s => ({ ...s, isPaused: true }));
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const resumeRecording = useCallback(() => {
    if (!recorderRef.current || recorderRef.current.state !== 'paused') return;
    recorderRef.current.resume();
    setState(s => ({ ...s, isPaused: false }));
    // Restart duration timer
    const elapsed = state.duration;
    startTimeRef.current = Date.now() - elapsed * 1000;
    timerRef.current = setInterval(() => {
      setState(s => ({
        ...s,
        duration: Math.floor((Date.now() - startTimeRef.current) / 1000),
      }));
    }, 1000);
  }, [state.duration]);

  const stopRecording = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder) { resolve(); return; }
      if (timerRef.current) clearInterval(timerRef.current);

      recorder.onstop = () => {
        resolve();
      };

      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      recorderRef.current = null;
      setState({ isRecording: false, isPaused: false, duration: 0, sizeKB: 0 });
      socket?.emit('recording-stopped');
    });
  }, [socket]);

  /** Builds a single Blob from the current chunks without consuming them. */
  const buildBlob = useCallback((): { blob: Blob; mimeType: string } | null => {
    if (!chunksRef.current.length) return null;
    const mimeType = recorderRef.current
      ? (recorderRef.current as any).mimeType || 'video/webm'
      : 'video/webm';
    return { blob: new Blob(chunksRef.current, { type: mimeType }), mimeType };
  }, []);

  const downloadRecording = useCallback((filename?: string) => {
    const built = buildBlob();
    if (!built) return;
    const url  = URL.createObjectURL(built.blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename || `boutyflameet-${new Date().toISOString().slice(0,19).replace(/[T:]/g,'-')}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, [buildBlob]);

  /**
   * Uploads the current recording to Replit Object Storage via a presigned URL.
   * Returns null on failure (e.g. server not configured) — never throws so
   * callers can fall back to the local download.
   *
   * Does NOT clear the chunks buffer: callers may still call downloadRecording().
   */
  const uploadRecording = useCallback(
    async (filename?: string): Promise<CloudUploadResult | null> => {
      const built = buildBlob();
      if (!built) return null;

      const safeName =
        filename ||
        `boutyflameet-${roomId || 'meeting'}-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.webm`;

      try {
        // Step 1 — request a presigned URL from our API server.
        const reqRes = await fetch('/api/storage/uploads/request-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: safeName,
            size: built.blob.size,
            contentType: built.mimeType,
          }),
        });
        if (!reqRes.ok) {
          console.warn('[Recording] presigned URL request failed:', reqRes.status);
          return null;
        }
        const { uploadURL, objectPath } = (await reqRes.json()) as {
          uploadURL: string;
          objectPath: string;
        };

        // Step 2 — PUT the recording bytes directly to GCS.
        const putRes = await fetch(uploadURL, {
          method: 'PUT',
          headers: { 'Content-Type': built.mimeType },
          body: built.blob,
        });
        if (!putRes.ok) {
          console.warn('[Recording] cloud PUT failed:', putRes.status);
          return null;
        }

        const servingUrl = `/api/storage${objectPath}`;
        return {
          objectPath,
          servingUrl,
          bytes: built.blob.size,
          filename: safeName,
        };
      } catch (e: any) {
        console.warn('[Recording] cloud upload threw:', e?.message || e);
        return null;
      }
    },
    [buildBlob, roomId],
  );

  /** Discards the in-memory chunks buffer (call after the user no longer needs the local copy). */
  const clearRecording = useCallback(() => {
    chunksRef.current = [];
    setState((s) => ({ ...s, sizeKB: 0 }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recorderRef.current?.state !== 'inactive') {
        recorderRef.current?.stop();
      }
    };
  }, []);

  return {
    ...state,
    isSupported: isSupported(),
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    downloadRecording,
    uploadRecording,
    clearRecording,
  };
}
