import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Settings, History, Trophy, Github, LogOut, User as UserIcon, Play, ChevronRight, BarChart2 } from 'lucide-react';
import { useVoice } from './hooks/useVoice';
import { useRealTimeMetrics } from './hooks/useRealTimeMetrics';
import { getChatResponse, analyzeSession } from './lib/gemini';
import { SCENARIOS, Scenario } from './constants/scenarios';
import { VoiceWaveform } from './components/VoiceWaveform';
import { auth, signIn, signOut, db } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, increment, collection, addDoc, query, where, orderBy, limit, getDocs } from 'firebase/firestore';

type View = 'landing' | 'scenarios' | 'session' | 'feedback' | 'history';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>('landing');
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  const [sessionTranscript, setSessionTranscript] = useState<{ role: string; content: string }[]>([]);
  const [feedback, setFeedback] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [sessionSeconds, setSessionSeconds] = useState(0);

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
    if (view === 'session') {
      interval = setInterval(() => {
        setSessionSeconds(s => s + 1);
      }, 1000);
    } else {
      setSessionSeconds(0);
    }
    return () => clearInterval(interval);
  }, [view]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        // Initialize user record if not exists
        const userRef = doc(db, 'users', u.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            userId: u.uid,
            displayName: u.displayName,
            xp: 0,
            level: 1,
            streak: 0,
            createdAt: new Date().toISOString()
          });
        }
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

  // Activity tracker for silence detection
  useEffect(() => {
    if (transcript || interimTranscript) {
      setLastActivity(Date.now());
    }
  }, [transcript, interimTranscript]);

  // Handle Automatic Turn-Taking (Silence Detection)
  useEffect(() => {
    if (isListening && (transcript.trim() || interimTranscript.trim()) && view === 'session') {
      const silenceDuration = 1800; // 1.8s silence
      const checkSilence = setInterval(() => {
        const now = Date.now();
        if (now - lastActivity > silenceDuration && !isAiProcessing && !isAiSpeaking) {
          stopListening();
        }
      }, 500);
      return () => clearInterval(checkSilence);
    }
  }, [isListening, transcript, interimTranscript, view, lastActivity, isAiProcessing, isAiSpeaking]);

  // Handle User Voice Turn-Taking (Auto-trigger AI response after user finishes)
  useEffect(() => {
    if (!isListening && transcript.trim() && view === 'session' && !isAiProcessing) {
      handleUserSpeechFinished(transcript.trim());
    }
  }, [isListening, transcript, view, isAiProcessing]);

  const handleUserSpeechFinished = async (content: string) => {
    if (isAiProcessing) return;
    setApiError(null);
    setSessionTranscript(prev => [...prev, { role: 'user', content }]);
    setTranscript('');
    setIsAiProcessing(true);

    try {
      const response = await getChatResponse(selectedScenario?.title || 'Communication', [
        ...sessionTranscript,
        { role: 'user', content }
      ]);
      
      if (response) {
        setSessionTranscript(prev => [...prev, { role: 'ai', content: response }]);
        setIsAiSpeaking(true);
        speak(response, () => {
          setIsAiSpeaking(false);
          // Restart listening after AI finishes speaking
          startListening();
        });
      } else {
        setApiError("Coach is thinking... just a moment.");
        setTimeout(() => startListening(), 2000);
      }
    } catch (err) {
      console.error(err);
      setApiError("Connection trouble. Let's try again.");
      setTimeout(() => startListening(), 2000);
    } finally {
      setIsAiProcessing(false);
    }
  };

  const startSession = (scenario: Scenario) => {
    setSelectedScenario(scenario);
    setSessionTranscript([]);
    setView('session');
    
    // Initial greeting
    const greeting = `Hi! I'm your SpeakFlow coach. Let's practice ${scenario.title}. I'm ready when you are. Just start speaking now.`;
    speak(greeting, () => {
       startListening();
    });
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
      
      if (user) {
        // Save session and update XP
        const sessionRef = collection(db, 'sessions');
        await addDoc(sessionRef, {
          userId: user.uid,
          scenario: selectedScenario?.id,
          scores: result.scores,
          overallScore: result.overallScore,
          feedback: result,
          createdAt: new Date().toISOString()
        });
        
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          xp: increment(result.overallScore),
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAiProcessing(false);
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
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('landing')}>
            <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Mic className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight uppercase italic ml-1">SpeakFlow <span className="text-indigo-400">AI</span></span>
          </div>
          
          {user ? (
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center bg-white/5 px-4 py-1.5 rounded-full border border-white/10">
                <Trophy className="w-4 h-4 text-orange-400 mr-2" />
                <span className="text-sm font-semibold">12 Day Streak</span>
              </div>
              <button onClick={() => setView('history')} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400">
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
            <button onClick={signIn} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full font-bold text-sm transition-all shadow-lg shadow-indigo-500/20">
              Sign In
            </button>
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
                onClick={() => user ? setView('scenarios') : signIn()}
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
              <div className="mb-12">
                <h2 className="text-3xl font-bold mb-2">Choose a Scenario</h2>
                <p className="text-slate-500">Select a mode to start practicing your speaking skills.</p>
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
                      <div className="w-[calc(100%-1.5rem)] h-[calc(100%-1.5rem)] bg-slate-950 rounded-full flex items-center justify-center">
                         <VoiceWaveform isActive={isListening || isAiProcessing || isAiSpeaking} />
                      </div>
                   </div>
                </div>
                
                <div className="mt-12 text-center min-h-[5rem] max-w-sm px-4">
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

              <div className="mt-12 flex items-center gap-10">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={isListening ? stopListening : startListening}
                  className={`w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all border-4 border-white/10 ${
                    isListening ? 'bg-red-500 shadow-red-500/30' : 'bg-indigo-600 shadow-indigo-600/30'
                  }`}
                >
                  {isListening ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
                </motion.button>

                <div className="flex flex-col items-center">
                  <button 
                    onClick={endSession}
                    className="px-8 py-3 bg-white/5 hover:bg-white/10 backdrop-blur-md border border-white/10 text-slate-100 rounded-full font-bold transition-all text-sm uppercase tracking-widest"
                  >
                    End Session
                  </button>
                  <span className="text-[10px] text-slate-600 font-bold mt-2 tracking-widest">{formatTime(sessionSeconds)}</span>
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

                   <button 
                     onClick={() => setView('scenarios')}
                     className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold transition-all shadow-xl shadow-indigo-600/20"
                   >
                     Practice Again
                   </button>
                </div>
              )}
            </motion.div>
          )}

          {view === 'history' && (
            <div className="max-w-2xl mx-auto py-8">
               <h2 className="text-3xl font-bold mb-8">Session History</h2>
               <HistoryList userId={user?.uid} />
            </div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}

function HistoryList({ userId }: { userId: string | undefined }) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const fetchSessions = async () => {
      const q = query(
        collection(db, 'sessions'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      const snap = await getDocs(q);
      setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
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
        <div key={s.id} className="p-6 glass-card rounded-3xl flex items-center justify-between">
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
          <p className="text-slate-500 font-medium">No sessions recorded yet.</p>
        </div>
      )}
    </div>
  );
}
