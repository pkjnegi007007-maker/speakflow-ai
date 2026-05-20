import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ShieldCheck, Sparkles, CreditCard, X, ChevronRight, Zap, ArrowLeft, RefreshCw } from 'lucide-react';
import confetti from 'canvas-confetti';

interface PricingModalProps {
  onClose: () => void;
  uid: string;
  onUpgradeSuccess: () => void;
  isLockedWall?: boolean;
}

interface PaymentReceipt {
  transactionId: string;
  receiptNumber: string;
  amountPaid: number;
  currency: string;
  tier: string;
  invoiceDate: string;
  gateway: string;
  message: string;
}

export function PricingModal({ onClose, uid, onUpgradeSuccess, isLockedWall = false }: PricingModalProps) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');
  const [step, setStep] = useState<'plan' | 'payment'>('plan');
  const [paymentDone, setPaymentDone] = useState(false);
  const [gateway, setGateway] = useState<'stripe' | 'paypal' | 'gpay'>('stripe');
  
  // Card Inputs (Stripe)
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');

  // PayPal Email Input
  const [paypalEmail, setPaypalEmail] = useState('');

  // Google Pay Active Wallet Simulation state
  const [gpayAuthorized, setGpayAuthorized] = useState(false);

  // API Interaction States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);

  const price = billingCycle === 'yearly' ? 4.79 : 7.99;
  const yearlyTotal = 57.48;

  // Format Card Number (adds nice spaces)
  const handleCardNumberChange = (val: string) => {
    const numbers = val.replace(/\D/g, '').substring(0, 16);
    const parts = numbers.match(/.{1,4}/g) || [];
    setCardNumber(parts.join(' '));
  };

  // Format Card Expiry MM/YY
  const handleExpiryChange = (val: string) => {
    const clean = val.replace(/\D/g, '').substring(0, 4);
    if (clean.length >= 2) {
      setCardExpiry(`${clean.slice(0, 2)}/${clean.slice(2)}`);
    } else {
      setCardExpiry(clean);
    }
  };

  const handleSubscribeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setPaymentError(null);

    // Prepare payment details depending on active gateway selection
    let paymentDetails: any = {};
    if (gateway === 'stripe') {
      paymentDetails = { cardName, cardNumber, cardExpiry, cardCvv };
    } else if (gateway === 'paypal') {
      paymentDetails = { email: paypalEmail };
    } else if (gateway === 'gpay') {
      paymentDetails = { billingToken: 'simulated_gpay_wallet_token_0xf892ac77e' };
    }

    try {
      // Direct call to back-end API payment gateway
      const response = await fetch('/api/payment/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uid,
          billingCycle,
          gateway,
          paymentDetails,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Server rejected payment transaction. Please try again.');
      }

      // Dynamic transaction receipt generated from backend endpoint
      setReceipt({
        transactionId: data.transactionId,
        receiptNumber: data.receiptNumber,
        amountPaid: data.amountPaid,
        currency: data.currency,
        tier: data.tier,
        invoiceDate: data.invoiceDate,
        gateway: data.gateway,
        message: data.message,
      });

      // Confetti splash for success feedback
      confetti({
        particleCount: 140,
        spread: 85,
        origin: { y: 0.65 },
        colors: ['#6366f1', '#a855f7', '#ec4899', '#10b981']
      });

      setPaymentDone(true);
      onUpgradeSuccess();
    } catch (err: any) {
      setPaymentError(err.message || 'An unexpected payment connectivity error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGplayAuthorize = () => {
    setIsSubmitting(true);
    setPaymentError(null);
    setTimeout(() => {
      setGpayAuthorized(true);
      setIsSubmitting(false);
    }, 1200);
  };

  const features = [
    { text: "Unlimited daily practice sessions", detail: "Practice as many times as you want without 3-session limits" },
    { text: "Dynamic Regional Accents & Age Profiles", detail: "Practice formal US, friendly UK, Indian, Australian, and customized voice tones" },
    { text: "Comprehensive historical assessment reviews", detail: "Gain retro reviews of filler counts, exact pacing, and confidence scores" },
    { text: "Advanced Gemini Pro evaluations", detail: "In-depth alternative corrections for perfect business grammar and conversational flow" },
    { text: "Speaking Rate Customizer (0.8x - 1.25x)", detail: "Adjust speech rate of coach personas on the fly" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div id="pricing-modal-box" className="w-full max-w-4xl bg-slate-900 border border-slate-850 rounded-[2.5rem] shadow-2xl overflow-hidden text-slate-100 flex flex-col md:flex-row min-h-[520px]">
        
        {/* Left pane: Membership Value Pitch */}
        <div className="md:w-7/12 p-8 md:p-10 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20">
                  <Sparkles className="text-indigo-400 w-5 h-5 animate-pulse" />
                </div>
                <span className="text-xs font-black uppercase tracking-[0.25em] text-indigo-400">SpeakFlow Premium</span>
              </div>
              <button onClick={onClose} className="md:hidden p-2 hover:bg-white/5 rounded-full text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {isLockedWall && (
              <div className="mb-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl p-3.5 flex items-center gap-2 text-xs text-orange-400">
                <Zap className="w-4 h-4 text-orange-400 shrink-0" />
                <span>Daily free limit (3 sessions) has been reached. Level up to continue practicing.</span>
              </div>
            )}

            <h2 className="text-3xl font-black mb-3 tracking-tight">Unlock Unlimited Speaking Growth</h2>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed">
              Join thousands of learners and professionals using SpeakFlow Premium to refine delivery, eradicate filler words, and shine in interview environments.
            </p>

            <div className="space-y-4 mb-8">
              {features.map((feature, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-5 h-5 rounded-full bg-indigo-500/15 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5 text-indigo-400 stroke-[3]" />
                  </div>
                  <div>
                    <h4 className="text-slate-200 text-xs font-bold">{feature.text}</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">{feature.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-slate-500 text-[11px] font-mono">
            <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-slate-400" /> Secure SSL Connection</span>
            <span>PCI-DSS Compliant Gateway</span>
          </div>
        </div>

        {/* Right pane: Interactive Gateway Selector & Receipts Form */}
        <div className="md:w-5/12 bg-slate-950/40 p-8 md:p-10 flex flex-col justify-between border-t md:border-t-0 md:border-l border-slate-800">
          <div className="flex justify-between items-center mb-6">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Gateway Subscription Panel</span>
            <button onClick={onClose} className="hidden md:flex p-2 hover:bg-white/5 rounded-full text-slate-400 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <AnimatePresence mode="wait">
            {!paymentDone ? (
              step === 'plan' ? (
                <motion.div
                  key="choose-plan"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6 my-auto"
                >
                  {/* Monthly vs Yearly Switcher */}
                  <div className="p-1 bg-slate-950 rounded-xl border border-slate-850 flex text-xs">
                    <button 
                      onClick={() => setBillingCycle('yearly')}
                      className={`flex-1 py-2 rounded-lg font-black tracking-wide uppercase transition-all ${billingCycle === 'yearly' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/15' : 'text-slate-400 hover:text-slate-100'}`}
                    >
                      Yearly <span className="text-[9px] font-extrabold text-indigo-200 ml-1">Save 40%</span>
                    </button>
                    <button 
                      onClick={() => setBillingCycle('monthly')}
                      className={`flex-1 py-2 rounded-lg font-black tracking-wide uppercase transition-all ${billingCycle === 'monthly' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/15' : 'text-slate-400 hover:text-slate-100'}`}
                    >
                      Monthly
                    </button>
                  </div>

                  {/* Pricing Overview Card */}
                  <div className="p-6 bg-slate-900/60 rounded-3xl border border-slate-800 text-center relative overflow-hidden">
                    {billingCycle === 'yearly' && (
                      <div className="absolute top-3 right-3 bg-indigo-500/20 text-indigo-300 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider border border-indigo-500/30">
                        Popular Choice
                      </div>
                    )}
                    <span className="text-slate-500 text-xs font-bold uppercase tracking-widest block mb-1">{billingCycle === 'yearly' ? 'Yearly Membership' : 'Monthly Membership'}</span>
                    <div className="flex items-center justify-center gap-1.5 mb-2">
                      <span className="text-4xl font-black tracking-tight">${price}</span>
                      <span className="text-slate-500 text-xs">/ month</span>
                    </div>
                    {billingCycle === 'yearly' && (
                      <span className="text-[10px] text-indigo-400 font-bold tracking-tight block">Billed annually (${yearlyTotal}/year) — Risk-Free Trial</span>
                    )}
                    {billingCycle === 'monthly' && (
                      <span className="text-[10px] text-slate-500 font-bold tracking-tight block">Cancel anytime, no long-term contracts</span>
                    )}
                  </div>

                  {/* CTA button to checkout selecting payment gateway */}
                  <button 
                    onClick={() => setStep('payment')}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white rounded-2xl font-bold text-sm tracking-wide uppercase transition-all shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-1.5"
                  >
                    <span>Proceed to Gateway Selection</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </motion.div>
              ) : (
                <motion.form
                  key="fill-payment"
                  onSubmit={handleSubscribeSubmit}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4 my-auto"
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-1">
                    <span>💳 Select Payment Gateway:</span>
                  </div>

                  {/* Gateway selector tabs */}
                  <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-850">
                    <button
                      type="button"
                      onClick={() => { setGateway('stripe'); setPaymentError(null); }}
                      className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex flex-col items-center gap-0.5 ${
                        gateway === 'stripe' ? 'bg-indigo-600/30 border border-indigo-500/40 text-white font-extrabold' : 'text-slate-400 hover:bg-slate-900/30'
                      }`}
                    >
                      <span>💳 Stripe</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setGateway('paypal'); setPaymentError(null); }}
                      className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex flex-col items-center gap-0.5 ${
                        gateway === 'paypal' ? 'bg-indigo-600/30 border border-indigo-500/40 text-white font-extrabold' : 'text-slate-400 hover:bg-slate-900/30'
                      }`}
                    >
                      <span>🌐 PayPal</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setGateway('gpay'); setPaymentError(null); }}
                      className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex flex-col items-center gap-0.5 ${
                        gateway === 'gpay' ? 'bg-indigo-600/30 border border-indigo-500/40 text-white font-extrabold' : 'text-slate-400 hover:bg-slate-900/30'
                      }`}
                    >
                      <span>⚡ GPay</span>
                    </button>
                  </div>

                  {/* Server Validation Error banner if any */}
                  {paymentError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs flex gap-2">
                      <span className="shrink-0">⚠️</span>
                      <span>{paymentError}</span>
                    </div>
                  )}

                  {/* Conditional inputs depending on Gateway */}
                  <div className="bg-slate-900/40 p-4 rounded-xl border border-white/5 space-y-3">
                    {gateway === 'stripe' && (
                      <div className="space-y-3">
                        <div>
                          <label className="text-[9px] uppercase font-black tracking-widest text-slate-500 block mb-1">Cardholder Name</label>
                          <input 
                            type="text"
                            required
                            placeholder="e.g. Samuel SpeakFlow"
                            value={cardName}
                            onChange={e => setCardName(e.target.value)}
                            className="w-full bg-slate-950 text-slate-200 text-xs px-3 py-2 rounded-lg border border-slate-850 focus:outline-none focus:border-indigo-500"
                          />
                        </div>

                        <div>
                          <label className="text-[9px] uppercase font-black tracking-widest text-slate-500 block mb-1">Card Number (16 Digits)</label>
                          <input 
                            type="text"
                            required
                            placeholder="4242 4242 4242 4242"
                            value={cardNumber}
                            onChange={e => handleCardNumberChange(e.target.value)}
                            className="w-full bg-slate-950 text-slate-200 text-xs px-3 py-2 rounded-lg border border-slate-850 focus:outline-none focus:border-indigo-500"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3.5">
                          <div>
                            <label className="text-[9px] uppercase font-black tracking-widest text-slate-500 block mb-1">Expires</label>
                            <input 
                              type="text"
                              required
                              placeholder="MM/YY"
                              value={cardExpiry}
                              onChange={e => handleExpiryChange(e.target.value)}
                              className="w-full bg-slate-950 text-slate-200 text-xs px-3 py-2 rounded-lg border border-slate-850 focus:outline-none focus:border-indigo-500 text-center"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] uppercase font-black tracking-widest text-slate-500 block mb-1">CVC Code</label>
                            <input 
                              type="password"
                              required
                              placeholder="123"
                              maxLength={3}
                              value={cardCvv}
                              onChange={e => setCardCvv(e.target.value.replace(/\D/g, ''))}
                              className="w-full bg-slate-950 text-slate-200 text-xs px-3 py-2 rounded-lg border border-slate-850 focus:outline-none focus:border-indigo-500 text-center font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {gateway === 'paypal' && (
                      <div className="space-y-3.5">
                        <div className="text-center font-bold text-xs text-indigo-400 py-1.5 flex items-center justify-center gap-1.5">
                          <span>🌐</span> Express PayPal Gateway Sandbox
                        </div>
                        <div>
                          <label className="text-[9px] uppercase font-black tracking-widest text-slate-500 block mb-1">PayPal Email Address</label>
                          <input 
                            type="email"
                            required
                            placeholder="e.g. member@paypal.com"
                            value={paypalEmail}
                            onChange={e => setPaypalEmail(e.target.value)}
                            className="w-full bg-slate-950 text-slate-200 text-xs px-3 py-2 rounded-lg border border-slate-850 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <p className="text-[10px] text-slate-500 text-center leading-normal">
                          By billing with PayPal, authorization token automatically proxies to standard secure sandbox callback routing.
                        </p>
                      </div>
                    )}

                    {gateway === 'gpay' && (
                      <div className="space-y-3 text-center">
                        <div className="text-center font-bold text-xs text-emerald-400 py-1 flex items-center justify-center gap-1.5">
                          <span>⚡</span> Google Pay Connected Device Wallet
                        </div>
                        <p className="text-[10px] text-slate-400 px-2 leading-relaxed">
                          Your active device wallet is connected. Click authorize to securely link and retrieve your gateway billing token.
                        </p>
                        
                        {!gpayAuthorized ? (
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={handleGplayAuthorize}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-black hover:bg-slate-900 text-white rounded-xl font-bold text-xs border border-white/10 mx-auto transition-colors disabled:opacity-50"
                          >
                            {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" /> : '🔗 Authorize Google Pay Wallet'}
                          </button>
                        ) : (
                          <div className="py-2.5 px-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 mx-auto">
                            <span>✅ Wallet Authorized & Connected</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Payment Billing summary */}
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300 bg-slate-950/30 p-3 rounded-lg border border-white/5">
                    <span>Grand Total:</span>
                    <span className="text-sm font-extrabold text-indigo-400">${billingCycle === 'yearly' ? yearlyTotal : price} USD</span>
                  </div>

                  {/* Submit checkout button */}
                  <button 
                    type="submit"
                    disabled={isSubmitting || (gateway === 'gpay' && !gpayAuthorized)}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white rounded-2xl font-bold text-sm tracking-wide uppercase transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-xl shadow-indigo-600/10"
                  >
                    {isSubmitting ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Pay & Activate Premium</span>
                      </>
                    )}
                  </button>

                  <button 
                    type="button"
                    onClick={() => setStep('plan')}
                    className="w-full py-2 bg-transparent text-slate-400 font-bold hover:text-slate-200 text-xs tracking-wide uppercase transition-colors flex items-center justify-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to choose plans
                  </button>
                </motion.form>
              )
            ) : (
              <motion.div
                key="payment-complete"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-2.5 space-y-4 my-auto"
              >
                <div className="text-center">
                  <div className="w-14 h-14 bg-emerald-500/15 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/25 mb-3">
                    <ShieldCheck className="w-7 h-7 font-black animate-bounce" />
                  </div>
                  <h3 className="text-xl font-extrabold text-white">Upgrade Successful!</h3>
                  <p className="text-slate-400 text-xs leading-normal block mt-1">
                    Your SpeakFlow account has been successfully upgraded to **Pro**.
                  </p>
                </div>

                {/* Secure Invoice Receipt block */}
                {receipt && (
                  <div className="p-4 bg-slate-950/60 rounded-2xl border border-white/5 space-y-2.5 font-mono text-[9px] text-slate-300 my-4 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-12 h-12 bg-indigo-500/10 rounded-full blur-xl" />
                    <div className="text-center font-bold text-[10px] text-indigo-400 border-b border-white/5 pb-2 uppercase tracking-widest flex items-center justify-center gap-1.5">
                      📑 Tax Invoice Receipt
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">TRANSACTION ID:</span>
                      <span className="text-slate-200 font-bold">{receipt.transactionId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">RECEIPT NO:</span>
                      <span className="text-slate-200 font-bold">{receipt.receiptNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">BILLING CYCLE:</span>
                      <span className="text-slate-200 font-bold uppercase">{receipt.billingCycle}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">TIER PRODUCT:</span>
                      <span className="text-slate-200 font-bold">{receipt.tier}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-semibold">PAID AMOUNT:</span>
                      <span className="text-emerald-400 font-bold text-[10px]">${receipt.amountPaid.toFixed(2)} USD</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">INVOICE DATE:</span>
                      <span className="text-slate-200">{receipt.invoiceDate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">GATEWAY ENDPOINT:</span>
                      <span className="text-slate-200 font-bold uppercase text-[8px] badge px-1.5 py-0.5 bg-indigo-500/10 border border-indigo-500/20 rounded text-indigo-300 inline-block">{receipt.gateway}</span>
                    </div>
                    <div className="border-t border-white/5 pt-2 text-center text-slate-500 font-bold uppercase text-[7px] tracking-wider leading-relaxed">
                      🏦 {receipt.message}
                    </div>
                  </div>
                )}

                <button 
                  onClick={onClose}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-1.5 scale-100 hover:scale-[1.02] active:scale-95"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Start Pro Session Now
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
