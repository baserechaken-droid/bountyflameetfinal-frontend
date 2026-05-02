/**
 * MeetingPage — Production meeting room v4
 * © Ken Baserecha — Boutyflameet
 *
 * NEW in v4:
 * - Recording feature (start/stop/download)
 * - Host controls (mute all, remove participant)
 * - Waiting room indicator
 * - Free plan time limit enforcement (40 min)
 * - unreadCount badge + hasNewReaction dot
 * - ToastContainer rendered
 * - isAlone overlay properly shown
 * - Blue screen fix: if (showConnecting) — no connStatus check
 */
import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { X, Copy, Check, Link2, WifiOff, RefreshCw } from 'lucide-react';
import { useSocket }            from '../hooks/useSocket';
import { useWebRTC }            from '../hooks/useWebRTC';
import { useToast }             from '../hooks/useToast';
import { useLocalStorage }      from '../hooks/useLocalStorage';
import { useVirtualBackground } from '../hooks/useVirtualBackground';
import { useAudioProcessing }   from '../hooks/useAudioProcessing';
import { useRecording }         from '../hooks/useRecording';
import { useRoom }              from '../hooks/useRoom';
import { useAppAuth }           from '../App';
import { TopBar }               from '../components/TopBar';
import { VideoGrid }            from '../components/VideoGrid';
import { ControlsBar }          from '../components/ControlsBar';
import {
  ToastContainer, ConnectingScreen, FloatingReactions,
  FloatingReaction, FlameIcon,
} from '../components/ui';
import { ChatMessage, RecentMeeting } from '../types';
import { copyToClipboard, uid }       from '../lib/utils';
import { LS_KEYS, COPYRIGHT, MAX_MINS_FREE } from '../lib/constants';
import { db }                         from '../lib/firebase';
import { AuthModal }                  from '../components/AuthModal';

const ChatPanel       = lazy(() => import('../components/ChatPanel').then(m => ({ default: m.ChatPanel })));
const PeoplePanel     = lazy(() => import('../components/PeoplePanel').then(m => ({ default: m.PeoplePanel })));
const BackgroundPanel = lazy(() => import('../components/BackgroundPanel').then(m => ({ default: m.BackgroundPanel })));
const AIPanelModal    = lazy(() => import('../components/AIPanelModal').then(m => ({ default: m.AIPanelModal })));
const RatingModal     = lazy(() => import('../components/RatingModal').then(m => ({ default: m.RatingModal })));

