/**
 * VideoGrid — Works on all devices
 * © Ken Baserecha — Boutyflameet
 *
 * Fixes:
 * - Self-view forcefully attaches stream with retry on autoplay block
 * - Peer tiles: re-attach whenever stream object or track changes
 * - "Poor connection" only on truly 'failed' state
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
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
  screenSharing, speakingPeers = new Set(), isAlone = false,
}: VideoGridProps) {
  const peerList    = Array.from(peers.values()).filter(p => p.connection !== null);
  const remoteCount = peerList.length;

  const gridCols =
    remoteCount === 0 ? 'grid-cols-1'
    : remoteCount === 1 ? 'grid-cols-1 sm:grid-cols-2'
    : remoteCount <= 3  ? 'grid-cols-2'
    : remoteCount <= 8  ? 'grid-cols-3'
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

        {/* Self tile — always rendered to keep stream alive */}
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

// ── Self-view tile ─────────────────────────────────────────────
function SelfTile({ stream, name, micOn, cameraOn, screenSharing, size }: {
  stream: MediaStream | null; name: string;
  micOn: boolean; cameraOn: boolean; screenSharing: boolean;
  size: 'hero'|'lg'|'md'|'sm';
}) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const [playing,   setPlaying]   = useState(false);
  const [camError,  setCamError]  = useState(false);
  const lastStream  = useRef<MediaStream | null>(null);

  const tryPlay = useCallback(async (vid: HTMLVideoElement) => {
    try {
      await vid.play();
      setPlaying(true);
      setCamError(false);
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        // Autoplay blocked — retry on first interaction
        const resume = () => {
          vid.play().then(() => setPlaying(true)).catch(() => {});
          document.removeEventListener('click',      resume);
          document.removeEventListener('touchstart', resume);
        };
        document.addEventListener('click',      resume, { once: true });
        document.addEventListener('touchstart', resume, { once: true, passive: true });
      } else {
        setCamError(true);
      }
    }
  }, []);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    if (stream && stream.active) {
      if (lastStream.current !== stream) {
        lastStream.current = stream;
        vid.srcObject = stream;
        setPlaying(false);
        tryPlay(vid);
      } else if (vid.paused) {
        tryPlay(vid);
      }
    } else {
      vid.srcObject = null;
      lastStream.current = null;
      setPlaying(false);
    }
  }, [stream, tryPlay]);

  // Re-check when cameraOn changes (track may have been re-enabled)
  useEffect(() => {
    const vid = videoRef.current;
    if (vid && vid.paused && stream?.active) tryPlay(vid);
  }, [cameraOn, stream, tryPlay]);

  const hasLiveVideo =
    !!stream && stream.active && cameraOn &&
    stream.getVideoTracks().some(t => t.enabled && t.readyState === 'live');

  const showVideo = hasLiveVideo && playing && !camError;

  const initials = name.split(' ').map(w => w[0]?.toUpperCase() ?? '').slice(0, 2).join('') || '?';
  const initSize = {
    hero: 'text-5xl w-28 h-28',
    lg:   'text-3xl w-20 h-20',
    md:   'text-2xl w-16 h-16',
    sm:   'text-xl  w-12 h-12',
  };

  return (
    <div className="relative rounded-2xl overflow-hidden bg-dark-800 border-2 border-flame-500/40 aspect-video min-h-0">

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        style={{ transform: 'scaleX(-1)', display: showVideo ? 'block' : 'none', backgroundColor: '#0D0D26' }}
      />

      {screenSharing && (
        <div className="absolute top-3 left-3 bg-black/90 text-white text-xs font-semibold px-3 py-1.5 rounded-xl z-20 border border-white/20">
          🖥️ Sharing screen
        </div>
      )}

      {!showVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg,#0D0D26,#1A1A42)' }}>
          <div className={`rounded-2xl flex items-center justify-center font-bold text-white/90 ${initSize[size]}`}
            style={{ background: 'linear-gradient(135deg,#FF4500,#DC2626)' }}>
            {initials}
          </div>
          <span className="text-white/40 text-xs">
            {!stream ? 'Starting camera…' : !cameraOn ? 'Camera off' : camError ? 'Camera error' : 'Loading…'}
          </span>
        </div>
      )}

      <div className="absolute top-2 left-2 bg-flame-500/85 text-white text-[9px] font-black px-2 py-0.5 rounded tracking-widest z-10">
        YOU
      </div>

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
