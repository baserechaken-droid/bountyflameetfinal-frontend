/**
 * useVirtualBackground — Virtual backgrounds with reliable CSS blur fallback
 * © Ken Baserecha — Boutyflameet
 *
 * Two rendering modes:
 *  1. CSS filter (instant, always works) — for blur effects
 *  2. Canvas + MediaPipe AI (loads lazily) — for image backgrounds
 *
 * The CSS approach works IMMEDIATELY and requires no loading.
 * MediaPipe AI loads in background for image backgrounds only.
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
  { id: 'none',       type: 'none',        label: 'None',           emoji: '🚫' },
  { id: 'blur',       type: 'blur',        label: 'Soft Blur',      emoji: '🌫️' },
  { id: 'blur-heavy', type: 'blur-strong', label: 'Heavy Blur',     emoji: '💨' },
  { id: 'office',    type: 'image', label: 'Modern Office',
    src:'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1920&q=80',
    thumb:'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&q=70' },
  { id: 'library',   type: 'image', label: 'Home Library',
    src:'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=1920&q=80',
    thumb:'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=400&q=70' },
  { id: 'cafe',      type: 'image', label: 'Coffee Shop',
    src:'https://images.unsplash.com/photo-1453614512568-c4024d13c247?w=1920&q=80',
    thumb:'https://images.unsplash.com/photo-1453614512568-c4024d13c247?w=400&q=70' },
  { id: 'cowork',    type: 'image', label: 'Coworking',
    src:'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1920&q=80',
    thumb:'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=400&q=70' },
  { id: 'mountain',  type: 'image', label: 'Mountains',
    src:'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80',
    thumb:'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=70' },
  { id: 'beach',     type: 'image', label: 'Beach',
    src:'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80',
    thumb:'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=70' },
  { id: 'city',      type: 'image', label: 'City Skyline',
    src:'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1920&q=80',
    thumb:'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=400&q=70' },
  { id: 'forest',    type: 'image', label: 'Forest',
    src:'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&q=80',
    thumb:'https://images.unsplash.com/photo-1448375240586-882707db888b?w=400&q=70' },
  { id: 'space',     type: 'image', label: 'Galaxy',
    src:'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1920&q=80',
    thumb:'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=400&q=70' },
  { id: 'abstract',  type: 'image', label: 'Abstract',
    src:'https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=1920&q=80',
    thumb:'https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=400&q=70' },
];

export function useVirtualBackground(inputStream: MediaStream | null) {
  const [selected,      setSelected]      = useState<BgOption>(BACKGROUND_OPTIONS[0]);
  const [canvasStream,  setCanvasStream]  = useState<MediaStream | null>(null);
  const [cssFilter,     setCssFilter]     = useState<string>('none');
  const [segReady,      setSegReady]      = useState(false);
  const [loading,       setLoading]       = useState(false);

  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const ctxRef       = useRef<CanvasRenderingContext2D | null>(null);
  const hiddenVidRef = useRef<HTMLVideoElement | null>(null);
  const segRef       = useRef<any>(null);
  const bgImgRef     = useRef<HTMLImageElement | null>(null);
  const rafRef       = useRef<number>(0);
  const activeRef    = useRef(false);
  const selectedRef  = useRef<BgOption>(BACKGROUND_OPTIONS[0]);

  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // ── Preload image ──────────────────────────────────────────
  const preloadImg = useCallback((src: string) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    img.onload  = () => { bgImgRef.current = img; };
    img.onerror = () => { bgImgRef.current = null; };
  }, []);

  // ── Load MediaPipe (lazily) ────────────────────────────────
  const loadMediaPipe = useCallback(async () => {
    if (segRef.current || loading) return;
    setLoading(true);
    try {
      if (!(window as any).SelfieSegmentation) {
        await new Promise<void>((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1/selfie_segmentation.js';
          s.crossOrigin = 'anonymous';
          s.onload = () => res(); s.onerror = rej;
          document.head.appendChild(s);
        });
      }
      const seg = new (window as any).SelfieSegmentation({
        locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1/${f}`,
      });
      seg.setOptions({ modelSelection: 1 });
      await seg.initialize();
      segRef.current = seg;
      setSegReady(true);
    } catch (e) {
      console.warn('[VirtualBg] MediaPipe failed — CSS blur only:', e);
    }
    setLoading(false);
  }, [loading]);

  // ── Canvas render loop ─────────────────────────────────────
  const startCanvas = useCallback((stream: MediaStream) => {
    // Create offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = 1280; canvas.height = 720;
    const ctx = canvas.getContext('2d')!;
    canvasRef.current = canvas;
    ctxRef.current    = ctx;

    // Hidden video to pull frames from
    const vid = document.createElement('video');
    vid.srcObject = stream; vid.muted = true; vid.playsInline = true;
    hiddenVidRef.current = vid;
    vid.play().catch(() => {});

    // Output stream from canvas (30fps)
    const out = canvas.captureStream(30);
    stream.getAudioTracks().forEach(t => out.addTrack(t)); // keep audio
    setCanvasStream(out);
    activeRef.current = true;

    const drawBg = () => {
      const opt = selectedRef.current;
      if (opt.type === 'blur' || opt.type === 'blur-strong') {
        ctx.save();
        ctx.filter = opt.type === 'blur-strong' ? 'blur(28px)' : 'blur(14px)';
        ctx.drawImage(vid, -20, -20, canvas.width + 40, canvas.height + 40);
        ctx.restore();
      } else if (bgImgRef.current) {
        const img = bgImgRef.current;
        const sc  = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
        const w = img.naturalWidth * sc, h = img.naturalHeight * sc;
        ctx.drawImage(img, (canvas.width-w)/2, (canvas.height-h)/2, w, h);
      } else {
        ctx.fillStyle = '#0D0D26'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    };

    const tick = async () => {
      if (!activeRef.current) return;
      const opt = selectedRef.current;
      if (vid.readyState < 2) { rafRef.current = requestAnimationFrame(tick); return; }

      if (opt.type === 'none') {
        // Passthrough — just copy frame
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
      } else if (segRef.current) {
        // AI segmentation path
        try {
          let done = false;
          segRef.current.onResults((r: any) => {
            done = true;
            // Layer 1: background
            drawBg();
            // Layer 2: apply mask — keep only person pixels from camera
            ctx.save();
            ctx.globalCompositeOperation = 'destination-in';
            ctx.drawImage(r.segmentationMask, 0, 0, canvas.width, canvas.height);
            ctx.restore();
            // Layer 3: composite person over background
            const tmp = document.createElement('canvas');
            tmp.width = canvas.width; tmp.height = canvas.height;
            const tc = tmp.getContext('2d')!;
            // Draw bg on tmp
            if (opt.type === 'blur' || opt.type === 'blur-strong') {
              tc.save(); tc.filter = opt.type === 'blur-strong' ? 'blur(28px)' : 'blur(14px)';
              tc.drawImage(vid, -20,-20,tmp.width+40,tmp.height+40); tc.restore();
            } else if (bgImgRef.current) {
              const img = bgImgRef.current;
              const sc = Math.max(tmp.width/img.naturalWidth,tmp.height/img.naturalHeight);
              tc.drawImage(img,(tmp.width-img.naturalWidth*sc)/2,(tmp.height-img.naturalHeight*sc)/2,img.naturalWidth*sc,img.naturalHeight*sc);
            } else { tc.fillStyle='#0D0D26'; tc.fillRect(0,0,tmp.width,tmp.height); }
            tc.drawImage(canvas, 0, 0);
            ctx.clearRect(0,0,canvas.width,canvas.height);
            ctx.drawImage(tmp, 0, 0);
          });
          await segRef.current.send({ image: vid });
          if (!done) ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
        } catch { ctx.drawImage(vid, 0, 0, canvas.width, canvas.height); }
      } else {
        // CSS blur fallback — just draw frame (CSS filter applied at video element level)
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    vid.addEventListener('loadeddata', () => { rafRef.current = requestAnimationFrame(tick); }, { once: true });
    // Start immediately if video already loaded
    if (vid.readyState >= 2) rafRef.current = requestAnimationFrame(tick);
  }, []);

  // ── Init when stream changes ───────────────────────────────
  useEffect(() => {
    if (!inputStream) return;
    if (!inputStream.getVideoTracks().length) {
      setCanvasStream(inputStream); // audio-only — pass through
      return;
    }
    startCanvas(inputStream);
    return () => {
      activeRef.current = false;
      cancelAnimationFrame(rafRef.current);
      hiddenVidRef.current?.pause();
    };
  }, [inputStream, startCanvas]);

  // ── Select background ──────────────────────────────────────
  const selectBackground = useCallback((opt: BgOption) => {
    setSelected(opt);
    // Update CSS filter for blur fallback
    if (opt.type === 'blur')        setCssFilter('blur(14px)');
    else if (opt.type === 'blur-strong') setCssFilter('blur(28px)');
    else                            setCssFilter('none');
    // Preload image if needed
    if (opt.src) preloadImg(opt.src);
    // Load MediaPipe lazily for image backgrounds
    if ((opt.type === 'image' || opt.type === 'custom') && !segRef.current) {
      loadMediaPipe();
    }
  }, [preloadImg, loadMediaPipe]);

  // ── Custom upload ──────────────────────────────────────────
  const uploadCustom = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const custom: BgOption = { id: 'custom', type: 'custom', label: 'My Photo', src: url, thumb: url };
    preloadImg(url);
    setSelected(custom);
    setCssFilter('none');
    if (!segRef.current) loadMediaPipe();
  }, [preloadImg, loadMediaPipe]);

  // Effective stream: raw input for 'none', canvas output for everything else
  const virtualStream = selected.type === 'none' ? inputStream : (canvasStream ?? inputStream);

  return { virtualStream, cssFilter, selected, selectBackground, uploadCustom, segReady, loading };
}
