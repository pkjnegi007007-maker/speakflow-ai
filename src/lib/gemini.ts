import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("GEMINI_API_KEY is not defined in environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export const models = {
  flash: "gemini-3-flash-preview",
  pro: "gemini-3.1-pro-preview",
};

export async function getChatResponse(scenario: string, messages: { role: string; content: string }[]) {
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
