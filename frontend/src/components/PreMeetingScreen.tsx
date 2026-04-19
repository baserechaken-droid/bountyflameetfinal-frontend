/**
 * PreMeetingScreen — Camera & mic permission + name entry before joining
 * © Ken Baserecha — Boutyflameet
 *
 * Shown ONCE before entering the meeting room.
 * Requests camera/mic explicitly with clear UI — critical for mobile.
 * Also collects name if not already set.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Video, VideoOff, ArrowRight, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import logoSrc from '../assets/logo.jpeg';
import { COPYRIGHT } from '../lib/constants';

interface Props {
  roomId:      string;
  userName:    string;
  onNameChange:(name: string) => void;
  onJoin:      (stream: MediaStream | null) => void;
}

type PermState = 'idle' | 'requesting' | 'granted' | 'denied' | 'error';

export function PreMeetingScreen({ roomId, userName, onNameChange, onJoin }: Props) {
  const [name,      setName]      = useState(userName);
  const [nameError, setNameError] = useState('');
  const [permState, setPermState] = useState<PermState>('idle');
  const [stream,    setStream]    = useState<MediaStream | null>(null);
  const [camOn,     setCamOn]     = useState(true);
  const [micOn,     setMicOn]     = useState(true);
  const [joining,   setJoining]   = useState(false);
  const [errorMsg,  setErrorMsg]  = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);

  // ── Request camera + mic ─────────────────────────────────
  const requestPermissions = useCallback(async () => {
    setPermState('requesting');
    setErrorMsg('');

    // Progressive constraint attempts (works across all phones)
    const attempts: MediaStreamConstraints[] = [
      { video: { facingMode: 'user' }, audio: true },
      { video: true, audio: true },
      { video: { facingMode: { ideal: 'user' } }, audio: { echoCancellation: true, noiseSuppression: true } },
      { video: { width: { max: 640 }, height: { max: 480 } }, audio: true },
      { video: true, audio: false },
      { video: false, audio: true },
    ];

    for (const c of attempts) {
      try {
        const s = await navigator.mediaDevices.getUserMedia(c);
        setStream(s);
        setPermState('granted');
        setCamOn(s.getVideoTracks().length > 0);
        setMicOn(s.getAudioTracks().length > 0);
        // Attach to preview video
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
        return;
      } catch (e: any) {
        if (e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError') {
          setPermState('denied');
          setErrorMsg('Camera/mic permission denied. Go to your browser settings → allow camera & microphone for this site, then refresh.');
          return;
        }
        // Otherwise try next constraint
      }
    }

    // All failed — try audio-only last resort
    try {
      const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStream(audioOnly);
      setPermState('granted');
      setCamOn(false);
      setMicOn(true);
      setErrorMsg('Camera not available — joining with microphone only.');
    } catch {
      setPermState('error');
      setErrorMsg('Could not access camera or microphone. Make sure another app isn\'t using them, then refresh.');
    }
  }, []);

  // Request on mount
  useEffect(() => {
    requestPermissions();
    return () => { stream?.getTracks().forEach(t => t.stop()); };
  }, []); // eslint-disable-line

  // Attach stream to video preview when it arrives
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !stream) return;
    vid.srcObject = stream;
    vid.play().catch(() => {});
  }, [stream]);

  // Toggle camera in preview
  const toggleCam = () => {
    if (!stream) return;
    const next = !camOn;
    stream.getVideoTracks().forEach(t => { t.enabled = next; });
    setCamOn(next);
  };

  // Toggle mic in preview
  const toggleMic = () => {
    if (!stream) return;
    const next = !micOn;
    stream.getAudioTracks().forEach(t => { t.enabled = next; });
    setMicOn(next);
  };

  const handleJoin = () => {
    const n = name.trim();
    if (!n || n.length < 2) { setNameError('Enter your name (at least 2 characters)'); return; }
    onNameChange(n);
    setJoining(true);
    onJoin(stream);
  };

  const hasVideo = !!stream && stream.getVideoTracks().some(t => t.readyState === 'live') && camOn;

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center px-4 py-8"
      style={{ background: 'radial-gradient(ellipse at center, rgba(255,69,0,0.08) 0%, #07071A 60%)' }}>

      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-8">
        <img src={logoSrc} alt="Boutyflameet" className="w-10 h-10 rounded-full object-cover animate-flame-pulse"/>
        <span className="text-xl font-black text-white">Boutyflameet</span>
      </div>

      <div className="w-full max-w-md">

        {/* Camera Preview */}
        <div className="relative rounded-2xl overflow-hidden bg-dark-800 border-2 border-white/10 mb-4"
          style={{ aspectRatio: '16/9' }}>

          <video ref={videoRef} autoPlay playsInline muted controls={false}
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)', display: hasVideo ? 'block' : 'none' }}/>

          {/* Avatar when no camera */}
          {!hasVideo && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
              style={{ background: 'linear-gradient(135deg,#0D0D26,#1A1A42)' }}>
              {permState === 'requesting' ? (
                <>
                  <Loader2 size={36} className="text-flame-500 animate-spin"/>
                  <p className="text-white/50 text-sm text-center px-4">
                    Requesting camera &amp; microphone access…
                  </p>
                  <p className="text-white/30 text-xs text-center px-4">
                    Tap <strong className="text-white/50">Allow</strong> when your browser asks
                  </p>
                </>
              ) : permState === 'denied' || permState === 'error' ? (
                <>
                  <AlertCircle size={36} className="text-orange-400"/>
                  <p className="text-white/60 text-sm text-center px-4 leading-relaxed">{errorMsg}</p>
                  <button onClick={requestPermissions}
                    className="flex items-center gap-2 text-flame-400 text-xs font-bold hover:text-flame-300 transition-colors">
                    <RefreshCw size={12}/> Try again
                  </button>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-black text-white"
                    style={{ background: 'linear-gradient(135deg,#FF4500,#DC2626)' }}>
                    {(name || 'U').charAt(0).toUpperCase()}
                  </div>
                  <p className="text-white/40 text-xs">
                    {!camOn ? 'Camera is off' : 'Camera starting…'}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Cam/Mic toggle buttons overlay */}
          {permState === 'granted' && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
              <button onClick={toggleCam}
                className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all ${camOn ? 'bg-white/10 border-white/20 text-white hover:bg-white/20' : 'bg-red-500/80 border-red-400/50 text-white'}`}>
                {camOn ? <Video size={16}/> : <VideoOff size={16}/>}
              </button>
              <button onClick={toggleMic}
                className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all ${micOn ? 'bg-white/10 border-white/20 text-white hover:bg-white/20' : 'bg-red-500/80 border-red-400/50 text-white'}`}>
                {micOn ? <Mic size={16}/> : <MicOff size={16}/>}
              </button>
            </div>
          )}
        </div>

        {/* Room code */}
        <p className="text-center text-white/40 text-xs mb-5 font-mono">
          Joining room <span className="text-flame-400 font-black">{roomId}</span>
        </p>

        {/* Name input */}
        <div className="mb-4">
          <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-1.5">
            Your display name
          </label>
          <input
            value={name}
            onChange={e => { setName(e.target.value); setNameError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            placeholder="Enter your name…"
            maxLength={40}
            autoComplete="name"
            className={`w-full bg-white/[0.06] border rounded-xl px-4 py-3 text-base text-white placeholder-white/25 outline-none transition-all ${
              nameError ? 'border-red-500/60 ring-2 ring-red-500/20' : 'border-white/10 focus:border-flame-500/60 focus:ring-2 focus:ring-flame-500/20'
            }`}
          />
          {nameError && <p className="text-red-400 text-xs mt-1.5">{nameError}</p>}
        </div>

        {/* Inline error */}
        {errorMsg && permState !== 'denied' && (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3 mb-4">
            <p className="text-orange-400 text-xs leading-relaxed">{errorMsg}</p>
          </div>
        )}

        {/* Join button */}
        <button
          onClick={handleJoin}
          disabled={joining || permState === 'requesting'}
          className="w-full py-4 rounded-xl font-bold text-base btn-flame text-white flex items-center justify-center gap-2.5 disabled:opacity-60 disabled:cursor-not-allowed transition-all">
          {joining
            ? <><Loader2 size={18} className="animate-spin"/>Joining…</>
            : <><ArrowRight size={18}/>Join Meeting</>
          }
        </button>

        {/* Tip */}
        <p className="text-center text-white/25 text-xs mt-4 leading-relaxed">
          {permState === 'denied'
            ? '💡 Tip: In Chrome tap the camera icon in the address bar → Allow'
            : '🔒 Your camera and microphone are only active while in the meeting'}
        </p>
      </div>

      <p className="text-white/15 text-[10px] mt-8">{COPYRIGHT}</p>
    </div>
  );
}
