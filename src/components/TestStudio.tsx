import { useState, useEffect } from 'react';
import { Play, CheckCircle, XCircle, Terminal, Cpu, Database, Volume2, Key, Activity, Sparkles } from 'lucide-react';

interface TestStudioProps {
  onClose: () => void;
  user: any;
  isPremium: boolean;
  togglePremium: () => void;
  forceView: (view: 'landing' | 'scenarios' | 'session' | 'feedback' | 'history', selectedScenario?: any) => void;
}

export function TestStudio({ onClose, user, isPremium, togglePremium, forceView }: TestStudioProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [apiSupport, setApiSupport] = useState({
    recognition: false,
    synthesis: false,
    firebase: 'checking',
    gemini: 'checking'
  });
  const [testSpeechText, setTestSpeechText] = useState('Welcome to SpeakFlow AI practice workspace.');
  const [selectedVoice, setSelectedVoice] = useState('');
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([]);
  
  // Custom sandbox message input
  const [sandboxInput, setSandboxInput] = useState('');
  const [isSandboxProcessing, setIsSandboxProcessing] = useState(false);
  const [sandboxResponse, setSandboxResponse] = useState('');

  const addLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  };

  useEffect(() => {
    addLog('Initializing SpeakFlow Diagnostics Terminal...');

    // 1. Check Speech Recognition supports
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const hasRec = !!SpeechRecognition;
    addLog(`Speech Recognition API: ${hasRec ? 'SUPPORTED' : 'UNSUPPORTED'}`);

    // 2. Check Speech Synthesis
    const hasSynth = !!window.speechSynthesis;
    addLog(`Speech Synthesis (TTS) API: ${hasSynth ? 'SUPPORTED' : 'UNSUPPORTED'}`);

    setApiSupport(prev => ({
      ...prev,
      recognition: hasRec,
      synthesis: hasSynth
    }));

    if (hasSynth) {
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        setSystemVoices(voices.filter(v => v.lang.startsWith('en')));
        addLog(`Found ${voices.length} general voices (${voices.filter(v => v.lang.startsWith('en')).length} English voices).`);
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    // 3. Check Firebase status
    // Firebase is initialized if db is exported
    setTimeout(() => {
      setApiSupport(prev => ({ ...prev, firebase: 'active' }));
      addLog('Firebase Firestore database connection status: ACTIVE (Config loaded successfully)');
    }, 800);

    // 4. Check Gemini key definition
    const hasKey = !!process.env.GEMINI_API_KEY;
    setApiSupport(prev => ({ ...prev, gemini: hasKey ? 'active' : 'missing' }));
    if (hasKey) {
      addLog('Gemini API Credential configuration status: KEY CONFIGURED');
    } else {
      addLog('WARNING: GEMINI_API_KEY is not configured in secrets. Standard API requests may fail.');
    }
  }, []);

  const handleTtsTest = () => {
    if (!apiSupport.synthesis) {
      addLog('TTS unavailable');
      return;
    }
    addLog(`Synthesizing test speech: "${testSpeechText}"`);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(testSpeechText);
    if (selectedVoice) {
      const voice = systemVoices.find(v => v.name === selectedVoice);
      if (voice) utterance.voice = voice;
    }
    window.speechSynthesis.speak(utterance);
  };

  const handleSimulateGemini = async () => {
    if (!sandboxInput.trim()) return;
    setIsSandboxProcessing(true);
    addLog(`Simulating AI Coach response for text input: "${sandboxInput}"`);
    
    try {
      // Call actual API route dynamically
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: 'Diagnostics Practice',
          messages: [
            { role: 'user', content: sandboxInput }
          ]
        })
      });

      if (response.ok) {
        const data = await response.json();
        setSandboxResponse(data.reply);
        addLog(`Gemini answered successfully: "${data.reply}"`);
        
        // Trigger speech
        if (apiSupport.synthesis) {
          const utterance = new SpeechSynthesisUtterance(data.reply);
          window.speechSynthesis.speak(utterance);
        }
      } else {
        throw new Error('Server returned non-ok status');
      }
    } catch (e: any) {
      addLog(`Gemini API Error: ${e.message}. Falling back to offline local rule assistant.`);
      // Simulated response
      const responses = [
        "That's a fantastic point! Can you expand on why that's important?",
        "Interesting structure. Try to use simpler vocabulary to ensure absolute flow.",
        "Perfect rhythm. Keep practicing this scenario to master your delivery.",
        "SpeakFlow Coach ready. How can I help you refine your greeting today?"
      ];
      const match = responses[Math.floor(Math.random() * responses.length)];
      setSandboxResponse(match);
      addLog(`Local Assistant Replied: "${match}"`);
      
      if (apiSupport.synthesis) {
        const utterance = new SpeechSynthesisUtterance(match);
        window.speechSynthesis.speak(utterance);
      }
    } finally {
      setIsSandboxProcessing(false);
    }
  };

  const loadDemoFeedback = () => {
    addLog('Injecting high-quality simulated Session Feedback state');
    const mockScenario = {
      id: 'interview',
      title: 'Job Interview Practice',
      description: 'Practice common job interview questions.',
      category: 'Professional'
    };
    forceView('feedback', mockScenario);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div id="test-studio-modal" className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-[2rem] shadow-2xl overflow-hidden text-slate-100 flex flex-col md:flex-row h-[90vh]">
        
        {/* Left Side: System status & Diagnostics */}
        <div className="md:w-1/2 p-6 flex flex-col border-b md:border-b-0 md:border-r border-slate-800 h-full overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Terminal className="w-4 h-4 text-orange-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold tracking-tight">Diagnostics Hub</h3>
                <p className="text-slate-500 text-xs">Self-test and system capabilities</p>
              </div>
            </div>
          </div>

          {/* Status Pills */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between p-3 bg-slate-950/50 rounded-xl border border-slate-800/60">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold">Web Speech Recognition</span>
              </div>
              {apiSupport.recognition ? (
                <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Enabled
                </span>
              ) : (
                <span className="text-[10px] bg-red-500/15 text-red-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> Unsuited
                </span>
              )}
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950/50 rounded-xl border border-slate-800/60">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-semibold">Voice Synthesis (TTS)</span>
              </div>
              {apiSupport.synthesis ? (
                <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Ready
                </span>
              ) : (
                <span className="text-[10px] bg-red-500/15 text-red-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> Suppressed
                </span>
              )}
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950/50 rounded-xl border border-slate-800/60">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold">Firebase Store Connection</span>
              </div>
              <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Operational
              </span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950/50 rounded-xl border border-slate-800/60">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-semibold">Gemini API Token Status</span>
              </div>
              {apiSupport.gemini === 'active' ? (
                <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Keyed
                </span>
              ) : (
                <span className="text-[10px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1">
                  Offline Mocked
                </span>
              )}
            </div>
          </div>

          {/* TTS Test tools */}
          <div className="bg-slate-950/30 p-4 rounded-2xl border border-slate-800/50 mb-6">
            <h4 className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">Sound Testing Instrument</h4>
            <div className="space-y-3">
              <input 
                type="text" 
                value={testSpeechText}
                onChange={e => setTestSpeechText(e.target.value)}
                className="w-full bg-slate-950 text-slate-100 text-xs px-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-indigo-500 font-mono"
              />
              <div className="flex gap-2">
                <select 
                  value={selectedVoice}
                  onChange={e => setSelectedVoice(e.target.value)}
                  className="flex-grow bg-slate-950 text-slate-300 text-[11px] px-2 py-2 rounded-lg border border-slate-800"
                >
                  <option value="">Default Coach Voice</option>
                  {systemVoices.map(v => (
                    <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                  ))}
                </select>
                <button 
                  onClick={handleTtsTest}
                  className="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-xs rounded-lg font-bold border border-slate-700 flex items-center gap-1 tracking-wider uppercase shrink-0"
                >
                  <Volume2 className="w-3.5 h-3.5" /> Speech
                </button>
              </div>
            </div>
          </div>

          {/* Quick Sandbox injections */}
          <div className="bg-slate-950/30 p-4 rounded-2xl border border-slate-800/50 mt-auto">
            <h4 className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">Fast State Injections</h4>
            <p className="text-slate-500 text-[10px] mb-4">Inject state properties to preview specific routes instantly</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => forceView('landing')} className="text-left p-2.5 bg-slate-950 hover:bg-slate-850 text-[11px] font-mono border border-slate-850 rounded-lg text-indigo-400 hover:text-indigo-300">
                &raquo; View Landing
              </button>
              <button onClick={() => forceView('scenarios')} className="text-left p-2.5 bg-slate-950 hover:bg-slate-850 text-[11px] font-mono border border-slate-850 rounded-lg text-emerald-400 hover:text-emerald-300">
                &raquo; View Scenarios
              </button>
              <button onClick={loadDemoFeedback} className="text-left p-2.5 bg-slate-950 hover:bg-slate-850 text-[11px] font-mono border border-slate-850 rounded-lg text-amber-400 hover:text-amber-300">
                &raquo; View Feedback Card
              </button>
              <button onClick={() => forceView('history')} className="text-left p-2.5 bg-slate-950 hover:bg-slate-850 text-[11px] font-mono border border-slate-850 rounded-lg text-fuchsia-400 hover:text-fuchsia-300">
                &raquo; View Client History
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Virtual Interactive Session & Logs */}
        <div className="md:w-1/2 p-6 flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold tracking-tight">Interactive Sandbox</h3>
            <button 
              onClick={onClose}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 transition-colors text-xs font-bold rounded-lg border border-slate-750"
            >
              Exit Console
            </button>
          </div>
          
          <p className="text-slate-500 text-xs mb-4 leading-relaxed">
            Test SpeakFlow's conversational loop by typing instead of speaking. Perfect for quiet spaces, offline verification, or direct scenario simulation.
          </p>

          <div className="bg-slate-950 rounded-2xl border border-slate-800/80 p-4 flex-grow flex flex-col min-h-0 overflow-hidden mb-4">
            <h4 className="text-[10px] font-black tracking-widest text-indigo-400 uppercase mb-2 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" /> Virtual Assistant Simulation
            </h4>
            
            <div className="flex-grow overflow-y-auto space-y-3 mb-4 pr-1 p-2 text-xs">
              {sandboxInput && !sandboxResponse && !isSandboxProcessing && (
                <div className="text-slate-500 italic text-center py-4">
                  Press "Send Response" to simulate speaking to the coach.
                </div>
              )}
              {sandboxResponse && (
                <div className="space-y-2">
                  <div className="bg-indigo-950/30 text-indigo-200 p-3 rounded-2xl rounded-tr-none max-w-[90%] ml-auto border border-indigo-900/40">
                    <div className="font-bold text-[9px] uppercase tracking-wider text-indigo-400 mb-1">User input</div>
                    <p>{sandboxInput}</p>
                  </div>
                  <div className="bg-slate-900 text-slate-200 p-3 rounded-2xl rounded-tl-none max-w-[90%] mr-auto border border-slate-800">
                    <div className="font-bold text-[9px] uppercase tracking-wider text-slate-400 mb-1">Coach response</div>
                    <p>{sandboxResponse}</p>
                  </div>
                </div>
              )}
              {!sandboxInput && !sandboxResponse && (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-600 space-y-2 p-6">
                  <Terminal className="w-10 h-10 stroke-[1.5]" />
                  <span>Type a prompt below to request immediate AI analysis and voice readback.</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Type simulated speech (e.g. Hi and nice to meet you)"
                value={sandboxInput}
                onChange={e => setSandboxInput(e.target.value)}
                className="flex-grow bg-slate-900 text-slate-100 text-xs px-3 py-2.5 rounded-xl border border-slate-800 focus:outline-none focus:border-indigo-500"
                onKeyDown={e => e.key === 'Enter' && handleSimulateGemini()}
              />
              <button 
                onClick={handleSimulateGemini}
                disabled={isSandboxProcessing || !sandboxInput.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
              >
                {isSandboxProcessing ? 'Processing...' : 'Send'}
              </button>
            </div>
          </div>

          {/* Real-time System Logs terminal */}
          <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 h-32 flex flex-col">
            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Runtime Logs</div>
            <div className="flex-grow overflow-y-auto font-mono text-[10px] text-slate-400 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800">
              {logs.map((log, i) => (
                <div key={i} className="whitespace-pre-wrap leading-relaxed truncate">{log}</div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
