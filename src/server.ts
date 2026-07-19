import express from "express";
import dotenv from "dotenv";

import OpenAI from "openai";
import Groq from "groq-sdk";

import type { Request, Response } from "express";

import { SYSTEM_PROMPT } from "./instructions/systemPrompt.js";
import { OPTIMISE } from "./instructions/optimise.js";

import fs from "fs/promises";
import path from "path";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const HISTORY_FILE = path.resolve("history.json");

app.use(express.json());
app.use(express.static(path.resolve("public")));

function checkAPIKey(apiKeyName: string | undefined): void {
  if (!apiKeyName) {
    throw new Error("API key variable name must be provided.");
  }

  if (!process.env[apiKeyName]) {
    throw new Error(`${apiKeyName} is not defined in environment variables.`);
  }
}

checkAPIKey("OPENAI_API_KEY");
checkAPIKey("GROQ_API_KEY");
checkAPIKey("OPENROUTER_API_KEY");

const openai = new OpenAI();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

let inMemoryHistory: any[] = [];
let isHistoryInitialized = false;

async function getHistory() {
  if (!isHistoryInitialized) {
    try {
      const data = await fs.readFile(HISTORY_FILE, "utf-8");
      inMemoryHistory = JSON.parse(data);
      isHistoryInitialized = true;
    } catch (error) {
      inMemoryHistory = [];
      isHistoryInitialized = true;
    }
  }
  return inMemoryHistory;
}

async function saveToHistory(prompt: string, finalAnswer: string) {
  const history = await getHistory();

  const newEntry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    prompt,
    finalAnswer,
  };

  history.push(newEntry);

  try {
    await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (error) {
    console.warn("Could not write history to disk (expected on Vercel):", error);
  }
}

async function getOpenAI(prompt: string): Promise<string> {
  try {
    const res: any = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    });
    return res.choices[0].message.content || "No response generated.";
  } catch (error) {
    const err = error as Error;
    return `OpenAI Error: ${err.message}`;
  }
}

async function getGroq(prompt: string): Promise<string> {
  try {
    const res = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    });
    return res.choices[0]?.message?.content || "No response generated.";
  } catch (error) {
    const err = error as Error;
    return `Groq Error: ${err.message}`;
  }
}

async function getOpenRouter(prompt: string): Promise<string> {
  try {
    const res = await openrouter.chat.completions.create({
      model: "openrouter/free",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    });
    return res.choices[0]?.message?.content || "No response generated.";
  } catch (error) {
    const err = error as Error;
    return `OpenRouter Error: ${err.message}`;
  }
}

interface GenerateRequestBody {
  prompt: string;
}

interface MultiModelResponse {
  raw: {
    openai: string;
    groq: string;
    openrouter: string;
  };
  final: string;
}

async function optimiser(
  prompt: string,
  openaiRes: string,
  groqRes: string,
  openrouterRes: string,
): Promise<string> {
  const userMessage = `
  [USER PROMPT]
  ${prompt}
  
  [MODEL 1 RESPONSE]
  ${openaiRes}
  
  [MODEL 2 RESPONSE]
  ${groqRes}
  
  [MODEL 3 RESPONSE]
  ${openrouterRes}
  
  Please synthesize the final response now.`;

  try {
    const res: any = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: OPTIMISE },
        { role: "user", content: userMessage },
      ],
    });

    return (
      res.choices[0].message.content || "Synthesis failed to generate text."
    );
  } catch (error) {
    const err = error as Error;
    return `Synthesis Error: ${err.message}`;
  }
}

app.get("/healthcheck", (req: Request, res: Response) => {
  res.json({
    status:
      "Welcome to the consistency engine backend. Server is up and running..",
  });
});

app.get("/api/history", async (req: Request, res: Response) => {
  try {
    const history = await getHistory();
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

app.delete("/api/history", async (req: Request, res: Response) => {
  try {
    inMemoryHistory = [];
    await fs.writeFile(HISTORY_FILE, JSON.stringify([], null, 2));
    res.json({ success: true, message: "History cleared successfully" });
  } catch (error) {
    // If writing fails (expected on Vercel), still return success because in-memory is cleared
    res.json({ success: true, message: "History cleared in-memory" });
  }
});

app.post(
  "/api/generate",
  async (
    req: Request<{}, {}, GenerateRequestBody>,
    res: Response<MultiModelResponse | { error: string }>,
  ) => {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const [openaiRes, groqRes, openrouterRes] = await Promise.all([
      getOpenAI(prompt),
      getGroq(prompt),
      getOpenRouter(prompt),
    ]);

    const finalAnswer = await optimiser(
      prompt,
      openaiRes,
      groqRes,
      openrouterRes,
    );

    await saveToHistory(prompt, finalAnswer);

    res.json({
      raw: { openai: openaiRes, groq: groqRes, openrouter: openrouterRes },
      final: finalAnswer,
    });
  },
);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
