import React from 'react';
import { useNavigate } from 'react-router-dom';
import { generateRoomId } from '../lib/utils';
import { Logo, Btn } from '../components/ui';
import logoSrc from '../assets/logo.jpeg';
import { Zap, Link2, Shield, Users, MonitorUp, MessageSquare } from 'lucide-react';

const features = [
  { icon: <Zap size={22} className="text-flame-500" />,      title: 'Instant HD Video',     desc: 'Crystal-clear 720p/1080p video with adaptive bitrate. Real WebRTC peer-to-peer.' },
  { icon: <Link2 size={22} className="text-cyan-accent" />,   title: 'Magic Invite Links',   desc: 'Share a link — anyone clicks it and joins instantly. Works on every device.' },
  { icon: <MessageSquare size={22} className="text-flame-500" />, title: 'Real-time Chat', desc: 'Persistent chat per room with floating emoji reactions for everyone.' },
  { icon: <MonitorUp size={22} className="text-cyan-accent" />, title: 'Screen Sharing',   desc: 'Share your screen, a window, or a tab. One click, instantly visible to all.' },
  { icon: <Users size={22} className="text-flame-500" />,     title: 'Multi-Device',        desc: 'Works on Android, iPhone, laptops and desktops — any modern browser.' },
  { icon: <Shield size={22} className="text-cyan-accent" />,  title: 'Encrypted P2P',       desc: 'Media flows directly peer-to-peer, never through our servers. Always private.' },
];

export function LandingPage() {
  const navigate = useNavigate();
  const handleNew = () => { const id = generateRoomId(); navigate(`/join/${id}`); };

  return (
    <div className="min-h-screen bg-dark-900 text-white overflow-x-hidden">
      {/* NAV */}
      <nav className="sticky top-0 z-50 glass-dark border-b border-white/[0.06] px-4 md:px-10 h-16 flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-2 md:gap-3">
          <Btn variant="ghost" size="sm" onClick={() => navigate('/lobby')} className="hidden sm:flex">Join a meeting</Btn>
          <Btn variant="flame" size="sm" onClick={handleNew}>Start Free</Btn>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative min-h-[90vh] flex items-center justify-center px-4 overflow-hidden"
        style={{ background: 'radial-gradient(ellipse at 15% 50%,rgba(255,69,0,.14) 0%,transparent 55%),radial-gradient(ellipse at 85% 40%,rgba(0,240,255,.08) 0%,transparent 55%),#07071A' }}>
        {/* animated bg dots */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(24)].map((_, i) => (
            <div key={i} className="absolute w-0.5 h-0.5 rounded-full"
              style={{ left:`${(i*17+11)%100}%`, top:`${(i*23+7)%100}%`,
                background: i%3===0?'#FF4500':i%3===1?'#00F0FF':'#fff',
                opacity: 0.15 + (i%5)*0.06 }} />
          ))}
        </div>

        <div className="relative z-10 text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-flame-500/10 border border-flame-500/25 rounded-full px-4 py-1.5 mb-8 text-sm font-medium text-flame-400">
            <span className="w-2 h-2 rounded-full bg-flame-500 animate-ping-slow" />
            Open Beta · Free for everyone
          </div>

          {/* Big logo */}
          <div className="mb-8 animate-float flex justify-center">
            <img src={logoSrc} alt="Boutyflameet" className="w-24 h-24 md:w-32 md:h-32 rounded-full object-cover shadow-flame animate-flame-pulse" />
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black leading-tight tracking-tight mb-6">
            <span className="gradient-text">Flame your</span><br />
            <span className="text-white">connections.</span>
          </h1>

          <p className="text-base md:text-xl text-white/55 max-w-2xl mx-auto leading-relaxed mb-10 px-4">
            Create a meeting, share the link, and anyone joins instantly — from any device, any browser, anywhere in the world.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center px-4">
            <Btn variant="flame" size="lg" onClick={handleNew} className="w-full sm:w-auto text-base">🔥 Start a Free Meeting</Btn>
            <Btn variant="ghost" size="lg" onClick={() => navigate('/lobby')} className="w-full sm:w-auto text-base">Join with a code</Btn>
          </div>
          <p className="text-white/30 text-xs mt-6">No account needed · Works on Android & iPhone · Free forever</p>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-16 md:py-20 px-4 border-t border-white/[0.04]"
        style={{ background: 'linear-gradient(180deg,transparent,rgba(255,69,0,.03),transparent)' }}>
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-4xl font-black mb-4">Three steps to <span className="gradient-text">blazing fast</span> calls</h2>
          <p className="text-white/50 mb-12 text-base">Works on Android, iPhone, laptop — any modern browser.</p>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { num:'01', title:'Create a room',  desc:'Click "New Meeting" — a unique room code is generated and the URL updates instantly.' },
              { num:'02', title:'Share the link', desc:'Copy and send the URL to anyone. They open it on any device — phone, tablet, laptop — and join in seconds.' },
              { num:'03', title:'Connect live',   desc:'Real WebRTC video connects everyone peer-to-peer. Chat, react, screen share, and collaborate.' },
            ].map(s => (
              <div key={s.num} className="glass border border-white/[0.07] rounded-2xl p-6 text-left hover:border-flame-500/20 transition-all">
                <div className="text-4xl font-black text-flame-500/30 font-mono mb-4">{s.num}</div>
                <h3 className="text-base font-bold text-white mb-2">{s.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="py-16 md:py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-4xl font-black mb-4">Everything you need. <span className="gradient-text">Nothing you don't.</span></h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map(f => (
              <div key={f.title} className="glass border border-white/[0.07] rounded-2xl p-5 hover:border-flame-500/20 transition-all group">
                <div className="w-10 h-10 rounded-xl bg-white/[0.05] flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">{f.icon}</div>
                <h3 className="text-sm font-bold text-white mb-1.5">{f.title}</h3>
                <p className="text-white/50 text-xs leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 text-center border-t border-white/[0.04]">
        <img src={logoSrc} alt="logo" className="w-20 h-20 rounded-full object-cover mx-auto mb-6 shadow-flame animate-float" />
        <h2 className="text-3xl md:text-5xl font-black mb-5">Ready to <span className="gradient-text">ignite</span> your meetings?</h2>
        <p className="text-white/50 mb-10 text-base max-w-xl mx-auto">Works on any device, any network. Share the link and connect in seconds.</p>
        <Btn variant="flame" size="lg" onClick={handleNew} className="text-base">🔥 Launch Boutyflameet — It's Free</Btn>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/[0.05] px-4 py-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <Logo />
          <p className="text-white/25 text-sm">© 2025 Boutyflameet</p>
          <div className="flex gap-6 text-white/35 text-sm">
            <a href="#" className="hover:text-white/70 transition-colors">Privacy</a>
            <a href="#" className="hover:text-white/70 transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
