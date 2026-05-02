/**
 * useVirtualBackground — Fixed compositing pipeline v4.1
 * © Ken Baserecha — Boutyflameet
 *
 * FIXES applied:
 * 1. onResults set ONCE outside the tick loop (was reassigned 60×/sec)
 * 2. Compositing fixed: draw bg → draw masked person ON TOP (not in reverse)
 *    Uses a dedicated personCanvas to hold the masked person separately
 *    from the background canvas, then composites them correctly.
 * 3. Canvas stops when type === 'none' (was wasting CPU drawing raw frames)
 * 4. Canvas dimensions match video track settings (not hardcoded 1280×720)
 * 5. sendRef prevents overlapping sends (was possible on slow GPUs)
 */
import { useRef, useState, useCallback, useEffect } from 'react';

export type BgType = 'none' | 'blur' | 'blur-strong' | 'image' | 'custom';

export interface BgOption {
  id:     string;
  type:   BgType;
  label:  string;
  emoji?: string;
  src?:   string;
  thumb?: string;
}

export const BACKGROUND_OPTIONS: BgOption[] = [
  { id: 'none',       type: 'none',        label: 'None',       emoji: '🚫' },
  { id: 'blur',       type: 'blur',        label: 'Soft Blur',  emoji: '🌫️' },
  { id: 'blur-heavy', type: 'blur-strong', label: 'Heavy Blur', emoji: '💨' },
  { id: 'office',    type: 'image', label: 'Modern Office',
    src:   'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1920&q=80',
    thumb: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&q=70' },
  { id: 'library',   type: 'image', label: 'Home Library',
    src:   'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=1920&q=80',
    thumb: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=400&q=70' },
  { id: 'cafe',      type: 'image', label: 'Coffee Shop',
    src:   'https://images.unsplash.com/photo-1453614512568-c4024d13c247?w=1920&q=80',
    thumb: 'https://images.unsplash.com/photo-1453614512568-c4024d13c247?w=400&q=70' },
  { id: 'mountain',  type: 'image', label: 'Mountains',
    src:   'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80',
    thumb: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=70' },
  { id: 'beach',     type: 'image', label: 'Beach',
    src:   'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80',
    thumb: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=70' },
  { id: 'city',      type: 'image', label: 'City Skyline',
    src:   'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1920&q=80',
    thumb: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=400&q=70' },
  { id: 'forest',    type: 'image', label: 'Forest',
    src:   'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&q=80',
    thumb: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=400&q=70' },
  { id: 'space',     type: 'image', label: 'Galaxy',
    src:   'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1920&q=80',
    thumb: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=400&q=70' },
  { id: 'abstract',  type: 'image', label: 'Abstract',
    src:   'https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=1920&q=80',
    thumb: 'https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=400&q=70' },
];

export function useVirtualBackground(inputStream: MediaStream | null) {
  const [selected,      setSelected]      = useState<BgOption>(BACKGROUND_OPTIONS[0]);
  const [virtualStream, setVirtualStream] = useState<MediaStream | null>(null);
  const [cssFilter,     setCssFilter]     = useState('none');
  const [segReady,      setSegReady]      = useState(false);
  const [loading,       setLoading]       = useState(false);

  // Canvas refs
  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null); // final output
  const personCanvasRef = useRef<HTMLCanvasElement | null>(null); // holds masked person
  const videoRef        = useRef<HTMLVideoElement | null>(null);
  const segRef          = useRef<any>(null);
  const bgImgRef        = useRef<HTMLImageElement | null>(null);
  const rafRef          = useRef<number>(0);
  const activeRef       = useRef(false);
  const selectedRef     = useRef<BgOption>(BACKGROUND_OPTIONS[0]);
  const sendingRef      = useRef(false); // prevent overlapping sends

  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // ── CSS blur (instant fallback, no canvas needed) ──────────
  const updateCssFilter = useCallback((opt: BgOption) => {
    if      (opt.type === 'blur')        setCssFilter('blur(12px)');
    else if (opt.type === 'blur-strong') setCssFilter('blur(28px)');
    else                                 setCssFilter('none');
  }, []);

  // ── Preload background image ───────────────────────────────
  const preloadBg = useCallback((opt: BgOption) => {
    if (!opt.src) { bgImgRef.current = null; return; }
    const img       = new Image();
    img.crossOrigin = 'anonymous';
    img.src         = opt.src;
    img.onload      = () => { bgImgRef.current = img; };
    img.onerror     = () => { bgImgRef.current = null; console.warn('[VirtualBg] Image load failed:', opt.src); };
  }, []);

  // ── Load MediaPipe ─────────────────────────────────────────
  const loadMediaPipe = useCallback(async () => {
    if (segRef.current || loading) return;
    setLoading(true);
    try {
      await new Promise<void>((resolve, reject) => {
        if ((window as any).SelfieSegmentation) { resolve(); return; }
        const s     = document.createElement('script');
        s.src       = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1/selfie_segmentation.js';
        s.crossOrigin = 'anonymous';
        s.onload    = () => resolve();
        s.onerror   = () => reject(new Error('MediaPipe load failed'));
        document.head.appendChild(s);
      });

      const seg = new (window as any).SelfieSegmentation({
        locateFile: (f: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1/${f}`,
      });
      seg.setOptions({ modelSelection: 1 });

      // ── FIX: Set onResults ONCE here, not inside the tick loop ──
      // The tick loop was calling segRef.current.onResults() on every frame
      // (60×/second), reassigning the callback and causing the previous
      // result to complete with a stale handler.
      seg.onResults((results: any) => {
        const outCanvas    = outputCanvasRef.current;
        const personCanvas = personCanvasRef.current;
        const vid          = videoRef.current;
        const opt          = selectedRef.current;
        if (!outCanvas || !personCanvas || !vid) return;

        const W   = outCanvas.width;
        const H   = outCanvas.height;
        const ctx = outCanvas.getContext('2d')!;
        const pctx = personCanvas.getContext('2d')!;

        // ── STEP 1: Draw the person onto personCanvas with mask ───
        // Clear person canvas
        pctx.clearRect(0, 0, W, H);
        // Draw raw camera frame
        pctx.drawImage(vid, 0, 0, W, H);
        // Apply segmentation mask — keep only person pixels
        pctx.globalCompositeOperation = 'destination-in';
        pctx.drawImage(results.segmentationMask, 0, 0, W, H);
        pctx.globalCompositeOperation = 'source-over'; // reset

        // ── STEP 2: Draw background onto output canvas ─────────
        ctx.clearRect(0, 0, W, H);
        if (opt.type === 'blur' || opt.type === 'blur-strong') {
          const blurPx = opt.type === 'blur-strong' ? '28px' : '14px';
          ctx.save();
          ctx.filter = `blur(${blurPx})`;
          // Draw slightly oversized to avoid blur edge artifacts
          ctx.drawImage(vid, -20, -20, W + 40, H + 40);
          ctx.restore();
        } else if (bgImgRef.current) {
          const img = bgImgRef.current;
          // Cover-fit the background image
          const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
          const w     = img.naturalWidth  * scale;
          const h     = img.naturalHeight * scale;
          ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
        } else {
          // Background image not loaded yet — use solid fallback
          ctx.fillStyle = '#1a1a2e';
          ctx.fillRect(0, 0, W, H);
        }

        // ── STEP 3: Composite person ON TOP of background ──────
        // source-over = default: draw personCanvas pixels over existing bg
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(personCanvas, 0, 0);

        sendingRef.current = false; // Allow next frame
      });

      await seg.initialize();
      segRef.current = seg;
      setSegReady(true);
      console.log('[VirtualBg] MediaPipe ready ✅');
    } catch (e) {
      console.warn('[VirtualBg] MediaPipe failed — CSS blur fallback active:', e);
    }
    setLoading(false);
  }, [loading]);

  // ── Canvas pipeline ────────────────────────────────────────
  const startCanvas = useCallback((stream: MediaStream) => {
    // Match canvas dimensions to actual camera track (not hardcoded 1280×720)
    const track    = stream.getVideoTracks()[0];
    const settings = track?.getSettings() || {};
    const W        = settings.width  || 1280;
    const H        = settings.height || 720;

    // Output canvas — what peers see
    const outCanvas    = document.createElement('canvas');
    outCanvas.width    = W;
    outCanvas.height   = H;
    outputCanvasRef.current = outCanvas;

    // Person canvas — intermediate, holds masked person only
    const personCanvas   = document.createElement('canvas');
    personCanvas.width   = W;
    personCanvas.height  = H;
    personCanvasRef.current = personCanvas;

    // Invisible video element to read frames from
    const vid          = document.createElement('video');
    vid.srcObject      = stream;
    vid.muted          = true;
    vid.playsInline    = true;
    vid.width          = W;
    vid.height         = H;
    videoRef.current   = vid;
    vid.play().catch(() => {});

    // Capture the output canvas as a stream (30fps)
    const outStream = outCanvas.captureStream(30);
    // Add original audio tracks to output stream
    stream.getAudioTracks().forEach(t => outStream.addTrack(t));
    setVirtualStream(outStream);
    activeRef.current  = true;

    const tick = () => {
      if (!activeRef.current) return;
      const opt = selectedRef.current;

      // ── OPTIMISATION: skip canvas entirely for 'none' ──────
      // Don't waste CPU drawing frames when no bg effect is active.
      // The effectiveStream logic below returns inputStream for 'none'.
      if (opt.type === 'none') {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (vid.readyState < 2) {
        // Video not ready yet
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const outCtx = outCanvas.getContext('2d')!;

      if (segRef.current && (opt.type === 'image' || opt.type === 'custom')) {
        // MediaPipe AI path — only for image backgrounds
        if (!sendingRef.current) {
          sendingRef.current = true;
          // onResults is already set once in loadMediaPipe — just send
          segRef.current.send({ image: vid }).catch(() => {
            sendingRef.current = false;
          });
        }
        // onResults callback will draw the composite — nothing else needed here
      } else {
        // Blur path (no MediaPipe needed — pure canvas filter)
        // OR image path before MediaPipe loads (fallback: raw frame)
        outCtx.clearRect(0, 0, W, H);
        if (opt.type === 'blur' || opt.type === 'blur-strong') {
          const blurPx = opt.type === 'blur-strong' ? '28px' : '14px';
          outCtx.save();
          outCtx.filter = `blur(${blurPx})`;
          outCtx.drawImage(vid, -20, -20, W + 40, H + 40);
          outCtx.restore();
        } else {
          // Image bg but MediaPipe not loaded yet — show raw frame
          outCtx.drawImage(vid, 0, 0, W, H);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    vid.addEventListener('loadeddata', () => {
      rafRef.current = requestAnimationFrame(tick);
    }, { once: true });

    // If video is already ready (cached), start immediately
    if (vid.readyState >= 2) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, []);

  // ── Init when stream arrives ───────────────────────────────
  useEffect(() => {
    if (!inputStream) return;
    if (!inputStream.getVideoTracks().length) {
      setVirtualStream(inputStream);
      return;
    }
    startCanvas(inputStream);
    return () => {
      activeRef.current = false;
      cancelAnimationFrame(rafRef.current);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
    };
  }, [inputStream, startCanvas]);

  // ── Select background ──────────────────────────────────────
  const selectBackground = useCallback((opt: BgOption) => {
    setSelected(opt);
    preloadBg(opt);
    updateCssFilter(opt);
    if ((opt.type === 'image' || opt.type === 'custom') && !segRef.current) {
      loadMediaPipe();
    }
  }, [preloadBg, updateCssFilter, loadMediaPipe]);

  // ── Custom photo upload ────────────────────────────────────
  const uploadCustom = useCallback((file: File) => {
    const url       = URL.createObjectURL(file);
    const custom: BgOption = { id: 'custom', type: 'custom', label: 'My Photo', src: url, thumb: url };
    preloadBg(custom);
    setSelected(custom);
    if (!segRef.current) loadMediaPipe();
  }, [preloadBg, loadMediaPipe]);

  // ── Effective stream ───────────────────────────────────────
  // For 'none': return raw input (canvas not needed, saves CPU)
  // For everything else: return canvas output stream
  const effectiveStream = selected.type === 'none'
    ? inputStream
    : (virtualStream ?? inputStream);

  return {
    virtualStream: effectiveStream,
    cssFilter,
    selected,
    selectBackground,
    uploadCustom,
    segReady,
    loading,
  };
}
