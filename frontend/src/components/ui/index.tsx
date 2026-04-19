/**
 * ================================================================
 * Boutyflameet — Shared UI Components
 * ================================================================
 */
import React, { useEffect, useRef } from 'react';
import { X, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { ToastMessage, PeerData } from '../../types';
import { getInitials, getPeerColor } from '../../lib/utils';
import logoSrc from '../../assets/logo.jpeg';

// ── Logo with the real flame image ───────────────────────────
export function FlameIcon({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src={logoSrc}
      alt="Boutyflameet"
      width={size}
      height={size}
      className={`rounded-full object-cover animate-flame-pulse ${className}`}
      style={{ aspectRatio: '1/1' }}
    />
  );
}

export function Logo({ showText = true }: { showText?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <FlameIcon size={34} />
      {showText && (
        <span className="text-xl font-bold tracking-tight text-white">
          Boutyflameet
        </span>
      )}
    </div>
  );
}

// ── Video Tile ────────────────────────────────────────────────
interface VideoTileProps {
  peer?: PeerData;
  stream?: MediaStream | null;
  name: string;
  socketId?: string;
  isSelf?: boolean;
  isMuted?: boolean;
  isVideoOff?: boolean;
  isScreenSharing?: boolean;
  isSpeaking?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'hero';
  className?: string;
}

export function VideoTile({
  peer, stream, name, socketId,
  isSelf = false, isMuted, isVideoOff, isScreenSharing,
  isSpeaking = false, size = 'md', className = '',
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const actualStream    = stream ?? peer?.stream ?? null;
  const actualMuted     = isMuted ?? peer?.micMuted ?? false;
  const actualVideoOff  = isVideoOff ?? peer?.videoMuted ?? false;
  const actualSSing     = isScreenSharing ?? peer?.isScreenSharing ?? false;
  const actualId        = socketId ?? peer?.socketId ?? '';
  const connState       = peer?.connectionState;
  const isConnecting    = connState === 'new' || connState === 'connecting' ;
  const isFailed        = connState === 'failed';

  const lastStreamRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (actualStream) {
      // Re-attach whenever stream changes OR when it's new tracks on same object
      if (lastStreamRef.current !== actualStream || vid.paused) {
        lastStreamRef.current = actualStream;
        vid.srcObject = actualStream;
        const tryPlay = () => {
          vid.play().catch(err => {
            if (err?.name === 'NotAllowedError') {
              const resume = () => { vid.play().catch(() => {}); };
              document.addEventListener('click',      resume, { once: true });
              document.addEventListener('touchstart', resume, { once: true, passive: true });
            }
          });
        };
        if (vid.readyState >= 1) { tryPlay(); }
        else { vid.onloadedmetadata = tryPlay; }
      }
    } else {
      vid.srcObject = null;
      lastStreamRef.current = null;
    }
  }, [actualStream]);

  const initials  = getInitials(name);
  const gradient  = getPeerColor(isSelf ? 'self' : actualId);
  const hasVideo  = !!actualStream && actualStream.active &&
                    actualStream.getVideoTracks().some(t => t.enabled && t.readyState !== 'ended') &&
                    !actualVideoOff;

  const initialsSize = {
    sm: 'text-xl w-12 h-12', 
    md: 'text-2xl w-16 h-16',
    lg: 'text-3xl w-20 h-20', 
    hero: 'text-5xl w-28 h-28',
  };

  return (
    <div className={[
      'relative rounded-2xl overflow-hidden bg-dark-700 border-2 transition-all duration-300',
      isSpeaking && !actualMuted ? 'tile-speaking border-flame-500' : 'border-white/[0.06]',
      isSelf ? 'border-flame-500/40' : '',
      actualSSing && 'ring-2 ring-flame-500/60 scale-[1.02]',   // Light hero effect
      className,
    ].join(' ')}>

      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay 
        playsInline 
        muted={isSelf}
        className={['w-full h-full object-cover', isSelf ? 'scale-x-[-1]' : '', hasVideo ? 'block' : 'hidden'].join(' ')}
        disablePictureInPicture
      />

      {/* No Video Fallback (Avatar) */}
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center" 
             style={{ background: 'linear-gradient(135deg,#0D0D26,#121232)' }}>
          <div className={`rounded-2xl flex items-center justify-center font-bold text-white/90 ${initialsSize[size]}`} 
               style={{ background: gradient }}>
            {initials}
          </div>
        </div>
      )}

      {/* Screen Sharing Overlay */}
      {actualSSing && (
        <div className="absolute top-3 left-3 bg-black/90 backdrop-blur-md text-white text-xs font-semibold 
                        px-4 py-1.5 rounded-2xl flex items-center gap-2 z-20 shadow-xl border border-white/20">
          🖥️ <span className="truncate max-w-[170px]">{name} is sharing screen</span>
        </div>
      )}

      {/* Status Badges */}
      {!isSelf && (
        <div className="absolute top-2 left-2 bg-flame-500 text-white text-[9px] font-black px-2 py-0.5 rounded tracking-widest">
          LIVE
        </div>
      )}
      
      {isSelf && (
        <div className="absolute top-2 left-2 bg-flame-500/80 text-white text-[9px] font-black px-2 py-0.5 rounded tracking-widest">
          YOU
        </div>
      )}

      {/* Connecting / Failed States */}
      {isConnecting && !isSelf && (
        <div className="absolute inset-0 bg-dark-900/80 flex flex-col items-center justify-center gap-2">
          <Loader2 size={24} className="text-flame-500 animate-spin" />
          <span className="text-xs text-white/60 font-medium">Connecting…</span>
        </div>
      )}

      {isFailed && !isSelf && (
        <div className="absolute inset-0 bg-dark-900/80 flex flex-col items-center justify-center gap-2">
          <WifiOff size={24} className="text-red-400" />
          <span className="text-xs text-red-400 font-medium">Poor connection</span>
        </div>
      )}

      {/* Bottom Bar: Name + Mute Indicator */}
      <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between">
        <span className="text-white font-semibold truncate text-xs">
          {name}{isSelf ? ' (You)' : ''}
        </span>
        
        <div className="flex items-center gap-1 ml-2">
          {connState === 'connected' && !isSelf && (
            <Wifi size={10} className="text-green-400 shrink-0" />
          )}
          
          {actualMuted && (
            <div className="bg-red-500/90 rounded-full p-0.5">
              <svg width="10" height="10" fill="white" viewBox="0 0 24 24">
                <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3 3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
              </svg>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────
const toastColors = {
  info:    'border-white/10 bg-dark-800',
  success: 'border-green-500/30 bg-green-500/10',
  warning: 'border-flame-500/40 bg-flame-500/10',
  error:   'border-red-500/30 bg-red-500/10',
};

const toastIcons: Record<ToastMessage['type'], string> = {
  info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌',
};

export function ToastContainer({ toasts, onRemove }: { toasts: ToastMessage[]; onRemove: (id: string) => void }) {
  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-xs w-full pointer-events-none px-2">
      {toasts.map(t => (
        <div key={t.id} className={`glass border rounded-xl px-4 py-3 flex items-start gap-3 shadow-xl animate-slide-right pointer-events-auto ${toastColors[t.type]}`}>
          <span className="text-base shrink-0 mt-0.5">{toastIcons[t.type]}</span>
          <p className="text-sm text-white/90 font-medium flex-1 leading-snug">{t.message}</p>
          <button onClick={() => onRemove(t.id)} className="text-white/40 hover:text-white/80 transition-colors shrink-0 mt-0.5">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Floating Reaction ─────────────────────────────────────────
export interface FloatingReaction {
  id: string; 
  emoji: string; 
  x: number; 
  y: number; 
  name: string; 
  socketId: string;
}

export function FloatingReactions({ reactions }: { reactions: FloatingReaction[] }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      {reactions.map(r => (
        <div key={r.id} className="absolute animate-emoji-rise select-none" style={{ left: r.x, bottom: 80 }}>
          <div className="flex flex-col items-center gap-1">
            <span className="text-4xl drop-shadow-lg">{r.emoji}</span>
            <span className="text-xs text-white/70 bg-black/40 px-2 py-0.5 rounded-full font-medium">{r.name}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Connection Badge ──────────────────────────────────────────
export function ConnectionBadge({ status }: { status: string }) {
  const configs: Record<string, { dot: string; label: string; pulse: boolean }> = {
    connected:    { dot: 'bg-green-400',  label: 'Connected',    pulse: false },
    connecting:   { dot: 'bg-yellow-400', label: 'Connecting…',  pulse: true  },
    reconnecting: { dot: 'bg-orange-400', label: 'Reconnecting', pulse: true  },
    error:        { dot: 'bg-red-400',    label: 'Error',        pulse: false },
    disconnected: { dot: 'bg-gray-500',   label: 'Offline',      pulse: false },
  };
  
  const cfg = configs[status] ?? configs.disconnected;
  
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${cfg.dot} ${cfg.pulse ? 'animate-ping-slow' : ''}`} />
      <span className="text-xs text-white/50 font-medium">{cfg.label}</span>
    </div>
  );
}

// ── Btn ───────────────────────────────────────────────────────
interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'flame' | 'ghost' | 'danger' | 'cyan';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export function Btn({ 
  variant = 'ghost', 
  size = 'md', 
  loading, 
  icon, 
  children, 
  className = '', 
  ...props 
}: BtnProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed select-none';
  const sizes = { 
    sm: 'px-3 py-1.5 text-sm', 
    md: 'px-5 py-2.5 text-sm', 
    lg: 'px-7 py-3.5 text-base' 
  };
  
  const variants = {
    flame:  'btn-flame text-white',
    ghost:  'bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-white',
    danger: 'bg-red-500/80 hover:bg-red-500 border border-red-400/30 text-white shadow-lg',
    cyan:   'bg-cyan-accent/10 hover:bg-cyan-accent/20 border border-cyan-accent/30 text-cyan-accent',
  };

  return (
    <button 
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} 
      disabled={loading || props.disabled} 
      {...props}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ── Input ─────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string; 
  error?: string; 
  icon?: React.ReactNode;
}

export function Input({ label, error, icon, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">{label}</label>}
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">{icon}</span>}
        <input 
          className={[
            'w-full rounded-xl bg-white/[0.05] border border-white/[0.08] text-white placeholder-white/25',
            'px-4 py-3 text-sm outline-none transition-all duration-200',
            'focus:border-flame-500/60 focus:bg-flame-500/[0.04] focus:ring-2 focus:ring-flame-500/20',
            icon ? 'pl-10' : '', 
            className
          ].join(' ')} 
          {...props} 
        />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ── Connecting Screen ─────────────────────────────────────────
export function ConnectingScreen({ roomId }: { roomId: string }) {
  return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center gap-8 px-4">
      <div className="relative">
        {[1,2,3].map(i => (
          <div 
            key={i} 
            className="absolute inset-0 rounded-full border-2 border-flame-500 animate-ping-slow"
            style={{ animationDelay: `${(i-1)*0.7}s`, opacity: 1/i }} 
          />
        ))}
        <div className="relative z-10 w-20 h-20 rounded-full bg-dark-700 flex items-center justify-center border border-flame-500/30 overflow-hidden">
          <img src={logoSrc} alt="logo" className="w-full h-full object-cover animate-flame-pulse" />
        </div>
      </div>
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Joining your room</h2>
        <p className="text-white/50 text-sm mb-4">
          Room <span className="text-flame-400 font-mono font-bold">{roomId}</span>
        </p>
        <div className="flex items-center justify-center gap-2 text-white/40 text-sm">
          <Loader2 size={14} className="animate-spin text-flame-500" />
          Setting things up…
        </div>
      </div>
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────
export function Spinner({ size = 24, className = '' }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin text-flame-500 ${className}`} />;
}