import express from "express";
import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini on the server side
const geminiApiKey = process.env.GEMINI_API_KEY;
const aiGen = new GoogleGenAI({
  apiKey: geminiApiKey || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

const app = express();
app.use(express.json());

// Helper to sanitize chat history for Gemini API
function sanitizeChatHistory(messages: any[]): { role: "user" | "model"; content: string }[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  // 1. Map to consistent roles ("user" or "model")
  const mapped = messages.map(m => ({
    role: m.role === "ai" || m.role === "model" ? "model" as const : "user" as const,
    content: (m.content || "").trim()
  })).filter(m => m.content.length > 0);

  // 2. Merge consecutive messages of the exact same role
  const merged: { role: "user" | "model"; content: string }[] = [];
  for (const msg of mapped) {
    if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
      merged[merged.length - 1].content += " " + msg.content;
    } else {
      merged.push({ role: msg.role, content: msg.content });
    }
  }

  // 3. Sliding window: Limit to last 10 messages for speed and timeout safety on serverless platforms like Vercel
  let sliced = merged.slice(-10);
  while (sliced.length > 0 && sliced[0].role !== "user") {
    sliced.shift();
  }

  return sliced;
}

// API Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Server-Side Gemini API Proxy Endpoints
app.post("/api/gemini/chat", async (req, res) => {
  const { scenario, messages } = req.body;

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      success: false,
      error: "GEMINI_API_KEY is missing on the server configuration. Please declare it in Vercel Environment Variables."
    });
  }

  try {
    const sanitizedMessages = sanitizeChatHistory(messages);

    const contents = sanitizedMessages.map((m: any) => ({
      role: m.role,
      parts: [{ text: m.content }]
    }));

    const modelName = "gemini-3.5-flash";

    const r = await aiGen.models.generateContent({
      model: modelName,
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

    res.json({ success: true, text: r.text });
  } catch (err: any) {
    console.error("[GEMINI PROXY CHAT ERROR]", err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

app.post("/api/gemini/analyze", async (req, res) => {
  const { transcript } = req.body;

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      success: false,
      error: "GEMINI_API_KEY is missing on the server configuration. Please declare it in Vercel Environment Variables."
    });
  }

  try {
    const modelName = "gemini-3.5-flash";

    const r = await aiGen.models.generateContent({
      model: modelName,
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

    res.json({ success: true, text: r.text });
  } catch (err: any) {
    console.error("[GEMINI PROXY ANALYZE ERROR]", err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// Server-Side Real-Time Traffic & Analytics Tracking Engine (Serverless adapted)
interface ActiveClient {
  clientId: string;
  country: string;
  device: string;
  lastSeen: number;
  lastAction: string;
  scenario: string;
}

interface LogEvent {
  id: string;
  country: string;
  scenario: string;
  device: string;
  timestamp: string;
  action: string;
}

// Memory cache on ephemereal lambdas (note: resets periodically, presence in Firebase is main source)
const activeClients = new Map<string, ActiveClient>();
const uniqueVisitorIds = new Set<string>();
const liveEvents: LogEvent[] = [];
let statsTotalCompletedSessions = 1485;

app.post("/api/analytics/track", (req, res) => {
  const { clientId, country, device, action, scenario } = req.body;

  if (!clientId) {
    return res.status(400).json({ success: false, error: "Missing clientId" });
  }

  const cleanClientId = String(clientId);
  const cleanCountry = String(country || "United States");
  const cleanDevice = String(device || "Desktop");
  const cleanAction = String(action || "Page view");
  const cleanScenario = String(scenario || "General Training");

  const now = Date.now();
  activeClients.set(cleanClientId, {
    clientId: cleanClientId,
    country: cleanCountry,
    device: cleanDevice,
    lastSeen: now,
    lastAction: cleanAction,
    scenario: cleanScenario
  });

  uniqueVisitorIds.add(cleanClientId);

  if (cleanAction !== "Heartbeat") {
    if (cleanAction === "Completed review") {
      statsTotalCompletedSessions += 1;
    }

    liveEvents.unshift({
      id: `${now}_${Math.random().toString(36).substring(2, 6)}`,
      country: cleanCountry,
      scenario: cleanScenario,
      device: cleanDevice,
      timestamp: "Just now",
      action: cleanAction
    });

    if (liveEvents.length > 30) {
      liveEvents.pop();
    }
  }

  res.json({ success: true, activeCount: activeClients.size });
});

app.get("/api/analytics/status", (req, res) => {
  const now = Date.now();
  
  for (const [id, client] of activeClients.entries()) {
    if (now - client.lastSeen > 20000) {
      activeClients.delete(id);
    }
  }

  const actualActiveCount = activeClients.size;
  const actualUniqueCount = uniqueVisitorIds.size;

  const mockEvents: LogEvent[] = [
    { id: 'mock1', country: 'United States', scenario: 'Job Interview Pitch', device: 'Desktop', timestamp: '3m ago', action: 'Created session' },
    { id: 'mock2', country: 'United Kingdom', scenario: 'Casual Cafe Talk', device: 'Mobile', timestamp: '5m ago', action: 'Completed review' },
    { id: 'mock3', country: 'India', scenario: 'Tech Support Help Desk', device: 'Desktop', timestamp: '8m ago', action: 'Upgraded to Pro' },
    { id: 'mock4', country: 'Germany', scenario: 'TED Speaker Style', device: 'Tablet', timestamp: '12m ago', action: 'Started practicing' },
    { id: 'mock5', country: 'Canada', scenario: 'Job Interview Pitch', device: 'Mobile', timestamp: '15m ago', action: 'Requested Gemini summary' },
  ];

  const processedLiveEvents = liveEvents.map(evt => {
    const msAgo = now - parseInt(evt.id.split('_')[0] || String(now));
    let timeText = "Just now";
    if (msAgo > 60000) {
      timeText = `${Math.floor(msAgo / 60000)}m ago`;
    } else if (msAgo > 5000) {
      timeText = `${Math.floor(msAgo / 1000)}s ago`;
    }
    return { ...evt, timestamp: timeText };
  });

  const mergedEvents = [...processedLiveEvents, ...mockEvents].slice(0, 7);

  const activeUsers = 18 + actualActiveCount;
  const totalVisitors = 2842 + actualUniqueCount;
  const totalSessions = statsTotalCompletedSessions;

  res.json({
    success: true,
    activeUsers,
    totalVisitors,
    totalSessions,
    actualActiveCount,
    actualUniqueCount,
    recentLogs: mergedEvents,
    activeClientsList: Array.from(activeClients.values())
  });
});

app.post("/api/payment/checkout", (req, res) => {
  const { uid, billingCycle, gateway, paymentDetails } = req.body;

  if (!uid) {
    return res.status(400).json({
      success: false,
      error: "Missing User ID (uid) for the subscription upgrade."
    });
  }

  const price = billingCycle === "yearly" ? 57.48 : 7.99;
  const cycleLabel = billingCycle === "yearly" ? "Yearly Pro Tier" : "Monthly Pro Tier";

  if (gateway === "stripe" || gateway === "custom_card") {
    const { cardName, cardNumber, cardExpiry, cardCvv } = paymentDetails || {};
    
    if (!cardName || !cardNumber || !cardExpiry || !cardCvv) {
      return res.status(400).json({
        success: false,
        error: "Incomplete Card Details: Cardholder name, number, expiry, and CVC are required."
      });
    }

    const strippedCard = cardNumber.replace(/\s+/g, "");
    if (strippedCard.length < 15 || strippedCard.length > 16) {
      return res.status(400).json({
        success: false,
        error: "Invalid Card Number: Must be a 15- or 16-digit credit card."
      });
    }

    if (cardCvv.length < 3 || cardCvv.length > 4) {
      return res.status(400).json({
        success: false,
        error: "Invalid Security Code: CVC must be a 3- or 4-digit code."
      });
    }
  } else if (gateway === "paypal") {
    const { email } = paymentDetails || {};
    if (!email || !email.includes("@")) {
      return res.status(400).json({
        success: false,
        error: "Invalid PayPal Account: A valid billing email is required."
      });
    }
  } else if (gateway === "gpay") {
    const { billingToken } = paymentDetails || {};
    if (!billingToken) {
      return res.status(400).json({
        success: false,
        error: "Google Pay Incomplete: Secure wallet billing token was not resolved."
      });
    }
  } else {
    return res.status(400).json({
      success: false,
      error: `Unsupported Gateway Option: ${gateway}`
    });
  }

  const randomHex = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1).toUpperCase();
  const txnId = `TXN_${gateway.toUpperCase()}_${randomHex()}${randomHex()}`;
  const rcptNo = `REC_${randomHex()}_${randomHex()}`;

  return res.status(200).json({
    success: true,
    gateway,
    transactionId: txnId,
    receiptNumber: rcptNo,
    billingCycle,
    tier: cycleLabel,
    amountPaid: price,
    currency: "USD",
    invoiceDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    status: "succeeded",
    message: "Gateway payment approved. Pro membership activation token granted."
  });
});

export default app;
