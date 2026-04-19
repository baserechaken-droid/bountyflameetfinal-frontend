import React from 'react';
import { X, Mic, MicOff, Video, VideoOff, MonitorUp, Crown } from 'lucide-react';
import { PeerData } from '../types';
import { getInitials, getPeerColor } from '../lib/utils';

interface PeoplePanelProps {
  peers: Map<string, PeerData>;
  mySocketId: string | null;
  myName: string;
  myMicOn: boolean;
  myCameraOn: boolean;
  onClose: () => void;
}

export function PeoplePanel({ peers, mySocketId, myName, myMicOn, myCameraOn, onClose }: PeoplePanelProps) {
  const peerList = Array.from(peers.values());
  const total = peerList.length + 1; // +1 for self

  return (
    <div className="flex flex-col h-full glass-dark border-l border-white/[0.06] w-full md:w-[280px] animate-slide-right">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
        <h2 className="text-sm font-bold text-white">Participants ({total})</h2>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-white/60 hover:text-white transition-all"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-1 hide-scrollbar">
        {/* Self */}
        <PersonRow
          name={myName}
          socketId={mySocketId ?? 'self'}
          micOn={myMicOn}
          cameraOn={myCameraOn}
          isScreenSharing={false}
          connState="connected"
          isHost
          isSelf
        />
        {/* Peers */}
        {peerList.map((peer) => (
          <PersonRow
            key={peer.socketId}
            name={peer.name}
            socketId={peer.socketId}
            micOn={!peer.micMuted}
            cameraOn={!peer.videoMuted}
            isScreenSharing={peer.isScreenSharing}
            connState={peer.connectionState}
          />
        ))}
      </div>
    </div>
  );
}

function PersonRow({
  name, socketId, micOn, cameraOn, isScreenSharing, connState, isHost, isSelf,
}: {
  name: string; socketId: string; micOn: boolean; cameraOn: boolean;
  isScreenSharing: boolean; connState: string; isHost?: boolean; isSelf?: boolean;
}) {
  const initials = getInitials(name);
  const gradient = getPeerColor(isSelf ? 'self' : socketId);
  const isConnected = connState === 'connected' || isSelf;

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors">
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
        style={{ background: gradient }}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-white truncate">{name}</span>
          {isSelf && <span className="text-[9px] text-flame-400 font-bold">(you)</span>}
          {isHost && <Crown size={10} className="text-yellow-400 shrink-0" />}
        </div>
        <span className={`text-[10px] font-medium ${isConnected ? 'text-green-400' : 'text-yellow-400'}`}>
          {isSelf ? 'Host' : isConnected ? 'Connected' : connState}
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {isScreenSharing && <MonitorUp size={13} className="text-cyan-accent" />}
        {micOn ? <Mic size={13} className="text-green-400" /> : <MicOff size={13} className="text-red-400" />}
        {cameraOn ? <Video size={13} className="text-green-400" /> : <VideoOff size={13} className="text-red-400" />}
      </div>
    </div>
  );
}
