import React, { useRef, useEffect, useState, FormEvent } from 'react';
import { X, Send, FileDown, Sparkles, Loader2 } from 'lucide-react';
import { ChatMessage } from '../types';
import { formatTime } from '../lib/utils';
import { downloadTranscript, generateAiSummary } from '../lib/transcript';

interface ChatPanelProps {
  messages:      ChatMessage[];
  onSend:        (text: string) => void;
  onClose:       () => void;
  mySocketId:    string | null;
  insertText?:   string;      // AI inserts text here
  onInsertClear?: () => void;
  // Transcript export context
  roomId?:       string;
  roomTitle?:    string | null;
  hostName?:     string | null;
  startedAt?:    number | null;
  isPro?:        boolean;
  onToast?:      (msg: string, kind?: 'success' | 'error' | 'info') => void;
}

export function ChatPanel({
  messages, onSend, onClose, mySocketId, insertText, onInsertClear,
  roomId, roomTitle, hostName, startedAt, isPro, onToast,
}: ChatPanelProps) {
  const [aiBusy, setAiBusy] = useState(false);
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
        <div className="flex items-center gap-1.5">
          <button
            onClick={async () => {
              if (!roomId || aiBusy) return;
              if (!isPro) {
                onToast?.('AI summary is a Pro feature — upgrade to unlock', 'info');
                return;
              }
              if (messages.length === 0) {
                onToast?.('No messages to summarize yet', 'info');
                return;
              }
              setAiBusy(true);
              try {
                onToast?.('🪄 Generating AI summary…', 'info');
                const summary = await generateAiSummary(messages, { roomId, title: roomTitle ?? null });
                downloadTranscript(messages, {
                  roomId,
                  title:     roomTitle ?? null,
                  hostName:  hostName  ?? null,
                  startedAt: startedAt ?? null,
                  summary,
                });
                onToast?.('✨ Transcript with AI summary downloaded', 'success');
              } catch (e: any) {
                onToast?.(`AI summary failed: ${e?.message || 'unknown error'}`, 'error');
              } finally {
                setAiBusy(false);
              }
            }}
            disabled={!roomId || aiBusy}
            title={
              !isPro
                ? 'AI summary — Pro feature'
                : messages.length === 0
                  ? 'No messages to summarize yet'
                  : 'Download transcript with AI summary'
            }
            className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-white/60 hover:text-flame-400 transition-all disabled:opacity-50 disabled:cursor-wait"
          >
            {aiBusy ? <Loader2 size={13} className="animate-spin"/> : <Sparkles size={13}/>}
          </button>
          <button
            onClick={() => {
              if (!roomId) return;
              downloadTranscript(messages, {
                roomId,
                title:     roomTitle ?? null,
                hostName:  hostName  ?? null,
                startedAt: startedAt ?? null,
              });
            }}
            disabled={!roomId || messages.length === 0}
            title={messages.length === 0 ? 'No messages to export yet' : 'Download transcript (.txt)'}
            className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-white/60 hover:text-cyan-accent transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-white/60"
          >
            <FileDown size={13}/>
          </button>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-white/60 hover:text-white transition-all"><X size={14}/></button>
        </div>
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
