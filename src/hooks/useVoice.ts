import { useState, useEffect, useCallback, useRef } from 'react';

export function useVoice() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const activeQueueRef = useRef<string[]>([]);
  const onEndCallbackRef = useRef<(() => void) | undefined>(undefined);
  const speechIntervalRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setError(null);
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        if (final) {
          setTranscript(prev => (prev + ' ' + final).trim());
        }
        setInterimTranscript(interim);
      };

      recognition.onerror = (event: any) => {
        // 'no-speech' is triggered naturally when the user is thinking/silent (no-speech error state)
        // 'aborted' happens naturally when the recognition is stopped manually
        if (event.error === 'no-speech' || event.error === 'aborted') {
          console.debug('Speech recognition pause cycle:', event.error);
          return;
        }
        console.error('Speech recognition error:', event.error);
        setError(event.error);
        if (event.error === 'not-allowed') {
          setError('Microphone access denied. Please check site permissions.');
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript('');
      };

      recognitionRef.current = recognition;
    } else {
      setError('Speech Recognition not supported in this browser.');
    }

    synthesisRef.current = window.speechSynthesis;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (synthesisRef.current) {
        synthesisRef.current.cancel();
      }
      if (speechIntervalRef.current) {
        clearInterval(speechIntervalRef.current);
      }
    };
  }, []);

  const startListening = useCallback(() => {
    if (recognitionRef.current) {
      setTranscript('');
      setInterimTranscript('');
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.warn('Speech recognition already started or stopping');
      }
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.warn('Speech recognition failed to stop');
      }
    }
  }, []);

  const playNextChunk = useCallback((voiceName?: string, rate?: number, pitch?: number) => {
    if (!synthesisRef.current) return;

    if (activeQueueRef.current.length === 0) {
      if (speechIntervalRef.current) {
        clearInterval(speechIntervalRef.current);
        speechIntervalRef.current = null;
      }
      if (onEndCallbackRef.current) {
        const cb = onEndCallbackRef.current;
        onEndCallbackRef.current = undefined;
        cb();
      }
      return;
    }

    const chunk = activeQueueRef.current.shift()?.trim();
    if (!chunk) {
      playNextChunk(voiceName, rate, pitch);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(chunk);
    if (voiceName) {
      const voices = synthesisRef.current.getVoices();
      const found = voices.find(v => v.name === voiceName);
      if (found) utterance.voice = found;
    }
    if (rate !== undefined) utterance.rate = rate;
    if (pitch !== undefined) utterance.pitch = pitch;

    let chunkCompleted = false;
    const completeChunk = () => {
      if (chunkCompleted) return;
      chunkCompleted = true;
      playNextChunk(voiceName, rate, pitch);
    };

    // Calculate a safe estimated timeout per sentence chunk to prevent hanging
    const estimatedDurationMs = Math.max(3000, (chunk.length / 5) * 1000 * (1 / (rate || 1.0)) + 2000);
    const safetyTimeout = setTimeout(() => {
      if (!chunkCompleted) {
        console.warn('Chunk speech timeout, safety skipping to keep app interactive');
        if (synthesisRef.current) synthesisRef.current.cancel();
        completeChunk();
      }
    }, estimatedDurationMs);

    const doneHandler = () => {
      clearTimeout(safetyTimeout);
      completeChunk();
    };

    utterance.onend = doneHandler;
    utterance.onerror = doneHandler;

    synthesisRef.current.speak(utterance);
    synthesisRef.current.resume(); // wake up speech synthesis (Chrome bug workaround)
  }, []);

  const speak = useCallback((text: string, onEnd?: () => void, voiceName?: string, rate?: number, pitch?: number) => {
    if (synthesisRef.current) {
      synthesisRef.current.cancel();

      if (speechIntervalRef.current) {
        clearInterval(speechIntervalRef.current);
        speechIntervalRef.current = null;
      }

      // Hack for Chrome's SpeechSynthesis stopping randomly on long runs
      speechIntervalRef.current = setInterval(() => {
        if (synthesisRef.current?.speaking) {
          synthesisRef.current.resume();
        }
      }, 5000);

      onEndCallbackRef.current = onEnd;

      // Extract brief sentences cleanly
      const chunks = text
        .split(/[.!?；。？！\n]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

      if (chunks.length === 0) {
        if (onEnd) onEnd();
        return;
      }

      activeQueueRef.current = chunks;
      playNextChunk(voiceName, rate, pitch);
    }
  }, [playNextChunk]);

  const cancelSpeech = useCallback(() => {
    activeQueueRef.current = [];
    onEndCallbackRef.current = undefined;
    if (speechIntervalRef.current) {
      clearInterval(speechIntervalRef.current);
      speechIntervalRef.current = null;
    }
    if (synthesisRef.current) {
      synthesisRef.current.cancel();
    }
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    speak,
    cancelSpeech,
    setTranscript,
  };
}
