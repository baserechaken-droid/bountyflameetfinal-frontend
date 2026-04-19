import React, { useRef, useEffect, useState, FormEvent } from 'react';
import { X, Send } from 'lucide-react';
import { ChatMessage } from '../types';
import { formatTime } from '../lib/utils';

interface ChatPanelProps {
  messages:      ChatMessage[];
  onSend:        (text: string) => void;
  onClose:       () => void;
  mySocketId:    string | null;
  insertText?:   string;      // AI inserts text here
  onInsertClear?: () => void;
}

export function ChatPanel({ messages, onSend, onClose, mySocketId, insertText, onInsertClear }: ChatPanelProps) {
  const [text,    setText]    = useState('');
  const bottomRef             = useRef<HTMLDivElement>(null);
  const inputRef              = useRef<HTMLInputElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  // AI inserts text into input
  useEffect(() => {
    if (insertText) { setText(insertText); inputRef.current?.focus(); onInsertClear?.(); }
  }, [insertText, onInsertClear]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  };

  return (
    <div className="flex flex-col h-full glass-dark border-l border-white/[0.06] w-full md:w-[300px] animate-slide-right">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
        <h2 className="text-sm font-bold text-white">Chat</h2>
        <button onClick={onClose} className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-white/60 hover:text-white transition-all"><X size={14}/></button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2 hide-scrollbar">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <span className="text-3xl">💬</span>
            <p className="text-white/40 text-sm font-medium">No messages yet</p>
          </div>
        )}
        {messages.map(msg => {
          const isOwn = msg.socketId === mySocketId || msg.isOwn;
          return (
            <div key={msg.id} className={`flex flex-col gap-1 animate-slide-up ${isOwn ? 'items-end' : 'items-start'}`}>
              <div className="flex items-center gap-2 px-1">
                {!isOwn && <span className="text-xs font-bold text-flame-400/90">{msg.userName}</span>}
                <span className="text-[10px] text-white/30">{formatTime(msg.timestamp)}</span>
              </div>
              <div className={['px-3 py-2 rounded-2xl text-sm max-w-[85%] break-words',
                isOwn ? 'bg-flame-500/20 border border-flame-500/25 text-white rounded-tr-sm'
                      : 'bg-white/[0.07] border border-white/[0.07] text-white/90 rounded-tl-sm'].join(' ')}>
                {msg.message}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef}/>
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 px-3 py-3 border-t border-white/[0.06] shrink-0">
        <input ref={inputRef} value={text} onChange={e => setText(e.target.value)}
          placeholder="Message…" maxLength={500}
          className="flex-1 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white placeholder-white/25 px-3 py-2 text-sm outline-none focus:border-flame-500/50 focus:ring-1 focus:ring-flame-500/20 transition-all"/>
        <button type="submit" disabled={!text.trim()}
          className="w-9 h-9 shrink-0 rounded-xl btn-flame text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed">
          <Send size={15}/>
        </button>
      </form>
    </div>
  );
}
