/**
 * AIPanelModal — AI Features via backend proxy
 * © Ken Baserecha — Boutyflameet
 *
 * Routes all Claude calls through backend /api/ai (never exposes key in browser)
 * Voice typing uses browser's built-in Web Speech API (free, no key needed)
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Mic, MicOff, Sparkles, Brain, Loader2, Copy, Check } from 'lucide-react';
import { COPYRIGHT } from '../lib/constants';
import { copyToClipboard } from '../lib/utils';

const AI_URL = (import.meta.env.VITE_AI_BACKEND_URL || import.meta.env.VITE_SIGNALING_URL || '') + '/api/ai';

interface Props {
  onClose:      () => void;
  onInsertText: (text: string) => void;
  chatHistory:  string[];
  userName:     string;
  isPro:        boolean;
}

export function AIPanelModal({ onClose, onInsertText, chatHistory, userName, isPro }: Props) {
  const [tab,         setTab]         = useState<'voice'|'summary'|'assist'>('voice');
  const [isListening, setIsListening] = useState(false);
  const [transcript,  setTranscript]  = useState('');
  const [summary,     setSummary]     = useState('');
  const [aiLoading,   setAiLoading]   = useState(false);
  const [copied,      setCopied]      = useState(false);
  const [prompt,      setPrompt]      = useState('');
  const [aiReply,     setAiReply]     = useState('');
  const [aiError,     setAiError]     = useState('');
  const recognitionRef = useRef<any>(null);

  // ── Voice Typing ─────────────────────────────────────────────
  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setAiError('Voice typing needs Chrome or Edge browser. Other browsers don\'t support it yet.');
      return;
    }
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-US';
    r.onresult = (e: any) => {
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
      }
      if (final) setTranscript(prev => prev + (prev ? ' ' : '') + final);
    };
    r.onerror = (e: any) => {
      setAiError(`Voice error: ${e.error}. Try clicking Allow when browser asks for microphone.`);
      setIsListening(false);
    };
    r.onend = () => setIsListening(false);
    recognitionRef.current = r;
    r.start();
    setIsListening(true);
    setAiError('');
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  // ── AI Call via backend ───────────────────────────────────────
  const callAI = async (system: string, userMsg: string): Promise<string> => {
    setAiError('');
    try {
      const res = await fetch(AI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system, prompt: userMsg, maxTokens: 800 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 503) throw new Error('AI not set up yet on server. Add CLAUDE_API_KEY to Render env vars.');
        throw new Error(err.error || `Server error ${res.status}`);
      }
      const data = await res.json();
      return data.text || 'No response';
    } catch (e: any) {
      const msg = e.message || 'AI request failed';
      setAiError(msg);
      return '';
    }
  };

  const generateSummary = async () => {
    if (!chatHistory.length) { setSummary('No chat messages to summarize yet.'); return; }
    setAiLoading(true);
    try {
      const text = await callAI(
        'You are a meeting assistant. Summarize concisely with: key topics, decisions, action items. Under 200 words.',
        `Meeting chat:\n${chatHistory.slice(-50).join('\n')}`
      );
      if (text) setSummary(text);
    } finally { setAiLoading(false); }
  };

  const askAI = async () => {
    if (!prompt.trim()) return;
    setAiLoading(true);
    try {
      const text = await callAI(
        `You are a helpful meeting assistant for ${userName}. Be concise and professional.`,
        prompt
      );
      if (text) setAiReply(text);
    } finally { setAiLoading(false); }
  };

  const handleCopy = async (text: string) => {
    await copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tabs = [
    { id: 'voice',   icon: <Mic size={13}/>,    label: 'Voice Typing', free: true },
    { id: 'summary', icon: <Brain size={13}/>,  label: 'Summary',      free: false },
    { id: 'assist',  icon: <Sparkles size={13}/>, label: 'AI Assist',  free: false },
  ] as const;

  return (
    <div className="fixed inset-0 z-[350] flex items-center justify-center bg-black/75 backdrop-blur-sm px-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="glass border border-white/10 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col animate-slide-up">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Sparkles size={16} className="text-flame-400"/> AI Features
          </h2>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1 transition-colors"><X size={16}/></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/[0.06]">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold border-b-2 transition-all ${
                tab === t.id ? 'border-flame-500 text-white' : 'border-transparent text-white/40 hover:text-white/70'
              }`}>
              {t.icon}{t.label}
              {!t.free && !isPro && <span className="text-[8px] bg-flame-500/20 text-flame-400 px-1.5 py-0.5 rounded font-black">PRO</span>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 hide-scrollbar">

          {/* Pro gate for non-voice tabs */}
          {(tab === 'summary' || tab === 'assist') && !isPro && (
            <div className="bg-flame-500/10 border border-flame-500/25 rounded-xl p-4 mb-4 text-center">
              <div className="text-2xl mb-2">👑</div>
              <p className="text-sm font-bold text-white mb-1">Pro Feature</p>
              <p className="text-xs text-white/50">Upgrade to Blaze Pro to access AI Summary and AI Assist.</p>
            </div>
          )}

          {/* Voice Typing — always available */}
          {tab === 'voice' && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-white/50 leading-relaxed">
                Speak naturally — words appear in the box. Works in Chrome and Edge.
              </p>
              <div className="flex justify-center">
                <button onClick={isListening ? stopListening : startListening}
                  className={`w-20 h-20 rounded-full flex flex-col items-center justify-center gap-1.5 border-2 transition-all ${
                    isListening ? 'bg-red-500/20 border-red-500 animate-pulse' : 'bg-flame-500/15 border-flame-500/50 hover:bg-flame-500/25'
                  }`}>
                  {isListening ? <MicOff size={28} className="text-red-400"/> : <Mic size={28} className="text-flame-400"/>}
                  <span className="text-[10px] font-bold text-white/60">{isListening ? 'Stop' : 'Speak'}</span>
                </button>
              </div>
              {isListening && (
                <div className="flex items-center justify-center gap-2 text-xs text-red-400 font-medium animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-red-400"/>Listening…
                </div>
              )}
              {aiError && <p className="text-orange-400 text-xs bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">{aiError}</p>}
              {transcript ? (
                <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4">
                  <p className="text-sm text-white leading-relaxed">{transcript}</p>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => { onInsertText(transcript); onClose(); }}
                      className="flex-1 py-2 rounded-lg text-xs font-bold btn-flame text-white">
                      Use in Chat →
                    </button>
                    <button onClick={() => setTranscript('')}
                      className="py-2 px-3 rounded-lg text-xs font-bold bg-white/[0.06] border border-white/10 text-white/60">
                      Clear
                    </button>
                  </div>
                </div>
              ) : !isListening && (
                <p className="text-center text-white/25 text-xs py-4">Press Speak to start voice typing</p>
              )}
            </div>
          )}

          {/* Meeting Summary */}
          {tab === 'summary' && isPro && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-white/50">Generate an AI summary of this meeting's chat — key topics, decisions, action items.</p>
              <button onClick={generateSummary} disabled={aiLoading}
                className="w-full py-3 rounded-xl font-bold text-sm btn-flame text-white flex items-center justify-center gap-2 disabled:opacity-60">
                {aiLoading ? <Loader2 size={16} className="animate-spin"/> : <Brain size={16}/>}
                {aiLoading ? 'Generating…' : 'Generate Summary'}
              </button>
              {aiError && <p className="text-orange-400 text-xs bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">{aiError}</p>}
              {summary && (
                <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-flame-400">Meeting Summary</span>
                    <button onClick={() => handleCopy(summary)} className="flex items-center gap-1 text-xs text-white/40 hover:text-white">
                      {copied ? <Check size={12} className="text-green-400"/> : <Copy size={12}/>} {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{summary}</p>
                </div>
              )}
            </div>
          )}

          {/* Smart Assist */}
          {tab === 'assist' && isPro && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-white/50">Ask anything — draft emails, translate, explain, summarize points…</p>
              <div className="flex flex-col gap-2">
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3}
                  placeholder="e.g. 'Draft a follow-up email' or 'Translate to Swahili: …'"
                  className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 outline-none focus:border-flame-500/60 resize-none transition-all"/>
                <button onClick={askAI} disabled={aiLoading || !prompt.trim()}
                  className="w-full py-2.5 rounded-xl font-bold text-sm btn-flame text-white flex items-center justify-center gap-2 disabled:opacity-50">
                  {aiLoading ? <Loader2 size={15} className="animate-spin"/> : <Sparkles size={15}/>}
                  {aiLoading ? 'Thinking…' : 'Ask AI'}
                </button>
              </div>
              {aiError && <p className="text-orange-400 text-xs bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">{aiError}</p>}
              {aiReply && (
                <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-cyan-accent">AI Response</span>
                    <button onClick={() => handleCopy(aiReply)} className="text-xs text-white/40 hover:text-white flex items-center gap-1">
                      {copied ? <Check size={11} className="text-green-400"/> : <Copy size={11}/>} {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{aiReply}</p>
                  <button onClick={() => { onInsertText(aiReply); onClose(); }}
                    className="mt-3 w-full py-2 rounded-lg text-xs font-bold btn-flame text-white">
                    Insert into Chat →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-white/[0.06]">
          <p className="text-center text-white/15 text-[10px]">{COPYRIGHT} · Voice by Web Speech API · AI by Claude</p>
        </div>
      </div>
    </div>
  );
}
