/**
 * VideoGrid — Camera grid that works on ALL devices
 * © Ken Baserecha — Boutyflameet
 *
 * Key fixes:
 * - Self camera always shows (forceful srcObject attach + retry)
 * - Peer video re-attaches when stream reference changes
 * - "Poor connection" only on truly failed (not transient disconnected)
 * - Track liveness checked properly for hasVideo
 * - Mobile-safe: playsInline + muted + autoPlay on every video
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { PeerData } from '../types';
import { VideoTile } from './ui';

interface VideoGridProps {
  peers:         Map<string, PeerData>;
  localStream:   MediaStream | null;
  localName:     string;
  micOn:         boolean;
  cameraOn:      boolean;
  screenSharing: boolean;
  mySocketId:    string | null;
  speakingPeers?: Set<string>;
  isAlone?:      boolean;
}

export function VideoGrid({
  peers, localStream, localName, micOn, cameraOn,
  screenSharing, mySocketId, speakingPeers = new Set(), isAlone = false,
}: VideoGridProps) {
  const peerList    = Array.from(peers.values());
  const remoteCount = peerList.length;

  const gridCols =
    remoteCount === 0 ? 'grid-cols-1'
    : remoteCount === 1 ? 'grid-cols-1 sm:grid-cols-2'
    : remoteCount <= 3 ? 'grid-cols-2'
    : remoteCount <= 8 ? 'grid-cols-3'
    : 'grid-cols-4';

  const tileSize: 'hero'|'lg'|'md'|'sm' =
    remoteCount === 0 ? 'hero'
    : remoteCount === 1 ? 'lg'
    : remoteCount <= 3 ? 'md'
    : 'sm';

  return (
    <div className={`flex-1 overflow-auto p-3 hide-scrollbar transition-opacity duration-300 ${isAlone ? 'opacity-25' : 'opacity-100'}`}>
      <div className={`grid ${gridCols} gap-3 h-full`}>

        {/* Remote peers */}
        {peerList.map(peer => (
          <VideoTile
            key={peer.socketId}
            peer={peer}
            name={peer.name}
            socketId={peer.socketId}
            isSpeaking={speakingPeers.has(peer.socketId)}
            size={tileSize}
            className="aspect-video min-h-0"
          />
        ))}

        {/* Self tile — always rendered to keep camera stream alive */}
        <SelfTile
          stream={localStream}
          name={localName}
          micOn={micOn}
          cameraOn={cameraOn}
          screenSharing={screenSharing}
          size={tileSize}
        />
      </div>
    </div>
  );
}

// ── Self Tile ──────────────────────────────────────────────────
function SelfTile({ stream, name, micOn, cameraOn, screenSharing, size }: {
  stream:        MediaStream | null;
  name:          string;
  micOn:         boolean;
  cameraOn:      boolean;
  screenSharing: boolean;
  size:          'hero'|'lg'|'md'|'sm';
}) {
  const videoRef     = useRef<HTMLVideoElement>(null);
  const [playing,    setPlaying] = useState(false);
  const [camError,   setCamError] = useState(false);
  const attachedRef  = useRef<MediaStream | null>(null);

  // ── Attach stream to video element ────────────────────────
  const attachStream = useCallback(async (vid: HTMLVideoElement, s: MediaStream) => {
    if (attachedRef.current === s && playing) return; // already attached
    try {
      vid.pause();
      vid.srcObject = s;
      attachedRef.current = s;
      await vid.play();
      setPlaying(true);
      setCamError(false);
    } catch (err: any) {
      // AutoPlay policy: retry on user interaction
      if (err?.name === 'NotAllowedError') {
        const retry = () => { vid.play().catch(() => {}); document.removeEventListener('click', retry); document.removeEventListener('touchstart', retry); };
        document.addEventListener('click', retry, { once: true });
        document.addEventListener('touchstart', retry, { once: true });
      } else {
        setCamError(true);
        console.warn('[SelfTile] play() failed:', err);
      }
    }
  }, [playing]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    if (stream && stream.active) {
      attachStream(vid, stream);
    } else {
      vid.srcObject = null;
      attachedRef.current = null;
      setPlaying(false);
    }
  }, [stream, attachStream]);

  // ── Re-check if tracks change (e.g. toggling camera) ──────
  useEffect(() => {
    if (!stream) return;
    const tracks = stream.getVideoTracks();
    tracks.forEach(t => {
      t.addEventListener('ended', () => { setPlaying(false); });
      t.addEventListener('unmute', () => {
        const vid = videoRef.current;
        if (vid && vid.paused) vid.play().catch(() => {});
      });
    });
  }, [stream]);

  // ── Determine if video should show ───────────────────────
  const hasLiveVideo = !!stream &&
    stream.active &&
    stream.getVideoTracks().some(t => t.enabled && t.readyState === 'live') &&
    cameraOn;

  const showVideo = hasLiveVideo && playing && !camError;

  const initials  = name.split(' ').map(w => w[0]?.toUpperCase() ?? '').slice(0, 2).join('') || '?';
  const initSize  = { hero: 'text-5xl w-28 h-28', lg: 'text-3xl w-20 h-20', md: 'text-2xl w-16 h-16', sm: 'text-xl w-12 h-12' };

  return (
    <div className="relative rounded-2xl overflow-hidden bg-dark-800 border-2 border-flame-500/40 aspect-video min-h-0">

      {/* Camera feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        controls={false}
        disablePictureInPicture
        className="w-full h-full object-cover"
        style={{
          transform: 'scaleX(-1)',
          display: showVideo ? 'block' : 'none',
          backgroundColor: '#0D0D26',
        }}
      />

      {/* Screen sharing label */}
      {screenSharing && (
        <div className="absolute top-3 left-3 bg-black/90 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-2 z-20 border border-white/20">
          🖥️ You're sharing screen
        </div>
      )}

      {/* Avatar fallback when camera off or not streaming yet */}
      {!showVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg,#0D0D26,#1A1A42)' }}>
          <div className={`rounded-2xl flex items-center justify-center font-bold text-white/90 ${initSize[size]}`}
            style={{ background: 'linear-gradient(135deg,#FF4500,#DC2626)' }}>
            {initials}
          </div>
          {stream && !cameraOn && (
            <span className="text-white/40 text-xs">Camera off</span>
          )}
          {!stream && (
            <span className="text-white/40 text-xs animate-pulse">Starting camera…</span>
          )}
          {camError && (
            <span className="text-red-400 text-xs">Camera error — check permissions</span>
          )}
        </div>
      )}

      {/* YOU badge */}
      <div className="absolute top-2 left-2 bg-flame-500/85 text-white text-[9px] font-black px-2 py-0.5 rounded tracking-widest z-10">
        YOU
      </div>

      {/* Name + mute strip */}
      <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between z-10">
        <span className="text-white font-semibold text-xs truncate">{name} (You)</span>
        {!micOn && (
          <div className="bg-red-500/90 rounded-full p-0.5 ml-2 shrink-0">
            <svg width="10" height="10" fill="white" viewBox="0 0 24 24">
              <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3 3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
