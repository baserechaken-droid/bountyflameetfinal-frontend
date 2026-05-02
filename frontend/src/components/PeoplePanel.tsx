/**
 * PeoplePanel — Participants list with host controls v4
 * © Ken Baserecha — Boutyflameet
 */
import React from 'react';
import { X, Mic, MicOff, Video, VideoOff, MonitorUp, Crown, UserX, VolumeX } from 'lucide-react';
import { PeerData } from '../types';
import { getInitials, getPeerColor } from '../lib/utils';

interface PeoplePanelProps {
  peers:       Map<string, PeerData>;
  mySocketId:  string | null;
  myName:      string;
  myMicOn:     boolean;
  myCameraOn:  boolean;
  isHost?:     boolean;
  onMuteAll?:  () => void;
  onRemove?:   (socketId: string) => void;
  onClose:     () => void;
}

export function PeoplePanel({ peers, mySocketId, myName, myMicOn, myCameraOn, isHost, onMuteAll, onRemove, onClose }: PeoplePanelProps) {
  const peerList = Array.from(peers.values());
  const total    = peerList.length + 1;

  return (
    <div className="flex flex-col h-full glass-dark border-l border-white/[0.06] w-full md:w-[280px] animate-slide-right">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
        <h2 className="text-sm font-bold text-white">Participants ({total})</h2>
        <div className="flex items-center gap-2">
          {isHost && onMuteAll && (
            <button onClick={onMuteAll} title="Mute all"
              className="flex items-center gap-1 text-xs text-white/50 hover:text-white bg-white/[0.06] hover:bg-white/[0.12] px-2 py-1 rounded-lg transition-all">
              <VolumeX size={12}/> Mute All
            </button>
          )}
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-white/60 hover:text-white transition-all">
            <X size={14}/>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-1 hide-scrollbar">
        {/* Self */}
        <PersonRow name={myName} socketId={mySocketId??'self'} micOn={myMicOn}
          cameraOn={myCameraOn} isHost connState="connected" isSelf/>

        {/* Peers */}
        {peerList.map(peer => (
          <PersonRow
            key={peer.socketId}
            name={peer.name}
            socketId={peer.socketId}
            micOn={!peer.micMuted}
            cameraOn={!peer.videoMuted}
            isScreenSharing={peer.isScreenSharing}
            handRaised={peer.handRaised}
            isHost={peer.isHost}
            isRecording={peer.isRecording}
            connState={peer.connectionState}
            canRemove={isHost && !!onRemove}
            onRemove={onRemove ? () => onRemove(peer.socketId) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function PersonRow({ name, socketId, micOn, cameraOn, isScreenSharing, handRaised, isHost, isRecording,
  connState, isSelf, canRemove, onRemove }: {
  name: string; socketId: string; micOn: boolean; cameraOn: boolean;
  isScreenSharing?: boolean; handRaised?: boolean; isHost?: boolean;
  isRecording?: boolean; connState: string;
  isSelf?: boolean; canRemove?: boolean; onRemove?: () => void;
}) {
  const initials    = getInitials(name);
  const gradient    = getPeerColor(isSelf ? 'self' : socketId);
  const isConnected = connState === 'connected' || isSelf;

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors group">
      <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 relative"
        style={{ background: gradient }}>
        {initials}
        {handRaised && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-yellow-400 flex items-center justify-center text-[10px] shadow">✋</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-semibold text-white truncate">{name}</span>
          {isSelf  && <span className="text-[9px] text-flame-400 font-bold shrink-0">(you)</span>}
          {isHost  && <Crown size={10} className="text-yellow-400 shrink-0"/>}
          {isRecording && <span className="text-[9px] text-red-400 font-bold shrink-0 animate-pulse">●REC</span>}
        </div>
        <span className={`text-[10px] font-medium ${isConnected?'text-green-400':'text-yellow-400'}`}>
          {isSelf ? 'Host · You' : isConnected ? 'Connected' : connState}
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {isScreenSharing && <MonitorUp size={13} className="text-cyan-400"/>}
        {micOn    ? <Mic   size={13} className="text-green-400"/> : <MicOff   size={13} className="text-red-400"/>}
        {cameraOn ? <Video size={13} className="text-green-400"/> : <VideoOff size={13} className="text-red-400"/>}
        {canRemove && onRemove && (
          <button onClick={onRemove} title="Remove from meeting"
            className="opacity-0 group-hover:opacity-100 ml-1 w-6 h-6 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition-all">
            <UserX size={11} className="text-red-400"/>
          </button>
        )}
      </div>
    </div>
  );
}
