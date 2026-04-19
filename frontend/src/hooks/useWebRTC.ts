/**
 * useWebRTC — Full-mesh WebRTC with improved screen sharing & fixes
 * © Ken Baserecha — Boutyflameet
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { RTC_CONFIG } from '../lib/constants';
import {
  PeerData, RoomJoinedPayload, UserJoinedPayload, UserLeftPayload,
  OfferPayload, AnswerPayload, IceCandidatePayload, PeerMuteStatePayload,
} from '../types';

interface Opts {
  socket:         Socket | null;
  roomId:         string | null;
  userName:       string;
  userUid?:       string;
  onPeerJoined?:  (name: string) => void;
  onPeerLeft?:    (name: string) => void;
  addToast?:      (msg: string, type: 'success' | 'info' | 'warning' | 'error') => void;
}

export function useWebRTC({ socket, roomId, userName, userUid, onPeerJoined, onPeerLeft, addToast }: Opts) {
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

  useEffect(() => { socketRef.current = socket; }, [socket]);
  useEffect(() => { micOnRef.current = micOn; }, [micOn]);
  useEffect(() => { camOnRef.current = cameraOn; }, [cameraOn]);

  const updatePeer = useCallback((id: string, update: Partial<PeerData>) => {
    const cur = peersRef.current.get(id);
    if (!cur) return;
    peersRef.current.set(id, { ...cur, ...update });
    setPeers(new Map(peersRef.current));
  }, []);

  const removePeer = useCallback((id: string) => {
    const p = peersRef.current.get(id);
    if (p) { try { p.connection.close(); } catch {} peersRef.current.delete(id); setPeers(new Map(peersRef.current)); }
  }, []);

  const createPC = useCallback((remotePeerId: string, remoteName: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection(RTC_CONFIG);

    localStreamRef.current?.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));

    pc.onicecandidate = e => {
      if (e.candidate) socketRef.current?.emit('ice-candidate', { to: remotePeerId, candidate: e.candidate.toJSON() });
    };

    pc.ontrack = e => {
      const stream = e.streams[0] || new MediaStream([e.track]);
      updatePeer(remotePeerId, { stream });
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      updatePeer(remotePeerId, { connectionState: s });
      if (s === 'failed') pc.restartIce();
    };

    peersRef.current.set(remotePeerId, {
      socketId: remotePeerId, name: remoteName, stream: null,
      connection: pc, micMuted: false, videoMuted: false,
      isScreenSharing: false, connectionState: 'new',
    });
    setPeers(new Map(peersRef.current));
    return pc;
  }, [updatePeer]);

  const initiateCall = useCallback(async (peerId: string, name: string) => {
    const pc = createPC(peerId, name);
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      socketRef.current?.emit('offer', { to: peerId, sdp: pc.localDescription });
    } catch (e) { console.error('[WebRTC] initiateCall:', e); }
  }, [createPC]);

  const handleOffer = useCallback(async ({ from, sdp }: OfferPayload) => {
    let pc = peersRef.current.get(from)?.connection;
    if (!pc) pc = createPC(from, `Peer-${from.slice(0,4)}`);
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current?.emit('answer', { to: from, sdp: pc.localDescription });
    } catch (e) { console.error('[WebRTC] handleOffer:', e); }
  }, [createPC]);

  const handleAnswer = useCallback(async ({ from, sdp }: AnswerPayload) => {
    const pc = peersRef.current.get(from)?.connection;
    if (!pc) return;
    try { if (pc.signalingState !== 'stable') await pc.setRemoteDescription(new RTCSessionDescription(sdp)); }
    catch (e) { console.error('[WebRTC] handleAnswer:', e); }
  }, []);

  const handleICE = useCallback(async ({ from, candidate }: IceCandidatePayload) => {
    const pc = peersRef.current.get(from)?.connection;
    if (!pc) return;
    try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
    catch {}
  }, []);

  const initLocalStream = useCallback(async (): Promise<MediaStream | null> => {
    if (localStreamRef.current) return localStreamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 },
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch {
      try {
        const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = audio;
        setLocalStream(audio);
        setCameraOn(false);
        return audio;
      } catch { return null; }
    }
  }, []);

  const joinRoom = useCallback(async () => {
    if (!socket || !roomId) return;
    if (!localStreamRef.current) await initLocalStream();
    socket.emit('join-room', { roomId, userName, uid: userUid || null });
  }, [socket, roomId, userName, userUid, initLocalStream]);

  const leaveRoom = useCallback(() => {
    peersRef.current.forEach(p => { try { p.connection.close(); } catch {} });
    peersRef.current.clear(); setPeers(new Map());
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null; screenStreamRef.current = null;
    setLocalStream(null); setScreenStream(null); setScreenSharing(false);
    socket?.emit('leave-room');
  }, [socket]);

  const toggleMic = useCallback(() => {
    const s = localStreamRef.current;
    if (!s) return;
    const next = !micOnRef.current;
    s.getAudioTracks().forEach(t => { t.enabled = next; });
    setMicOn(next);
    socketRef.current?.emit('mute-state', { micMuted: !next, videoMuted: !camOnRef.current });
  }, []);

  const toggleCamera = useCallback(() => {
    const s = localStreamRef.current;
    if (!s) return;
    const next = !camOnRef.current;
    s.getVideoTracks().forEach(t => { t.enabled = next; });
    setCameraOn(next);
    socketRef.current?.emit('mute-state', { micMuted: !micOnRef.current, videoMuted: !next });
  }, []);

  /** Improved Screen Share with renegotiation */
  const startScreenShare = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: false, noiseSuppression: false },
      });

      screenStreamRef.current = stream;
      setScreenStream(stream);
      setScreenSharing(true);

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) return false;

      await Promise.all(
        Array.from(peersRef.current.values()).map(async (peer) => {
          const pc = peer.connection;
          const senders = pc.getSenders();
          const videoSender = senders.find(s => s.track?.kind === 'video');

          if (videoSender) {
            await videoSender.replaceTrack(videoTrack).catch(console.warn);
          } else {
            pc.addTrack(videoTrack, stream);
          }

          // Renegotiation (critical for screen share in mesh)
          if (pc.signalingState === 'stable') {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socketRef.current?.emit('offer', { to: peer.socketId, sdp: pc.localDescription });
          }
        })
      );

      videoTrack.onended = () => stopScreenShare();

      socketRef.current?.emit('screen-share-started');
      addToast?.('🖥️ Screen sharing started — everyone should see it', 'success');
      return true;
    } catch (e) {
      console.error('[Screen] Failed:', e);
      addToast?.('Screen share cancelled or permission denied', 'warning');
      return false;
    }
  }, [addToast]);

  const stopScreenShare = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    setScreenStream(null);
    setScreenSharing(false);

    const camTrack = localStreamRef.current?.getVideoTracks()[0];
    if (camTrack) {
      Array.from(peersRef.current.values()).forEach(peer => {
        const vs = peer.connection.getSenders().find(s => s.track?.kind === 'video');
        if (vs) vs.replaceTrack(camTrack).catch(console.warn);
      });
    }

    socketRef.current?.emit('screen-share-stopped');
  }, []);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    const onRoomJoined = ({ socketId, existingPeers }: RoomJoinedPayload) => {
      setMySocketId(socketId);
      existingPeers.forEach(({ socketId: pid, name }) => initiateCall(pid, name));
    };

    const onUserJoined = ({ socketId: pid, name }: UserJoinedPayload) => {
      onPeerJoined?.(name);
      initiateCall(pid, name);   // ← Ensures new peer gets called
    };

    const onUserLeft = ({ socketId: pid }: UserLeftPayload) => {
      const name = peersRef.current.get(pid)?.name ?? 'Someone';
      removePeer(pid);
      onPeerLeft?.(name);
    };

    const onPeerMute = ({ socketId: pid, micMuted, videoMuted }: PeerMuteStatePayload) =>
      updatePeer(pid, { micMuted, videoMuted });

    const onSSOn = ({ socketId: pid }: { socketId: string }) => updatePeer(pid, { isScreenSharing: true });
    const onSSOff = ({ socketId: pid }: { socketId: string }) => updatePeer(pid, { isScreenSharing: false });

    socket.on('room-joined', onRoomJoined);
    socket.on('user-joined', onUserJoined);
    socket.on('user-left', onUserLeft);
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleICE);
    socket.on('peer-mute-state', onPeerMute);
    socket.on('peer-screen-share-started', onSSOn);
    socket.on('peer-screen-share-stopped', onSSOff);

    return () => {
      socket.off('room-joined', onRoomJoined);
      socket.off('user-joined', onUserJoined);
      socket.off('user-left', onUserLeft);
      socket.off('offer', handleOffer);
      socket.off('answer', handleAnswer);
      socket.off('ice-candidate', handleICE);
      socket.off('peer-mute-state', onPeerMute);
      socket.off('peer-screen-share-started', onSSOn);
      socket.off('peer-screen-share-stopped', onSSOff);
    };
  }, [socket, initiateCall, handleOffer, handleAnswer, handleICE, updatePeer, removePeer, onPeerJoined, onPeerLeft]);

  return {
    localStream, screenStream, micOn, cameraOn, screenSharing,
    peers, mySocketId, joinRoom, leaveRoom,
    toggleMic, toggleCamera, startScreenShare, stopScreenShare, initLocalStream,
  };
}