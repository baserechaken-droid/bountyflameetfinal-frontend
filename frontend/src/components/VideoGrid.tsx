/**
 * VideoGrid — Responsive video layout v4
 * © Ken Baserecha — Boutyflameet
 *
 * NEW: handRaised badge, host badge, recording indicator,
 *      host can remove participants from tile, better grid math
 */
import React, { useEffect, useRef } from 'react';
import { UserX } from 'lucide-react';
import { PeerData } from '../types';
import { VideoTile } from './ui';

interface VideoGridProps {
  peers:          Map<string, PeerData>;
  localStream:    MediaStream | null;
  localName:      string;
  micOn:          boolean;
  cameraOn:       boolean;
  screenSharing:  boolean;
  mySocketId:     string | null;
  speakingPeers?: Set<string>;
  isAlone?:       boolean;
  isHost?:        boolean;
  onRemoveParticipant?: (socketId: string) => void;
}

export function VideoGrid({
  peers, localStream, localName, micOn, cameraOn, mySocketId,
  speakingPeers = new Set(), isAlone = false, isHost, onRemoveParticipant,
}: VideoGridProps) {
  const peerList    = Array.from(peers.values()).filter(p => p.connection);
  const remoteCount = peerList.length;
  const total       = remoteCount + 1;

  const gridCols =
    total === 1 ? 'grid-cols-1' :
    total === 2 ? 'grid-cols-2' :
    total <= 4  ? 'grid-cols-2' :
    total <= 9  ? 'grid-cols-3' :
    'grid-cols-4';

  const tileSize: 'hero'|'lg'|'md'|'sm' =
    total === 1 ? 'hero' :
    total === 2 ? 'lg'   :
    total <= 4  ? 'md'   : 'sm';

  return (
    <div className={`flex-1 overflow-auto p-2 md:p-3 hide-scrollbar transition-opacity duration-500 ${isAlone ? 'opacity-30' : 'opacity-100'}`}>
      <div className={`grid ${gridCols} gap-2 md:gap-3 h-full`}>

        {peerList.map(peer => (
          <div key={peer.socketId} className="relative group">
            <VideoTile
              peer={peer} name={peer.name} socketId={peer.socketId}
              isSpeaking={speakingPeers.has(peer.socketId)}
              size={tileSize} className="aspect-video min-h-0 w-full h-full"/>
            {/* Host remove button */}
            {isHost && onRemoveParticipant && (
              <button
                onClick={() => onRemoveParticipant(peer.socketId)}
                title={`Remove ${peer.name}`}
                className="absolute top-2 right-2 z-30 opacity-0 group-hover:opacity-100 w-7 h-7 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center transition-all shadow-lg">
                <UserX size={13} className="text-white"/>
              </button>
            )}
          </div>
        ))}

        {/* Self tile */}
        <SelfTile
          stream={localStream} name={localName}
          micOn={micOn} cameraOn={cameraOn} size={tileSize}/>
      </div>
    </div>
  );
}

function SelfTile({ stream, name, micOn, cameraOn, size }: {
  stream: MediaStream | null; name: string;
  micOn: boolean; cameraOn: boolean;
  size: 'hero'|'lg'|'md'|'sm';
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (stream) {
      if (vid.srcObject !== stream) {
        vid.srcObject = stream;
        const p = vid.play();
        if (p) p.catch(() => {
          const resume = () => { vid.play().catch(() => {}); vid.removeEventListener('click', resume); };
          vid.addEventListener('click', resume);
          document.addEventListener('touchstart', () => vid.play().catch(() => {}), { once: true });
        });
      }
    } else {
      vid.srcObject = null;
    }
  }, [stream]);

  const hasVideo = !!stream && stream.getVideoTracks().some(t => t.enabled && t.readyState === 'live') && cameraOn;
  const initials = name.split(' ').map(w => w[0]?.toUpperCase() ?? '').slice(0, 2).join('') || '?';
  const initSize = { hero: 'text-5xl w-28 h-28', lg: 'text-3xl w-20 h-20', md: 'text-2xl w-16 h-16', sm: 'text-xl w-12 h-12' };

  return (
    <div className="relative rounded-2xl overflow-hidden bg-dark-700 border-2 border-flame-500/40 aspect-video min-h-0">
      <video ref={videoRef} autoPlay playsInline muted
        className="w-full h-full object-cover"
        style={{ transform: 'scaleX(-1)', display: hasVideo ? 'block' : 'none' }}/>

      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg,#0D0D26,#1A1A42)' }}>
          <div className={`rounded-2xl flex items-center justify-center font-bold text-white/90 ${initSize[size]}`}
            style={{ background: 'linear-gradient(135deg,#FF4500,#DC2626)' }}>
            {initials}
          </div>
        </div>
      )}

      <div className="absolute top-2 left-2 bg-flame-500/85 text-white text-[9px] font-black px-2 py-0.5 rounded tracking-widest z-10">
        YOU
      </div>

      {!micOn && (
        <div className="absolute top-2 right-2 bg-red-500/90 rounded-full p-1 z-10">
          <svg width="10" height="10" fill="white" viewBox="0 0 24 24">
            <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3 3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
          </svg>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-gradient-to-t from-black/75 to-transparent">
        <span className="text-white font-semibold text-xs truncate block">{name} (You)</span>
      </div>
    </div>
  );
}
