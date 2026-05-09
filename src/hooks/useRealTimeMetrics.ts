import { useState, useEffect } from 'react';

export interface RealTimeMetrics {
  wpm: number;
  paceLabel: 'Slow' | 'Normal' | 'Fast' | '---';
  confidence: 'High' | 'Medium' | 'Low';
  wordCount: number;
  fillersCount: number;
}

export function useRealTimeMetrics(transcript: string, isListening: boolean) {
  const [metrics, setMetrics] = useState<RealTimeMetrics>({
    wpm: 0,
    paceLabel: '---',
    confidence: 'High',
    wordCount: 0,
    fillersCount: 0,
  });
  
  const [startTime, setStartTime] = useState<number | null>(null);

  // Track start of speaking turn
  useEffect(() => {
    if (isListening && transcript.length > 0 && !startTime) {
      setStartTime(Date.now());
    }
    if (!isListening) {
      setStartTime(null);
    }
  }, [isListening, transcript, startTime]);

  useEffect(() => {
    if (isListening && startTime && transcript) {
      const words = transcript.trim().split(/\s+/).filter(w => w.length > 0);
      const wordCount = words.length;
      const seconds = (Date.now() - startTime) / 1000;
      
      let wpm = 0;
      if (seconds > 0.5) {
        wpm = Math.round((wordCount / seconds) * 60);
      }

      // Detection for common fillers
      const fillers = (transcript.match(/\b(um|uh|err|like|ah|oh)\b/gi) || []).length;
      
      // Heuristic for confidence
       let confidence: 'High' | 'Medium' | 'Low' = 'High';
       const fillerRatio = wordCount > 0 ? fillers / wordCount : 0;
       
       if (fillerRatio > 0.15 || (wpm > 0 && wpm < 60)) {
         confidence = 'Low';
       } else if (fillerRatio > 0.05 || (wpm > 0 && wpm < 90)) {
         confidence = 'Medium';
       }

      const getPaceLabel = (val: number): 'Slow' | 'Normal' | 'Fast' | '---' => {
        if (val === 0) return '---';
        if (val < 100) return 'Slow';
        if (val > 160) return 'Fast';
        return 'Normal';
      };

      setMetrics({
        wpm,
        paceLabel: getPaceLabel(wpm),
        confidence,
        wordCount,
        fillersCount: fillers
      });
    } else if (!isListening) {
      // Reset turn-specific metrics but keep them visible briefly if needed
      // Actually, we'll let the component decide when to reset
    }
  }, [transcript, isListening, startTime]);

  return metrics;
}