// ── Timer hook ────────────────────────────────────────────────
function useTimer() {
  const [secs, setSecs] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval>|null>(null);
  useEffect(() => {
    ref.current = setInterval(() => setSecs(s => s+1), 1000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, []);
  return {
    display: [Math.floor(secs/3600),Math.floor((secs%3600)/60),secs%60].map(n=>String(n).padStart(2,'0')).join(':'),
    seconds: secs,
  };
}

// ── Invite modal ──────────────────────────────────────────────
function InviteModal({ url, roomId, onClose }: { url: string; roomId: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => { await copyToClipboard(url); setCopied(true); setTimeout(()=>setCopied(false),2500); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="glass border border-white/10 rounded-2xl p-6 w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Link2 size={16} className="text-flame-500"/> Invite to Meeting
          </h2>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1"><X size={18}/></button>
        </div>
        <p className="text-white/50 text-sm mb-3">Anyone who opens this link joins on any device:</p>
        <div className="bg-white/[0.06] border border-white/10 rounded-xl px-3 py-3 text-xs font-mono text-cyan-accent/90 break-all mb-3 select-all cursor-text leading-relaxed">
          {url}
        </div>
        <div className="bg-flame-500/10 border border-flame-500/20 rounded-xl px-3 py-2.5 flex items-center justify-between mb-4">
          <span className="text-xs text-white/50">Room Code</span>
          <span className="font-mono font-black text-flame-400 tracking-widest text-sm">{roomId}</span>
        </div>
        <button onClick={handle} className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${copied?'bg-green-500/20 border border-green-500/30 text-green-400':'btn-flame text-white'}`}>
          {copied?<><Check size={16}/>Copied!</>:<><Copy size={16}/>Copy Invite Link</>}
        </button>
        <p className="text-center text-white/20 text-[10px] mt-3">{COPYRIGHT} · Link expires when meeting ends</p>
      </div>
    </div>
  );
}

// ── Recording bar ─────────────────────────────────────────────
function RecordingBar({ duration, sizeKB, isPaused, onPause, onStop, onDownload }: {
  duration: number; sizeKB: number; isPaused: boolean;
  onPause: ()=>void; onStop: ()=>void; onDownload: ()=>void;
}) {
  const fmt = (s: number) => [Math.floor(s/60),s%60].map(n=>String(n).padStart(2,'0')).join(':');
  return (
    <div className="flex items-center justify-between gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2 mx-4 my-1 text-xs animate-pulse-slow">
      <div className="flex items-center gap-2 text-red-400">
        <span className={`w-2 h-2 rounded-full bg-red-500 ${isPaused?'':'animate-pulse'}`}/>
        <span className="font-bold">{isPaused ? 'PAUSED' : 'REC'}</span>
        <span className="font-mono text-white/70">{fmt(duration)}</span>
        <span className="text-white/30">{sizeKB > 1024 ? `${(sizeKB/1024).toFixed(1)}MB` : `${sizeKB}KB`}</span>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onPause} className="text-white/50 hover:text-white px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] transition-all">
          {isPaused ? '▶ Resume' : '⏸ Pause'}
        </button>
        <button onClick={onStop} className="text-white/50 hover:text-red-400 px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-red-500/10 transition-all">
          ⏹ Stop
        </button>
        {sizeKB > 0 && (
          <button onClick={onDownload} className="text-white/50 hover:text-green-400 px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-green-500/10 transition-all">
            ⬇ Save
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export function MeetingPage() {
  const { roomId }           = useParams<{ roomId: string }>();
  const navigate             = useNavigate();
  const { display: timer, seconds: timerSecs } = useTimer();
  const {
    user: appUser,
    isFirebaseConfigured,
    loginWithName,
  } = useAppAuth();
  const { onJoin, onLeave }  = useRoom();

  const [localName, setLocalName] = useLocalStorage<string>(LS_KEYS.USER_NAME, '');
  // No more random `Guest-XXXX` fallback — if the user has no name, we
  // require them to enter one via the AuthModal before joining.
  const resolvedName = appUser?.displayName || localName || '';
  const userName     = resolvedName || 'Guest';
  const userUid      = appUser?.uid;
  const [showNameModal, setShowNameModal] = useState(!resolvedName);
  const isPro        = appUser?.plan === 'pro' || appUser?.plan === 'enterprise';

  const [, setRecent]            = useLocalStorage<RecentMeeting[]>(LS_KEYS.RECENT_MEETINGS, []);
  const [title,      setTitle]   = useState('My Meeting');
  const [chatOpen,       setChatOpen]       = useState(false);
  const [peopleOpen,     setPeopleOpen]     = useState(false);
  const [bgPanelOpen,    setBgPanelOpen]    = useState(false);
  const [showAI,         setShowAI]         = useState(false);
  const [showRating,     setShowRating]     = useState(false);
  const [handRaised,     setHandRaised]     = useState(false);
  const [showReactions,  setShowReactions]  = useState(false);
  const [showInvite,     setShowInvite]     = useState(false);
  const [joined,         setJoined]         = useState(false);
  const [showConnecting, setShowConnecting] = useState(true);
  const [chatInsert,     setChatInsert]     = useState('');
  const [unreadCount,    setUnreadCount]    = useState(0);
  const [hasNewReaction, setHasNewReaction] = useState(false);
  const [messages,   setMessages]  = useLocalStorage<ChatMessage[]>(`bfm_chat_${roomId}`, []);
  const [reactions,  setReactions] = useState<FloatingReaction[]>([]);

  const seenMsgIds = useRef<Set<string>>(new Set());
  const preCapturedStream = useRef<MediaStream | null>(null);
  const meetingStartedAt = useRef<number>(Date.now());

  const { toasts, addToast, removeToast } = useToast();
  const { socket, status: connStatus }    = useSocket();

  const {
    localStream, micOn, cameraOn, screenSharing,
    peers, mySocketId, isHost, joinRoom, leaveRoom,
    toggleMic, toggleCamera, startScreenShare, stopScreenShare, initLocalStream,
    muteAll, removeParticipant,
  } = useWebRTC({
    socket, roomId: roomId ?? null, userName, userUid,
    externalStreamRef: preCapturedStream,
    addToast,
    onPeerJoined: name => addToast(`🔥 ${name} joined`, 'success'),
    onPeerLeft:   name => addToast(`👋 ${name} left`,   'info'),
    onHostAction: action => {
      if (action === 'removed-by-host') setTimeout(() => navigate('/lobby'), 2000);
    },
  });

  const { virtualStream, selected: bgSelected, selectBackground, uploadCustom, segReady, loading: bgLoading } =
    useVirtualBackground(localStream);
  const { audioSettings, updateAudioSettings } = useAudioProcessing(localStream);

  // Recording — uses composite stream (virtual bg or local)
  const streamForRecording = virtualStream || localStream;
  const recording = useRecording(streamForRecording, socket, roomId);

  // ── Start camera on mount ─────────────────────────────────
  useEffect(() => { initLocalStream(); }, []); // eslint-disable-line

  // ── Blue screen fix: clear connecting screen after 6s ─────
  // Uses if (showConnecting) — NOT if (showConnecting && connStatus==='connecting')
  // because connStatus may already be 'connected' when user joins
  useEffect(() => {
    const t = setTimeout(() => setShowConnecting(false), 6000);
    return () => clearTimeout(t);
  }, []);

  // Once a name has been resolved (via login or name modal), close the modal.
  useEffect(() => {
    if (resolvedName) setShowNameModal(false);
  }, [resolvedName]);

  // ── Join room when socket ready AND we know who the user is ──
  useEffect(() => {
    if (
      connStatus === 'connected' &&
      roomId &&
      !joined &&
      !!resolvedName  // Don't broadcast a placeholder identity.
    ) {
      setJoined(true);
      setShowConnecting(false);
      joinRoom();
      onJoin(roomId.toUpperCase());
      setRecent(p => [
        { roomId: roomId.toUpperCase(), title, joinedAt: Date.now() },
        ...p.filter(r => r.roomId !== roomId.toUpperCase()),
      ].slice(0, 10));
    }
  }, [connStatus, roomId, joined, resolvedName]); // eslint-disable-line

  // ── Free plan time limit ──────────────────────────────────
  useEffect(() => {
    if (isPro) return;
    if (timerSecs >= MAX_MINS_FREE * 60) {
      addToast(`⏰ Free plan limit (${MAX_MINS_FREE} min) reached. Upgrade for unlimited time.`, 'warning');
      setTimeout(() => {
        leaveRoom();
        navigate('/lobby');
      }, 5000);
    }
  }, [timerSecs, isPro]); // eslint-disable-line

  // ── Room lifecycle ────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const onExpired   = () => { addToast('🔗 Meeting ended', 'info'); setTimeout(() => navigate('/lobby'), 3000); };
    const onDuplicate = () => { addToast('⚠️ Joined from another device — this session will close.', 'warning'); setTimeout(() => navigate('/lobby'), 3000); };
    socket.on('room-expired',      onExpired);
    socket.on('duplicate-session', onDuplicate);
    return () => { socket.off('room-expired', onExpired); socket.off('duplicate-session', onDuplicate); };
  }, [socket, navigate, addToast]);

  // ── Chat + reactions ──────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const onChat = (msg: ChatMessage) => {
      if (seenMsgIds.current.has(msg.id)) return;
      seenMsgIds.current.add(msg.id);
      setMessages(p => [...p, { ...msg, isOwn: msg.socketId === mySocketId }]);
      if (!chatOpen) setUnreadCount(c => c + 1);
    };
    const onReact = ({ emoji, socketId, name }: { emoji: string; socketId: string; name: string }) => {
      const r: FloatingReaction = { id: uid(), emoji, socketId, name, x: 60+Math.random()*(window.innerWidth-160), y: 0 };
      setReactions(p => [...p, r]);
      setTimeout(() => setReactions(p => p.filter(x => x.id !== r.id)), 2500);
      if (!showReactions) setHasNewReaction(true);
    };
    socket.on('chat-message', onChat);
    socket.on('reaction',     onReact);
    return () => { socket.off('chat-message', onChat); socket.off('reaction', onReact); };
  }, [socket, mySocketId, setMessages, chatOpen, showReactions]);

  // ── Actions ───────────────────────────────────────────────
  const closeAllPanels = useCallback(() => {
    setChatOpen(false); setPeopleOpen(false); setBgPanelOpen(false);
  }, []);

  const handleToggleChat = useCallback(() => {
    const next = !chatOpen;
    if (next) setUnreadCount(0);
    closeAllPanels();
    setChatOpen(next);
  }, [chatOpen, closeAllPanels]);

  const handleToggleReactions = useCallback(() => {
    setShowReactions(s => !s);
    setHasNewReaction(false);
  }, []);

  const handleSendChat = useCallback((text: string) => {
    if (!socket || !roomId) return;
    const msgId = uid();
    const msg: ChatMessage = { id: msgId, message: text, userName, timestamp: Date.now(), socketId: mySocketId??'local', isOwn: true };
    seenMsgIds.current.add(msgId);
    setMessages(p => [...p, msg]);
    socket.emit('chat-message', { roomId, id: msgId, message: text, userName, timestamp: msg.timestamp });
  }, [socket, roomId, userName, mySocketId, setMessages]);

  const handleReaction = useCallback((emoji: string) => {
    if (socket && roomId) socket.emit('reaction', { roomId, emoji });
  }, [socket, roomId]);

  const handleToggleScreen = useCallback(() => {
    if (screenSharing) { stopScreenShare(); addToast('🖥️ Screen share stopped', 'info'); }
    else startScreenShare().then(ok => ok ? addToast('🖥️ Sharing — everyone sees your screen', 'success') : null);
  }, [screenSharing, startScreenShare, stopScreenShare, addToast]);

  const handleToggleHand = useCallback(() => {
    setHandRaised(h => {
      const next = !h;
      socket?.emit('hand-state', { handRaised: next });
      addToast(next ? '✋ Hand raised — everyone can see' : 'Hand lowered', 'info');
      return next;
    });
  }, [socket, addToast]);

  const handleLeave = useCallback(() => {
    if (roomId) onLeave(roomId.toUpperCase());
    leaveRoom();
    navigate('/lobby');
    setTimeout(() => setShowRating(true), 1500);
  }, [leaveRoom, navigate, roomId, onLeave]);

  // Persists a cloud-uploaded recording to Firestore so the user can download
  // it again from any device. No-op if Firestore isn't configured.
  const persistRecordingDoc = useCallback(
    async (filename: string, bytes: number, objectPath: string, servingUrl: string) => {
      if (!db || !userUid) return;
      try {
        const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
        await addDoc(collection(db, 'users', userUid, 'recordings'), {
          roomId: roomId?.toUpperCase() || null,
          title: title || null,
          filename,
          bytes,
          objectPath,
          servingUrl,
          createdAt: serverTimestamp(),
        });
      } catch (e: any) {
        console.warn('[Recording] Firestore persist failed:', e?.message || e);
      }
    },
    [roomId, title, userUid],
  );

  // Stops the recorder, uploads to cloud (best-effort), saves a local copy,
  // writes a Firestore doc, then clears the in-memory buffer.
  const finalizeRecording = useCallback(
    async (filename?: string) => {
      await recording.stopRecording();
      const safeName =
        filename ||
        `boutyflameet-${roomId}-${new Date().toISOString().slice(0, 10)}.webm`;

      // Best-effort cloud upload — runs before download so the local copy is
      // identical to the cloud copy.
      const uploaded = await recording.uploadRecording(safeName);

      recording.downloadRecording(safeName);

      if (uploaded) {
        addToast('✅ Recording saved locally and to your cloud library', 'success');
        await persistRecordingDoc(
          uploaded.filename,
          uploaded.bytes,
          uploaded.objectPath,
          uploaded.servingUrl,
        );
      } else {
        addToast('✅ Recording saved — check your Downloads', 'success');
      }

      recording.clearRecording();
    },
    [recording, roomId, addToast, persistRecordingDoc],
  );

  const handleToggleRecording = useCallback(async () => {
    if (!isPro) { addToast('⭐ Recording is a Pro feature. Upgrade to record meetings.', 'info'); return; }
    if (recording.isRecording) {
      await finalizeRecording();
    } else {
      const ok = recording.startRecording();
      if (ok) addToast('🔴 Recording started', 'info');
      else    addToast('Recording not supported in this browser (use Chrome)', 'warning');
    }
  }, [isPro, recording, addToast, finalizeRecording]);

  // ── Derived ───────────────────────────────────────────────
  const inviteUrl  = `${window.location.origin}/join/${roomId?.toUpperCase()}`;
  const isAlone    = peers.size === 0;
  const peerCount  = peers.size + 1;
  const chatLines  = messages.map(m => `${m.userName}: ${m.message}`);

  // ── RENDER: Name modal (gate before anyone sees the call) ──
  // Reached when a user opens /join/:roomId directly without ever
  // having signed in or saved a local name. We don't proceed with
  // join-room until they've identified themselves.
  if (showNameModal) {
    return (
      <AuthModal
        isFirebaseReady={isFirebaseConfigured}
        onNameLogin={(n) => {
          setLocalName(n);
          loginWithName(n);
          setShowNameModal(false);
        }}
        onSignIn={async () => false}
        onRegister={async () => false}
        onGoogle={async () => false}
        onReset={async () => false}
        error={null}
        clearError={() => {}}
      />
    );
  }

  // ── RENDER: Connecting screen ─────────────────────────────
  // FIX: just "if (showConnecting)" — NOT "if (showConnecting && connStatus==='connecting')"
  // because connStatus may already be 'connected' before user opens the page
  if (showConnecting) return <ConnectingScreen roomId={roomId??''}/>;

  // ── RENDER: Meeting room ──────────────────────────────────
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-dark-900">

      <TopBar roomId={roomId?.toUpperCase()??''} title={title} onTitleChange={setTitle}
        connectionStatus={connStatus} participantCount={peerCount} timer={timer}
        onInviteClick={() => setShowInvite(true)}/>

      {connStatus === 'error' && (
        <div className="flex items-center justify-between gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2 mx-4 my-2 text-xs">
          <div className="flex items-center gap-2 text-red-400 min-w-0">
            <WifiOff size={13} className="shrink-0"/>
            <span className="truncate">Signaling offline — camera works, peers can't connect yet</span>
          </div>
          <button onClick={()=>window.location.reload()} className="flex items-center gap-1 text-white/50 hover:text-white shrink-0">
            <RefreshCw size={11}/> Retry
          </button>
        </div>
      )}

      {/* Free plan time warning at 35 min */}
      {!isPro && timerSecs >= (MAX_MINS_FREE - 5) * 60 && (
        <div className="flex items-center justify-between gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-2 mx-4 my-1 text-xs">
          <span className="text-yellow-400">⏰ {MAX_MINS_FREE - Math.floor(timerSecs/60)} min left on free plan</span>
          <button onClick={() => navigate('/lobby')} className="text-flame-400 font-bold hover:text-flame-300">Upgrade →</button>
        </div>
      )}

      {/* Recording bar */}
      {recording.isRecording && (
        <RecordingBar
          duration={recording.duration}
          sizeKB={recording.sizeKB}
          isPaused={recording.isPaused}
          onPause={recording.isPaused ? recording.resumeRecording : recording.pauseRecording}
          onStop={async () => { await finalizeRecording(); }}
          onDownload={() => recording.downloadRecording()}
        />
      )}

      <div className="flex-1 flex overflow-hidden relative">
        <VideoGrid
          peers={peers}
          localStream={virtualStream || localStream}
          localName={userName}
          micOn={micOn}
          cameraOn={cameraOn}
          screenSharing={screenSharing}
          mySocketId={mySocketId}
          isAlone={isAlone}
          isHost={isHost}
          onRemoveParticipant={isHost ? removeParticipant : undefined}
        />

        {isAlone && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 px-4">
            <div className="glass border border-white/10 rounded-2xl p-6 md:p-8 text-center max-w-sm w-full pointer-events-auto">
              <div className="mb-4 animate-float inline-block"><FlameIcon size={52}/></div>
              <h2 className="text-lg md:text-xl font-bold text-white mb-2">You're the first one here 🔥</h2>
              <p className="text-white/50 text-sm mb-4 leading-relaxed">Share this link — works on Android, iPhone, and any browser.</p>
              <div className="bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 font-mono text-[11px] text-cyan-accent/80 break-all text-left mb-4 select-all cursor-text leading-relaxed">
                {inviteUrl}
              </div>
              <button onClick={()=>{copyToClipboard(inviteUrl);addToast('📋 Link copied!','success');}}
                className="w-full py-3 rounded-xl font-bold text-sm btn-flame text-white flex items-center justify-center gap-2">
                <Copy size={15}/> Copy Invite Link
              </button>
              <p className="text-white/20 text-[10px] mt-2">{COPYRIGHT} · Works on Android · iPhone · any browser</p>
            </div>
          </div>
        )}

        <Suspense fallback={null}>
          {chatOpen && (
            <ChatPanel messages={messages} onSend={handleSendChat}
              roomId={roomId?.toUpperCase() || ''}
              roomTitle={title}
              hostName={isHost ? userName : null}
              startedAt={meetingStartedAt.current}
              isPro={isPro}
              onToast={addToast}
              onClose={()=>setChatOpen(false)} mySocketId={mySocketId}
              insertText={chatInsert} onInsertClear={()=>setChatInsert('')}/>
          )}
        </Suspense>

        <Suspense fallback={null}>
          {peopleOpen && (
            <PeoplePanel peers={peers} mySocketId={mySocketId} myName={userName}
              myMicOn={micOn} myCameraOn={cameraOn} isHost={isHost}
              onMuteAll={isHost ? muteAll : undefined}
              onRemove={isHost ? removeParticipant : undefined}
              onClose={()=>setPeopleOpen(false)}/>
          )}
        </Suspense>

        <Suspense fallback={null}>
          {bgPanelOpen && (
            <BackgroundPanel selected={bgSelected} onSelect={selectBackground} onUpload={uploadCustom}
              audioSettings={audioSettings} onAudioChange={updateAudioSettings}
              segReady={segReady} loading={bgLoading} onClose={()=>setBgPanelOpen(false)}/>
          )}
        </Suspense>
      </div>

      <ControlsBar
        micOn={micOn} cameraOn={cameraOn} screenSharing={screenSharing}
        chatOpen={chatOpen} peopleOpen={peopleOpen} bgPanelOpen={bgPanelOpen}
        handRaised={handRaised} showReactions={showReactions}
        unreadCount={unreadCount} hasNewReaction={hasNewReaction}
        isRecording={recording.isRecording}
        onToggleMic={toggleMic} onToggleCamera={toggleCamera}
        onToggleScreen={handleToggleScreen}
        onToggleChat={handleToggleChat}
        onTogglePeople={()=>{const o=!peopleOpen;closeAllPanels();setPeopleOpen(o);}}
        onToggleBgPanel={()=>{const o=!bgPanelOpen;closeAllPanels();setBgPanelOpen(o);}}
        onToggleAI={()=>setShowAI(s=>!s)}
        onToggleHand={handleToggleHand}
        onToggleReactions={handleToggleReactions}
        onToggleRecording={handleToggleRecording}
        onLeave={handleLeave} onReaction={handleReaction}
        roomId={roomId??''} participantCount={peerCount}
      />

      {showInvite && <InviteModal url={inviteUrl} roomId={roomId?.toUpperCase()??''} onClose={()=>setShowInvite(false)}/>}

      <Suspense fallback={null}>
        {showAI && (
          <AIPanelModal onClose={()=>setShowAI(false)}
            onInsertText={t=>{setChatInsert(t);closeAllPanels();setChatOpen(true);setShowAI(false);}}
            chatHistory={chatLines} userName={userName} isPro={isPro}/>
        )}
      </Suspense>

      <Suspense fallback={null}>
        {showRating && <RatingModal userName={userName} userEmail={appUser?.email??''} onClose={()=>setShowRating(false)}/>}
      </Suspense>

      {reactions.length > 0 && <FloatingReactions reactions={reactions}/>}
      <ToastContainer toasts={toasts} onRemove={removeToast}/>
    </div>
  );
}
