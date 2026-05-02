// © Ken Baserecha — Boutyflameet v4

export interface User {
  uid:         string;
  email:       string | null;
  displayName: string;
  photoURL:    string | null;
  plan:        'free' | 'pro' | 'enterprise';
  expiresAt?:  number;   // subscription expiry timestamp
  createdAt:   number;
}

export interface PeerData {
  socketId:        string;
  name:            string;
  stream:          MediaStream | null;
  connection:      RTCPeerConnection;
  micMuted:        boolean;
  videoMuted:      boolean;
  isScreenSharing: boolean;
  connectionState: RTCPeerConnectionState;
  handRaised?:     boolean;
  isHost?:         boolean;
  isRecording?:    boolean;
}

export interface ChatMessage {
  id:        string;
  message:   string;
  userName:  string;
  timestamp: number;
  socketId:  string;
  isOwn?:    boolean;
  type?:     'text' | 'ai' | 'system';
}

export interface Reaction {
  id: string; emoji: string; socketId: string; name: string; x: number; y: number;
}

export interface RecentMeeting {
  roomId:   string;
  title:    string;
  joinedAt: number;
}

export interface ToastMessage {
  id:       string;
  message:  string;
  type:     'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

export interface RecordingState {
  isRecording:  boolean;
  isPaused:     boolean;
  duration:     number;
  sizeKB:       number;
  startTime:    number | null;
}

// Socket payloads
export interface RoomJoinedPayload {
  roomId:           string;
  socketId:         string;
  existingPeers:    { socketId: string; name: string; micMuted: boolean; videoMuted: boolean; handRaised?: boolean; isHost?: boolean }[];
  isHost:           boolean;
  participantCount: number;
}
export interface UserJoinedPayload    { socketId: string; name: string; uid?: string; isHost?: boolean; }
export interface UserLeftPayload      { socketId: string; }
export interface OfferPayload         { from: string; sdp: RTCSessionDescriptionInit; name?: string; }
export interface AnswerPayload        { from: string; sdp: RTCSessionDescriptionInit; }
export interface IceCandidatePayload  { from: string; candidate: RTCIceCandidateInit; }
export interface PeerMuteStatePayload { socketId: string; micMuted: boolean; videoMuted: boolean; }

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
export type PlanKey = 'free' | 'pro' | 'enterprise';
