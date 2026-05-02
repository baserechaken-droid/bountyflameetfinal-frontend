/**
 * LobbyPage — With fixed auth (name + Firebase) and working upgrade flow
 * © Ken Baserecha — Boutyflameet
 */
import React, { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ArrowRight, Plus, LogIn, Trash2, Crown, Star, LogOut, User, Sparkles, Video, Download, RefreshCw } from 'lucide-react';
import { Logo, Btn, Input } from '../components/ui';
import { AuthModal }    from '../components/AuthModal';
import { PaymentModal } from '../components/PaymentModal';
import { RatingModal }  from '../components/RatingModal';
import { useAppAuth }   from '../App';
import { useRoom }      from '../hooks/useRoom';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useRecordings, type CloudRecording } from '../hooks/useRecordings';
import { RecentMeeting }   from '../types';
import { timeAgo, generateRoomId } from '../lib/utils';
import { LS_KEYS, COPYRIGHT }       from '../lib/constants';

function formatBytes(n: number): string {
  if (!n) return '0 KB';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function LobbyPage() {
  const navigate = useNavigate();
  const {
    user: appUser, logout, isFirebaseConfigured, loginWithName, upgradePlan,
    signInEmail, registerEmail, signInGoogle, resetPassword,
    error: authError, clearError,
  } = useAppAuth();
  const { createRoom } = useRoom();

  const [joinCode,    setJoinCode]    = useState('');
  const [joinError,   setJoinError]   = useState('');
  const [creating,    setCreating]    = useState(false);
  const [showAuth,    setShowAuth]    = useState(!appUser); // auto-show if not logged in
  const [showPayment, setShowPayment] = useState(false);
  const recordings    = useRecordings(appUser?.uid);
  const [showRating,  setShowRating]  = useState(false);
  const [recent,      setRecent]      = useLocalStorage<RecentMeeting[]>(LS_KEYS.RECENT_MEETINGS, []);

  const displayName = appUser?.displayName || '';
  const userEmail   = appUser?.email       || '';
  const userPlan    = appUser?.plan        || 'free';
  const isPro       = userPlan !== 'free';

  // ── Auto-close auth when user logs in ─────────────────────
  React.useEffect(() => {
    if (appUser) setShowAuth(false);
  }, [appUser]);

  const handleNewMeeting = async () => {
    if (!appUser) { setShowAuth(true); return; }
    setCreating(true);
    try {
      const roomId = await createRoom(displayName || 'Host');
      navigate(`/join/${roomId}`);
    } finally { setCreating(false); }
  };

  const handleJoin = (e: FormEvent) => {
    e.preventDefault();
    const raw = joinCode.trim();
    if (!raw) { setJoinError('Enter a room code or invite link'); return; }
    const urlMatch = raw.match(/\/join\/([A-Z0-9-]+)/i);
    const roomId   = (urlMatch ? urlMatch[1] : raw).toUpperCase().replace(/\s/g, '');
    if (!/^[A-Z0-9-]{4,20}$/.test(roomId)) {
      setJoinError('Invalid code — try BOUTY-ABC123');
      return;
    }
    navigate(`/join/${roomId}`);
  };

  const handlePaymentSuccess = (plan: 'pro' | 'enterprise') => {
    upgradePlan(plan);
    setShowPayment(false);
  };

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      {/* NAV */}
      <nav className="glass-dark border-b border-white/[0.06] px-4 md:px-6 h-16 flex items-center justify-between shrink-0">
        <button onClick={() => navigate('/')} className="hover:opacity-80 transition-opacity"><Logo/></button>
        <div className="flex items-center gap-2">
          {appUser ? (
            <>
              {/* User chip */}
              <div className="flex items-center gap-2 bg-white/[0.06] border border-white/10 rounded-xl px-3 py-1.5">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-flame-500 to-flame-700 flex items-center justify-center text-white text-[10px] font-black shrink-0">
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-white/90 max-w-[100px] truncate hidden sm:block">{displayName}</span>
                {isPro && <Crown size={11} className="text-flame-400 shrink-0"/>}
              </div>
              <button onClick={() => setShowRating(true)}
                className="flex items-center gap-1.5 bg-white/[0.05] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white/50 hover:text-white transition-all">
                <Star size={11}/><span className="hidden sm:inline">Rate</span>
              </button>
              {!isPro && (
                <button onClick={() => setShowPayment(true)}
                  className="flex items-center gap-1.5 bg-flame-500/10 border border-flame-500/25 rounded-xl px-3 py-1.5 text-xs font-bold text-flame-400 hover:bg-flame-500/20 transition-all">
                  <Sparkles size={12}/><span className="hidden sm:inline">Upgrade</span>
                </button>
              )}
              <button onClick={logout} title="Sign out"
                className="w-8 h-8 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all">
                <LogOut size={13}/>
              </button>
            </>
          ) : (
            <button onClick={() => setShowAuth(true)}
              className="btn-flame text-white text-xs font-bold px-4 py-2 rounded-xl">
              Sign In / Join
            </button>
          )}
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-4xl">
          <h1 className="text-2xl md:text-4xl font-black text-white mb-1 animate-slide-up">
            {displayName ? `Welcome back, ${displayName.split(' ')[0]} 👋` : 'Welcome to Boutyflameet 🔥'}
          </h1>
          <p className="text-white/50 mb-8 text-sm md:text-base">
            {appUser
              ? 'Start or join a meeting — your link works anywhere in the world.'
              : 'Sign in or enter your name to get started.'}
          </p>

          <div className="grid md:grid-cols-2 gap-4 mb-8">
            {/* New Meeting */}
            <div className="glass border border-white/[0.08] rounded-2xl p-6 md:p-7 hover:border-flame-500/20 transition-all">
              <div className="text-4xl mb-4 animate-float inline-block">🔥</div>
              <h2 className="text-lg md:text-xl font-bold text-white mb-2">New Meeting</h2>
              <p className="text-white/50 text-sm mb-5 leading-relaxed">
                A unique <span className="font-mono text-flame-400 text-xs">BOUTY-XXXXXX</span> code is created every time. Link expires when everyone leaves.
              </p>
              <Btn variant="flame" size="lg" className="w-full" loading={creating}
                icon={creating ? undefined : <Plus size={18}/>} onClick={handleNewMeeting}>
                {creating ? 'Creating…' : 'Create Meeting'}
              </Btn>
            </div>

            {/* Join Meeting */}
            <div className="glass border border-white/[0.08] rounded-2xl p-6 md:p-7 hover:border-cyan-accent/15 transition-all">
              <div className="text-4xl mb-4 inline-block">🔗</div>
              <h2 className="text-lg md:text-xl font-bold text-white mb-2">Join Meeting</h2>
              <p className="text-white/50 text-sm mb-5 leading-relaxed">
                Enter a room code like <span className="font-mono text-flame-400 text-xs">BOUTY-ABC123</span> or paste a full invite link.
              </p>
              <form onSubmit={handleJoin} className="flex flex-col gap-3">
                <Input value={joinCode} onChange={e => { setJoinCode(e.target.value); setJoinError(''); }}
                  placeholder="BOUTY-ABC123 or paste link…" error={joinError} className="font-mono"/>
                <Btn variant="cyan" size="md" className="w-full" icon={<LogIn size={16}/>}>Join Meeting</Btn>
              </form>
            </div>
          </div>

          {/* Pro teaser */}
          {!isPro && appUser && (
            <div className="glass border border-flame-500/15 rounded-2xl p-5 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-flame-500/15 flex items-center justify-center shrink-0">
                <Crown size={20} className="text-flame-400"/>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-white mb-0.5">Upgrade to Blaze Pro</h3>
                <p className="text-xs text-white/50">50 participants · Unlimited time · AI features · Voice typing · Recording · Breakout rooms</p>
              </div>
              <button onClick={() => setShowPayment(true)}
                className="btn-flame text-white text-xs font-bold px-4 py-2 rounded-xl shrink-0 whitespace-nowrap">
                KES 1,500/mo →
              </button>
            </div>
          )}

          {/* Recent meetings */}
          {recent.length > 0 && (
            <div className="animate-fade-in">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-white/50 text-sm font-semibold">
                  <Clock size={14}/> Recent Meetings
                </div>
                <button onClick={() => setRecent([])}
                  className="flex items-center gap-1.5 text-white/25 hover:text-red-400 text-xs transition-colors">
                  <Trash2 size={11}/> Clear
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {recent.slice(0, 6).map(r => (
                  <button key={r.roomId} onClick={() => navigate(`/join/${r.roomId}`)}
                    className="glass border border-white/[0.06] hover:border-flame-500/20 rounded-xl px-4 py-3 flex items-center justify-between group transition-all text-left">
                    <div>
                      <p className="text-sm font-semibold text-white/90 group-hover:text-white">{r.title || r.roomId}</p>
                      <p className="text-xs text-white/35 font-mono">{r.roomId} · {timeAgo(r.joinedAt)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-flame-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-xs font-bold">Rejoin</span><ArrowRight size={14}/>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* My Recordings — cloud library, only when signed in */}
          {appUser && recordings.isAvailable && (
            <div className="animate-fade-in mt-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-white/50 text-sm font-semibold">
                  <Video size={14}/> My Recordings
                  {recordings.items.length > 0 && (
                    <span className="text-white/30 text-xs font-normal">
                      ({recordings.items.length})
                    </span>
                  )}
                </div>
                <button
                  onClick={() => recordings.reload()}
                  className="flex items-center gap-1.5 text-white/25 hover:text-white/60 text-xs transition-colors"
                  disabled={recordings.loading}
                >
                  <RefreshCw size={11} className={recordings.loading ? 'animate-spin' : ''}/>
                  Refresh
                </button>
              </div>

              {recordings.loading && recordings.items.length === 0 ? (
                <div className="glass border border-white/[0.04] rounded-xl px-4 py-6 text-center text-xs text-white/35">
                  Loading recordings…
                </div>
              ) : recordings.items.length === 0 ? (
                <div className="glass border border-white/[0.04] rounded-xl px-4 py-6 text-center text-xs text-white/35">
                  No recordings yet — start a meeting and tap the record button to save one to your library.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {recordings.items.map((r: CloudRecording) => (
                    <div key={r.id}
                      className="glass border border-white/[0.06] hover:border-cyan-accent/20 rounded-xl px-4 py-3 flex items-center justify-between gap-3 transition-all">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white/90 truncate">
                          {r.title || r.filename}
                        </p>
                        <p className="text-xs text-white/35 font-mono truncate">
                          {r.roomId ? `${r.roomId} · ` : ''}
                          {formatBytes(r.bytes)}
                          {r.createdAt ? ` · ${timeAgo(r.createdAt)}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <a
                          href={r.servingUrl}
                          download={r.filename}
                          className="p-2 rounded-lg text-white/40 hover:text-cyan-accent hover:bg-white/[0.04] transition-colors"
                          title="Download"
                        >
                          <Download size={14}/>
                        </a>
                        <button
                          onClick={async () => {
                            if (!confirm(`Delete "${r.filename}"? This can't be undone.`)) return;
                            await recordings.remove(r);
                          }}
                          className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-white/[0.04] transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14}/>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] px-4 py-4 flex items-center justify-between flex-wrap gap-3">
        <p className="text-white/20 text-xs">{COPYRIGHT} · Boutyflameet</p>
        <button onClick={() => setShowRating(true)}
          className="flex items-center gap-1.5 text-white/25 hover:text-white/50 text-xs transition-colors">
          <Star size={11}/> Rate this app
        </button>
      </footer>

      {/* Modals */}
      {showAuth && (
        <AuthModal
          isFirebaseReady={isFirebaseConfigured}
          onNameLogin={name => { loginWithName(name); setShowAuth(false); }}
          onSignIn={signInEmail}
          onRegister={registerEmail}
          onGoogle={signInGoogle}
          onReset={resetPassword}
          error={authError}
          clearError={clearError}
          onClose={appUser ? () => setShowAuth(false) : undefined}
        />
      )}
      {showPayment && appUser && (
        <PaymentModal
          plan="pro"
          userName={displayName}
          userEmail={userEmail}
          userUid={appUser.uid}
          onClose={() => setShowPayment(false)}
          onSuccess={handlePaymentSuccess}
        />
      )}
      {showRating && (
        <RatingModal
          userName={displayName || 'User'}
          userEmail={userEmail}
          onClose={() => setShowRating(false)}
        />
      )}
    </div>
  );
}
