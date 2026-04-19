// © Ken Baserecha — Boutyflameet
export const COPYRIGHT     = '© Ken Baserecha';
export const OWNER         = 'Ken Baserecha';
export const APP_NAME      = 'Boutyflameet';
export const SUPPORT_EMAIL = 'support@boutyflameet.app'; // set your real email here

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'turn:openrelay.metered.ca:80',              username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443',             username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: ICE_SERVERS,
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

export const SIGNALING_URL =
  import.meta.env.VITE_SIGNALING_URL || 'http://localhost:3001';

export const ROOM_PREFIX      = 'BOUTY';
export const MAX_PEERS        = 12;
export const ALLOWED_REACTIONS = ['👍','❤️','🔥','😂','👏','🎉','🚀','💯'];

export const LS_KEYS = {
  RECENT_MEETINGS: 'bfm_recent_v3',
  USER_NAME:       'bfm_username',
  USER_PLAN:       'bfm_plan',
  SETTINGS:        'bfm_settings',
};

export const PLANS = {
  free: {
    name: 'Spark', price: '$0',
    maxParticipants: 5, maxMinutes: 40,
    features: ['5 participants','40 min limit','HD video','Basic backgrounds','Chat'],
  },
  pro: {
    name: 'Blaze', price: '$12/mo',
    maxParticipants: 50, maxMinutes: Infinity,
    features: ['50 participants','Unlimited time','4K video','All backgrounds','Cloud recording','AI noise cancel','Voice typing','Breakout rooms','Analytics'],
  },
  enterprise: {
    name: 'Inferno', price: 'Custom',
    maxParticipants: 500, maxMinutes: Infinity,
    features: ['500 participants','Custom branding','SSO login','Dedicated support','On-prem','Unlimited storage'],
  },
} as const;

export type PlanKey = keyof typeof PLANS;
