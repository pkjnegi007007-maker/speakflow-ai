import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ShieldCheck, Sparkles, CreditCard, X, ChevronRight, Zap } from 'lucide-react';
import confetti from 'canvas-confetti';

interface PricingModalProps {
  onClose: () => void;
  uid: string;
  onUpgradeSuccess: () => void;
  isLockedWall?: boolean;
}

export function PricingModal({ onClose, uid, onUpgradeSuccess, isLockedWall = false }: PricingModalProps) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');
  const [step, setStep] = useState<'plan' | 'payment'>('plan');
  const [paymentDone, setPaymentDone] = useState(false);
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const price = billingCycle === 'yearly' ? 4.79 : 7.99;
  const originalPrice = billingCycle === 'yearly' ? 7.99 : 7.99;

  // Format inputs nicely
  const handleCardNumberChange = (val: string) => {
    const numbers = val.replace(/\D/g, '').substring(0, 16);
    const parts = numbers.match(/.{1,4}/g) || [];
    setCardNumber(parts.join(' '));
  };

  const handleExpiryChange = (val: string) => {
    const clean = val.replace(/\D/g, '').substring(0, 4);
    if (clean.length >= 2) {
      setCardExpiry(`${clean.slice(0, 2)}/${clean.slice(2)}`);
    } else {
      setCardExpiry(clean);
    }
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate payment transaction delays
    await new Promise(resolve => setTimeout(resolve, 1400));

    try {
      // Trigger confetti
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#6366f1', '#a855f7', '#ec4899', '#10b981']
      });

      setPaymentDone(true);
      onUpgradeSuccess();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const features = [
    { text: "Unlimited daily practice sessions (No 3-session limits)", detail: "Practice as many times as you want" },
    { text: "Selectable browser speech accents & custom tone guides", detail: "Formal US, friendly UK, energetic Australian, and more" },
    { text: "Detailed past session metrics & historical report reviews", detail: "Review full AI analyses for your historical runs" },
    { text: "Gemini Pro analytical reasoning corrections", detail: "Deep sentence-by-sentence phrasing alternatives & explanations" },
    { text: "Dynamic coach speaking rate modifier", detail: "Slow down or speed up the coach to challenge your ear" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div id="pricing-modal-box" className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl overflow-hidden text-slate-100 flex flex-col md:flex-row min-h-[500px]">
        
        {/* Left Aspect: Value Proposition & Plan choice */}
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
              <div className="mb-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl p-3 flex items-center gap-2 text-xs text-orange-400">
                <Zap className="w-4 h-4 text-orange-400 shrink-0" />
                <span>Daily free limit (3 sessions) reached! Level up to Pro to continue practicing.</span>
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
            <span>Production Ready Simulation</span>
          </div>
        </div>

        {/* Right Aspect: Interactive Subscribing Flow */}
        <div className="md:w-5/12 bg-slate-950/40 p-8 md:p-10 flex flex-col justify-between border-t md:border-t-0 md:border-l border-slate-800">
          <div className="flex justify-between items-center mb-6">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Secure Payment Portal</span>
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
                      className={`flex-1 py-2 rounded-lg font-black tracking-wide uppercase transition-all ${billingCycle === 'yearly' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10' : 'text-slate-400 hover:text-slate-100'}`}
                    >
                      Yearly <span className="text-[9px] font-extrabold text-indigo-200 ml-1">Save 40%</span>
                    </button>
                    <button 
                      onClick={() => setBillingCycle('monthly')}
                      className={`flex-1 py-2 rounded-lg font-black tracking-wide uppercase transition-all ${billingCycle === 'monthly' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10' : 'text-slate-400 hover:text-slate-100'}`}
                    >
                      Monthly
                    </button>
                  </div>

                  {/* Pricing visual card */}
                  <div className="p-6 bg-slate-900/60 rounded-3xl border border-slate-800 text-center relative overflow-hidden">
                    {billingCycle === 'yearly' && (
                      <div className="absolute top-3 right-3 bg-indigo-500/20 text-indigo-300 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider border border-indigo-500/30">
                        Popular Choice
                      </div>
                    )}
                    <span className="text-slate-500 text-xs font-bold uppercase tracking-widest block mb-2">{billingCycle === 'yearly' ? 'Yearly Membership' : 'Monthly Membership'}</span>
                    <div className="flex items-center justify-center gap-1.5 mb-2">
                      <span className="text-4xl font-extrabold tracking-tight">${price}</span>
                      <span className="text-slate-500 text-sm font-semibold">/ month</span>
                    </div>
                    {billingCycle === 'yearly' && (
                      <span className="text-[10px] text-indigo-400 font-bold tracking-tight block">Billed annually ($57.48/year) — Risk Free Trial</span>
                    )}
                    {billingCycle === 'monthly' && (
                      <span className="text-[10px] text-slate-500 font-bold tracking-tight block">Cancel anytime, no long term contracts</span>
                    )}
                  </div>

                  {/* CTA button to checkout */}
                  <button 
                    onClick={() => setStep('payment')}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white rounded-2xl font-bold text-sm tracking-wide uppercase transition-all shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-1.5"
                  >
                    <span>Proceed to Checkout</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </motion.div>
              ) : (
                <motion.form
                  key="fill-payment"
                  onSubmit={handleSubscribe}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4 my-auto"
                >
                  <div className="mb-2 text-xs font-bold text-slate-400">Credit Card Details (Mock Sandbox)</div>
                  
                  {/* Cardholder Input */}
                  <div>
                    <label className="text-[9px] uppercase font-black tracking-widest text-slate-500 block mb-1">Cardholder Name</label>
                    <input 
                      type="text"
                      required
                      placeholder="e.g. Samuel SpeakFlow"
                      value={cardName}
                      onChange={e => setCardName(e.target.value)}
                      className="w-full bg-slate-950 text-slate-200 text-xs px-3.5 py-2.5 rounded-xl border border-slate-850 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Card Number Input */}
                  <div>
                    <label className="text-[9px] uppercase font-black tracking-widest text-slate-500 block mb-1">Card Number</label>
                    <div className="relative">
                      <input 
                        type="text"
                        required
                        placeholder="4242 4242 4242 4242"
                        value={cardNumber}
                        onChange={e => handleCardNumberChange(e.target.value)}
                        className="w-full bg-slate-950 text-slate-200 text-xs px-3.5 py-2.5 rounded-xl border border-slate-850 focus:outline-none focus:border-indigo-500 pl-10"
                      />
                      <CreditCard className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                    </div>
                  </div>

                  {/* CVV & Expiry row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] uppercase font-black tracking-widest text-slate-500 block mb-1">Expires</label>
                      <input 
                        type="text"
                        required
                        placeholder="MM/YY"
                        value={cardExpiry}
                        onChange={e => handleExpiryChange(e.target.value)}
                        className="w-full bg-slate-950 text-slate-200 text-xs px-3.5 py-2.5 rounded-xl border border-slate-850 focus:outline-none focus:border-indigo-500 text-center"
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
                        className="w-full bg-slate-950 text-slate-200 text-xs px-3.5 py-2.5 rounded-xl border border-slate-850 focus:outline-none focus:border-indigo-500 text-center font-mono letter-spacing-widest"
                      />
                    </div>
                  </div>

                  <div className="pt-2 text-[10px] text-slate-500 leading-normal mb-2 text-center">
                    Simulated secure payment gateway. No real billing key or transaction will occur.
                  </div>

                  {/* Subscribe Action Button */}
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white rounded-2xl font-bold text-sm tracking-wide uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-xl shadow-indigo-600/10"
                  >
                    {isSubmitting ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Pay & Activate Pro</span>
                      </>
                    )}
                  </button>
                  <button 
                    type="button"
                    onClick={() => setStep('plan')}
                    className="w-full py-2 bg-transparent text-slate-400 font-bold hover:text-slate-200 text-xs tracking-wide uppercase transition-colors"
                  >
                    Back to plans
                  </button>
                </motion.form>
              )
            ) : (
              <motion.div
                key="payment-complete"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-8 space-y-4 my-auto"
              >
                <div className="w-16 h-16 bg-emerald-500/15 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
                  <ShieldCheck className="w-8 h-8 font-black animate-bounce" />
                </div>
                <h3 className="text-xl font-extrabold text-white">Upgrade Active!</h3>
                <p className="text-slate-400 text-xs leading-normal px-4">
                  Excellent choice! Your account has been upgraded to **PRO**. You now have unlimited practice modules and selectable voice persona capabilities.
                </p>
                <button 
                  onClick={onClose}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/20 mt-4 transition-all"
                >
                  Start Practicing
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
