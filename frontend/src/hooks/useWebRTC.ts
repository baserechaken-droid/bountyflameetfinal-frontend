/**
 * useWebRTC — Production-grade full-mesh WebRTC
 * © Ken Baserecha — Boutyflameet
 *
 * FIXES IN THIS VERSION:
 * 1. externalStream param: pre-captured stream from PreMeetingScreen injected
 *    directly into localStreamRef — prevents double getUserMedia on mobile
 * 2. ICE candidate queuing: candidates buffered until remote description set
 * 3. Robust ontrack: handles empty e.streams[], adds track to existing stream
 * 4. handleOffer: uses peer's real name if already in map
 * 5. Connection state: disconnected is temporary, not an error
 * 6. toggleCamera: re-acquires camera track if needed (for phones)
 * 7. Screen share: safe check for getDisplayMedia support
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { RTC_CONFIG } from '../lib/constants';
import {
  PeerData, RoomJoinedPayload, UserJoinedPayload, UserLeftPayload,
  OfferPayload, AnswerPayload, IceCandidatePayload, PeerMuteStatePayload,
} from '../types';

interface Opts {
  socket:          Socket | null;
  roomId:          string | null;
  userName:        string;
  userUid?:        string;
  externalStream?: MediaStream | null;   // ← stream from PreMeetingScreen
  onPeerJoined?:   (name: string) => void;
  onPeerLeft?:     (name: string) => void;
  addToast?:       (msg: string, type: 'success' | 'info' | 'warning' | 'error') => void;
}

export function useWebRTC({
  socket, roomId, userName, userUid, externalStream,
  onPeerJoined, onPeerLeft, addToast,
}: Opts) {
  const [localStream,   setLocalStream]   = useState<MediaStream | null>(null);
  const [screenStream,  setScreenStream]  = useState<MediaStream | null>(null);
  const [micOn,         setMicOn]         = useState(true);
  const [cameraOn,      setCameraOn]      = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [peers,         setPeers]         = useState<Map<string, PeerData>>(new Map());
  const [mySocketId,    setMySocketId]    = useState<string | null>(null);

  const localStreamRef  = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peersRef        = useRef<Map<string, PeerData>>(new Map());
  const socketRef       = useRef<Socket | null>(null);
  const micOnRef        = useRef(true);
  const camOnRef        = useRef(true);
  // ICE candidate queue per peer — candidates that arrive before remote desc is set
  const iceCandidateQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  useEffect(() => { socketRef.current = socket; },   [socket]);
  useEffect(() => { micOnRef.current   = micOn; },   [micOn]);
  useEffect(() => { camOnRef.current   = cameraOn; }, [cameraOn]);

  // ── Helpers ──────────────────────────────────────────────
  const syncPeers = useCallback(() => {
    setPeers(new Map(peersRef.current));
  }, []);

  const updatePeer = useCallback((id: string, update: Partial<PeerData>) => {
    const cur = peersRef.current.get(id);
    if (!cur) return;
    peersRef.current.set(id, { ...cur, ...update });
    syncPeers();
  }, [syncPeers]);

  const removePeer = useCallback((id: string) => {
    const p = peersRef.current.get(id);
    if (!p) return;
    try { p.connection.close(); } catch {}
    peersRef.current.delete(id);
    iceCandidateQueueRef.current.delete(id);
    syncPeers();
  }, [syncPeers]);

  // ── Flush queued ICE candidates once remote description is set ──
  const flushIceCandidates = useCallback(async (peerId: string, pc: RTCPeerConnection) => {
    const queue = iceCandidateQueueRef.current.get(peerId) ?? [];
    iceCandidateQueueRef.current.delete(peerId);
    for (const candidate of queue) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    }
  }, []);

  // ── Create RTCPeerConnection ──────────────────────────────
  const createPC = useCallback((remotePeerId: string, remoteName: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection(RTC_CONFIG);

    // Add ALL local tracks (audio + video) to this peer connection
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach(track => {
        try { pc.addTrack(track, stream); } catch {}
      });
    } else {
      console.warn(`[WebRTC] createPC for ${remoteName}: localStream is null — no tracks added!`);
    }

    // Send ICE candidates to peer via signaling
    pc.onicecandidate = e => {
      if (e.candidate && socketRef.current) {
        socketRef.current.emit('ice-candidate', {
          to: remotePeerId,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    pc.onicecandidateerror = (e) => {
      // Only log — don't treat as fatal
      console.warn('[WebRTC] ICE candidate error (usually benign):', e.errorText);
    };

    // ── CRITICAL: ontrack — attach remote stream to peer ─────
    pc.ontrack = (e) => {
      console.log(`[WebRTC] ontrack from ${remoteName}:`, e.track.kind, 'streams:', e.streams.length);
      let stream: MediaStream;

      if (e.streams && e.streams.length > 0) {
        // Standard path: use the stream from the event
        stream = e.streams[0];
      } else {
        // Firefox / some mobile browsers: no stream in event — build one from existing
        const existing = peersRef.current.get(remotePeerId)?.stream;
        if (existing) {
          // Add the track to the existing stream (in-place mutation triggers re-render)
          if (!existing.getTracks().some(t => t.id === e.track.id)) {
            existing.addTrack(e.track);
          }
          stream = existing;
        } else {
          stream = new MediaStream([e.track]);
        }
      }

      // When a track ends, update peer state
      e.track.onended = () => {
        const peer = peersRef.current.get(remotePeerId);
        if (peer) {
          const remaining = peer.stream?.getTracks().filter(t => t.readyState !== 'ended') ?? [];
          const hasVideo = remaining.some(t => t.kind === 'video');
          updatePeer(remotePeerId, { videoMuted: !hasVideo });
        }
      };

      updatePeer(remotePeerId, { stream });
    };

    // Connection state tracking
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      console.log(`[WebRTC] ${remoteName} connectionState: ${s}`);
      updatePeer(remotePeerId, { connectionState: s });
      if (s === 'failed') {
        console.warn(`[WebRTC] Connection failed to ${remoteName}, attempting ICE restart`);
        pc.restartIce();
      }
      // 'disconnected' is temporary (network hiccup) — do NOT treat as failed
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ${remoteName} ICE: ${pc.iceConnectionState}`);
    };

    pc.onsignalingstatechange = () => {
      console.log(`[WebRTC] ${remoteName} signaling: ${pc.signalingState}`);
    };

    // Register peer
    peersRef.current.set(remotePeerId, {
      socketId:        remotePeerId,
      name:            remoteName,
      stream:          null,
      connection:      pc,
      micMuted:        false,
      videoMuted:      false,
      isScreenSharing: false,
      connectionState: 'new',
    });
    syncPeers();
    return pc;
  }, [updatePeer, syncPeers]);

  // ── Initiate call TO a peer (we are the caller) ───────────
  const initiateCall = useCallback(async (peerId: string, name: string) => {
    // Don't duplicate
    if (peersRef.current.has(peerId)) return;
    const pc = createPC(peerId, name);
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);
      socketRef.current?.emit('offer', {
        to:   peerId,
        sdp:  pc.localDescription,
        name: userName,
      });
      console.log(`[WebRTC] Offer → ${name} (${peerId})`);
    } catch (e) {
      console.error('[WebRTC] initiateCall error:', e);
    }
  }, [createPC, userName]);

  // ── Handle incoming offer (we are the callee) ─────────────
  const handleOffer = useCallback(async ({ from, sdp, name: peerName }: OfferPayload & { name?: string }) => {
    // Reuse existing PC if we already have one (renegotiation)
    let pc = peersRef.current.get(from)?.connection;
    const existingName = peersRef.current.get(from)?.name ?? peerName ?? `Peer-${from.slice(0, 4)}`;

    if (!pc) {
      pc = createPC(from, existingName);
    }

    try {
      // Only set remote if not already stable with a remote description
      if (pc.signalingState === 'stable' && pc.remoteDescription) {
        // Glare condition: both sides created offer simultaneously — ignore this one
        console.warn(`[WebRTC] Glare detected from ${from}, ignoring duplicate offer`);
        return;
      }
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      // Flush any ICE candidates that arrived before the remote description
      await flushIceCandidates(from, pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current?.emit('answer', { to: from, sdp: pc.localDescription });
      console.log(`[WebRTC] Answer → ${existingName} (${from})`);
    } catch (e) {
      console.error('[WebRTC] handleOffer error:', e);
    }
  }, [createPC, flushIceCandidates]);

  // ── Handle incoming answer ────────────────────────────────
  const handleAnswer = useCallback(async ({ from, sdp }: AnswerPayload) => {
    const pc = peersRef.current.get(from)?.connection;
    if (!pc) return;
    try {
      if (pc.signalingState !== 'have-local-offer') {
        console.warn(`[WebRTC] handleAnswer: unexpected state ${pc.signalingState}`);
        return;
      }
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      // Flush queued ICE candidates
      await flushIceCandidates(from, pc);
    } catch (e) {
      console.error('[WebRTC] handleAnswer error:', e);
    }
  }, [flushIceCandidates]);

  // ── Handle incoming ICE candidate ────────────────────────
  const handleICE = useCallback(async ({ from, candidate }: IceCandidatePayload) => {
    const pc = peersRef.current.get(from)?.connection;
    if (!pc) return;

    // If remote description not set yet, queue the candidate
    if (!pc.remoteDescription) {
      const q = iceCandidateQueueRef.current.get(from) ?? [];
      q.push(candidate);
      iceCandidateQueueRef.current.set(from, q);
      return;
    }

    try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
    catch (e) { console.warn('[WebRTC] addIceCandidate (benign):', e); }
  }, []);

  // ── Get local stream (camera + mic) ──────────────────────
  const initLocalStream = useCallback(async (): Promise<MediaStream | null> => {
    // If already have a stream, return it
    if (localStreamRef.current?.active) return localStreamRef.current;

    // ── Use pre-captured stream from PreMeetingScreen (prevents double getUserMedia on mobile) ──
    if (externalStream?.active && externalStream.getTracks().length > 0) {
      console.log('[Media] Using pre-captured stream from PreMeetingScreen');
      localStreamRef.current = externalStream;
      setLocalStream(externalStream);
      setCameraOn(externalStream.getVideoTracks().length > 0);
      setMicOn(externalStream.getAudioTracks().length > 0);
      return externalStream;
    }

    // ── Try progressive constraints (most to least demanding) ──
    const attempts: MediaStreamConstraints[] = [
      { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } },
      { video: { facingMode: 'user' }, audio: true },
      { video: true, audio: true },
      { video: { width: { max: 640 }, height: { max: 480 } }, audio: true },
      { video: true, audio: false },
      { video: false, audio: true },
    ];

    for (const constraints of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;
        setLocalStream(stream);
        setCameraOn(stream.getVideoTracks().length > 0);
        setMicOn(stream.getAudioTracks().length > 0);
        console.log('[Media] Got stream with constraints:', constraints);
        return stream;
      } catch (e: any) {
        if (e?.name === 'NotAllowedError') {
          addToast?.('Camera/mic permission denied. Allow permissions and refresh.', 'error');
          return null;
        }
        console.warn('[Media] Attempt failed:', constraints, e?.message);
      }
    }

    addToast?.('Could not access camera or microphone. Check permissions.', 'error');
    return null;
  }, [externalStream, addToast]);

  // ── Join room ─────────────────────────────────────────────
  const joinRoom = useCallback(async () => {
    if (!socket || !roomId) return;
    // Ensure we have a local stream before joining
    if (!localStreamRef.current?.active) {
      await initLocalStream();
    }
    console.log(`[WebRTC] Joining room ${roomId} as "${userName}"`);
    socket.emit('join-room', { roomId, userName, uid: userUid || null });
  }, [socket, roomId, userName, userUid, initLocalStream]);

  // ── Leave room ────────────────────────────────────────────
  const leaveRoom = useCallback(() => {
    peersRef.current.forEach(p => { try { p.connection.close(); } catch {} });
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

  // ── Toggle microphone ─────────────────────────────────────
  const toggleMic = useCallback(() => {
    const s = localStreamRef.current;
    if (!s) return;
    const next = !micOnRef.current;
    s.getAudioTracks().forEach(t => { t.enabled = next; });
    setMicOn(next);
    socketRef.current?.emit('mute-state', { micMuted: !next, videoMuted: !camOnRef.current });
  }, []);

  // ── Toggle camera ─────────────────────────────────────────
  const toggleCamera = useCallback(async () => {
    const s = localStreamRef.current;
    if (!s) return;
    const next = !camOnRef.current;

    // If turning ON and no video tracks available, try re-acquiring
    if (next && s.getVideoTracks().every(t => t.readyState === 'ended')) {
      try {
        const newVid = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        const track = newVid.getVideoTracks()[0];
        if (track) {
          s.addTrack(track);
          // Replace in all peer connections
          Array.from(peersRef.current.values()).forEach(peer => {
            const sender = peer.connection.getSenders().find(sv => sv.track?.kind === 'video');
            if (sender) sender.replaceTrack(track).catch(console.warn);
            else peer.connection.addTrack(track, s);
          });
        }
      } catch (e) {
        addToast?.('Could not start camera. Check permissions.', 'warning');
        return;
      }
    }

    s.getVideoTracks().forEach(t => { t.enabled = next; });
    setCameraOn(next);
    socketRef.current?.emit('mute-state', { micMuted: !micOnRef.current, videoMuted: !next });
  }, [addToast]);

  // ── Screen share ──────────────────────────────────────────
  const startScreenShare = useCallback(async (): Promise<boolean> => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      addToast?.('Screen sharing is not supported in this browser.', 'warning');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      screenStreamRef.current = stream;
      setScreenStream(stream);
      setScreenSharing(true);

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) { stream.getTracks().forEach(t => t.stop()); return false; }

      // Replace video track on all peers + renegotiate
      await Promise.all(Array.from(peersRef.current.values()).map(async (peer) => {
        const pc     = peer.connection;
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(videoTrack).catch(console.warn);
        else        pc.addTrack(videoTrack, stream);
        // Renegotiate
        if (pc.signalingState === 'stable') {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socketRef.current?.emit('offer', { to: peer.socketId, sdp: pc.localDescription, name: userName });
        }
      }));

      videoTrack.onended = () => stopScreenShare();
      socketRef.current?.emit('screen-share-started');
      return true;
    } catch (e: any) {
      if (e?.name !== 'NotAllowedError') {
        addToast?.('Screen share cancelled or not supported.', 'warning');
      }
      return false;
    }
  }, [addToast, userName]); // eslint-disable-line

  const stopScreenShare = useCallback(async () => {
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    setScreenStream(null);
    setScreenSharing(false);

    const camTrack = localStreamRef.current?.getVideoTracks()[0];
    await Promise.all(Array.from(peersRef.current.values()).map(async (peer) => {
      const pc     = peer.connection;
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (!sender) return;
      await sender.replaceTrack(camTrack ?? null).catch(console.warn);
      if (pc.signalingState === 'stable') {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current?.emit('offer', { to: peer.socketId, sdp: pc.localDescription, name: userName });
      }
    }));
    socketRef.current?.emit('screen-share-stopped');
  }, [userName]);

  // ── Socket event listeners ────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onRoomJoined = ({ socketId, existingPeers }: RoomJoinedPayload) => {
      console.log(`[Socket] room-joined. My ID: ${socketId}. Existing peers: ${existingPeers.length}`);
      setMySocketId(socketId);
      existingPeers.forEach(({ socketId: pid, name }) => {
        initiateCall(pid, name);
      });
    };

    const onUserJoined = ({ socketId: pid, name }: UserJoinedPayload) => {
      console.log(`[Socket] user-joined: ${name} (${pid})`);
      onPeerJoined?.(name);
      // The new peer will send us an offer — don't duplicate-call
      // But register them with a placeholder so we know their name when offer arrives
      if (!peersRef.current.has(pid)) {
        // Just store name — actual PC created in handleOffer
        peersRef.current.set(pid, {
          socketId: pid, name, stream: null,
          connection: null as any, // will be set in handleOffer
          micMuted: false, videoMuted: false,
          isScreenSharing: false, connectionState: 'new',
        });
        syncPeers();
      }
    };

    const onUserLeft = ({ socketId: pid }: UserLeftPayload) => {
      const name = peersRef.current.get(pid)?.name ?? 'Someone';
      removePeer(pid);
      onPeerLeft?.(name);
    };

    const onPeerMute = ({ socketId: pid, micMuted, videoMuted }: PeerMuteStatePayload) =>
      updatePeer(pid, { micMuted, videoMuted });

    const onSSOn  = ({ socketId: pid }: { socketId: string }) => updatePeer(pid, { isScreenSharing: true  });
    const onSSOff = ({ socketId: pid }: { socketId: string }) => updatePeer(pid, { isScreenSharing: false });

    socket.on('room-joined',                onRoomJoined);
    socket.on('user-joined',                onUserJoined);
    socket.on('user-left',                  onUserLeft);
    socket.on('offer',                      handleOffer);
    socket.on('answer',                     handleAnswer);
    socket.on('ice-candidate',              handleICE);
    socket.on('peer-mute-state',            onPeerMute);
    socket.on('peer-screen-share-started',  onSSOn);
    socket.on('peer-screen-share-stopped',  onSSOff);

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
    };
  }, [socket, initiateCall, handleOffer, handleAnswer, handleICE, updatePeer, removePeer, syncPeers, onPeerJoined, onPeerLeft]);

  return {
    localStream, screenStream, micOn, cameraOn, screenSharing,
    peers, mySocketId, joinRoom, leaveRoom,
    toggleMic, toggleCamera, startScreenShare, stopScreenShare, initLocalStream,
  };
}
