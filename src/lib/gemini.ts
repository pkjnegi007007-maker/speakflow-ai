import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({ apiKey });
}

export const models = {
  flash: "gemini-3.5-flash",
  pro: "gemini-3.1-pro-preview",
};

export async function getChatResponse(scenario: string, messages: { role: string; content: string }[]) {
  // 1. Try server-side proxy route first
  try {
    const res = await fetch("/api/gemini/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario, messages })
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.text) {
        return data.text;
      }
      if (data.error) {
        throw new Error(data.error);
      }
    }
    // If we get a 404 (static deployment with no backend), proceed to client fallback
    if (res.status !== 404) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Proxy returned server status ${res.status}`);
    }
  } catch (err: any) {
    // Only log and proceed to direct client fallback if it looks like a 404 or connection error to backend (i.e. static SPA build)
    console.warn("Express proxy unavailable, trying browser-direct GenAI fallback...", err);
    if (err.message && (err.message.includes("missing") || err.message.includes("GEMINI_API_KEY"))) {
      throw err;
    }
  }

  // 2. Client-side fallback (if running as static Vercel app with keys configured via build variables)
  if (!apiKey) {
    throw new Error(
      "Gemini API key is missing. For production, please declare GEMINI_API_KEY in your hosting (e.g., Vercel Environment Variables) or use the SpeakFlow AI Studio playground."
    );
  }

  if (!ai) {
    ai = new GoogleGenAI({ apiKey });
  }

  const contents = messages.map(m => ({
    role: m.role === "ai" ? "model" : "user",
    parts: [{ text: m.content }]
  }));

  const response = await ai.models.generateContent({
    model: models.flash,
    contents,
    config: {
      systemInstruction: `You are an AI Speaking Coach named SpeakFlow. 
      The current scenario is: ${scenario}.
      Your goal is to practice ${scenario} with the user.
      Keep your responses SHORT and CONVERSATIONAL (max 1-2 sentences).
      Sound supportive and encouraging.
      Ask follow-up questions naturally.
      Gentle corrections are allowed but don't interrupt the flow.
      Adapt tone to the user's confidence level.`,
      temperature: 0.7,
    }
  });

  return response.text;
}

export async function analyzeSession(transcript: string) {
  // 1. Try server-side proxy route first
  try {
    const res = await fetch("/api/gemini/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript })
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.text) {
        return JSON.parse(data.text || "{}");
      }
      if (data.error) {
        throw new Error(data.error);
      }
    }
    if (res.status !== 404) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Proxy returned server status ${res.status}`);
    }
  } catch (err: any) {
    console.warn("Express proxy unavailable, trying browser-direct GenAI fallback...", err);
    if (err.message && (err.message.includes("missing") || err.message.includes("GEMINI_API_KEY"))) {
      throw err;
    }
  }

  // 2. Client-side fallback
  if (!apiKey) {
    throw new Error(
      "Gemini API key is missing. For production, please declare GEMINI_API_KEY in your hosting (e.g., Vercel Environment Variables) or use the SpeakFlow AI Studio playground."
    );
  }

  if (!ai) {
    ai = new GoogleGenAI({ apiKey });
  }

  const response = await ai.models.generateContent({
    model: models.flash,
    contents: [{ parts: [{ text: `Analyze the following communication practice session transcript and provide detailed feedback in JSON format:\n\n${transcript}` }] }],
    config: {
      systemInstruction: `Analyze communication skills: Confidence, Clarity, Speaking Speed, Grammar, Vocabulary, Filler Words, Emotional Tone.
      Provide an overall score (0-100) and category scores.
      Include professional feedback, strengths, weaknesses, and improvement tips.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallScore: { type: Type.NUMBER },
          scores: {
            type: Type.OBJECT,
            properties: {
              confidence: { type: Type.NUMBER },
              fluency: { type: Type.NUMBER },
              grammar: { type: Type.NUMBER },
              vocabulary: { type: Type.NUMBER },
              clarity: { type: Type.NUMBER }
            }
          },
          strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
          improvementTips: { type: Type.ARRAY, items: { type: Type.STRING } },
          fillerWordsCount: { type: Type.NUMBER },
          paceAnalysis: { type: Type.STRING },
          betterAlternatives: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                original: { type: Type.STRING },
                suggested: { type: Type.STRING },
                reason: { type: Type.STRING }
              }
            }
          }
        },
        required: ["overallScore", "scores", "strengths", "weaknesses", "improvementTips"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
}
