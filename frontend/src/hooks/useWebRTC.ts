/**
 * useWebRTC — Production full-mesh WebRTC v4
 * © Ken Baserecha — Boutyflameet
 *
 * Fixes + Upgrades:
 * 1. externalStreamRef: no stale closure for pre-captured stream
 * 2. ICE candidate queuing: buffers until setRemoteDescription completes
 * 3. Robust ontrack: handles empty e.streams[] (Firefox/iOS)
 * 4. handleOffer: uses peer's real name from existing map
 * 5. disconnected = temporary, only 'failed' triggers ICE restart
 * 6. toggleCamera: re-acquires track if ended (mobile)
 * 7. Screen share: full renegotiation with all peers
 * 8. handRaised + isHost + isRecording in PeerData
 * 9. Host controls: force-mute, removed-by-host listeners
 * 10. SFU-ready: architecture comment for future LiveKit/mediasoup migration
 */
import { useRef, useState, useCallback, useEffect, MutableRefObject } from 'react';
import { Socket } from 'socket.io-client';
import { RTC_CONFIG } from '../lib/constants';
import {
  PeerData, RoomJoinedPayload, UserJoinedPayload, UserLeftPayload,
  OfferPayload, AnswerPayload, IceCandidatePayload, PeerMuteStatePayload,
} from '../types';

// SFU NOTE: When scaling beyond ~8 simultaneous video feeds, replace this
// full-mesh approach with a Selective Forwarding Unit (SFU).
// Recommended: LiveKit (livekit.io) or mediasoup (mediasoup.org).
// The socket event names (join-room, offer, answer, ice-candidate) map
// directly to LiveKit's client SDK — migration path is straightforward.

interface Opts {
  socket:              Socket | null;
  roomId:              string | null;
  userName:            string;
  userUid?:            string;
  externalStreamRef?:  MutableRefObject<MediaStream | null>;
  addToast?:           (msg: string, type: 'success'|'info'|'warning'|'error') => void;
  onPeerJoined?:       (name: string) => void;
  onPeerLeft?:         (name: string) => void;
  onHostAction?:       (action: 'muted-by-host' | 'removed-by-host' | 'promoted') => void;
}

