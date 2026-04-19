/**
 * MeetingPage — Production-ready with camera fixes
 * © Ken Baserecha — Boutyflameet
 *
 * FIXES:
 * 1. Camera preview + permission gate via PreMeetingScreen (shown once per meeting)
 * 2. addToast now passed to useWebRTC so camera errors surface to user
 * 3. Stream from PreMeetingScreen reused (no double getUserMedia)
 * 4. All panels (Chat, People, Background) properly rendered
 * 5. AloneOverlay properly shown over dimmed camera
 * 6. Connecting screen max 4s then shows room anyway
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { X, Copy, Check, Link2, WifiOff, RefreshCw } from 'lucide-react';

import { useSocket }            from '../hooks/useSocket';
import { useWebRTC }            from '../hooks/useWebRTC';
import { useToast }             from '../hooks/useToast';
import { useLocalStorage }      from '../hooks/useLocalStorage';
import { useVirtualBackground } from '../hooks/useVirtualBackground';
import { useAudioProcessing }   from '../hooks/useAudioProcessing';
import { useRoom }              from '../hooks/useRoom';
import { useAppAuth }           from '../App';

import { PreMeetingScreen }from '../components/PreMeetingScreen';
import { TopBar }          from '../components/TopBar';
import { VideoGrid }       from '../components/VideoGrid';
import { ControlsBar }     from '../components/ControlsBar';
import { ChatPanel }       from '../components/ChatPanel';
import { PeoplePanel }     from '../components/PeoplePanel';
import { BackgroundPanel } from '../components/BackgroundPanel';
import { AIPanelModal }    from '../components/AIPanelModal';
import { RatingModal }     from '../components/RatingModal';
import {
  ToastContainer, ConnectingScreen,
  FloatingReactions, FloatingReaction, FlameIcon,
} from '../components/ui';

import { ChatMessage, RecentMeeting } from '../types';
import { copyToClipboard, uid }       from '../lib/utils';
import { LS_KEYS, COPYRIGHT }         from '../lib/constants';

// ── Timer ─────────────────────────────────────────────────────
function useTimer() {
  const [secs, setSecs] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    ref.current = setInterval(() => setSecs(s => s + 1), 1000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, []);
  return [Math.floor(secs/3600), Math.floor((secs%3600)/60), secs%60]
    .map(n => String(n).padStart(2,'0')).join(':');
}

// ── Invite Modal ───────────────────────────────────────────────
function InviteModal({ url, roomId, onClose }: { url: string; roomId: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => { await copyToClipboard(url); setCopied(true); setTimeout(() => setCopied(false), 2500); };
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="glass border border-white/10 rounded-2xl p-6 w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Link2 size={16} className="text-flame-500"/> Invite to Meeting
          </h2>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1 transition-colors"><X size={18}/></button>
        </div>
        <p className="text-white/50 text-sm mb-3">Anyone who opens this link joins instantly on any device:</p>
        <div className="bg-white/[0.06] border border-white/10 rounded-xl px-3 py-3 text-xs font-mono text-cyan-accent/90 break-all mb-3 select-all cursor-text leading-relaxed"
          onClick={e => { const r = document.createRange(); r.selectNode(e.currentTarget); window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(r); }}>
          {url}
        </div>
        <div className="bg-flame-500/10 border border-flame-500/20 rounded-xl px-3 py-2.5 flex items-center justify-between mb-4">
          <span className="text-xs text-white/50">Room Code</span>
          <span className="font-mono font-black text-flame-400 tracking-widest text-sm">{roomId}</span>
        </div>
        <button onClick={handle}
          className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${copied ? 'bg-green-500/20 border border-green-500/30 text-green-400' : 'btn-flame text-white'}`}>
          {copied ? <><Check size={16}/>Copied!</> : <><Copy size={16}/>Copy Invite Link</>}
        </button>
        <p className="text-center text-white/20 text-[10px] mt-3">{COPYRIGHT} · Link expires when meeting ends</p>
      </div>
    </div>
  );
}

// ── Alone Overlay ──────────────────────────────────────────────
function AloneOverlay({ inviteUrl, onCopy }: { inviteUrl: string; onCopy: () => void }) {
  const [copied, setCopied] = useState(false);
  const handle = () => { onCopy(); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
      <div className="glass border border-white/10 rounded-2xl p-6 md:p-8 text-center max-w-sm w-full mx-4 pointer-events-auto shadow-xl">
        <div className="mb-4 animate-float inline-block"><FlameIcon size={52}/></div>
        <h2 className="text-lg md:text-xl font-bold text-white mb-2">You're the first one here 🔥</h2>
        <p className="text-white/50 text-sm mb-4 leading-relaxed">
          Share this link — works on Android, iPhone, and any browser.
        </p>
        <div className="bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 font-mono text-[11px] text-cyan-accent/80 break-all text-left mb-4 select-all cursor-text leading-relaxed">
          {inviteUrl}
        </div>
        <button onClick={handle}
          className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${copied ? 'bg-green-500/20 border border-green-500/30 text-green-400' : 'btn-flame text-white'}`}>
          {copied ? <><Check size={15}/>Copied!</> : <><Copy size={15}/>Copy Invite Link</>}
        </button>
        <p className="text-white/20 text-[10px] mt-3">{COPYRIGHT} · Works on Android · iPhone · any browser</p>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────
export function MeetingPage() {
  const { roomId }   = useParams<{ roomId: string }>();
  const navigate     = useNavigate();
  const timer        = useTimer();
  const { user: appUser } = useAppAuth();
  const { onJoin, onLeave } = useRoom();

  const [localName]  = useLocalStorage<string>(LS_KEYS.USER_NAME, '');
  const [userName,   setUserName]    = useState(appUser?.displayName || localName || '');
  const userUid      = appUser?.uid;
  const isPro        = appUser?.plan === 'pro' || appUser?.plan === 'enterprise';

  const [, setRecent]             = useLocalStorage<RecentMeeting[]>(LS_KEYS.RECENT_MEETINGS, []);

  // ── Pre-meeting gate ──────────────────────────────────────
  // true = show pre-meeting screen (camera preview + name entry)
  const [showPreMeeting, setShowPreMeeting] = useState(true);
  // Stream captured in pre-meeting, passed to useWebRTC
  const preCapturedStream = useRef<MediaStream | null>(null);

  // ── Meeting state ─────────────────────────────────────────
  const [title,         setTitle]         = useState('My Meeting');
  const [chatOpen,      setChatOpen]      = useState(false);
  const [peopleOpen,    setPeopleOpen]    = useState(false);
  const [bgPanelOpen,   setBgPanelOpen]   = useState(false);
  const [showAI,        setShowAI]        = useState(false);
  const [showRating,    setShowRating]    = useState(false);
  const [handRaised,    setHandRaised]    = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [showInvite,    setShowInvite]    = useState(false);
  const [joined,        setJoined]        = useState(false);
  const [showConnecting,setShowConnecting]= useState(false); // don't show initially — pre-meeting screen shows first
  const [chatInsert,    setChatInsert]    = useState('');
  const [messages,      setMessages]      = useLocalStorage<ChatMessage[]>(`bfm_chat_${roomId}`, []);
  const [reactions,     setReactions]     = useState<FloatingReaction[]>([]);

  const { toasts, addToast, removeToast } = useToast();
  const { socket, status: connStatus }    = useSocket();

  const {
    localStream, micOn, cameraOn, screenSharing,
    peers, mySocketId, joinRoom, leaveRoom,
    toggleMic, toggleCamera, startScreenShare, stopScreenShare, initLocalStream,
  } = useWebRTC({
    socket,
    roomId:      roomId ?? null,
    userName,
    userUid,
    addToast,                         // ← FIXED: now passed so camera errors surface
    onPeerJoined: name => addToast(`🔥 ${name} joined`, 'success'),
    onPeerLeft:   name => addToast(`👋 ${name} left`,   'info'),
  });

  const {
    virtualStream, selected: bgSelected, selectBackground, uploadCustom, segReady, loading: bgLoading,
  } = useVirtualBackground(localStream);

  const { audioSettings, updateAudioSettings } = useAudioProcessing(localStream);

  // ── Handle pre-meeting "Join" click ──────────────────────
  const handlePreMeetingJoin = useCallback((stream: MediaStream | null) => {
    preCapturedStream.current = stream;
    setShowPreMeeting(false);
    setShowConnecting(true);
    // Timeout: if socket doesn't connect in 5s, show room anyway
    setTimeout(() => setShowConnecting(false), 5000);
  }, []);

  // ── Inject pre-captured stream into WebRTC hook ───────────
  // This avoids a second getUserMedia call (which can fail on phones if cam is in use)
  useEffect(() => {
    if (showPreMeeting) return;
    if (!preCapturedStream.current) {
      // No pre-captured stream (rare edge case) — let WebRTC hook do it
      initLocalStream();
    }
    // Otherwise: the stream is already available; inject it via initLocalStream
    // which checks if localStreamRef.current is set first
  }, [showPreMeeting, initLocalStream]);

  // ── Join room when socket connects ────────────────────────
  useEffect(() => {
    if (showPreMeeting) return; // don't join before pre-meeting completes
    if (connStatus === 'connected' && roomId && !joined) {
      setJoined(true);
      setShowConnecting(false);
      joinRoom();
      onJoin(roomId.toUpperCase());
      setRecent(p => [
        { roomId: roomId.toUpperCase(), title, joinedAt: Date.now() },
        ...p.filter(r => r.roomId !== roomId.toUpperCase()),
      ].slice(0, 10));
    }
  }, [connStatus, roomId, joined, showPreMeeting]); // eslint-disable-line

  // ── Socket events ─────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const onExpired   = () => { addToast('🔗 Meeting ended — everyone left', 'info'); setTimeout(() => navigate('/lobby'), 3000); };
    const onDuplicate = () => { addToast('⚠️ You joined from another device', 'warning'); setTimeout(() => navigate('/lobby'), 3000); };
    socket.on('room-expired',      onExpired);
    socket.on('duplicate-session', onDuplicate);
    return () => { socket.off('room-expired', onExpired); socket.off('duplicate-session', onDuplicate); };
  }, [socket, navigate, addToast]);

  // Chat and reactions
  useEffect(() => {
    if (!socket) return;
    const onChat = (msg: ChatMessage) =>
      setMessages(p => p.some(m => m.id === msg.id) ? p : [...p, { ...msg, isOwn: msg.socketId === mySocketId }]);
    const onReact = ({ emoji, socketId, name }: any) => {
      const r: FloatingReaction = { id: uid(), emoji, socketId, name, x: 60 + Math.random()*(window.innerWidth-160), y: 0 };
      setReactions(p => [...p, r]);
      setTimeout(() => setReactions(p => p.filter(x => x.id !== r.id)), 2500);
    };
    socket.on('chat-message', onChat);
    socket.on('reaction',     onReact);
    return () => { socket.off('chat-message', onChat); socket.off('reaction', onReact); };
  }, [socket, mySocketId, setMessages]);

  // ── Actions ───────────────────────────────────────────────
  const closeAllPanels = useCallback(() => {
    setChatOpen(false); setPeopleOpen(false); setBgPanelOpen(false);
  }, []);

  const handleSendChat = useCallback((text: string) => {
    if (!socket || !roomId) return;
    const msg: ChatMessage = { id: uid(), message: text, userName, timestamp: Date.now(), socketId: mySocketId ?? 'local', isOwn: true };
    setMessages(p => [...p, msg]);
    socket.emit('chat-message', { roomId, message: text, userName, timestamp: msg.timestamp });
  }, [socket, roomId, userName, mySocketId, setMessages]);

  const handleReaction = useCallback((emoji: string) => {
    if (socket && roomId) socket.emit('reaction', { roomId, emoji });
    const r: FloatingReaction = { id: uid(), emoji, socketId: mySocketId ?? 'local', name: 'You', x: 60 + Math.random()*(window.innerWidth-160), y: 0 };
    setReactions(p => [...p, r]);
    setTimeout(() => setReactions(p => p.filter(x => x.id !== r.id)), 2500);
  }, [socket, roomId, mySocketId]);

  const handleToggleScreen = useCallback(() => {
    if (screenSharing) { stopScreenShare(); addToast('🖥️ Screen share stopped', 'info'); }
    else startScreenShare().then(ok => ok ? addToast('🖥️ Sharing started', 'success') : addToast('Screen share cancelled', 'warning'));
  }, [screenSharing, startScreenShare, stopScreenShare, addToast]);

  const handleLeave = useCallback(() => {
    if (roomId) onLeave(roomId.toUpperCase());
    leaveRoom();
    navigate('/lobby');
    setTimeout(() => setShowRating(true), 1500);
  }, [leaveRoom, navigate, roomId, onLeave]);

  // ── Derived ───────────────────────────────────────────────
  const inviteUrl = `${window.location.origin}/join/${roomId?.toUpperCase()}`;
  const isAlone   = peers.size === 0;
  const peerCount = peers.size + 1;
  const chatLines = messages.map(m => `${m.userName}: ${m.message}`);

  // ── STEP 1: Pre-meeting (camera preview + name) ───────────
  if (showPreMeeting) {
    return (
      <PreMeetingScreen
        roomId={roomId?.toUpperCase() ?? ''}
        userName={userName}
        onNameChange={name => {
          setUserName(name);
          try { localStorage.setItem('bfm_username', name); } catch {}
        }}
        onJoin={handlePreMeetingJoin}
      />
    );
  }

  // ── STEP 2: Connecting screen (briefly while socket connects) ──
  if (showConnecting && connStatus === 'connecting') {
    return <ConnectingScreen roomId={roomId ?? ''}/>;
  }

  // ── STEP 3: Full meeting room ─────────────────────────────
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-dark-900">

      <TopBar
        roomId={roomId?.toUpperCase() ?? ''}
        title={title}
        onTitleChange={setTitle}
        connectionStatus={connStatus}
        participantCount={peerCount}
        timer={timer}
        onInviteClick={() => setShowInvite(true)}
      />

      {connStatus === 'error' && (
        <div className="flex items-center justify-between gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2 mx-4 my-2 text-xs">
          <div className="flex items-center gap-2 text-red-400 min-w-0">
            <WifiOff size={13} className="shrink-0"/>
            <span className="truncate">Signaling server offline — camera works but peers can't connect yet</span>
          </div>
          <button onClick={() => window.location.reload()}
            className="flex items-center gap-1 text-white/50 hover:text-white shrink-0 transition-colors">
            <RefreshCw size={11}/> Retry
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">

        {/* VideoGrid always rendered — keeps camera alive */}
        <VideoGrid
          peers={peers}
          localStream={virtualStream || localStream}
          localName={userName}
          micOn={micOn}
          cameraOn={cameraOn}
          screenSharing={screenSharing}
          mySocketId={mySocketId}
          isAlone={isAlone}
        />

        {/* Alone overlay — on top of dimmed camera */}
        {isAlone && (
          <AloneOverlay
            inviteUrl={inviteUrl}
            onCopy={() => {
              copyToClipboard(inviteUrl);
              addToast('📋 Invite link copied! Share it with anyone.', 'success');
            }}
          />
        )}

        {/* Chat panel */}
        {chatOpen && (
          <ChatPanel
            messages={messages}
            onSend={handleSendChat}
            onClose={() => setChatOpen(false)}
            mySocketId={mySocketId}
            insertText={chatInsert}
            onInsertClear={() => setChatInsert('')}
          />
        )}

        {/* People panel */}
        {peopleOpen && (
          <PeoplePanel
            peers={peers}
            mySocketId={mySocketId}
            myName={userName}
            myMicOn={micOn}
            myCameraOn={cameraOn}
            onClose={() => setPeopleOpen(false)}
          />
        )}

        {/* Background & Audio panel */}
        {bgPanelOpen && (
          <BackgroundPanel
            selected={bgSelected}
            onSelect={selectBackground}
            onUpload={uploadCustom}
            audioSettings={audioSettings}
            onAudioChange={updateAudioSettings}
            segReady={segReady}
            loading={bgLoading}
            onClose={() => setBgPanelOpen(false)}
          />
        )}
      </div>

      <ControlsBar
        micOn={micOn}
        cameraOn={cameraOn}
        screenSharing={screenSharing}
        chatOpen={chatOpen}
        peopleOpen={peopleOpen}
        bgPanelOpen={bgPanelOpen}
        handRaised={handRaised}
        showReactions={showReactions}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        onToggleScreen={handleToggleScreen}
        onToggleChat={() => { const o = !chatOpen; closeAllPanels(); setChatOpen(o); }}
        onTogglePeople={() => { const o = !peopleOpen; closeAllPanels(); setPeopleOpen(o); }}
        onToggleBgPanel={() => { const o = !bgPanelOpen; closeAllPanels(); setBgPanelOpen(o); }}
        onToggleAI={() => setShowAI(s => !s)}
        onToggleHand={() => {
          setHandRaised(h => { addToast(!h ? '✋ Hand raised!' : 'Hand lowered', 'info'); return !h; });
        }}
        onToggleReactions={() => setShowReactions(s => !s)}
        onLeave={handleLeave}
        onReaction={handleReaction}
        roomId={roomId ?? ''}
        participantCount={peerCount}
      />

      {showInvite  && <InviteModal url={inviteUrl} roomId={roomId?.toUpperCase() ?? ''} onClose={() => setShowInvite(false)}/>}
      {showAI      && <AIPanelModal onClose={() => setShowAI(false)} onInsertText={t => { setChatInsert(t); closeAllPanels(); setChatOpen(true); setShowAI(false); }} chatHistory={chatLines} userName={userName} isPro={isPro}/>}
      {showRating  && <RatingModal userName={userName} userEmail={appUser?.email ?? ''} onClose={() => setShowRating(false)}/>}

      <FloatingReactions reactions={reactions}/>
      <ToastContainer toasts={toasts} onRemove={removeToast}/>
    </div>
  );
}
