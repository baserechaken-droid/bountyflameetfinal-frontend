/**
 * PaymentModal — Working Flutterwave integration
 * © Ken Baserecha — Boutyflameet
 *
 * Flutterwave handles: M-Pesa, Visa, Mastercard, Bank Transfer in Kenya
 * Free to sign up: flutterwave.com
 * Get your public key from: dashboard → Settings → API Keys
 */
import React, { useState, useEffect } from 'react';
import { X, CreditCard, Smartphone, Building2, CheckCircle, Loader2, ExternalLink, Crown } from 'lucide-react';
import { COPYRIGHT } from '../lib/constants';
import { db, isFirebaseConfigured } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface Props {
  plan:      'pro' | 'enterprise';
  userName:  string;
  userEmail: string;
  userUid:   string;
  onClose:   () => void;
  onSuccess: (plan: 'pro' | 'enterprise') => void;
}

const FLW_KEY    = import.meta.env.VITE_FLW_PUBLIC_KEY || '';
const PLAN_PRICE = { pro: 1500, enterprise: 0 } as const;
const PLAN_NAME  = { pro: 'Blaze Pro',  enterprise: 'Inferno Enterprise' } as const;
const PLAN_USD   = { pro: '$12/mo',     enterprise: 'Custom' } as const;
const PLAN_FEAT  = {
  pro: ['50 participants','Unlimited duration','AI features','Cloud recording','Virtual backgrounds','Breakout rooms'],
  enterprise: ['500 participants','Custom branding','SSO login','Dedicated support','SLA guarantee'],
};

