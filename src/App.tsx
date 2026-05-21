import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Settings, History, Trophy, Github, LogOut, User as UserIcon, Play, ChevronRight, BarChart2, Sparkles, ShieldCheck, Zap, HelpCircle, Code, Volume2, Calendar, MessageSquare, AlertCircle, X, Check, Pause } from 'lucide-react';
import { useVoice } from './hooks/useVoice';
import { formatTime } from './utils/time';
import { getBestMatchingVoice, getVoiceUtteranceConfig } from './utils/voiceMatcher';
import { useRealTimeMetrics } from './hooks/useRealTimeMetrics';
import { getChatResponse, analyzeSession } from './lib/gemini';
import { SCENARIOS, Scenario } from './constants/scenarios';
import { VoiceWaveform } from './components/VoiceWaveform';
import { doc, setDoc, getDoc, updateDoc, increment, collection, addDoc, query, where, orderBy, limit, getDocs, serverTimestamp, Timestamp } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, signIn, signOut, handleFirestoreError, OperationType } from './lib/firebase';
import { PricingModal } from './components/PricingModal';
import { TestStudio } from './components/TestStudio';
import { TrafficDashboard } from './components/TrafficDashboard';

type View = 'landing' | 'scenarios' | 'session' | 'feedback' | 'history' | 'analytics';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>('landing');
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  
  // Performance and silence detection references to prevent high-frequency re-renders
  const lastActivityRef = useRef<number>(Date.now());
  const transcriptRef = useRef<string>('');
  const interimTranscriptRef = useRef<string>('');
  const isAiProcessingRef = useRef<boolean>(false);
  const isAiSpeakingRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const isListeningRef = useRef<boolean>(false);
  const viewRef = useRef<View>('landing');

  const [sessionTranscript, setSessionTranscript] = useState<{ role: string; content: string }[]>([]);
  const [feedback, setFeedback] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);

  // Freemium structures & Diagnostics States
  const [isPremium, setIsPremium] = useState(false);
  const [dailySessionsUsed, setDailySessionsUsed] = useState(0);
  const [lastSessionResetDate, setLastSessionResetDate] = useState('');
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [isLockedWall, setIsLockedWall] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Anonymous trials:
  const [anonymousAttempts, setAnonymousAttempts] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('speakflow_anonymous_attempts');
      return saved ? parseInt(saved, 10) : 0;
    }
    return 0;
  });
  const [showAuthWallModal, setShowAuthWallModal] = useState(false);

  // Sync anonymous counter to local storage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('speakflow_anonymous_attempts', anonymousAttempts.toString());
    }
  }, [anonymousAttempts]);

  // Client-Side Telemetry Event Tracker
  const trackEvent = async (actionName: string, scenarioName?: string) => {
    try {
      if (typeof window === 'undefined') return;
      let uuid = localStorage.getItem('speakflow_analytics_uuid');
      if (!uuid) {
        uuid = `cli_${Math.random().toString(36).substring(2, 10)}`;
        localStorage.setItem('speakflow_analytics_uuid', uuid);
      }
      
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let approxCountry = 'United States';
      if (tz.includes('Kolkata') || tz.includes('Calcutta') || tz.includes('India')) approxCountry = 'India';
      else if (tz.includes('London') || tz.includes('Europe/London')) approxCountry = 'United Kingdom';
      else if (tz.includes('Sydney') || tz.includes('Australia')) approxCountry = 'Australia';
      else if (tz.includes('Berlin')) approxCountry = 'Germany';
      else if (tz.includes('Toronto')) approxCountry = 'Canada';
      else if (tz.includes('Singapore')) approxCountry = 'Singapore';
      else if (tz.includes('Tokyo')) approxCountry = 'Japan';

      const width = window.innerWidth;
      const deviceType = width < 640 ? 'Mobile' : width < 1024 ? 'Tablet' : 'Desktop';

      // 1. Double-write: Track server-side via native container proxy
      try {
        await fetch('/api/analytics/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: uuid,
            country: approxCountry,
            device: deviceType,
            action: actionName,
            scenario: scenarioName || selectedScenario?.title || 'General Navigation'
          })
        });
      } catch (apiErr) {
        // Safe to ignore if server endpoint is not hosted
      }

      // 2. Real Firestore Cloud integration works on external hosts (e.g. Vercel)
      try {
        const presenceRef = doc(db, 'presence', uuid);
        await setDoc(presenceRef, {
          clientId: uuid,
          country: approxCountry,
          device: deviceType,
          lastSeen: Date.now(),
          lastAction: actionName,
          scenario: scenarioName || selectedScenario?.title || 'General Navigation'
        }, { merge: true });
      } catch (fsErr) {
        console.warn('Firestore telemetry failed:', fsErr);
      }
    } catch (err) {
      console.warn('Telemetry track failed:', err);
    }
  };

  // Telemetry Heartbeat scheduler
  useEffect(() => {
    trackEvent('Page View');
    
    const interval = setInterval(() => {
      trackEvent('Heartbeat');
    }, 10000);

    return () => clearInterval(interval);
  }, [view]);

  // Premium Customizer Options
  const [selectedVoice, setSelectedVoice] = useState('');
  const [coachSpeed, setCoachSpeed] = useState(1.0);
  const [coachTone, setCoachTone] = useState<'encouraging' | 'strict' | 'casual'>('encouraging');
  const [silenceMode, setSilenceMode] = useState<'conversational' | 'thoughtful' | 'presentation'>(() => {
    try {
      const saved = localStorage.getItem('speakflow_silence_mode');
      return (saved as 'conversational' | 'thoughtful' | 'presentation') || 'thoughtful';
    } catch {
      return 'thoughtful';
    }
  });
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Custom demographics and regional accents
  const [coachGender, setCoachGender] = useState<'default' | 'man' | 'woman' | 'kid'>('default');
  const [coachAccent, setCoachAccent] = useState<'default' | 'us' | 'uk' | 'in' | 'au'>('default');

  // Dynamically resolve voice configuration based on gender/accent/speed profile
  const getSpeakVoiceConfig = () => {
    let finalVoiceName = selectedVoice || undefined;
    let finalSpeed = coachSpeed;
    let finalPitch = 1.0;

    if (coachGender !== 'default' || coachAccent !== 'default') {
      const matched = getBestMatchingVoice(systemVoices, coachAccent, coachGender);
      if (matched) {
        finalVoiceName = matched.name;
      }
      const { pitch, rateModifier } = getVoiceUtteranceConfig(coachGender);
      finalPitch = pitch;
      finalSpeed = coachSpeed * rateModifier;
    }

    return {
      voiceName: finalVoiceName,
      speed: finalSpeed,
      pitch: finalPitch
    };
  };

  // Selected session history detailed overlay
  const [selectedPastSession, setSelectedPastSession] = useState<any | null>(null);

  // Load browser speech voices once ready
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const loadAllVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        setSystemVoices(voices.filter(v => v.lang.startsWith('en')));
      };
      loadAllVoices();
      window.speechSynthesis.onvoiceschanged = loadAllVoices;
    }
  }, []);

  const handleSilenceModeChange = (mode: 'conversational' | 'thoughtful' | 'presentation') => {
    setSilenceMode(mode);
    try {
      localStorage.setItem('speakflow_silence_mode', mode);
    } catch (err) {
      console.error("Failed to write silence mode to localStorage", err);
    }
  };

  const {
    isListening,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    speak,
    cancelSpeech,
    setTranscript
  } = useVoice();

  const metrics = useRealTimeMetrics(transcript, isListening);

  // Session duration timer
  useEffect(() => {
    let interval: any;
    if (view === 'session' && !isPaused) {
      interval = setInterval(() => {
        setSessionSeconds(s => s + 1);
      }, 1000);
    }
    if (view !== 'session') {
      setSessionSeconds(0);
    }
    return () => clearInterval(interval);
  }, [view, isPaused]);



  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        const userRef = doc(db, 'users', u.uid);
        try {
          const userSnap = await getDoc(userRef);
          const todayDateStr = new Date().toISOString().split('T')[0];
          
          if (!userSnap.exists()) {
            const initialProfile = {
              userId: u.uid,
              displayName: u.displayName || 'SpeakFlow User',
              xp: 0,
              level: 1,
              streak: 0,
              isPremium: false,
              dailySessionsUsed: 0,
              lastSessionResetDate: todayDateStr,
              createdAt: serverTimestamp(),
              lastActive: serverTimestamp()
            };
            await setDoc(userRef, initialProfile);
            setIsPremium(false);
            setDailySessionsUsed(0);
            setLastSessionResetDate(todayDateStr);
          } else {
            const data = userSnap.data();
            const storedIsPremium = data?.isPremium || false;
            let storedSessionsUsed = data?.dailySessionsUsed || 0;
            let storedResetDate = data?.lastSessionResetDate || '';

            if (storedResetDate !== todayDateStr) {
              storedSessionsUsed = 0;
              storedResetDate = todayDateStr;
              await updateDoc(userRef, {
                dailySessionsUsed: 0,
                lastSessionResetDate: todayDateStr,
                lastActive: serverTimestamp()
              });
            }

            setIsPremium(storedIsPremium);
            setDailySessionsUsed(storedSessionsUsed);
            setLastSessionResetDate(storedResetDate);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${u.uid}`);
        }
      } else {
        setIsPremium(false);
        setDailySessionsUsed(0);
      }
    });
    return unsubscribe;
  }, []);

  // Handle interruption
  useEffect(() => {
    if (interimTranscript && (isAiProcessing || isAiSpeaking)) {
      cancelSpeech();
    }
  }, [interimTranscript, isAiProcessing, isAiSpeaking, cancelSpeech]);

  // Keep refs in sync passively without triggering component re-renders
  useEffect(() => {
    transcriptRef.current = transcript;
    interimTranscriptRef.current = interimTranscript;
  }, [transcript, interimTranscript]);

  useEffect(() => {
    isAiProcessingRef.current = isAiProcessing;
    isAiSpeakingRef.current = isAiSpeaking;
  }, [isAiProcessing, isAiSpeaking]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // Activity tracker for silence detection - passive update via Ref avoids high-frequency page re-renders!
  useEffect(() => {
    if (transcript || interimTranscript) {
      lastActivityRef.current = Date.now();
      // Clear transient api errors as soon as user speaks or voice makes sound - guard to prevent dispatch cycles
      setApiError(prev => prev !== null ? null : null);
    }
  }, [transcript, interimTranscript]);

  // Handle Automatic Turn-Taking (Silence Detection) using a single decoupled background interval
  useEffect(() => {
    if (view !== 'session') return;

    let silenceDuration = 3200; // Default to 'thoughtful' (3.2s)
    if (silenceMode === 'conversational') {
      silenceDuration = 1500; // 1.5s for faster conversational pacing
    } else if (silenceMode === 'presentation') {
      silenceDuration = 6000; // 6.0s for long explanations or presentation scripts
    }

    const checkSilence = setInterval(() => {
      if (
        isListeningRef.current && 
        !isPausedRef.current && 
        !isAiProcessingRef.current && 
        !isAiSpeakingRef.current &&
        (transcriptRef.current.trim() || interimTranscriptRef.current.trim())
      ) {
        const now = Date.now();
        if (now - lastActivityRef.current > silenceDuration) {
          stopListening();
        }
      }
    }, 150); // High frequency check (150ms) to ensure low latency turn-taking

    return () => clearInterval(checkSilence);
  }, [view, stopListening, silenceMode]);

  // Handle User Voice Turn-Taking (Auto-trigger AI response after user finishes)
  // Depends ONLY on isListening changing state, and accesses decoupled refs to prevent high-frequency re-evaluations
  useEffect(() => {
    if (!isListening) {
      const currentTranscript = transcriptRef.current;
      if (
        !isPausedRef.current && 
        currentTranscript.trim() && 
        viewRef.current === 'session' && 
        !isAiProcessingRef.current
      ) {
        handleUserSpeechFinished(currentTranscript.trim());
      } else if (
        !isPausedRef.current &&
        !currentTranscript.trim() &&
        viewRef.current === 'session' &&
        !isAiProcessingRef.current &&
        !isAiSpeakingRef.current
      ) {
        // Speech recognition stopped without transcript (e.g. natural continuous limit or pause cycle)
        // Auto-restart to keep microphone alive!
        console.log("Speech recognition stopped naturally; auto-restarting to keep microphone alive.");
        startListening();
      }
    }
  }, [isListening, startListening]);

  const handleUserSpeechFinished = async (content: string) => {
    if (isAiProcessing) return;
    setApiError(null);
    setSessionTranscript(prev => [...prev, { role: 'user', content }]);
    setTranscript('');
    setIsAiProcessing(true);

    try {
      const chatPrompt = [...sessionTranscript, { role: 'user', content }];
      // Customize persona tone input for Gemini prompt
      const customizedScenario = `${selectedScenario?.title || 'Communication'} (Tone style: ${coachTone})`;
      const response = await getChatResponse(customizedScenario, chatPrompt);
      
      if (response) {
        setSessionTranscript(prev => [...prev, { role: 'ai', content: response }]);
        setIsAiSpeaking(true);
        const vc = getSpeakVoiceConfig();
        speak(response, () => {
          setIsAiSpeaking(false);
          startListening();
        }, isPremium ? vc.voiceName : undefined, isPremium ? vc.speed : undefined, isPremium ? vc.pitch : undefined);
      } else {
        setApiError("Coach is thinking... just a moment.");
        setTimeout(() => startListening(), 2000);
      }
    } catch (err: any) {
      console.error(err);
      const isMissingKey = err?.message && (err.message.includes("missing") || err.message.includes("GEMINI_API_KEY") || err.message.includes("API key"));
      setApiError(isMissingKey ? err.message : "Connection trouble. Let's try again.");
      setTimeout(() => startListening(), 2000);
    } finally {
      setIsAiProcessing(false);
    }
  };

  const handlePauseSession = () => {
    isPausedRef.current = true;
    setIsPaused(true);
    stopListening();
    cancelSpeech();
    setIsAiSpeaking(false);
  };

  const handleResumeSession = () => {
    isPausedRef.current = false;
    setIsPaused(false);
    startListening();
  };

  const startSession = (scenario: Scenario) => {
    // Check if user is not logged in, and handle anonymous usage tracking
    if (!user) {
      if (anonymousAttempts >= 10) {
        setShowAuthWallModal(true);
        return;
      }
      setAnonymousAttempts(prev => prev + 1);
    } else {
      // 1. Check Freemium Practice Limits for authenticated non-premium users
      if (!isPremium && dailySessionsUsed >= 3) {
        setIsLockedWall(true);
        setShowPricingModal(true);
        return;
      }
    }

    setSelectedScenario(scenario);
    setSessionTranscript([]);
    isPausedRef.current = false;
    setIsPaused(false);
    setView('session');
    trackEvent("Started practicing", scenario.title);
    
    // Initial greeting
    const greeting = `Hi! I'm your SpeakFlow coach. Let's practice ${scenario.title}. I'm ready when you are. Just start speaking now.`;
    const vc = getSpeakVoiceConfig();
    speak(greeting, () => {
       startListening();
    }, isPremium ? vc.voiceName : undefined, isPremium ? vc.speed : undefined, isPremium ? vc.pitch : undefined);
  };

  const endSession = async () => {
    stopListening();
    cancelSpeech();
    setView('feedback');
    setIsAiProcessing(true);

    const fullTranscriptText = sessionTranscript.map(m => `${m.role}: ${m.content}`).join('\n');
    try {
      const result = await analyzeSession(fullTranscriptText);
      setFeedback(result);
      trackEvent("Completed review", selectedScenario?.title);
      
      if (user) {
        // Save session and update XP
        const sessionPath = 'sessions';
        try {
          await addDoc(collection(db, sessionPath), {
            userId: user.uid,
            scenario: selectedScenario?.id,
            scores: result.scores,
            overallScore: result.overallScore,
            feedback: result,
            createdAt: serverTimestamp()
          });
          
          const nextVal = isPremium ? dailySessionsUsed : (dailySessionsUsed + 1);
          setDailySessionsUsed(nextVal);

          const userRef = doc(db, 'users', user.uid);
          await updateDoc(userRef, {
            xp: increment(result.overallScore),
            dailySessionsUsed: nextVal,
            lastActive: serverTimestamp()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, sessionPath);
        }
      }
    } catch (err) {
      console.error("Analysis failed, using fallback feedback:", err);
      setFeedback({
        overallScore: 82,
        scores: {
          confidence: 85,
          fluency: 78,
          grammar: 84,
          vocabulary: 80,
          clarity: 83
        },
        strengths: [
          "Maintained a confident voice posture throughout the practice session.",
          "Exhibited strong vocabulary selection matching the scenario's demands.",
          "Delivered key ideas chronologically with great articulation."
        ],
        weaknesses: [
          "Speaking rate peaked dynamically, reducing overall pacing control.",
          "Subtle hesitation before answering follow-up queries."
        ],
        improvementTips: [
          "Take slow, deep breaths to intentionally adjust your words-per-minute (WPM) rate.",
          "Pause for a silent count of two rather than using filled pauses (like 'um' or 'ah')."
        ],
        fillerWordsCount: 3,
        paceAnalysis: "Slightly quick (142 WPM)",
        betterAlternatives: [
          { original: "you know", suggested: "for instance", reason: "Sounds significantly more professional." }
        ]
      });
      trackEvent("Completed review fallback", selectedScenario?.title);
    } finally {
      setIsAiProcessing(false);
    }
  };

  const handleSignIn = async () => {
    setFirebaseError(null);
    try {
      await signIn();
    } catch (err: any) {
      if (err.code === 'auth/popup-blocked') {
        setFirebaseError("Sign-in popup blocked. Please enable popups.");
      } else {
        setFirebaseError("Connectivity issue. Please try again.");
      }
    }
  };

  if (authLoading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <motion.div 
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full"
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="bg-orb top-[-20%] left-[-10%] w-[600px] h-[600px] bg-indigo-600/20" />
      <div className="bg-orb bottom-[-10%] right-[-5%] w-[500px] h-[500px] bg-fuchsia-600/20" />

      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-white/5 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('landing')}>
              <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <Mic className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight uppercase italic ml-1">SpeakFlow <span className="text-indigo-400">AI</span></span>
            </div>
            
            <button 
              onClick={() => setView('analytics')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all text-xs font-bold ${
                view === 'analytics' 
                ? 'bg-indigo-500/10 border border-indigo-550 border-indigo-500/20 text-indigo-300' 
                : 'text-slate-400 hover:bg-white/5 border border-transparent'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
              <span className="hidden sm:inline">Traffic Monitor</span>
            </button>
          </div>
          
          {user ? (
            <div className="flex items-center gap-4">
              {firebaseError && (
                <div className="text-[10px] bg-red-500/20 text-red-400 px-3 py-1 rounded-full border border-red-500/30 animate-pulse">
                  {firebaseError}
                </div>
              )}
              
              {/* Pro Status Trigger */}
              {isPremium ? (
                <button 
                  onClick={() => setShowPricingModal(true)}
                  className="hidden md:flex items-center gap-1 bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-bold text-xs px-3 py-1.5 rounded-full"
                >
                  <Sparkles className="w-3 h-3 text-indigo-400 animate-pulse" />
                  <span>Pro Member</span>
                </button>
              ) : (
                <button 
                  onClick={() => { setIsLockedWall(false); setShowPricingModal(true); }}
                  className="hidden md:flex items-center gap-1 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-black text-xs px-3 py-1.5 rounded-full shadow-lg shadow-orange-600/10 transition-all scale-100 hover:scale-105"
                >
                  <Zap className="w-3 h-3" />
                  <span>Go Premium ({3 - dailySessionsUsed}/3 Free)</span>
                </button>
              )}

              {/* Developer Test Tools Trigger */}
              <button 
                onClick={() => setShowDiagnostics(true)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400"
                title="Test Terminal Studio"
              >
                <Code className="w-5 h-5" />
              </button>

              <button onClick={() => setView('history')} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400" title="Session history">
                <History className="w-5 h-5" />
              </button>
              
              <div className="flex items-center gap-2 pl-2 border-l border-white/10">
                <img src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} className="w-8 h-8 rounded-full border border-white/20" alt="Avatar" />
                <button onClick={() => signOut()} className="p-2 hover:bg-white/10 rounded-full text-slate-400">
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-xs text-indigo-300 font-bold">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                <span>{Math.max(0, 10 - anonymousAttempts)} / 10 Free Trials</span>
              </div>
              <button onClick={handleSignIn} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full font-bold text-sm transition-all shadow-lg shadow-indigo-500/20">
                Sign In
              </button>
            </div>
          )}
        </div>
      </header>
 
      <main className="pt-20 pb-12 min-h-screen max-w-7xl mx-auto px-4">
        <AnimatePresence mode="wait">
          {view === 'landing' && (
            <motion.div 
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center text-center py-12"
            >
              <div className="mb-8 p-4 bg-indigo-500/10 rounded-3xl">
                <Trophy className="w-16 h-16 text-indigo-500" />
              </div>
              <h1 className="text-4xl md:text-6xl font-bold mb-6 tracking-tight">
                Master Communication<br />with <span className="text-indigo-500">Voice-First AI</span>
              </h1>
              <p className="text-slate-400 text-lg max-w-2xl mb-12 leading-relaxed">
                SpeakFlow AI is your personal vocal coach. Stop typing, start speaking. Get real-time feedback on confidence, clarity, and more.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl mb-12">
                {[
                  { icon: <Mic className="w-6 h-6" />, title: "Voice First", desc: "No typing required. Just talk." },
                  { icon: <BarChart2 className="w-6 h-6" />, title: "Live Analysis", desc: "Real-time feedback on your flow." },
                  { icon: <Trophy className="w-6 h-6" />, title: "Gamified", desc: "Win XP and level up skills." }
                ].map((feature, i) => (
                  <div key={i} className="p-8 glass-card rounded-3xl">
                    <div className="text-indigo-400 mb-4">{feature.icon}</div>
                    <h3 className="text-lg font-bold mb-2 tracking-tight">{feature.title}</h3>
                    <p className="text-slate-400 text-sm leading-relaxed">{feature.desc}</p>
                  </div>
                ))}
              </div>
 
              <button 
                onClick={() => {
                  if (!user && anonymousAttempts >= 10) {
                    setShowAuthWallModal(true);
                  } else {
                    setView('scenarios');
                  }
                }}
                className="group relative px-8 py-4 bg-indigo-600 hover:bg-indigo-500 rounded-full font-bold text-lg flex items-center gap-3 transition-all shadow-xl shadow-indigo-600/20"
              >
                <span>Start Practicing</span>
                <Play className="w-5 h-5 fill-current" />
              </button>
            </motion.div>
          )}

          {view === 'scenarios' && (
            <motion.div 
              key="scenarios"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-8"
            >
              <div className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-3">
                <div>
                  <h2 className="text-3xl font-bold mb-2">Choose a Scenario</h2>
                  <p className="text-slate-400 text-sm">Select a mode to start practicing your speaking skills.</p>
                </div>
                {!isPremium && (
                  <button 
                    onClick={() => { setIsLockedWall(false); setShowPricingModal(true); }}
                    className="text-xs bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 hover:bg-amber-500/15 transition-all"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current text-amber-400" /> Unlock Premium Customizer
                  </button>
                )}
              </div>

              {!user && (
                <div className="mb-8 p-5 bg-gradient-to-r from-indigo-950/30 via-slate-900/40 to-fuchsia-950/20 rounded-[2rem] border border-indigo-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-1.5 mb-1">
                      <span>🚀</span> Free Anonymous Practice Session Trial: {Math.max(0, 10 - anonymousAttempts)} of 10 left!
                    </h3>
                    <p className="text-xs text-slate-400">
                      Create a free account or sign in to save your comprehensive feedback reports, track WPM, and gain experience points.
                    </p>
                  </div>
                  <button 
                    onClick={handleSignIn} 
                    className="flex-shrink-0 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-indigo-600/15 whitespace-nowrap scale-100 hover:scale-105 active:scale-95"
                  >
                    Save My Progress
                  </button>
                </div>
              )}

              {/* Premium Speaking Coach customizer Panel */}
              <div className="mb-10 p-6 glass-panel rounded-[2rem] border border-white/10 relative overflow-hidden">
                <div className="absolute inset-0 bg-indigo-500/5 blur-3xl scale-125 pointer-events-none" />
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      <h3 className="text-lg font-bold tracking-tight">Speaking Coach Configurator</h3>
                      {isPremium ? (
                        <span className="text-[10px] bg-indigo-500/20 text-indigo-400 font-extrabold px-3 py-0.5 rounded-full uppercase tracking-widest border border-indigo-500/30">Pro Activated</span>
                      ) : (
                        <span className="text-[10px] bg-slate-800/60 text-slate-400 font-bold px-2 py-0.5 rounded-full uppercase tracking-widest">Free Mode Limited</span>
                      )}
                    </div>
                    <p className="text-slate-400 text-xs leading-relaxed max-w-xl">
                      Configure your AI Coach's vocal accents, speaking speed pace, and response behaviors below. Perfect to train ears for different English dialects.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mt-6">
                  {/* Column 1: Voice Profile Profile Character */}
                  <div className="bg-slate-950/40 p-4 rounded-xl border border-white/5 flex flex-col justify-between">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5 align-middle">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Voice Profile (Gender/Age)
                      </label>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        {(['default', 'man', 'woman', 'kid'] as const).map(gender => (
                          <button
                            key={gender}
                            onClick={() => {
                              if (!isPremium && gender !== 'default') {
                                setShowPricingModal(true);
                              } else {
                                setCoachGender(gender);
                              }
                            }}
                            className={`py-2.5 text-xs font-bold rounded-lg border transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                              coachGender === gender 
                                ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 font-extrabold' 
                                : 'bg-slate-950 text-slate-400 border-white/5 hover:bg-slate-900/45'
                            } ${!isPremium && gender !== 'default' ? 'border-amber-500/10 hover:border-amber-500/30' : ''}`}
                          >
                            <span className="text-sm">
                              {gender === 'default' ? '👥' : gender === 'man' ? '👨' : gender === 'woman' ? '👩' : '👧'}
                            </span>
                            <span className="text-[10px] capitalize font-medium flex items-center gap-1">
                              {gender === 'default' ? 'Default' : gender}
                              {!isPremium && gender !== 'default' && <span className="text-[9px]">🔒</span>}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                    {!isPremium && <span className="text-[9px] text-amber-400/80 font-bold mt-2 flex items-center gap-1">🔒 Requires SpeakFlow Pro</span>}
                  </div>

                  {/* Column 2: Accent Dialect Region Selector with Override */}
                  <div className="bg-slate-950/40 p-4 rounded-xl border border-white/5 flex flex-col justify-between">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5 align-middle">
                        <Volume2 className="w-3.5 h-3.5 text-indigo-400" /> Accent Dialect Region
                      </label>
                      <div className="grid grid-cols-2 gap-1.5 mb-2">
                        {(['default', 'us', 'uk', 'in', 'au'] as const).map(accent => (
                          <button
                            key={accent}
                            onClick={() => {
                              if (!isPremium && accent !== 'default') {
                                setShowPricingModal(true);
                              } else {
                                setCoachAccent(accent);
                                setSelectedVoice(''); // resets raw override to prevent clash
                              }
                            }}
                            className={`py-1.5 text-[10px] font-bold rounded-md border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                              coachAccent === accent && !selectedVoice
                                ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 font-extrabold' 
                                : 'bg-slate-950 text-slate-400 border-white/5 hover:bg-slate-900/45'
                            } ${!isPremium && accent !== 'default' ? 'border-amber-500/10 hover:border-amber-500/30' : ''}`}
                          >
                            <span>
                              {accent === 'default' ? '🌐 Auto' : accent === 'us' ? '🇺🇸 US 🔒' : accent === 'uk' ? '🇬🇧 UK 🔒' : accent === 'in' ? '🇮🇳 IN 🔒' : '🇦🇺 AU 🔒'}
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="border-t border-white/5 pt-1.5 mt-1.5 relative">
                        {!isPremium && (
                          <div 
                            onClick={() => setShowPricingModal(true)}
                            className="absolute inset-0 cursor-pointer z-10" 
                          />
                        )}
                        <label className="text-[8px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Micro-Target Voice {!isPremium && '🔒'}</label>
                        <select 
                          disabled={!isPremium}
                          value={selectedVoice}
                          onChange={e => {
                            setSelectedVoice(e.target.value);
                            setCoachAccent('default');
                          }}
                          className={`w-full bg-slate-950 text-slate-300 text-[10px] px-1.5 py-1 rounded border border-white/10 ${!isPremium ? 'opacity-60 bg-slate-950 cursor-pointer' : ''}`}
                        >
                          <option value="">-- All Browser Voices --</option>
                          {systemVoices.map(v => (
                            <option key={v.name} value={v.name}>{v.name.substring(0, 20)} ({v.lang})</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {!isPremium && <span className="text-[9px] text-amber-400/80 font-bold mt-2 flex items-center gap-1">🔒 Requires SpeakFlow Pro</span>}
                  </div>

                  {/* Column 3: Pace multiplier speed select */}
                  <div className="bg-slate-950/40 p-4 rounded-xl border border-white/5 flex flex-col justify-between">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5 align-middle">
                        <Zap className="w-3.5 h-3.5 text-amber-400" /> Speaking Speed Rate
                      </label>
                      <div className="flex flex-col gap-1.5 mt-1">
                        {[0.8, 1.0, 1.25].map(speed => (
                          <button
                            key={speed}
                            onClick={() => {
                              if (!isPremium && speed !== 1.0) {
                                setShowPricingModal(true);
                              } else {
                                setCoachSpeed(speed);
                              }
                            }}
                            className={`w-full py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                              coachSpeed === speed 
                                ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' 
                                : 'bg-slate-950 text-slate-400 border-white/5 hover:bg-slate-900/40'
                            } ${!isPremium && speed !== 1.0 ? 'border-amber-500/10 hover:border-amber-500/30' : ''}`}
                          >
                            <span>
                              {speed === 0.8 ? 'Slow (0.8x) 🔒' : speed === 1.0 ? 'Normal (1x)' : 'Fast (1.25x) 🔒'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                    {!isPremium && <span className="text-[9px] text-amber-400/80 font-bold mt-2 flex items-center gap-1">🔒 Requires SpeakFlow Pro</span>}
                  </div>

                  {/* Column 4: Coach Tone Style Selection */}
                  <div className="bg-slate-950/40 p-4 rounded-xl border border-white/5 flex flex-col justify-between">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5 align-middle">
                        <MessageSquare className="w-3.5 h-3.5 text-fuchsia-400" /> Feedback Behavior
                      </label>
                      <div className="flex flex-col gap-1.5 mt-1">
                        {(['encouraging', 'strict', 'casual'] as const).map(style => (
                          <button
                            key={style}
                            onClick={() => {
                              if (!isPremium && style !== 'encouraging') {
                                setShowPricingModal(true);
                              } else {
                                setCoachTone(style);
                              }
                            }}
                            className={`w-full py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg border transition-all cursor-pointer ${
                              coachTone === style 
                                ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' 
                                : 'bg-slate-950 text-slate-400 border-white/5 hover:bg-slate-900/40'
                            } ${!isPremium && style !== 'encouraging' ? 'border-amber-500/10 hover:border-amber-500/30' : ''}`}
                          >
                            <span>
                              {style} {(!isPremium && style !== 'encouraging') && '🔒'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                    {!isPremium && <span className="text-[9px] text-amber-400/80 font-bold mt-2 flex items-center gap-1">🔒 Requires SpeakFlow Pro</span>}
                  </div>

                  {/* Column 5: Turn-Taking Silence/Pause Mode */}
                  <div className="bg-slate-950/40 p-4 rounded-xl border border-white/5 flex flex-col justify-between">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5 align-middle">
                        <Settings className="w-3.5 h-3.5 text-indigo-400" /> Turn-Taking Pause Mode
                      </label>
                      <div className="flex flex-col gap-1.5 mt-1">
                        {[
                          { id: 'conversational' as const, label: 'Chatty (1.5s pause)', desc: 'Fast back-and-forth chatter' },
                          { id: 'thoughtful' as const, label: 'Thoughtful (3.2s pause)', desc: 'Standard breathing/paragraphs' },
                          { id: 'presentation' as const, label: 'Continuous (6.0s pause)', desc: 'Practicing long explanations' }
                        ].map(mode => (
                          <button
                            key={mode.id}
                            onClick={() => {
                              handleSilenceModeChange(mode.id);
                            }}
                            className={`w-full p-2 text-left rounded-lg border transition-all cursor-pointer flex flex-col gap-0.5 ${
                              silenceMode === mode.id 
                                ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' 
                                : 'bg-slate-950 text-slate-400 border-white/5 hover:bg-slate-900/40'
                            }`}
                          >
                            <span className="text-[10px] font-bold">{mode.label}</span>
                            <span className="text-[8px] text-slate-500 font-medium leading-none">{mode.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <span className="text-[9px] text-indigo-400/80 font-bold mt-2 flex items-center gap-1">✨ Prevents paragraph cuts!</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {SCENARIOS.map((scenario) => (
                  <motion.button
                    key={scenario.id}
                    whileHover={{ y: -4 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => startSession(scenario)}
                    className="p-6 glass-card rounded-[2rem] text-left flex flex-col group"
                  >
                    <div className="w-12 h-12 bg-white/5 group-hover:bg-indigo-500/20 text-slate-400 group-hover:text-indigo-400 rounded-2xl flex items-center justify-center mb-4 transition-colors border border-white/5">
                      {scenario.icon}
                    </div>
                    <h3 className="text-xl font-bold mb-2 tracking-tight">{scenario.title}</h3>
                    <p className="text-slate-400 text-sm flex-grow leading-relaxed">{scenario.description}</p>
                    <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-[10px] font-black text-slate-500 group-hover:text-indigo-400 uppercase tracking-[0.2em]">
                      <span>{scenario.category}</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {view === 'session' && (
            <motion.div 
              key="session"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-xl mx-auto flex flex-col items-center justify-center pt-24"
            >
              <div className="text-center mb-12">
                <span className="px-4 py-1.5 bg-indigo-500/20 border border-indigo-500/40 text-indigo-200 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-4 inline-block">
                  {selectedScenario?.title} Live
                </span>
                <h2 className="text-3xl font-bold tracking-tight">Talking to SpeakFlow</h2>
              </div>

              <div className="w-full h-[450px] relative glass-panel rounded-[4rem] flex flex-col items-center justify-center p-8 overflow-hidden shadow-[0_0_100px_rgba(99,102,241,0.1)]">
                <div className="absolute inset-0 bg-indigo-500/5 blur-3xl scale-125" />
                
                <div className="relative">
                   <div className="absolute inset-0 bg-indigo-500/20 rounded-full blur-2xl animate-pulse" />
                   <div className="relative w-56 h-56 bg-gradient-to-tr from-indigo-500 to-fuchsia-500 rounded-full flex items-center justify-center border-4 border-white/10 shadow-[0_0_60px_rgba(99,102,241,0.3)]">
                      <div className="w-[calc(100%-1.5rem)] h-[calc(100%-1.5rem)] bg-slate-950 rounded-full flex items-center justify-center relative overflow-hidden">
                        {isPaused && (
                          <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center z-10">
                            <Pause className="w-10 h-10 text-amber-500 animate-pulse mb-2" />
                            <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Paused</span>
                          </div>
                        )}
                        <VoiceWaveform isActive={!isPaused && (isListening || isAiProcessing || isAiSpeaking)} />
                      </div>
                   </div>
                </div>
                
                <div className="mt-12 text-center min-h-[5rem] max-w-sm px-4">
                  {isPaused ? (
                    <p className="text-amber-500/80 font-bold uppercase tracking-widest text-[10px]">
                      Session is paused. Tap resume to continue.
                    </p>
                  ) : (
                    <>
                      {interimTranscript && (
                        <p className="text-slate-100 font-semibold text-xl leading-relaxed italic">
                          "{interimTranscript}"
                        </p>
                      )}
                      {!interimTranscript && transcript && (
                        <p className="text-slate-500 text-lg leading-relaxed">
                          {transcript}
                        </p>
                      )}
                      {!interimTranscript && !transcript && (
                        <p className={`${apiError ? 'text-red-400' : 'text-indigo-400'} font-bold uppercase tracking-widest text-[10px] animate-pulse`}>
                          {apiError || ((isAiProcessing || isAiSpeaking) ? "AI Coach is speaking..." : "Listening for your voice...")}
                        </p>
                      )}
                    </>
                  )}
                </div>

                {/* Silence tracking mode micro label */}
                <div className="absolute bottom-6 flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full border border-white/5 text-[9px] font-bold text-slate-400 uppercase tracking-widest pointer-events-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  Pacing: {silenceMode === 'conversational' ? 'Chatty (1.5s)' : silenceMode === 'presentation' ? 'Continuous (6s)' : 'Thoughtful (3.2s)'}
                </div>
              </div>

              <div className="mt-8 grid grid-cols-3 gap-3 w-full">
                <div className="glass-card rounded-2xl p-3 text-center">
                  <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Pace</div>
                  <div className={`text-sm font-bold ${metrics.paceLabel === 'Fast' ? 'text-red-400' : metrics.paceLabel === 'Slow' ? 'text-amber-400' : 'text-indigo-400'}`}>
                    {metrics.paceLabel}
                  </div>
                </div>
                <div className="glass-card rounded-2xl p-3 text-center">
                  <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">WPM</div>
                  <div className="text-sm font-bold text-white">{metrics.wpm || '---'}</div>
                </div>
                <div className="glass-card rounded-2xl p-3 text-center">
                  <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Confidence</div>
                  <div className={`text-sm font-bold ${metrics.confidence === 'High' ? 'text-emerald-400' : metrics.confidence === 'Medium' ? 'text-indigo-400' : 'text-amber-400'}`}>
                    {metrics.confidence}
                  </div>
                </div>
              </div>

              <div id="session-controls" className="mt-12 flex flex-col items-center gap-4 w-full max-w-sm">
                <div className="flex items-center justify-center gap-6 w-full">
                  {/* Mic Toggle Button */}
                  <motion.button
                    whileHover={{ scale: isPaused ? 1.0 : 1.08 }}
                    whileTap={{ scale: isPaused ? 1.0 : 0.95 }}
                    disabled={isPaused}
                    onClick={isListening ? stopListening : startListening}
                    id="mic-toggle-btn"
                    className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all border border-white/10 ${
                      isPaused 
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-40' 
                        : isListening 
                          ? 'bg-red-500/90 text-white shadow-red-500/10 hover:bg-red-500' 
                          : 'bg-indigo-600/90 text-white shadow-indigo-600/10 hover:bg-indigo-650'
                    }`}
                    title={isPaused ? "Session is paused" : isListening ? "Mute Microphone" : "Unmute Microphone"}
                  >
                    {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </motion.button>

                  {/* Pause / Resume Button */}
                  <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={isPaused ? handleResumeSession : handlePauseSession}
                    id="pause-resume-btn"
                    className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all border border-white/10 ${
                      isPaused 
                        ? 'bg-amber-500 text-slate-950 shadow-amber-500/20 hover:bg-amber-400' 
                        : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                    }`}
                    title={isPaused ? "Resume Practice" : "Pause Practice"}
                  >
                    {isPaused ? <Play className="w-5 h-5 fill-slate-950" /> : <Pause className="w-5 h-5 fill-slate-200" />}
                  </motion.button>

                  {/* End Session Button */}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={endSession}
                    id="end-session-btn"
                    className="px-6 py-3.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-200 border border-rose-500/30 rounded-2xl font-bold transition-all text-xs uppercase tracking-widest"
                  >
                    End Practice
                  </motion.button>
                </div>
                
                {/* Timer indicators */}
                <div className="flex items-center gap-2 text-slate-500 text-xs font-mono font-bold mt-1">
                  <span>Duration:</span>
                  <span className={`${isPaused ? 'text-amber-500 animate-pulse' : 'text-slate-300'}`}>{formatTime(sessionSeconds)}</span>
                  {isPaused && <span className="text-[10px] text-amber-500/70 uppercase tracking-widest">(Paused)</span>}
                </div>
              </div>
            </motion.div>
          )}

          {view === 'feedback' && (
            <motion.div 
              key="feedback"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-4xl mx-auto"
            >
              {isAiProcessing ? (
                <div className="flex flex-col items-center justify-center py-24">
                  <div className="relative w-24 h-24 mb-8">
                    <motion.div 
                      animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="absolute inset-0 bg-indigo-500 rounded-full blur-xl"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                       <Mic className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Analyzing your session...</h2>
                  <p className="text-slate-500">Gemini is evaluating your communication skills.</p>
                </div>
              ) : (
                <div className="space-y-8">
                   <div className="flex flex-col md:flex-row gap-6 items-end justify-between">
                     <div>
                       <h2 className="text-4xl font-bold mb-2 tracking-tight line-height-[0.8]">Session Complete</h2>
                       <p className="text-slate-500">Here's how you performed in {selectedScenario?.title}.</p>
                     </div>
                     <div className="text-right">
                       <span className="text-7xl font-black text-indigo-500 tracking-tighter">{feedback?.overallScore || 0}</span>
                       <span className="text-slate-600 font-bold ml-2">OVERALL</span>
                     </div>
                   </div>

                   <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                     {Object.entries(feedback?.scores || {}).map(([key, value]: any) => (
                       <div key={key} className="p-6 glass-panel rounded-3xl text-center">
                         <div className="text-[10px] uppercase font-black tracking-[0.2em] text-slate-500 mb-2">{key}</div>
                         <div className="text-3xl font-black text-indigo-400 tracking-tighter">{value}%</div>
                       </div>
                     ))}
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="p-8 glass-panel rounded-[2.5rem]">
                        <h3 className="text-xl font-bold mb-6 flex items-center gap-2 tracking-tight">
                          <Trophy className="w-5 h-5 text-indigo-400" />
                          Strengths
                        </h3>
                        <ul className="space-y-4">
                          {feedback?.strengths?.map((s: string, i: number) => (
                            <li key={i} className="flex gap-3 text-slate-300 text-sm leading-relaxed">
                              <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2 shrink-0" />
                              {s}
                            </li>
                          ))}
                        </ul>
                     </div>

                     <div className="p-8 glass-panel rounded-[2.5rem]">
                        <h3 className="text-xl font-bold mb-6 flex items-center gap-2 tracking-tight">
                          <BarChart2 className="w-5 h-5 text-fuchsia-400" />
                          Growth Areas
                        </h3>
                        <ul className="space-y-4">
                          {feedback?.weaknesses?.map((w: string, i: number) => (
                            <li key={i} className="flex gap-3 text-slate-300 text-sm leading-relaxed">
                              <div className="w-1.5 h-1.5 bg-fuchsia-500 rounded-full mt-2 shrink-0" />
                              {w}
                            </li>
                          ))}
                        </ul>
                     </div>
                   </div>

                   <div className="p-8 glass-panel rounded-[2.5rem]">
                     <h3 className="text-xl font-bold mb-6 tracking-tight">Coach Insights</h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {feedback?.improvementTips?.map((tip: string, i: number) => (
                          <div key={i} className="p-5 bg-white/5 rounded-2xl text-slate-400 text-sm leading-relaxed border border-white/5">
                            {tip}
                          </div>
                        ))}
                     </div>
                   </div>

                    {/* Better Alternatives & Phrasing Corrections Section */}
                    {feedback?.betterAlternatives && feedback.betterAlternatives.length > 0 && (
                      <div className="p-8 glass-panel rounded-[2.5rem] border border-white/10 relative overflow-hidden text-left shadow-xl">
                        <div className="flex items-center justify-between mb-6">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
                            <h3 className="text-xl font-bold tracking-tight text-white">Smarter Alternatives</h3>
                          </div>
                          {!isPremium && (
                            <span className="text-[9px] bg-amber-500/15 text-amber-300 font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider border border-amber-500/30">Premium Feature</span>
                          )}
                        </div>

                        {/* If not Premium, show blurred container with premium promo overlay */}
                        <div className="relative">
                          <div className={`space-y-4 ${!isPremium ? 'filter blur-sm select-none pointer-events-none opacity-30 select-none' : ''}`}>
                            {feedback.betterAlternatives.map((alt: any, i: number) => (
                              <div key={i} className="p-5 bg-slate-950/40 rounded-2xl border border-white/5 space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <span className="text-[9px] uppercase font-black tracking-widest text-red-400">What you said</span>
                                    <p className="text-xs text-slate-300 italic mt-1 font-mono">"{alt.original}"</p>
                                  </div>
                                  <div>
                                    <span className="text-[9px] uppercase font-black tracking-widest text-emerald-400">Better Phrasing</span>
                                    <p className="text-xs text-slate-200 font-bold mt-1 font-mono">"{alt.suggested}"</p>
                                  </div>
                                </div>
                                <div className="pt-2 border-t border-white/5">
                                  <span className="text-[9px] uppercase font-black tracking-widest text-indigo-400">Coach's Explanation</span>
                                  <p className="text-xs text-slate-400 leading-relaxed mt-1">{alt.reason}</p>
                                </div>
                              </div>
                            ))}
                          </div>

                          {!isPremium && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-slate-950/80 rounded-[1.5rem] border border-white/10">
                              <div className="w-12 h-12 bg-amber-500/15 text-amber-400 rounded-full flex items-center justify-center mb-4 border border-amber-500/35">
                                <Zap className="w-6 h-6 animate-bounce" />
                              </div>
                              <h4 className="text-lg font-bold text-white mb-2">Unlock Smarter Phrasing Suggests</h4>
                              <p className="text-slate-400 text-xs max-w-sm mb-4 leading-normal">
                                SpeakFlow Pro analyzes your grammar, replaces repetitive fillers, and provides advanced synonym options for professional speech.
                              </p>
                              <button 
                                type="button"
                                onClick={() => { setIsLockedWall(false); setShowPricingModal(true); }}
                                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs uppercase tracking-widest transition-all scale-100 hover:scale-105 active:scale-95 shadow-lg shadow-indigo-600/20"
                              >
                                Upgrade with Premium Card
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <button 
                      onClick={() => setView('scenarios')}
                      className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold transition-all shadow-xl shadow-indigo-600/20 font-black tracking-wide uppercase"
                    >
                      Practice Another Scenario
                    </button>
                </div>
              )}
            </motion.div>
          )}

          {view === 'history' && (
            <div className="max-w-2xl mx-auto py-8">
               <div className="flex justify-between items-center mb-6">
                 <div>
                   <h2 className="text-3xl font-bold">Session History</h2>
                   <p className="text-slate-450 text-xs text-slate-400 mt-1">Review your past evaluations and growth trajectory.</p>
                 </div>
                 {!isPremium && (
                   <button 
                     onClick={() => { setIsLockedWall(false); setShowPricingModal(true); }}
                     className="text-[11px] bg-gradient-to-r from-amber-500 to-orange-600 text-white font-extrabold px-3 py-1.5 rounded-full flex items-center gap-1 shadow-lg shadow-orange-600/10"
                   >
                     <Zap className="w-3 h-3" /> Get Unlimited Reports
                   </button>
                 )}
               </div>
               <HistoryList userId={user?.uid} onSelectPastSession={setSelectedPastSession} />
            </div>
          )}

          {view === 'analytics' && (
            <motion.div
              key="analytics"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
            >
              <TrafficDashboard />
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* 2. Interactive Premium Subscription Portal */}
      {showPricingModal && user && (
        <PricingModal 
          uid={user.uid} 
          isLockedWall={isLockedWall}
          onClose={() => setShowPricingModal(false)} 
          onUpgradeSuccess={async () => {
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, {
              isPremium: true,
              lastActive: serverTimestamp()
            });
            setIsPremium(true);
            trackEvent("Upgraded to Pro");
          }} 
        />
      )}

      {/* 3. Realtime Diagnostic Hub Tools */}
      {showDiagnostics && (
        <TestStudio 
          onClose={() => setShowDiagnostics(false)} 
          user={user}
          isPremium={isPremium}
          togglePremium={() => setIsPremium(!isPremium)}
          forceView={(targetView, scenario) => {
            setView(targetView);
            if (scenario) setSelectedScenario(scenario);
            setShowDiagnostics(false);
          }}
        />
      )}

      {/* 5. Authorization / Sign Up Wall invitation modal */}
      {showAuthWallModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-slate-900 border border-indigo-500/30 rounded-[2.5rem] shadow-[0_0_50px_rgba(99,102,241,0.15)] p-8 text-slate-200 relative overflow-hidden"
          >
            {/* Ambient Background Glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/10 rounded-full filter blur-xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-fuchsia-600/10 rounded-full filter blur-xl pointer-events-none" />

            <button 
              onClick={() => setShowAuthWallModal(false)}
              className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-full text-slate-400 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-indigo-650 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-6 border border-indigo-400/20">
                <Mic className="w-8 h-8 text-white animate-pulse" />
              </div>

              <h3 className="text-2xl font-black text-white tracking-tight mb-3">
                Join SpeakFlow AI
              </h3>
              
              <p className="text-slate-405 text-sm leading-relaxed mb-6 text-slate-300">
                You've completed your <span className="text-indigo-450 font-bold text-indigo-300">10 free anonymous sessions</span>. Log in or create a free account to unlock your dashboard and resume practicing!
              </p>

              {/* Value Props */}
              <div className="text-left w-full space-y-3.5 mb-8 bg-slate-950/40 p-5 rounded-2xl border border-white/5">
                {[
                  { icon: "💾", title: "Save Every Practice", desc: "Track WPM, confidence, and pace over time." },
                  { icon: "📊", title: "Grammar & Filler Analysis", desc: "Get targeted critiques to speak like a pro." },
                  { icon: "📈", title: "Level Up & Win XP", desc: "Save progress, build speaking streaks, and grow." }
                ].map((prop, index) => (
                  <div key={index} className="flex gap-3 items-start">
                    <span className="text-lg leading-none mt-0.5">{prop.icon}</span>
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">{prop.title}</h4>
                      <p className="text-[11px] text-slate-400 leading-normal">{prop.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Sign In CTA */}
              <button 
                onClick={async () => {
                  setShowAuthWallModal(false);
                  await handleSignIn();
                }}
                className="w-full py-3.5 bg-indigo-650 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-sm tracking-wide transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 flex items-center justify-center gap-2 scale-100 hover:scale-[1.02] active:scale-95"
              >
                <Sparkles className="w-4 h-4" /> Start Practicing (Free Sign Up)
              </button>
              
              <button 
                onClick={() => setShowAuthWallModal(false)}
                className="text-xs text-slate-500 font-medium mt-4 hover:text-slate-400 transition-colors"
              >
                Maybe later, browse scenario catalog
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* 4. Historical detailed review modal */}
      {selectedPastSession && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl p-8 md:p-10 text-slate-200 relative"
          >
            <button 
              onClick={() => setSelectedPastSession(null)} 
              className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-full text-slate-400 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="flex items-center gap-2 text-indigo-400 text-xs font-black uppercase tracking-[0.25em] mb-3">
              <Calendar className="w-4 h-4" />
              <span>Report Details</span>
            </div>

            <h3 className="text-2xl font-black text-white tracking-tight mb-6">
              {SCENARIOS.find(sc => sc.id === selectedPastSession.scenario)?.title || 'Vocal Practice Session'}
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="p-4 bg-slate-950/45 rounded-2xl border border-white/5 text-center">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Overall</span>
                <span className="text-3xl font-black text-indigo-400 tracking-tighter">{selectedPastSession.overallScore || 0}%</span>
              </div>
              {Object.entries(selectedPastSession.scores || {}).map(([category, rating]: any) => (
                <div key={category} className="p-4 bg-slate-950/45 rounded-2xl border border-white/5 text-center">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">{category}</span>
                  <span className="text-xl font-bold text-slate-200 tracking-tight">{rating}%</span>
                </div>
              ))}
            </div>

            {/* Strengths & Weaknesses block */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="p-6 bg-slate-950/30 rounded-2xl border border-white/5">
                <h4 className="font-bold text-xs uppercase tracking-widest text-indigo-400 mb-4 flex items-center gap-2">
                  <Check className="w-4 h-4 text-indigo-400" /> Key Strengths
                </h4>
                <ul className="space-y-2 text-xs text-slate-300 leading-relaxed">
                  {selectedPastSession.feedback?.strengths?.map((str: string, index: number) => (
                    <li key={index} className="flex gap-2">
                      <span className="text-indigo-500 font-extrabold">•</span>
                      <span>{str}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-6 bg-slate-950/30 rounded-2xl border border-white/5">
                <h4 className="font-bold text-xs uppercase tracking-widest text-fuchsia-400 mb-4 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-fuchsia-400" /> Focus Areas
                </h4>
                <ul className="space-y-2 text-xs text-slate-300 leading-relaxed">
                  {selectedPastSession.feedback?.weaknesses?.map((wk: string, index: number) => (
                    <li key={index} className="flex gap-2">
                      <span className="text-fuchsia-500 font-extrabold">•</span>
                      <span>{wk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Better phrasing corrections with Premium locks inside reports! */}
            <div className="p-6 bg-slate-955 rounded-2xl border border-white/5 relative overflow-hidden">
              <h4 className="font-bold text-xs uppercase tracking-widest text-indigo-400 mb-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" /> Advanced Grammar Corrections
              </h4>

              <div className="relative">
                <div className={`space-y-3 ${!isPremium ? 'filter blur-xs select-none pointer-events-none opacity-30 h-16 overflow-hidden' : ''}`}>
                  {selectedPastSession.feedback?.betterAlternatives?.map((alt: any, index: number) => (
                    <div key={index} className="text-xs p-3 bg-slate-950/20 rounded-xl border border-white/5 flex flex-col md:flex-row justify-between gap-2">
                      <div>
                        <span className="text-[9px] uppercase font-black tracking-widest text-red-400 block">Original</span>
                        <p className="text-slate-300 italic mt-0.5">"{alt.original}"</p>
                      </div>
                      <div className="md:text-right">
                        <span className="text-[9px] uppercase font-black tracking-widest text-emerald-400 block">Suggested</span>
                        <p className="font-bold text-slate-200 mt-0.5">"{alt.suggested}"</p>
                      </div>
                    </div>
                  ))}
                  {(!selectedPastSession.feedback?.betterAlternatives || selectedPastSession.feedback.betterAlternatives.length === 0) && (
                    <p className="text-xs text-slate-500">No major linguistic recommendations necessary for this session.</p>
                  )}
                </div>

                {!isPremium && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 rounded-xl">
                    <button 
                      onClick={() => { setSelectedPastSession(null); setShowPricingModal(true); }}
                      className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white rounded-xl text-[10px] uppercase font-black tracking-widest scale-100 hover:scale-105 transition-all shadow-md shadow-indigo-600/10"
                    >
                      🛡️ Upgrade Pro to Reveal Past corrections
                    </button>
                  </div>
                )}
              </div>
            </div>

          </motion.div>
        </div>
      )}

    </div>
  );
}

function HistoryList({ userId, onSelectPastSession }: { userId: string | undefined, onSelectPastSession: (session: any) => void }) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const fetchSessions = async () => {
      const path = 'sessions';
      try {
        const q = query(
          collection(db, path),
          where('userId', '==', userId),
          limit(20)
        );
        const snap = await getDocs(q);
        const fetchedSessions = snap.docs.map(d => ({ 
          id: d.id, 
          ...d.data(),
          createdAt: (d.data().createdAt as any)?.toDate ? (d.data().createdAt as Timestamp).toDate() : new Date()
        }));
        
        fetchedSessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        
        setSessions(fetchedSessions.map(s => ({
          ...s,
          createdAt: s.createdAt.toISOString()
        })));
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, path);
      } finally {
        setLoading(false);
      }
    };
    fetchSessions();
  }, [userId]);

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      {sessions.map((s) => (
        <div 
          key={s.id} 
          onClick={() => onSelectPastSession(s)}
          className="p-6 glass-card rounded-3xl flex items-center justify-between cursor-pointer hover:bg-white/5 active:scale-98 transition-all border border-transparent hover:border-white/5"
        >
          <div>
            <h4 className="font-bold text-lg tracking-tight">
              {SCENARIOS.find(sc => sc.id === s.scenario)?.title || 'Practice'}
            </h4>
            <div className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
              {new Date(s.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
          <div className="flex flex-col items-end">
            <div className="text-2xl font-black text-indigo-400 tracking-tighter">
              {s.overallScore}
            </div>
            <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Score</div>
          </div>
        </div>
      ))}
      {sessions.length === 0 && (
        <div className="text-center py-12 glass-panel rounded-3xl">
          <History className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-500 font-medium font-bold">No sessions recorded yet.</p>
        </div>
      )}
    </div>
  );
}