export function useWebRTC({
  socket, roomId, userName, userUid, externalStreamRef,
  addToast, onPeerJoined, onPeerLeft, onHostAction,
}: Opts) {
  const [localStream,   setLocalStream]   = useState<MediaStream | null>(null);
  const [screenStream,  setScreenStream]  = useState<MediaStream | null>(null);
  const [micOn,         setMicOn]         = useState(true);
  const [cameraOn,      setCameraOn]      = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [peers,         setPeers]         = useState<Map<string, PeerData>>(new Map());
  const [mySocketId,    setMySocketId]    = useState<string | null>(null);
  const [isHost,        setIsHost]        = useState(false);

  const localStreamRef       = useRef<MediaStream | null>(null);
  // Ref to stopScreenShare — avoids stale closure in vt.onended
  const stopScreenShareRef   = useRef<(() => void) | null>(null);
  const screenStreamRef  = useRef<MediaStream | null>(null);
  const peersRef         = useRef<Map<string, PeerData>>(new Map());
  const socketRef        = useRef<Socket | null>(null);
  const micOnRef         = useRef(true);
  const camOnRef         = useRef(true);
  // ICE candidate queue: buffer candidates until remote desc is set
  const iceCandidateQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  useEffect(() => { socketRef.current = socket; },     [socket]);
  useEffect(() => { micOnRef.current  = micOn; },      [micOn]);
  useEffect(() => { camOnRef.current  = cameraOn; },   [cameraOn]);

  // ── Helpers ───────────────────────────────────────────────
  const syncPeers = useCallback(() => setPeers(new Map(peersRef.current)), []);

  const updatePeer = useCallback((id: string, update: Partial<PeerData>) => {
    const cur = peersRef.current.get(id);
    if (!cur) return;
    peersRef.current.set(id, { ...cur, ...update });
    syncPeers();
  }, [syncPeers]);

  const removePeer = useCallback((id: string) => {
    const p = peersRef.current.get(id);
    if (!p) return;
    if (p.connection) try { p.connection.close(); } catch {}
    peersRef.current.delete(id);
    iceCandidateQueueRef.current.delete(id);
    syncPeers();
  }, [syncPeers]);

  // Flush buffered ICE candidates after setRemoteDescription
  const flushIce = useCallback(async (peerId: string, pc: RTCPeerConnection) => {
    const queue = iceCandidateQueueRef.current.get(peerId) ?? [];
    iceCandidateQueueRef.current.delete(peerId);
    for (const c of queue) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
  }, []);

  // ── Create RTCPeerConnection ───────────────────────────────
  const createPC = useCallback((remotePeerId: string, remoteName: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection(RTC_CONFIG);

    // Add all local tracks
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach(track => {
        try { pc.addTrack(track, stream); } catch {}
      });
    } else {
      console.warn(`[WebRTC] createPC: no local stream for ${remoteName}`);
    }

    pc.onicecandidate = e => {
      if (e.candidate) {
        socketRef.current?.emit('ice-candidate', {
          to: remotePeerId, candidate: e.candidate.toJSON(),
        });
      }
    };

    pc.onicecandidateerror = e => console.warn('[ICE] error (benign):', (e as any).errorText);

    // Robust ontrack — handles Firefox/iOS empty e.streams
    pc.ontrack = e => {
      let stream: MediaStream;
      if (e.streams?.length > 0) {
        stream = e.streams[0];
      } else {
        const existing = peersRef.current.get(remotePeerId)?.stream;
        if (existing) {
          if (!existing.getTracks().some(t => t.id === e.track.id)) existing.addTrack(e.track);
          stream = existing;
        } else {
          stream = new MediaStream([e.track]);
        }
      }
      e.track.onended = () => {
        const peer = peersRef.current.get(remotePeerId);
        if (peer?.stream) {
          const hasVideo = peer.stream.getVideoTracks().some(t => t.readyState === 'live');
          updatePeer(remotePeerId, { videoMuted: !hasVideo });
        }
      };
      updatePeer(remotePeerId, { stream });
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      updatePeer(remotePeerId, { connectionState: s });
      if (s === 'failed') {
        console.warn(`[WebRTC] ${remoteName} — connection failed, ICE restart`);
        // FIX: restartIce() alone does nothing in most browsers.
        // Must create a new offer with iceRestart:true and send it.
        pc.restartIce();
        if (pc.signalingState === 'stable') {
          pc.createOffer({ iceRestart: true })
            .then(o => pc.setLocalDescription(o))
            .then(() => {
              socketRef.current?.emit('offer', {
                to: remotePeerId, sdp: pc.localDescription, name: userName,
              });
              console.log(`[WebRTC] ICE restart offer sent to ${remoteName}`);
            })
            .catch(e => console.warn('[WebRTC] ICE restart offer failed:', e));
        }
      }
      // 'disconnected' is transient — do NOT treat as failed
    };

    // FIX: onnegotiationneeded — fires when tracks added mid-call
    // (e.g. camera re-acquire, screen share start/stop).
    // Without this handler the new track never reaches the peer.
    pc.onnegotiationneeded = async () => {
      if (pc.signalingState !== 'stable') return; // already negotiating
      try {
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') return; // state changed while async
        await pc.setLocalDescription(offer);
        socketRef.current?.emit('offer', {
          to: remotePeerId, sdp: pc.localDescription, name: userName,
        });
        console.log(`[WebRTC] onnegotiationneeded: offer sent to ${remoteName}`);
      } catch (e) {
        console.warn('[WebRTC] onnegotiationneeded error:', e);
      }
    };

    // Register peer
    const existing = peersRef.current.get(remotePeerId);
    peersRef.current.set(remotePeerId, {
      socketId:        remotePeerId,
      name:            remoteName,
      stream:          null,
      connection:      pc,
      micMuted:        existing?.micMuted        ?? false,
      videoMuted:      existing?.videoMuted      ?? false,
      isScreenSharing: existing?.isScreenSharing ?? false,
      connectionState: 'new',
      handRaised:      existing?.handRaised      ?? false,
      isHost:          existing?.isHost          ?? false,
      isRecording:     false,
    });
    syncPeers();
    return pc;
  }, [updatePeer, syncPeers]);

  // ── Initiate call (we are caller) ─────────────────────────
  const initiateCall = useCallback(async (peerId: string, name: string) => {
    if (peersRef.current.get(peerId)?.connection) return; // don't duplicate
    const pc = createPC(peerId, name);
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      socketRef.current?.emit('offer', { to: peerId, sdp: pc.localDescription, name: userName });
    } catch (e) { console.error('[WebRTC] initiateCall:', e); }
  }, [createPC, userName]);

  // ── Handle incoming offer (we are callee) ─────────────────
  const handleOffer = useCallback(async ({ from, sdp, name: peerName }: OfferPayload & { name?: string }) => {
    const existingName = peersRef.current.get(from)?.name ?? peerName ?? `Peer-${from.slice(0,4)}`;
    let pc = peersRef.current.get(from)?.connection;
    if (!pc) pc = createPC(from, existingName);

    try {
      if (pc.signalingState === 'stable' && pc.remoteDescription) {
        console.warn('[WebRTC] Glare — ignoring duplicate offer from', from);
        return;
      }
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await flushIce(from, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current?.emit('answer', { to: from, sdp: pc.localDescription });
    } catch (e) { console.error('[WebRTC] handleOffer:', e); }
  }, [createPC, flushIce]);

  const handleAnswer = useCallback(async ({ from, sdp }: AnswerPayload) => {
    const pc = peersRef.current.get(from)?.connection;
    if (!pc || pc.signalingState !== 'have-local-offer') return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await flushIce(from, pc);
    } catch (e) { console.error('[WebRTC] handleAnswer:', e); }
  }, [flushIce]);

  const handleICE = useCallback(async ({ from, candidate }: IceCandidatePayload) => {
    const pc = peersRef.current.get(from)?.connection;
    if (!pc) return;
    if (!pc.remoteDescription) {
      // Queue until remote desc is set
      const q = iceCandidateQueueRef.current.get(from) ?? [];
      q.push(candidate);
      iceCandidateQueueRef.current.set(from, q);
      return;
    }
    try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
  }, []);

  // ── Get local stream ───────────────────────────────────────
  const initLocalStream = useCallback(async (): Promise<MediaStream | null> => {
    if (localStreamRef.current?.active) return localStreamRef.current;

    // Use pre-captured stream from PreMeetingScreen (avoids double getUserMedia on mobile)
    const ext = externalStreamRef?.current;
    if (ext?.active && ext.getTracks().length > 0) {
      localStreamRef.current = ext;
      setLocalStream(ext);
      setCameraOn(ext.getVideoTracks().length > 0);
      setMicOn(ext.getAudioTracks().length > 0);
      return ext;
    }

    const attempts: MediaStreamConstraints[] = [
      { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } },
      { video: { facingMode: 'user' }, audio: true },
      { video: true, audio: true },
      { video: { width: { max: 640 }, height: { max: 480 } }, audio: true },
      { video: true, audio: false },
      { video: false, audio: true },
    ];

    for (const c of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(c);
        localStreamRef.current = stream;
        setLocalStream(stream);
        setCameraOn(stream.getVideoTracks().length > 0);
        setMicOn(stream.getAudioTracks().length > 0);
        return stream;
      } catch (e: any) {
        if (e?.name === 'NotAllowedError') {
          addToast?.('Camera/mic permission denied. Allow access and refresh.', 'error');
          return null;
        }
      }
    }
    addToast?.('Could not access camera or microphone.', 'error');
    return null;
  }, [addToast, externalStreamRef]);

  // ── Join room ──────────────────────────────────────────────
  const joinRoom = useCallback(async () => {
    if (!socket || !roomId) return;
    if (!localStreamRef.current?.active) await initLocalStream();
    socket.emit('join-room', { roomId, userName, uid: userUid || null });
  }, [socket, roomId, userName, userUid, initLocalStream]);

  // ── Leave room ─────────────────────────────────────────────
  const leaveRoom = useCallback(() => {
    peersRef.current.forEach(p => { if (p.connection) try { p.connection.close(); } catch {} });
    peersRef.current.clear();
    iceCandidateQueueRef.current.clear();
    syncPeers();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current  = null;
    screenStreamRef.current = null;
    setLocalStream(null);
    setScreenStream(null);
    setScreenSharing(false);
    socket?.emit('leave-room');
  }, [socket, syncPeers]);

  // ── Reconnect: called by MeetingPage after socket reconnects ──
  // Closes all stale peer connections (they died during the network drop)
  // and re-emits join-room so the server re-registers this user.
  const reconnectToRoom = useCallback(async () => {
    if (!socket || !roomId) return;
    console.log('[WebRTC] Reconnecting — closing stale peer connections');
    // Close all existing (dead) RTCPeerConnections
    peersRef.current.forEach((p, id) => {
      try { p.connection?.close(); } catch {}
      iceCandidateQueueRef.current.delete(id);
    });
    peersRef.current.clear();
    syncPeers();
    // Re-acquire local stream if it died during the drop
    if (!localStreamRef.current?.active) {
      await initLocalStream();
    }
    // Re-join the signaling room — server will send existing peers again
    socket.emit('join-room', { roomId, userName, uid: userUid || null });
    console.log('[WebRTC] Re-joined room after reconnect:', roomId);
  }, [socket, roomId, userName, userUid, syncPeers, initLocalStream]);

  // ── Toggle mic ─────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    const s = localStreamRef.current;
    if (!s) return;
    const next = !micOnRef.current;
    s.getAudioTracks().forEach(t => { t.enabled = next; });
    setMicOn(next);
    socketRef.current?.emit('mute-state', { micMuted: !next, videoMuted: !camOnRef.current });
  }, []);

  // ── Toggle camera ──────────────────────────────────────────
  const toggleCamera = useCallback(async () => {
    const s = localStreamRef.current;
    if (!s) return;
    const next = !camOnRef.current;

    if (next && s.getVideoTracks().every(t => t.readyState === 'ended')) {
      try {
        const nv    = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        const track = nv.getVideoTracks()[0];
        if (track) {
          s.addTrack(track);
          Array.from(peersRef.current.values()).forEach(peer => {
            if (!peer.connection) return;
            const sender = peer.connection.getSenders().find(sv => sv.track?.kind === 'video');
            if (sender) sender.replaceTrack(track).catch(() => {});
            else peer.connection.addTrack(track, s);
          });
        }
      } catch { addToast?.('Could not start camera.', 'warning'); return; }
    }

    s.getVideoTracks().forEach(t => { t.enabled = next; });
    setCameraOn(next);
    socketRef.current?.emit('mute-state', { micMuted: !micOnRef.current, videoMuted: !next });
  }, [addToast]);

  // ── Screen share ───────────────────────────────────────────
  const startScreenShare = useCallback(async (): Promise<boolean> => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      addToast?.('Screen sharing not supported in this browser.', 'warning');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      screenStreamRef.current = stream;
      setScreenStream(stream);
      setScreenSharing(true);
      const vt = stream.getVideoTracks()[0];
      if (!vt) { stream.getTracks().forEach(t => t.stop()); return false; }

      await Promise.all(Array.from(peersRef.current.values()).map(async peer => {
        const pc = peer.connection;
        if (!pc) return;
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(vt).catch(() => {});
        else        pc.addTrack(vt, stream);
        if (pc.signalingState === 'stable') {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socketRef.current?.emit('offer', { to: peer.socketId, sdp: pc.localDescription, name: userName });
        }
      }));

      // Use ref to avoid stale closure — stopScreenShare may be recreated
      vt.onended = () => { stopScreenShareRef.current?.(); };
      socketRef.current?.emit('screen-share-started');
      return true;
    } catch (e: any) {
      if (e?.name !== 'NotAllowedError') addToast?.('Screen share cancelled.', 'warning');
      return false;
    }
  }, [addToast, userName]); // eslint-disable-line

  const stopScreenShare = useCallback(async () => {
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    setScreenStream(null);
    setScreenSharing(false);
    const camTrack = localStreamRef.current?.getVideoTracks()[0];
    await Promise.all(Array.from(peersRef.current.values()).map(async peer => {
      const pc = peer.connection;
      if (!pc) return;
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (!sender) return;
      await sender.replaceTrack(camTrack ?? null).catch(() => {});
      if (pc.signalingState === 'stable') {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current?.emit('offer', { to: peer.socketId, sdp: pc.localDescription, name: userName });
      }
    }));
    socketRef.current?.emit('screen-share-stopped');
  }, [userName]);

  // ── Host controls ──────────────────────────────────────────
  const muteAll = useCallback(() => {
    socket?.emit('host-mute-all');
  }, [socket]);

  const removeParticipant = useCallback((targetSocketId: string) => {
    socket?.emit('host-remove-participant', { targetSocketId });
  }, [socket]);

  // ── Socket event listeners ─────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onRoomJoined = ({ socketId, existingPeers, isHost: iAmHost }: RoomJoinedPayload) => {
      setMySocketId(socketId);
      setIsHost(iAmHost);
      // Pre-register peers with names (so handleOffer knows the name)
      existingPeers.forEach(p => {
        if (!peersRef.current.has(p.socketId)) {
          peersRef.current.set(p.socketId, {
            socketId: p.socketId, name: p.name, stream: null,
            connection: undefined as any,
            micMuted: p.micMuted, videoMuted: p.videoMuted,
            isScreenSharing: false, connectionState: 'new',
            handRaised: p.handRaised ?? false, isHost: p.isHost ?? false, isRecording: false,
          });
        }
        initiateCall(p.socketId, p.name);
      });
      syncPeers();
    };

    const onUserJoined = ({ socketId: pid, name, isHost: peerIsHost }: UserJoinedPayload) => {
      onPeerJoined?.(name);
      if (!peersRef.current.has(pid)) {
        peersRef.current.set(pid, {
          socketId: pid, name, stream: null,
          connection: undefined as any,
          micMuted: false, videoMuted: false,
          isScreenSharing: false, connectionState: 'new',
          handRaised: false, isHost: peerIsHost ?? false, isRecording: false,
        });
        syncPeers();
      }
    };

    const onUserLeft  = ({ socketId: pid }: UserLeftPayload) => {
      const name = peersRef.current.get(pid)?.name ?? 'Someone';
      removePeer(pid);
      onPeerLeft?.(name);
    };

    const onPeerMute  = ({ socketId: pid, micMuted, videoMuted }: PeerMuteStatePayload) =>
      updatePeer(pid, { micMuted, videoMuted });

    const onSSOn      = ({ socketId: pid }: any) => updatePeer(pid, { isScreenSharing: true  });
    const onSSOff     = ({ socketId: pid }: any) => updatePeer(pid, { isScreenSharing: false });
    const onHand      = ({ socketId: pid, handRaised }: any) => updatePeer(pid, { handRaised });
    const onRecStart  = ({ socketId: pid }: any) => updatePeer(pid, { isRecording: true  });
    const onRecStop   = ({ socketId: pid }: any) => updatePeer(pid, { isRecording: false });

    const onHostChanged = ({ newHostSocketId }: any) => {
      // Update isHost flags
      peersRef.current.forEach((p, id) => {
        updatePeer(id, { isHost: id === newHostSocketId });
      });
    };
    const onForceMute = () => {
      toggleMic();
      onHostAction?.('muted-by-host');
      addToast?.('🔇 You were muted by the host', 'info');
    };
    const onRemovedByHost = () => {
      onHostAction?.('removed-by-host');
      addToast?.('You were removed from the meeting by the host', 'warning');
    };
    const onPromotedToHost = () => {
      setIsHost(true);
      onHostAction?.('promoted');
      addToast?.('👑 You are now the host', 'success');
    };

    socket.on('room-joined',                onRoomJoined);
    socket.on('user-joined',                onUserJoined);
    socket.on('user-left',                  onUserLeft);
    socket.on('offer',                      handleOffer);
    socket.on('answer',                     handleAnswer);
    socket.on('ice-candidate',              handleICE);
    socket.on('peer-mute-state',            onPeerMute);
    socket.on('peer-screen-share-started',  onSSOn);
    socket.on('peer-screen-share-stopped',  onSSOff);
    socket.on('peer-hand-state',            onHand);
    socket.on('peer-recording-started',     onRecStart);
    socket.on('peer-recording-stopped',     onRecStop);
    socket.on('host-changed',               onHostChanged);
    socket.on('force-mute',                 onForceMute);
    socket.on('removed-by-host',            onRemovedByHost);
    socket.on('promoted-to-host',           onPromotedToHost);

    return () => {
      socket.off('room-joined',                onRoomJoined);
      socket.off('user-joined',                onUserJoined);
      socket.off('user-left',                  onUserLeft);
      socket.off('offer',                      handleOffer);
      socket.off('answer',                     handleAnswer);
      socket.off('ice-candidate',              handleICE);
      socket.off('peer-mute-state',            onPeerMute);
      socket.off('peer-screen-share-started',  onSSOn);
      socket.off('peer-screen-share-stopped',  onSSOff);
      socket.off('peer-hand-state',            onHand);
      socket.off('peer-recording-started',     onRecStart);
      socket.off('peer-recording-stopped',     onRecStop);
      socket.off('host-changed',               onHostChanged);
      socket.off('force-mute',                 onForceMute);
      socket.off('removed-by-host',            onRemovedByHost);
      socket.off('promoted-to-host',           onPromotedToHost);
    };
  }, [socket, initiateCall, handleOffer, handleAnswer, handleICE,
      updatePeer, removePeer, syncPeers, toggleMic,
      onPeerJoined, onPeerLeft, onHostAction, addToast]);

  // Keep stopScreenShareRef in sync so vt.onended never gets stale ref
  useEffect(() => { stopScreenShareRef.current = stopScreenShare; }, [stopScreenShare]);

  return {
    localStream, screenStream, micOn, cameraOn, screenSharing,
    peers, mySocketId, isHost,
    joinRoom, leaveRoom, reconnectToRoom,
    toggleMic, toggleCamera,
    startScreenShare, stopScreenShare,
    initLocalStream, muteAll, removeParticipant,
  };
}
