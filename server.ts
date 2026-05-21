import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Helper to sanitize chat history for Gemini API
  function sanitizeChatHistory(messagesToSanitize: any[]): { role: "user" | "model"; content: string }[] {
    if (!Array.isArray(messagesToSanitize) || messagesToSanitize.length === 0) {
      return [];
    }

    // 1. Map to consistent roles ("user" or "model")
    const mapped = messagesToSanitize.map(m => ({
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

    // 3. Sliding window: Limit to last 10 messages for speed and timeout safety on serverless platforms
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
        error: "GEMINI_API_KEY is missing on the server configuration. Please declare it in your environment variables."
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
        error: "GEMINI_API_KEY is missing on the server configuration. Please declare it in your environment variables."
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

  // Server-Side Real-Time Traffic & Analytics Tracking Engine
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

  // In-memory telemetry database
  const activeClients = new Map<string, ActiveClient>();
  const uniqueVisitorIds = new Set<string>();
  const liveEvents: LogEvent[] = [];
  let statsTotalCompletedSessions = 1485;

  // Track live client interactions
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

    // Register active client heartbeat
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

    // If it's a structural event (beyond a static idle heartbeat), log it to the event stream
    if (cleanAction !== "Heartbeat") {
      const isSessionCompleted = cleanAction === "Completed review";
      if (isSessionCompleted) {
        statsTotalCompletedSessions += 1;
      }

      // Add to event stream logs
      liveEvents.unshift({
        id: `${now}_${Math.random().toString(36).substring(2, 6)}`,
        country: cleanCountry,
        scenario: cleanScenario,
        device: cleanDevice,
        timestamp: "Just now",
        action: cleanAction
      });

      // Keep stream capped at latest 30 events
      if (liveEvents.length > 30) {
        liveEvents.pop();
      }

      console.log(`[ANALYTICS] Tracked event: ${cleanAction} from client ${cleanClientId} (${cleanCountry}, ${cleanDevice})`);
    }

    res.json({ success: true, activeCount: activeClients.size });
  });

  // Retrieve compiled live telemetry status (mixes actual active hits + mock background traffic for visual baseline richness)
  app.get("/api/analytics/status", (req, res) => {
    const now = Date.now();
    
    // Prune stale clients (inactive for > 20 seconds)
    for (const [id, client] of activeClients.entries()) {
      if (now - client.lastSeen > 20000) {
        activeClients.delete(id);
      }
    }

    const actualActiveCount = activeClients.size;
    const actualUniqueCount = uniqueVisitorIds.size;

    // Base mock sets to merge with actual logs
    const mockEvents: LogEvent[] = [
      { id: 'mock1', country: 'United States', scenario: 'Job Interview Pitch', device: 'Desktop', timestamp: '3m ago', action: 'Created session' },
      { id: 'mock2', country: 'United Kingdom', scenario: 'Casual Cafe Talk', device: 'Mobile', timestamp: '5m ago', action: 'Completed review' },
      { id: 'mock3', country: 'India', scenario: 'Tech Support Help Desk', device: 'Desktop', timestamp: '8m ago', action: 'Upgraded to Pro' },
      { id: 'mock4', country: 'Germany', scenario: 'TED Speaker Style', device: 'Tablet', timestamp: '12m ago', action: 'Started practicing' },
      { id: 'mock5', country: 'Canada', scenario: 'Job Interview Pitch', device: 'Mobile', timestamp: '15m ago', action: 'Requested Gemini summary' },
    ];

    // Map live events list and update human-friendly duration text
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

    // Merge actual events first, then fill in with mocks to retain high visual fidelity
    const mergedEvents = [...processedLiveEvents, ...mockEvents].slice(0, 7);

    // Calculate dynamic state base
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

  // Secure Server-Side Payment Gateway Handler for Freemium Upgrades
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

    // 1. Gateway Routing & Validation
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

    // 2. Mocking Secure Gateway Latency & Transaction Log
    const randomHex = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1).toUpperCase();
    const txnId = `TXN_${gateway.toUpperCase()}_${randomHex()}${randomHex()}`;
    const rcptNo = `REC_${randomHex()}_${randomHex()}`;

    console.log(`[PAYMENT GATEWAY - ${gateway.toUpperCase()}] Premium Upgrade authorized for UID: ${uid}. Cycle: ${cycleLabel}. Txn: ${txnId}`);

    // 3. Return full high-fidelity transaction token and invoice receipt details
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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production serving
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SpeakFlow AI Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
