import { useState, useEffect, useCallback, useRef } from 'react';

export function useVoice() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);

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

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (synthesisRef.current) {
      synthesisRef.current.cancel(); 
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => {
        if (onEnd) onEnd();
      };
      utterance.onerror = () => {
        if (onEnd) onEnd();
      };
      synthesisRef.current.speak(utterance);
    }
  }, []);

  const cancelSpeech = useCallback(() => {
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
