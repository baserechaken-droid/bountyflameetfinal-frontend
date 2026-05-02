/**
 * ControlsBar — Meeting controls v4
 * © Ken Baserecha — Boutyflameet
 *
 * NEW: Recording button, unread badge, hasNewReaction dot, touch support
 */
import React, { useEffect, useCallback } from 'react';
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, MonitorOff,
  MessageSquare, Users, PhoneOff, Hand, Smile, ImageIcon, Sparkles, Circle,
} from 'lucide-react';
import { ALLOWED_REACTIONS } from '../lib/constants';

interface ControlsBarProps {
  micOn:         boolean; cameraOn:      boolean; screenSharing: boolean;
  chatOpen:      boolean; peopleOpen:    boolean; bgPanelOpen:   boolean;
  handRaised:    boolean; showReactions: boolean;
  unreadCount?:  number;
  hasNewReaction?: boolean;
  isRecording?:  boolean;
  onToggleMic:   () => void; onToggleCamera:   () => void; onToggleScreen: () => void;
  onToggleChat:  () => void; onTogglePeople:   () => void; onToggleBgPanel: () => void;
  onToggleAI:    () => void; onToggleHand:     () => void; onToggleReactions: () => void;
  onToggleRecording?: () => void;
  onLeave:       () => void; onReaction: (e: string) => void;
  roomId: string; participantCount: number;
}

function CtrlBtn({ onClick, active, danger, off, tip, children, className = '', badge, dot }: {
  onClick: () => void; active?: boolean; danger?: boolean; off?: boolean;
  tip: string; children: React.ReactNode; className?: string; badge?: number; dot?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      onTouchStart={e => { e.preventDefault(); onClick(); }}
      title={tip} aria-label={tip}
      className={[
        'relative w-11 h-11 md:w-12 md:h-12 rounded-2xl flex items-center justify-center transition-all duration-200 group border select-none',
        danger  ? 'bg-red-500 hover:bg-red-400 border-red-400/50 text-white'
        : off   ? 'bg-red-500/20 hover:bg-red-500/30 border-red-500/40 text-red-400'
        : active ? 'bg-flame-500 hover:bg-flame-400 border-flame-400/50 text-white shadow-flame-sm'
                 : 'bg-white/[0.08] hover:bg-white/[0.16] border-white/[0.08] text-white',
        className,
      ].join(' ')}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-flame-500 text-white text-[9px] font-black flex items-center justify-center px-1 shadow-lg z-10">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      {dot && (
        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-yellow-400 shadow-md z-10"/>
      )}
      <span className="absolute -top-9 left-1/2 -translate-x-1/2 bg-dark-800 border border-white/10 text-white text-[10px] font-medium px-2 py-1 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
        {tip}
      </span>
    </button>
  );
}