export function PaymentModal({ plan, userName, userEmail, userUid, onClose, onSuccess }: Props) {
  const [step,    setStep]    = useState<'info'|'pay'|'success'>('info');
  const [loading, setLoading] = useState(false);
  const [method,  setMethod]  = useState<'flw'|'bank'>('flw');

  const amount  = PLAN_PRICE[plan];
  const txRef   = `BFM-${userUid.slice(0,8).toUpperCase()}-${Date.now()}`;

  const BANK = {
    bank: 'Equity Bank Kenya',
    name: 'Ken Baserecha',
    account: '0170295385188', // ← Replace with your actual Equity account
    branch: 'Nairobi',
    ref: `BFM-${userUid.slice(0,8).toUpperCase()}`,
  };

  // Load Flutterwave script
  useEffect(() => {
    if (!document.querySelector('script[src*="checkout.flutterwave"]')) {
      const s = document.createElement('script');
      s.src = 'https://checkout.flutterwave.com/v3.js';
      document.head.appendChild(s);
    }
  }, []);

  const payWithFlutterwave = () => {
    if (!FLW_KEY) {
      alert(
        'Flutterwave not configured yet.\n\n' +
        'Steps:\n' +
        '1. Go to flutterwave.com → Sign up free\n' +
        '2. Get your Public Key from Settings → API Keys\n' +
        '3. Add VITE_FLW_PUBLIC_KEY to Vercel env vars\n' +
        '4. Redeploy'
      );
      return;
    }

    setLoading(true);
    const fw = (window as any).FlutterwaveCheckout;
    if (!fw) { setLoading(false); alert('Payment system loading — try again in a moment'); return; }

    fw({
      public_key: FLW_KEY,
      tx_ref: txRef,
      amount,
      currency: 'KES',
      payment_options: 'card,mobilemoneykenya',
      customer: { email: userEmail || `${userUid}@boutyflameet.app`, name: userName },
      customizations: {
        title:       `Boutyflameet ${PLAN_NAME[plan]}`,
        description: `Upgrade to ${PLAN_NAME[plan]} — ${PLAN_USD[plan]}`,
        logo:        `${window.location.origin}/logo.jpeg`,
      },
      callback: (response: any) => {
        setLoading(false);
        if (response.status === 'successful' || response.status === 'completed') {
          console.log('[Payment] Success:', response.transaction_id, response.tx_ref);
          setStep('success');
          onSuccess(plan);
        }
      },
      onclose: () => { setLoading(false); },
    });
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 py-6 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="glass border border-white/10 rounded-2xl w-full max-w-md animate-slide-up overflow-hidden my-auto">

        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between bg-gradient-to-r from-flame-500/10 to-transparent">
          <div className="flex items-center gap-2.5">
            <Crown size={18} className="text-flame-400"/>
            <div>
              <h2 className="text-base font-bold text-white">{PLAN_NAME[plan]}</h2>
              <p className="text-xs text-white/40">{PLAN_USD[plan]} · Cancel anytime</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1 transition-colors"><X size={18}/></button>
        </div>

        {step === 'success' ? (
          <div className="p-8 text-center">
            <CheckCircle size={52} className="text-green-400 mx-auto mb-4"/>
            <h3 className="text-xl font-bold text-white mb-2">Payment Successful! 🔥</h3>
            <p className="text-white/50 text-sm mb-6">Welcome to {PLAN_NAME[plan]}. Enjoy your premium features!</p>
            <button onClick={() => { onSuccess(plan); onClose(); }}
              className="btn-flame text-white text-sm font-bold px-8 py-3 rounded-xl">
              Start Using Pro Features →
            </button>
          </div>
        ) : (
          <div className="p-6">
            {/* Plan summary */}
            <div className="bg-flame-500/10 border border-flame-500/20 rounded-xl p-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-white">{PLAN_NAME[plan]}</p>
                <div className="text-right">
                  <p className="text-lg font-black text-flame-400">KES {amount.toLocaleString()}</p>
                  <p className="text-xs text-white/30">{PLAN_USD[plan]}</p>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                {PLAN_FEAT[plan].map(f => (
                  <div key={f} className="flex items-center gap-2 text-xs text-white/70">
                    <span className="text-flame-400">✓</span>{f}
                  </div>
                ))}
              </div>
            </div>

            {/* Payment method */}
            <div className="flex gap-2 mb-5">
              <button onClick={() => setMethod('flw')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                  method === 'flw'
                    ? 'border-flame-500/60 bg-flame-500/15 text-flame-400'
                    : 'border-white/10 bg-white/[0.04] text-white/50 hover:text-white/70'
                }`}>
                <CreditCard size={12} className="inline mr-1.5"/>M-Pesa / Card
              </button>
              <button onClick={() => setMethod('bank')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                  method === 'bank'
                    ? 'border-flame-500/60 bg-flame-500/15 text-flame-400'
                    : 'border-white/10 bg-white/[0.04] text-white/50 hover:text-white/70'
                }`}>
                <Building2 size={12} className="inline mr-1.5"/>Bank / Equity
              </button>
            </div>

            {/* Flutterwave (M-Pesa + Card) */}
            {method === 'flw' && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-white/60 leading-relaxed">
                  Pay with <strong className="text-white">M-Pesa</strong>, Visa, or Mastercard.
                  Tap the button — a secure Flutterwave checkout will open.
                </p>
                <button onClick={payWithFlutterwave} disabled={loading}
                  className="w-full py-3.5 rounded-xl font-bold text-sm btn-flame text-white flex items-center justify-center gap-2 disabled:opacity-60">
                  {loading ? <Loader2 size={16} className="animate-spin"/> : <Smartphone size={16}/>}
                  {loading ? 'Opening payment…' : `Pay KES ${amount.toLocaleString()}`}
                </button>
                <div className="flex items-center justify-center gap-2">
                  <img src="https://cdn.flutterwave.com/assets/rave-logo.svg" alt="Flutterwave" className="h-5 opacity-60"/>
                  <a href="https://flutterwave.com" target="_blank" rel="noreferrer"
                    className="text-xs text-white/25 hover:text-white/50 flex items-center gap-1">
                    Secured by Flutterwave <ExternalLink size={9}/>
                  </a>
                </div>
                {!FLW_KEY && (
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3">
                    <p className="text-orange-400 text-xs font-semibold mb-1">⚠️ Payments not configured yet</p>
                    <p className="text-white/40 text-xs">
                      Add <code className="text-orange-300">VITE_FLW_PUBLIC_KEY</code> to Vercel env vars from flutterwave.com
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Bank / Equity */}
            {method === 'bank' && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-white/60">Transfer to Equity Bank. Your account upgrades within 24 hours after we confirm.</p>
                <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 space-y-2.5">
                  {Object.entries({
                    'Bank':         BANK.bank,
                    'Account Name': BANK.name,
                    'Account No.':  BANK.account,
                    'Branch':       BANK.branch,
                    'Amount':       `KES ${amount.toLocaleString()}`,
                    'Reference':    BANK.ref,
                  }).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <span className="text-white/40 text-xs">{k}</span>
                      <span className="text-white font-bold text-xs text-right font-mono">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-flame-500/10 border border-flame-500/20 rounded-xl p-3">
                  <p className="text-flame-400 text-xs font-bold">⚠️ Always include the Reference number</p>
                  <p className="text-white/40 text-xs mt-1">Without it we cannot identify your payment</p>
                </div>
                <a href={`mailto:kenbaserecha@gmail.com?subject=Payment - ${BANK.ref}&body=Hi Ken, I transferred KES ${amount} for ${PLAN_NAME[plan]}. Reference: ${BANK.ref}. My email: ${userEmail}`}
                  className="w-full py-3 rounded-xl font-bold text-sm bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-white text-center transition-all block">
                  📧 Send Email Confirmation
                </a>
              </div>
            )}

            <p className="text-center text-white/15 text-[10px] mt-5">{COPYRIGHT} · Secure payments</p>
          </div>
        )}
      </div>
    </div>
  );
}
