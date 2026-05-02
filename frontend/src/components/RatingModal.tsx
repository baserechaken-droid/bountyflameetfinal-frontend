/**
 * RatingModal — App rating + comment → sends to EmailJS (free tier)
 * © Ken Baserecha — Boutyflameet
 *
 * HOW TO SET UP EmailJS (free, 200 emails/month):
 * 1. Go to https://emailjs.com → Sign up free
 * 2. Create an Email Service (Gmail works)
 * 3. Create an Email Template with variables: {{name}}, {{email}}, {{rating}}, {{comment}}
 * 4. Copy your Service ID, Template ID, and Public Key
 * 5. Add to .env.local: VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, VITE_EMAILJS_PUBLIC_KEY
 * 6. Also create a REPLY template to auto-send "Thank you" replies
 */
import React, { useState } from 'react';
import { X, Star, Send, Loader2, CheckCircle } from 'lucide-react';
import { SUPPORT_EMAIL, COPYRIGHT } from '../lib/constants';

interface Props {
  userName: string;
  userEmail?: string;
  onClose: () => void;
}

const SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID   || '';
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID  || '';
const REPLY_TPL   = import.meta.env.VITE_EMAILJS_REPLY_TPL    || '';
const PUBLIC_KEY  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY   || '';

async function sendEmail(params: Record<string, string>) {
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
    console.warn('[Email] EmailJS not configured — see RatingModal.tsx comments');
    return true; // pretend success in dev
  }
  const res = await fetch(`https://api.emailjs.com/api/v1.0/email/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id:  SERVICE_ID,
      template_id: TEMPLATE_ID,
      user_id:     PUBLIC_KEY,
      template_params: params,
    }),
  });
  return res.ok;
}

async function sendReply(params: Record<string, string>) {
  if (!SERVICE_ID || !REPLY_TPL || !PUBLIC_KEY || !params.reply_to) return;
  await fetch(`https://api.emailjs.com/api/v1.0/email/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id:  SERVICE_ID,
      template_id: REPLY_TPL,
      user_id:     PUBLIC_KEY,
      template_params: params,
    }),
  });
}

export function RatingModal({ userName, userEmail, onClose }: Props) {
  const [rating,  setRating]  = useState(0);
  const [hover,   setHover]   = useState(0);
  const [comment, setComment] = useState('');
  const [email,   setEmail]   = useState(userEmail || '');
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);
  const [error,   setError]   = useState('');

  const labels = ['','Poor','Fair','Good','Great','Excellent!'];

  const handleSubmit = async () => {
    if (!rating) { setError('Please select a star rating'); return; }
    if (!comment.trim()) { setError('Please write a brief comment'); return; }
    setError('');
    setLoading(true);
    try {
      const params = {
        from_name:  userName,
        reply_to:   email,
        rating:     String(rating),
        stars:      '⭐'.repeat(rating),
        comment:    comment.trim(),
        support_to: SUPPORT_EMAIL,
      };

      // Send feedback to support email
      await sendEmail(params);

      // Send thank-you reply to user
      if (email) {
        await sendReply({
          ...params,
          to_name:  userName,
          to_email: email,
        });
      }
      setDone(true);
    } catch (e) {
      setError('Failed to send. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/75 backdrop-blur-sm px-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="glass border border-white/10 rounded-2xl p-7 w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Rate Boutyflameet</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1 transition-colors"><X size={18}/></button>
        </div>

        {done ? (
          <div className="text-center py-8">
            <CheckCircle size={52} className="text-green-400 mx-auto mb-4"/>
            <h3 className="text-xl font-bold text-white mb-2">Thank you, {userName.split(' ')[0]}!</h3>
            <p className="text-white/50 text-sm leading-relaxed">
              We appreciate your feedback. Hope you had a great experience with Boutyflameet!
              {email && <> A thank-you reply has been sent to <span className="text-flame-400">{email}</span>.</>}
            </p>
            <button onClick={onClose} className="mt-6 btn-flame text-white text-sm font-bold px-6 py-2.5 rounded-xl">Close</button>
          </div>
        ) : (
          <>
            {/* Stars */}
            <div className="flex flex-col items-center mb-6">
              <p className="text-white/50 text-sm mb-4">How would you rate your experience?</p>
              <div className="flex gap-2">
                {[1,2,3,4,5].map(s => (
                  <button key={s} onClick={() => setRating(s)}
                    onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(0)}
                    className="transition-transform hover:scale-110">
                    <Star size={40} className="transition-colors"
                      fill={(hover || rating) >= s ? '#FF4500' : 'none'}
                      stroke={(hover || rating) >= s ? '#FF4500' : '#ffffff30'}/>
                  </button>
                ))}
              </div>
              {(hover || rating) > 0 && (
                <p className="text-flame-400 text-sm font-bold mt-2">{labels[hover || rating]}</p>
              )}
            </div>

            {/* Name + email */}
            <div className="flex flex-col gap-3 mb-4">
              {!userEmail && (
                <input value={email} onChange={e => setEmail(e.target.value)} type="email"
                  placeholder="Your email (for reply) — optional"
                  className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-flame-500/60 transition-all"/>
              )}
              <textarea value={comment} onChange={e => setComment(e.target.value)} rows={4}
                placeholder="Tell us about your experience… What did you love? What can we improve?"
                className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 outline-none focus:border-flame-500/60 resize-none transition-all"/>
            </div>

            {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

            <button onClick={handleSubmit} disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-sm btn-flame text-white flex items-center justify-center gap-2 disabled:opacity-60">
              {loading ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>}
              {loading ? 'Sending…' : 'Submit Feedback'}
            </button>

            <p className="text-center text-white/20 text-[10px] mt-4">{COPYRIGHT}</p>
          </>
        )}
      </div>
    </div>
  );
}
