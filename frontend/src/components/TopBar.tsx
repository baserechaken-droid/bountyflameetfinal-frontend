import { useState, useRef } from 'react';
import { Link2, Shield } from 'lucide-react';
import { Logo, ConnectionBadge } from './ui';
import { ConnectionStatus } from '../types';

interface TopBarProps {
  roomId: string;
  title: string;
  onTitleChange: (t: string) => void;
  connectionStatus: ConnectionStatus;
  participantCount: number;
  timer: string;
  onInviteClick: () => void;
}

export function TopBar({
  roomId, title, onTitleChange, connectionStatus,
  participantCount, timer, onInviteClick,
}: TopBarProps) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleTitleClick = () => {
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 50);
  };

  return (
    <div className="glass-dark border-b border-white/[0.06] px-4 py-2.5 flex items-center justify-between gap-4 shrink-0 z-40 h-14">

      {/* Left: Logo + editable title */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Logo showText={false} />
        {editing ? (
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.blur(); }}
            maxLength={60}
            autoFocus
            className="bg-white/[0.06] border border-flame-500/40 rounded-lg px-2 py-1 text-sm font-semibold text-white outline-none max-w-[180px]"
          />
        ) : (
          <button
            onClick={handleTitleClick}
            title="Click to rename"
            className="text-sm font-semibold text-white/90 hover:text-white truncate max-w-[150px] transition-colors text-left"
          >
            {title || 'My Meeting'}
          </button>
        )}
        <span className="hidden md:flex items-center gap-1.5 text-[10px] font-mono text-white/30 bg-white/[0.04] px-2 py-0.5 rounded-md shrink-0">
          <Shield size={9} className="text-flame-500" />
          {roomId}
        </span>
      </div>

      {/* Center: timer + count */}
      <div className="hidden md:flex items-center gap-4 text-sm text-white/50 shrink-0">
        <span className="font-mono font-medium">{timer}</span>
        <span className="text-white/20">·</span>
        <span>{participantCount} participant{participantCount !== 1 ? 's' : ''}</span>
      </div>

      {/* Right: status + invite button */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="hidden sm:block">
          <ConnectionBadge status={connectionStatus} />
        </div>

        {/* Invite button — opens modal showing the actual URL */}
        <button
          onClick={onInviteClick}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 border bg-flame-500/10 hover:bg-flame-500/20 border-flame-500/30 text-flame-400 hover:text-flame-300"
          title="Share invite link"
        >
          <Link2 size={13} />
          <span className="hidden sm:inline">Invite</span>
        </button>
      </div>
    </div>
  );
}
