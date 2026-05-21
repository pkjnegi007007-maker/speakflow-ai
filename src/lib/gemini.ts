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

// Safety wrapper to abort request before serverless limits or infinite freezes occur
async function fetchWithTimeout(resource: string, options: RequestInit & { timeout?: number }) {
  const { timeout = 7500 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (err: any) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeout}ms`);
    }
    throw err;
  }
}

export function sanitizeChatHistory(messages: { role: string; content: string }[]) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  // 1. Map to consistent roles ("user" or "model")
  const mapped = messages.map(m => ({
    role: m.role === "ai" || m.role === "model" ? "model" as const : "user" as const,
    content: (m.content || "").trim()
  })).filter(m => m.content.length > 0);

  // 2. Merge consecutive messages of the exact same role (e.g., user + user combined, model + model combined)
  const merged: { role: "user" | "model"; content: string }[] = [];
  for (const msg of mapped) {
    if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
      merged[merged.length - 1].content += " " + msg.content;
    } else {
      merged.push({ role: msg.role, content: msg.content });
    }
  }

  // 3. Sliding window: Keep at most the last 10 messages (approx 5 conversational turns)
  // This bounds the context, ensures high performance, and prevents Vercel serverless request timeouts.
  let sliced = merged.slice(-10);
  while (sliced.length > 0 && sliced[0].role !== "user") {
    sliced.shift();
  }

  return sliced;
}

export async function getChatResponse(scenario: string, messages: { role: string; content: string }[]) {
  const sanitizedMessages = sanitizeChatHistory(messages);

  let attempts = 0;
  const maxAttempts = 2; // Reduced to fail-fast and allow client fallback/retry feedback rather than 30s freeze
  let lastError: any = null;

  while (attempts < maxAttempts) {
    try {
      const res = await fetchWithTimeout("/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario, messages: sanitizedMessages }),
        timeout: 7000 // Cut-off at 7 seconds to prevent hitting Vercel's 10-second serverless gateway limit
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
      
      // If we get a 404 (static deployment with no backend), skip directly to client fallback
      if (res.status === 404) {
        break;
      }
      
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Proxy returned server status ${res.status}`);
    } catch (err: any) {
      lastError = err;
      attempts++;
      console.warn(`Chat proxy attempt ${attempts} failed:`, err);
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, attempts * 500));
      }
    }
  }

  // 2. Client-side fallback (if running as static Vercel app with keys configured via build variables)
  if (!apiKey) {
    throw lastError || new Error(
      "Gemini API key is missing. For production, please declare GEMINI_API_KEY in your hosting (e.g., Vercel Environment Variables) or use the SpeakFlow AI Studio playground."
    );
  }

  if (!ai) {
    ai = new GoogleGenAI({ apiKey });
  }

  const contents = sanitizedMessages.map(m => ({
    role: m.role,
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
  let attempts = 0;
  const maxAttempts = 2; // Reduced to reduce Vercel timeout risk on 10s Hobby limit
  let lastError: any = null;

  while (attempts < maxAttempts) {
    try {
      const res = await fetchWithTimeout("/api/gemini/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
        timeout: 15000 // Give more time (15s) for full-length review/analysis report
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
      
      // If we get a 404 (static deployment with no backend), skip directly to client fallback
      if (res.status === 404) {
        break;
      }
      
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Proxy returned server status ${res.status}`);
    } catch (err: any) {
      lastError = err;
      attempts++;
      console.warn(`Analysis proxy attempt ${attempts} failed:`, err);
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, attempts * 500));
      }
    }
  }

  // 2. Client-side fallback
  if (!apiKey) {
    throw lastError || new Error(
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
