/**
 * PaymentModal — Flutterwave + Bank Transfer v4.1
 * © Ken Baserecha — Boutyflameet
 *
 * P0 FIX: Backend verification before granting pro access.
 * Previously, onSuccess(plan) was called directly in the Flutterwave callback
 * which could be triggered from browser devtools — free pro access for anyone.
 *
 * Now:
 * 1. Flutterwave callback fires with transaction_id
 * 2. We POST to /api/payment/verify with the txId + uid
 * 3. Server verifies with Flutterwave API that the transaction is real
 * 4. Server checks amount >= plan price
 * 5. ONLY THEN do we call onSuccess(plan)
 */
import React, { useState } from 'react';
import { X, CreditCard, Building2, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { COPYRIGHT, PLANS } from '../lib/constants';

interface Props {
  plan:       'pro' | 'enterprise';
  userName:   string;
  userEmail:  string;
  userUid?:   string;
  onClose:    () => void;
  onSuccess:  (plan: 'pro' | 'enterprise') => void;
}

type PayStep = 'choose' | 'processing' | 'verifying' | 'done' | 'error';

const AI_URL = import.meta.env.VITE_AI_BACKEND_URL || import.meta.env.VITE_SIGNALING_URL || '';

export function PaymentModal({ plan, userName, userEmail, userUid, onClose, onSuccess }: Props) {
  const [step,       setStep]       = useState<PayStep>('choose');
  const [errorMsg,   setErrorMsg]   = useState('');
  const [showBank,   setShowBank]   = useState(false);

  const planInfo = PLANS[plan];

  const BANK = {
    bank:    'Equity Bank Kenya',
    name:    'Ken Baserecha',
    account: '0170295385188',
    branch:  'Nairobi CBD',
  };

  // ── Flutterwave checkout ──────────────────────────────────
  const handleFlutterwave = () => {
    const fw = (window as any).FlutterwaveCheckout;
    if (!fw) {
      setErrorMsg('Payment SDK failed to load. Refresh and try again.');
      setStep('error');
      return;
    }

    const pubKey = import.meta.env.VITE_FLW_PUBLIC_KEY;
    if (!pubKey || !pubKey.startsWith('FLWPUBK')) {
      setErrorMsg('Payment not configured. Add VITE_FLW_PUBLIC_KEY to Vercel environment variables.');
      setStep('error');
      return;
    }

    // tx_ref encodes: app prefix + uid + timestamp + plan
    // Server uses this to identify which plan to grant
    const txRef = `BFM-${userUid || 'anon'}-${Date.now()}-${plan}-sub`;

    fw({
      public_key:         pubKey,
      tx_ref:             txRef,
      amount:             planInfo.priceKES,
      currency:           'KES',
      payment_options:    'mpesa,card,ussd,banktransfer',
      redirect_url:       undefined,
      customer: {
        email:       userEmail || `${userName.replace(/\s+/g,'').toLowerCase()}@boutyflameet.app`,
        phonenumber: '',
        name:        userName,
      },
      customizations: {
        title:       `Boutyflameet ${planInfo.name}`,
        description: `Monthly subscription — ${planInfo.name} plan`,
        logo:        `${window.location.origin}/logo.jpeg`,
      },
      // ── CRITICAL: verify on backend before granting access ──
      callback: async (response: any) => {
        console.log('[Payment] Flutterwave response:', response);

        if (response.status !== 'successful' && response.status !== 'completed') {
          setErrorMsg(`Payment was not successful (status: ${response.status}). Please try again.`);
          setStep('error');
          return;
        }

        // Never trust the frontend — verify with server
        setStep('verifying');
        try {
          const verifyRes = await fetch(`${AI_URL}/api/payment/verify`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              txId: response.transaction_id,
              txRef,
              uid:  userUid || null,
              plan,
            }),
          });
          const data = await verifyRes.json();

          if (!verifyRes.ok || !data.verified) {
            const reason = data.reason || 'Verification failed';
            console.error('[Payment] Backend rejected:', reason);
            setErrorMsg(`Payment could not be verified: ${reason}. Contact support with transaction ID: ${response.transaction_id}`);
            setStep('error');
            return;
          }

          console.log('[Payment] ✅ Verified by backend:', data);
          setStep('done');
          // Now safe to unlock pro
          onSuccess(data.plan || plan);
        } catch (e: any) {
          console.error('[Payment] Verify request failed:', e.message);
          // Network error during verification — don't silently grant access
          setErrorMsg(`Could not verify payment (network error). Please contact support with transaction ID: ${response.transaction_id}`);
          setStep('error');
        }
      },
      onclose: () => {
        if (step === 'choose') setStep('choose');
      },
    });
  };

  if (step === 'verifying') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
        <div className="glass border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center">
          <Loader2 size={40} className="text-flame-500 animate-spin mx-auto mb-4"/>
          <h2 className="text-white font-bold text-lg mb-2">Verifying Payment…</h2>
          <p className="text-white/50 text-sm">Confirming your transaction with our payment processor. This takes a few seconds.</p>
        </div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
        <div className="glass border border-green-500/30 rounded-2xl p-8 max-w-sm w-full text-center">
          <CheckCircle2 size={52} className="text-green-400 mx-auto mb-4"/>
          <h2 className="text-white font-bold text-xl mb-2">You're on {planInfo.name}! 🔥</h2>
          <p className="text-white/60 text-sm mb-6">All premium features are now unlocked. Enjoy Boutyflameet.</p>
          <button onClick={onClose} className="btn-flame text-white px-8 py-3 rounded-xl font-bold text-sm w-full">
            Start Meeting →
          </button>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
        <div className="glass border border-red-500/30 rounded-2xl p-8 max-w-sm w-full text-center">
          <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
            <X size={28} className="text-red-400"/>
          </div>
          <h2 className="text-white font-bold text-lg mb-2">Payment Issue</h2>
          <p className="text-white/50 text-sm mb-5 leading-relaxed">{errorMsg}</p>
          <div className="flex gap-3">
            <button onClick={()=>setStep('choose')} className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-all text-sm font-medium">
              Try Again
            </button>
            <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-white/[0.06] text-white/60 hover:text-white transition-all text-sm font-medium">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="glass border border-white/10 rounded-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-base font-bold text-white">Upgrade to {planInfo.name}</h2>
            <p className="text-white/40 text-xs mt-0.5">{planInfo.price} · Billed monthly</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-white/50 hover:text-white transition-all">
            <X size={16}/>
          </button>
        </div>

        {/* Features */}
        <div className="px-6 py-4 space-y-2">
          {planInfo.features.map(f => (
            <div key={f} className="flex items-center gap-2 text-sm text-white/80">
              <CheckCircle2 size={14} className="text-flame-500 shrink-0"/>
              <span>{f}</span>
            </div>
          ))}
        </div>

        {/* Security badge */}
        <div className="mx-6 mb-4 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center gap-2">
          <ShieldCheck size={14} className="text-green-400 shrink-0"/>
          <span className="text-green-400/80 text-xs">Payments verified server-side — your card info never touches our servers</span>
        </div>

        {/* Payment methods */}
        <div className="px-6 pb-6 flex flex-col gap-3">
          <button onClick={handleFlutterwave}
            className="w-full btn-flame text-white py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2">
            <CreditCard size={17}/>
            Pay with M-Pesa / Card (KES {planInfo.priceKES?.toLocaleString()})
          </button>

          <button onClick={() => setShowBank(b => !b)}
            className="w-full border border-white/10 hover:border-white/20 text-white/70 hover:text-white py-3 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2">
            <Building2 size={16}/>
            {showBank ? 'Hide' : 'Pay via'} Bank Transfer
          </button>

          {showBank && (
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 text-sm space-y-2">
              <p className="text-white/60 text-xs mb-3">Transfer KES {planInfo.priceKES?.toLocaleString()} to:</p>
              {[
                ['Bank',    BANK.bank],
                ['Name',    BANK.name],
                ['Account', BANK.account],
                ['Branch',  BANK.branch],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between items-center">
                  <span className="text-white/40">{k}</span>
                  <span className="text-white font-mono font-semibold text-xs">{v}</span>
                </div>
              ))}
              <p className="text-white/30 text-xs mt-3 leading-relaxed">
                After transfer, email <span className="text-flame-400">kenbaserecha@gmail.com</span> with your payment slip and account email to activate.
              </p>
              <button onClick={() => { onSuccess(plan); onClose(); }}
                className="w-full mt-2 py-2.5 rounded-xl border border-white/10 text-white/50 hover:text-white text-xs transition-all">
                I've completed the bank transfer →
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-white/20 text-[10px] pb-4 px-4">{COPYRIGHT} · Cancel anytime · SSL secured</p>
      </div>
    </div>
  );
}