export function ControlsBar({
  micOn, cameraOn, screenSharing, chatOpen, peopleOpen, bgPanelOpen,
  handRaised, showReactions, unreadCount = 0, hasNewReaction = false, isRecording = false,
  onToggleMic, onToggleCamera, onToggleScreen, onToggleChat, onTogglePeople,
  onToggleBgPanel, onToggleAI, onToggleHand, onToggleReactions, onToggleRecording,
  onLeave, onReaction, participantCount,
}: ControlsBarProps) {

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (['INPUT','TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
    switch (e.key.toLowerCase()) {
      case 'm': onToggleMic();    break;
      case 'v': onToggleCamera(); break;
      case 'c': onToggleChat();   break;
      case 'r': onReaction(ALLOWED_REACTIONS[Math.floor(Math.random()*ALLOWED_REACTIONS.length)]); break;
    }
  }, [onToggleMic, onToggleCamera, onToggleChat, onReaction]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  return (
    <div className="relative">
      {showReactions && (
        <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 glass border border-white/10 rounded-2xl px-4 py-3 flex gap-3 animate-slide-up z-20">
          {ALLOWED_REACTIONS.map(e => (
            <button key={e}
              onClick={() => { onReaction(e); onToggleReactions(); }}
              onTouchStart={ev => { ev.preventDefault(); onReaction(e); onToggleReactions(); }}
              className="text-2xl hover:scale-125 active:scale-110 transition-transform">
              {e}
            </button>
          ))}
        </div>
      )}

      <div className="glass-dark border-t border-white/[0.06] px-3 py-2.5 md:px-6 md:py-4">
        <div className="flex items-center justify-between max-w-3xl mx-auto gap-1.5 md:gap-2">

          {/* Left: mic + camera */}
          <div className="flex items-center gap-1.5 md:gap-2">
            <CtrlBtn onClick={onToggleMic}    off={!micOn}    tip={micOn    ? 'Mute (M)'       : 'Unmute (M)'}>
              {micOn    ? <Mic   size={19}/> : <MicOff   size={19}/>}
            </CtrlBtn>
            <CtrlBtn onClick={onToggleCamera} off={!cameraOn} tip={cameraOn ? 'Stop video (V)' : 'Start video (V)'}>
              {cameraOn ? <Video size={19}/> : <VideoOff size={19}/>}
            </CtrlBtn>
          </div>

          {/* Centre: all other controls */}
          <div className="flex items-center gap-1.5 md:gap-2 flex-wrap justify-center">
            <CtrlBtn onClick={onToggleScreen} active={screenSharing}
              tip={screenSharing ? 'Stop sharing' : 'Share screen'}>
              {screenSharing ? <MonitorOff size={19}/> : <MonitorUp size={19}/>}
            </CtrlBtn>

            <CtrlBtn onClick={onToggleReactions} tip="Reactions (R)" dot={hasNewReaction && !showReactions}>
              <Smile size={19}/>
            </CtrlBtn>

            <CtrlBtn onClick={onToggleHand} active={handRaised} tip={handRaised ? 'Lower hand' : 'Raise hand'}>
              <Hand size={19}/>
              {handRaised && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-yellow-400 animate-ping"/>}
            </CtrlBtn>

            <CtrlBtn onClick={onToggleChat} active={chatOpen} tip="Chat (C)"
              badge={chatOpen ? 0 : unreadCount}>
              <MessageSquare size={19}/>
            </CtrlBtn>

            <CtrlBtn onClick={onTogglePeople} active={peopleOpen} tip="Participants">
              <div className="relative">
                <Users size={19}/>
                {participantCount > 1 && (
                  <span className="absolute -top-2 -right-2.5 min-w-[15px] h-[15px] rounded-full bg-flame-500 text-white text-[8px] font-bold flex items-center justify-center px-0.5">
                    {participantCount}
                  </span>
                )}
              </div>
            </CtrlBtn>

            <CtrlBtn onClick={onToggleBgPanel} active={bgPanelOpen} tip="Background & Audio">
              <ImageIcon size={19}/>
            </CtrlBtn>

            <CtrlBtn onClick={onToggleAI} tip="AI Features" className="hidden sm:flex">
              <Sparkles size={19}/>
            </CtrlBtn>

            {onToggleRecording && (
              <CtrlBtn onClick={onToggleRecording}
                active={isRecording}
                tip={isRecording ? 'Stop recording' : 'Record meeting'}
                className="hidden sm:flex">
                <Circle size={19} className={isRecording ? 'fill-current animate-pulse' : ''}/>
              </CtrlBtn>
            )}
          </div>

          {/* Right: leave */}
          <CtrlBtn onClick={onLeave} danger tip="Leave meeting">
            <PhoneOff size={19}/>
          </CtrlBtn>
        </div>

        <p className="text-center text-white/20 text-[10px] font-medium mt-1.5 hidden md:block">
          M · Mic &nbsp; V · Video &nbsp; C · Chat &nbsp; R · Reaction
        </p>
      </div>
    </div>
  );
}
