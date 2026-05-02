/**
 * AuthModal — Login/Register with name fallback
 * © Ken Baserecha — Boutyflameet
 *
 * Shows name-entry if Firebase not configured (still works!)
 * Shows full email/Google auth if Firebase IS configured
 */
import React, { useState, useRef, useEffect } from 'react';
import { X, Eye, EyeOff, Mail, Lock, User, Loader2, ArrowRight } from 'lucide-react';
import logoSrc from '../assets/logo.jpeg';
import { COPYRIGHT } from '../lib/constants';

interface Props {
  mode?:              'login' | 'register';
  isFirebaseReady:    boolean;
  onNameLogin:        (name: string) => void;
  onSignIn:           (email: string, pass: string) => Promise<boolean>;
  onRegister:         (name: string, email: string, pass: string) => Promise<boolean>;
  onGoogle:           () => Promise<boolean>;
  onReset:            (email: string) => Promise<boolean>;
  onClose?:           () => void;
  error:              string | null;
  clearError:         () => void;
}

export function AuthModal({
  mode: initMode = 'login', isFirebaseReady,
  onNameLogin, onSignIn, onRegister, onGoogle, onReset,
  onClose, error, clearError,
}: Props) {
  const [mode,      setMode]      = useState<'name'|'login'|'register'|'reset'>(
    isFirebaseReady ? initMode : 'name'
  );
  const [name,      setName]      = useState('');
  const [email,     setEmail]     = useState('');
  const [pass,      setPass]      = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [nameError, setNameError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 120); }, [mode]);

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) { setNameError('Please enter your name'); return; }
    if (n.length < 2) { setNameError('Name must be at least 2 characters'); return; }
    onNameLogin(n);
  };

  const go = async () => {
    setLoading(true); clearError();
    try {
      let ok = false;
      if (mode === 'login')    ok = await onSignIn(email, pass);
      if (mode === 'register') ok = await onRegister(name, email, pass);
      if (mode === 'reset')  { ok = await onReset(email); if (ok) setResetSent(true); }
    } finally { setLoading(false); }
  };

  const switchMode = (m: typeof mode) => { setMode(m); clearError(); setResetSent(false); };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-dark-900 px-4 overflow-y-auto py-6">
      {/* BG glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/4 w-80 h-80 rounded-full bg-flame-500/8 blur-3xl"/>
        <div className="absolute bottom-1/3 right-1/4 w-72 h-72 rounded-full bg-cyan-accent/5 blur-3xl"/>
      </div>

      <div className="relative z-10 w-full max-w-md my-auto">
        {onClose && (
          <button onClick={onClose}
            className="absolute -top-2 -right-2 w-9 h-9 rounded-xl glass border border-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all z-10">
            <X size={16}/>
          </button>
        )}

        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <img src={logoSrc} alt="Boutyflameet"
            className="w-20 h-20 rounded-full object-cover shadow-flame animate-flame-pulse mb-3"/>
          <h1 className="text-2xl font-black text-white">Boutyflameet</h1>
          <p className="text-white/40 text-xs mt-0.5">© Ken Baserecha</p>
        </div>

        <div className="glass border border-white/10 rounded-2xl overflow-hidden">
          {/* ── NAME-ONLY MODE (when Firebase not configured) ── */}
          {mode === 'name' && (
            <div className="p-7">
              <h2 className="text-lg font-bold text-white mb-1">What's your name?</h2>
              <p className="text-white/40 text-sm mb-5">Others will see this during the meeting</p>
              <form onSubmit={handleNameSubmit} className="flex flex-col gap-4">
                <div className="relative">
                  <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30"/>
                  <input ref={inputRef} value={name} onChange={e => { setName(e.target.value); setNameError(''); }}
                    placeholder="Enter your full name…" maxLength={40} autoComplete="name"
                    className="w-full bg-white/[0.05] border border-white/10 rounded-xl pl-10 pr-4 py-3.5 text-base text-white placeholder-white/25 outline-none focus:border-flame-500/60 focus:ring-2 focus:ring-flame-500/20 transition-all"/>
                </div>
                {nameError && <p className="text-red-400 text-xs">{nameError}</p>}
                <button type="submit"
                  className="w-full py-3.5 rounded-xl font-bold text-base btn-flame text-white flex items-center justify-center gap-2">
                  Continue <ArrowRight size={18}/>
                </button>
              </form>
              {isFirebaseReady && (
                <div className="mt-4 pt-4 border-t border-white/[0.06] text-center">
                  <p className="text-white/40 text-xs mb-2">Have an account?</p>
                  <button onClick={() => switchMode('login')}
                    className="text-flame-400 text-sm font-bold hover:text-flame-300 transition-colors">
                    Sign in with email →
                  </button>
                </div>
              )}
              <p className="text-center text-white/20 text-[10px] mt-5">
                Your name stays on your device only
              </p>
            </div>
          )}

          {/* ── FIREBASE AUTH MODES ── */}
          {(mode === 'login' || mode === 'register' || mode === 'reset') && (
            <div className="p-7">
              <h2 className="text-lg font-bold text-white mb-5 text-center">
                {mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Reset password'}
              </h2>

              {resetSent ? (
                <div className="text-center py-6">
                  <div className="text-4xl mb-4">📧</div>
                  <p className="text-white font-semibold mb-2">Check your email</p>
                  <p className="text-white/50 text-sm">Reset link sent to <span className="text-flame-400">{email}</span></p>
                  <button onClick={() => switchMode('login')} className="mt-5 text-flame-400 text-sm font-bold">← Back to sign in</button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {mode === 'register' && (
                    <div className="relative">
                      <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30"/>
                      <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name"
                        autoComplete="name"
                        className="w-full bg-white/[0.05] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-white/25 outline-none focus:border-flame-500/60 focus:ring-2 focus:ring-flame-500/20 transition-all"/>
                    </div>
                  )}
                  <div className="relative">
                    <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30"/>
                    <input ref={mode !== 'register' ? inputRef : undefined}
                      value={email} onChange={e => setEmail(e.target.value)} type="email"
                      placeholder="Email" autoComplete="email"
                      className="w-full bg-white/[0.05] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-white/25 outline-none focus:border-flame-500/60 focus:ring-2 focus:ring-flame-500/20 transition-all"/>
                  </div>
                  {mode !== 'reset' && (
                    <div className="relative">
                      <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30"/>
                      <input value={pass} onChange={e => setPass(e.target.value)}
                        type={showPass ? 'text' : 'password'} placeholder="Password"
                        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                        onKeyDown={e => e.key === 'Enter' && go()}
                        className="w-full bg-white/[0.05] border border-white/10 rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-white/25 outline-none focus:border-flame-500/60 focus:ring-2 focus:ring-flame-500/20 transition-all"/>
                      <button onClick={() => setShowPass(s => !s)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                        {showPass ? <EyeOff size={14}/> : <Eye size={14}/>}
                      </button>
                    </div>
                  )}
                  {error && (
                    <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>
                  )}
                  {mode === 'login' && (
                    <button onClick={() => switchMode('reset')}
                      className="text-right text-xs text-white/40 hover:text-flame-400 transition-colors">
                      Forgot password?
                    </button>
                  )}
                  <button onClick={go} disabled={loading}
                    className="w-full py-3 rounded-xl font-bold text-sm btn-flame text-white flex items-center justify-center gap-2 disabled:opacity-60 mt-1">
                    {loading && <Loader2 size={15} className="animate-spin"/>}
                    {mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : 'Send Reset Email'}
                  </button>

                  {mode !== 'reset' && (
                    <>
                      <div className="flex items-center gap-3 my-1">
                        <div className="flex-1 h-px bg-white/10"/>
                        <span className="text-white/25 text-xs">or</span>
                        <div className="flex-1 h-px bg-white/10"/>
                      </div>
                      <button onClick={onGoogle} disabled={loading}
                        className="w-full py-3 rounded-xl font-semibold text-sm bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-white flex items-center justify-center gap-2.5 transition-all">
                        <svg width="18" height="18" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Continue with Google
                      </button>
                    </>
                  )}

                  <div className="text-center text-xs text-white/40 mt-1">
                    {mode === 'login'
                      ? <><button onClick={() => switchMode('name')} className="text-white/40 hover:text-white mr-3">← Use name only</button><button onClick={() => switchMode('register')} className="text-flame-400 font-bold hover:text-flame-300">Create account</button></>
                      : mode === 'register'
                      ? <button onClick={() => switchMode('login')} className="text-flame-400 font-bold hover:text-flame-300">Sign in instead</button>
                      : <button onClick={() => switchMode('login')} className="text-flame-400 font-bold hover:text-flame-300">← Back to sign in</button>
                    }
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <p className="text-center text-white/15 text-[10px] mt-4">{COPYRIGHT}</p>
      </div>
    </div>
  );
}
