// © Ken Baserecha — Boutyflameet

export interface User {
  uid:         string;
  email:       string | null;
  displayName: string;
  photoURL:    string | null;
  plan:        'free' | 'pro' | 'enterprise';
  createdAt:   number;
}

export interface PeerData {
  socketId:       string;
  name:           string;
  stream:         MediaStream | null;
  connection:     RTCPeerConnection;
  micMuted:       boolean;
  videoMuted:     boolean;
  isScreenSharing:boolean;
  connectionState:RTCPeerConnectionState;
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

// Socket payloads
export interface RoomJoinedPayload {
  roomId:         string;
  socketId:       string;
  existingPeers:  { socketId: string; name: string; micMuted: boolean; videoMuted: boolean }[];
}
export interface UserJoinedPayload   { socketId: string; name: string; uid?: string; }
export interface UserLeftPayload     { socketId: string; }
export interface OfferPayload        { from: string; sdp: RTCSessionDescriptionInit; }
export interface AnswerPayload       { from: string; sdp: RTCSessionDescriptionInit; }
export interface IceCandidatePayload { from: string; candidate: RTCIceCandidateInit; }
export interface PeerMuteStatePayload{ socketId: string; micMuted: boolean; videoMuted: boolean; }

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
